import { describe, expect, it } from 'vitest';
import { compileDiagram, layoutSequence, type SequenceLayout } from '@mermaid-animator/core';
import { arrowTags, edgeMarkers, fitText, panToReveal, RAIL, railEntries, type ScreenView } from '../src/orientation/model';

/** 7 px per character at 12 px; scales with the font size in the CSS font string. */
const measure = (text: string, font: string) => text.length * 7 * (Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 12) / 12);
const layoutMeasure = (text: string) => text.length * 7;

function layout(source: string): SequenceLayout {
  const seq = compileDiagram(source).sequence!;
  return layoutSequence(seq.model, seq.compiled, { measure: layoutMeasure });
}

const body = Array.from({ length: 30 }, (_, i) => `    ${['U->>G', 'G->>A', 'A->>D', 'D-->>A'][i % 4]}: message ${i + 1}`).join('\n');
const long = layout(`sequenceDiagram\n    participant U as User\n    participant G as Gateway\n    participant A as Auth Service\n    participant D as Database\n${body}`);
const size = { width: 1200, height: 600 };
const p = (id: string) => long.participants.find((x) => x.id === id)!;

/** A view at zoom k that puts drawing point (dx, dy) at the top-left of the screen. */
const at = (k: number, dx: number, dy: number): ScreenView => ({ k, x: -dx * k, y: -dy * k });

describe('participant rail', () => {
  it('names every visible lifeline, centred on it, once the headers are above the view', () => {
    const view = at(1, 0, 400);
    const entries = railEntries(long, view, size, { measure });
    expect(entries.map((e) => e.id)).toEqual(['U', 'G', 'A', 'D']);
    for (const e of entries) expect(e.lifelineX).toBeCloseTo(view.x + p(e.id).x * view.k);
    expect(entries.find((e) => e.id === 'A')!.label).toBe('Auth Service');
  });

  it('shows nothing while the headers are in view', () => {
    expect(railEntries(long, at(1, 0, 0), size, { measure })).toEqual([]);
    // A header only partly above the view still counts as visible.
    const header = p('U').header;
    expect(railEntries(long, at(1, 0, header.y + header.h / 2), size, { measure })).toEqual([]);
  });

  it('keeps the same on-screen size at 8x zoom', () => {
    const one = railEntries(long, at(1, 0, 400), size, { measure });
    const eight = railEntries(long, at(8, p('G').x - 100, 500), size, { measure });
    const name = (entries: typeof one, id: string) => entries.find((e) => e.id === id)!;
    expect(eight.map((e) => e.id)).toContain('G');
    expect(name(eight, 'G').width).toBe(name(one, 'G').width);
  });

  it('culls lifelines outside the view horizontally', () => {
    const entries = railEntries(long, at(2, p('A').x - 300, 600), size, { measure });
    expect(entries.map((e) => e.id)).not.toContain('U');
  });

  it('names a created participant only once its header row is above the view', () => {
    const created = layout('sequenceDiagram\n    A->>B: one\n' + Array.from({ length: 12 }, (_, i) => `    A->>B: m${i}`).join('\n') + '\n    create participant C as Cache\n    A->>C: hello\n    C-->>A: ok\n' + Array.from({ length: 12 }, (_, i) => `    A->>C: n${i}`).join('\n'));
    const c = created.participants.find((x) => x.id === 'C')!;
    expect(c.created).toBe(true);
    const beforeCreation = railEntries(created, at(1, 0, c.header.y - 100), size, { measure });
    expect(beforeCreation.map((e) => e.id)).not.toContain('C');
    const afterCreation = railEntries(created, at(1, 0, c.header.y + c.header.h + 20), size, { measure });
    expect(afterCreation.map((e) => e.id)).toContain('C');
  });

  it('drops a destroyed participant once its lifeline ended above the view', () => {
    const destroyed = layout('sequenceDiagram\n    participant A\n    participant B\n    A->>B: one\n    destroy B\n    A-xB: bye\n' + Array.from({ length: 20 }, (_, i) => `    A->>A: self ${i}`).join('\n'));
    const b = destroyed.participants.find((x) => x.id === 'B')!;
    expect(b.destroyedAt).toBeDefined();
    const above = railEntries(destroyed, at(1, 0, b.destroyedAt! + 40), size, { measure });
    expect(above.map((e) => e.id)).not.toContain('B');
    const crossing = railEntries(destroyed, at(1, 0, b.header.y + b.header.h + 5), size, { measure });
    expect(crossing.map((e) => e.id)).toContain('B');
  });

  it('shortens names so neighbours never overlap, and falls back to ticks', () => {
    const narrow = railEntries(long, at(0.35, 0, 300), size, { measure });
    expect(narrow.length).toBe(4);
    for (let i = 1; i < narrow.length; i++) {
      const a = narrow[i - 1]!;
      const b = narrow[i]!;
      if (!a.tick && !b.tick) expect(a.x + a.width / 2).toBeLessThanOrEqual(b.x - b.width / 2);
    }
    expect(fitText('Auth Service', 40, '560 12px x', measure)?.text).toBe('Auth…');
    expect(fitText('Auth Service', 20, '560 12px x', measure)).toBeUndefined();
    const tiny = railEntries(long, at(0.12, 0, 200), size, { measure });
    expect(tiny.some((e) => e.tick && e.label === '')).toBe(true);
  });

  it('marks current-step participants and dims those outside the focus', () => {
    const entries = railEntries(long, at(1, 0, 400), size, { measure, involved: new Set(['G', 'A']), focus: new Set(['G']) });
    const state = Object.fromEntries(entries.map((e) => [e.id, e.state]));
    expect(state).toEqual({ U: 'dim', G: 'current', A: 'current', D: 'dim' });
  });

  it('scales metrics for exports', () => {
    const one = railEntries(long, at(1, 0, 400), size, { measure });
    const two = railEntries(long, at(2, 0, 400), { width: 2400, height: 1200 }, { measure, scale: 2 });
    expect(two.find((e) => e.id === 'G')!.width).toBe(one.find((e) => e.id === 'G')!.width * 2);
    expect(RAIL.height).toBe(24);
  });
});

describe('off-screen markers', () => {
  const view = at(3, p('G').x - 150, 500);
  const step = { x: p('G').x, y: 560, w: p('D').x - p('G').x, h: 20 };

  it('marks a receiver off to the right, beside the step', () => {
    const markers = edgeMarkers(long, view, size, ['A', 'D'], step);
    expect(markers.find((m) => m.id === 'D')).toMatchObject({ side: 'right', name: 'Database' });
    const y = view.y + (step.y + step.h / 2) * view.k;
    expect(markers.find((m) => m.id === 'D')!.y).toBeCloseTo(Math.min(Math.max(y, RAIL.height + 20), size.height - 20));
    // With the step out of view vertically, markers sit at mid-height.
    expect(edgeMarkers(long, view, size, ['D'], { ...step, y: 2000 })[0]!.y).toBe(size.height / 2);
  });

  it('marks participants off to the left and ignores uninvolved ones', () => {
    const markers = edgeMarkers(long, view, size, ['U'], step);
    expect(markers).toEqual([expect.objectContaining({ id: 'U', side: 'left' })]);
    expect(edgeMarkers(long, view, size, ['G'], step)).toEqual([]);
  });

  it('stacks markers on the same side', () => {
    const far = at(3, p('U').x - 100, 500);
    const markers = edgeMarkers(long, far, size, ['A', 'D'], step);
    expect(markers.map((m) => m.side)).toEqual(['right', 'right']);
    expect(markers[1]!.y).toBeGreaterThan(markers[0]!.y);
  });

  it('pans by the minimum distance that reveals the lifeline with 24 px padding', () => {
    const next = panToReveal(view, size, p('D').x);
    expect(next.k).toBe(view.k);
    expect(next.y).toBe(view.y);
    expect(next.x + p('D').x * next.k).toBeCloseTo(size.width - 24);
    const left = panToReveal(view, size, p('U').x);
    expect(left.x + p('U').x * left.k).toBeCloseTo(24);
    expect(panToReveal(view, size, p('G').x)).toBe(view);
  });
});

describe('arrow-end tags', () => {
  const gToA = long.messages.filter((m) => m.from === 'G' && m.to === 'A')[3]!;
  const zoomed = at(3, p('G').x - 50, gToA.points[0]!.y - 100);

  it('is empty when off', () => {
    expect(arrowTags(long, [gToA.id], zoomed, size, 'off', measure)).toEqual([]);
  });

  it('shows sender and receiver tags when always, away from the label and short of the arrowhead', () => {
    const tags = arrowTags(long, [gToA.id], at(1, 0, 0), { width: 1200, height: 2000 }, 'always', measure);
    expect(tags.map((t) => t.text)).toEqual(['Gateway', 'Auth Service']);
    const [from, to] = tags;
    const lineY = gToA.points[0]!.y;
    expect(from!.y).toBeGreaterThan(lineY); // labels sit above the arrow, tags below
    expect(from).toMatchObject({ anchor: 'start' });
    expect(to).toMatchObject({ anchor: 'end' });
    expect(to!.x).toBeLessThan(gToA.points[gToA.points.length - 1]!.x);
  });

  it('shows no tags in auto while the headers are visible, both when zoomed in below them', () => {
    expect(arrowTags(long, [gToA.id], at(1, 0, 0), size, 'auto', measure)).toEqual([]);
    expect(arrowTags(long, [gToA.id], zoomed, size, 'auto', measure).map((t) => t.participant)).toEqual(['G', 'A']);
  });

  it('gives a self-message one tag', () => {
    const self = layout('sequenceDiagram\n    participant A as Auth\n    A->>A: check');
    const m = self.messages[0]!;
    const tags = arrowTags(self, [m.id], at(1, 0, 0), size, 'always', measure);
    expect(tags).toEqual([expect.objectContaining({ text: 'Auth', anchor: 'end' })]);
  });
});

describe('arrow-end tags with autonumber', () => {
  it('moves the sender tag clear of the step-number badge', () => {
    const numbered = layout('sequenceDiagram\n    autonumber\n    participant A as Auth\n    participant D as Database\n    A->>D: query');
    const m = numbered.messages[0]!;
    expect(m.badge).toBeDefined();
    const k = 3;
    const [from] = arrowTags(numbered, [m.id], { k, x: 0, y: 0 }, { width: 2000, height: 2000 }, 'always', measure);
    expect(from!.x - m.points[0]!.x * k).toBeGreaterThanOrEqual(9 * k);
  });
});
