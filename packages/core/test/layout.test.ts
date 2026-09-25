import { describe, expect, it } from 'vitest';
import { approximateMeasure, compileDiagram, layoutSequence, wrapText, type SequenceLayout } from '../src';

function layout(body: string, options: { widthFactor?: number; mirrorActors?: boolean } = {}): SequenceLayout {
  const d = compileDiagram(`sequenceDiagram\n${body}`);
  if (!d.sequence) throw new Error(JSON.stringify(d.diagnostics));
  return layoutSequence(d.sequence.model, d.sequence.compiled, { measure: approximateMeasure, ...options });
}

describe('columns', () => {
  it('places participants left to right in declaration then appearance order', () => {
    const l = layout('participant C\nA->>B: x\nB->>C: y');
    expect(l.participants.map((p) => p.id)).toEqual(['C', 'A', 'B']);
    const xs = l.participants.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('widens the gap so a long label fits between adjacent lifelines', () => {
    const short = layout('A->>B: hi');
    const long = layout(`A->>B: ${'a very long message label '.repeat(3).trim()}`);
    const gap = (l: SequenceLayout) => l.participants[1]!.x - l.participants[0]!.x;
    expect(gap(long)).toBeGreaterThan(gap(short));
    const m = long.messages[0]!;
    expect(m.label.width).toBeLessThanOrEqual(gap(long));
  });

  it('keeps a spanning label within its span without widening unrelated gaps unnecessarily', () => {
    const l = layout(`participant A\nparticipant B\nparticipant C\nA->>C: ${'x'.repeat(60)}`);
    const [a, , c] = l.participants;
    expect(c!.x - a!.x).toBeGreaterThanOrEqual(l.messages[0]!.label.width);
  });

  it('applies the export width factor to boxes', () => {
    const normal = layout('participant Alexander\nAlexander->>B: x');
    const padded = layout('participant Alexander\nAlexander->>B: x', { widthFactor: 1.5 });
    expect(padded.participants[0]!.header.w).toBeGreaterThan(normal.participants[0]!.header.w);
  });

  it('wraps long labels to at most three lines with an ellipsis', () => {
    const lines = wrapText('word '.repeat(200), approximateMeasure, 'label', 100, 3);
    expect(lines).toHaveLength(3);
    expect(lines[2]?.endsWith('…')).toBe(true);
    expect(wrapText('a\nb', approximateMeasure, 'label', 100, 3)).toEqual(['a', 'b']);
  });
});

describe('rows', () => {
  it('gives every message, note and fragment its own vertical space', () => {
    const l = layout('A->>B: one\nNote over A,B: note\nloop l\nB->>A: two\nend\nA->>B: three');
    const ys = l.messages.map((m) => m.points[0]!.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    const note = l.notes[0]!.rect;
    expect(note.y).toBeGreaterThan(ys[0]!);
    expect(note.y + note.h).toBeLessThan(ys[1]!);
    const frame = l.fragments[0]!.rect;
    expect(frame.y).toBeLessThan(ys[1]!);
    expect(frame.y + frame.h).toBeLessThan(ys[2]!);
  });

  it('draws alt separators and nests fragment frames inside each other', () => {
    const l = layout('loop outer\nalt a\nA->>B: x\nelse b\nB->>A: y\nend\nend');
    const [inner, outer] = l.fragments;
    expect(inner!.separators).toHaveLength(1);
    expect(outer!.rect.x).toBeLessThan(inner!.rect.x);
    expect(outer!.rect.x + outer!.rect.w).toBeGreaterThan(inner!.rect.x + inner!.rect.w);
  });

  it('draws self messages as a loop with the label to the right', () => {
    const m = layout('A->>A: think').messages[0]!;
    expect(m.self).toBe(true);
    expect(m.points).toHaveLength(4);
    expect(m.label.anchor).toBe('start');
    expect(m.label.x).toBeGreaterThan(m.points[1]!.x);
  });
});

describe('activations', () => {
  it('opens and closes bars at the rows of the steps that carry the effects', () => {
    const l = layout('A->>+B: go\nB->>+C: fwd\nC-->>-B: back\nB-->>-A: done');
    expect(l.activations.map((a) => [a.participant, a.startStep, a.endStep, a.depth])).toEqual([
      ['B', 0, 3, 0],
      ['C', 1, 2, 0],
    ]);
    const b = l.activations[0]!;
    expect(b.y1).toBe(l.stepRows[0]);
    expect(b.y2).toBe(l.stepRows[3]);
  });

  it('stacks nested activations and ends arrows at the bar edge', () => {
    const l = layout('A->>+B: one\nA->>+B: two\nB-->>-A: three\nB-->>-A: four');
    expect(l.activations.map((a) => a.depth)).toEqual([0, 1]);
    const second = l.messages[1]!;
    expect(second.points[1]!.x).toBeLessThan(l.participants[1]!.x);
  });
});

describe('participants', () => {
  it('places created participants on their creating row and ends destroyed lifelines', () => {
    const l = layout('A->>B: x\ncreate participant C\nA->>C: hello\ndestroy C\nA-xC: bye');
    const c = l.participants.find((p) => p.id === 'C')!;
    const hello = l.messages[1]!;
    expect(c.created).toBe(true);
    expect(c.header.y + c.header.h / 2).toBeCloseTo(hello.points[0]!.y);
    expect(hello.points[1]!.x).toBe(c.header.x);
    expect(c.destroyedAt).toBeDefined();
    expect(c.footer).toBeUndefined();
  });

  it('mirrors headers at the bottom unless disabled', () => {
    expect(layout('A->>B: x').participants[0]!.footer).toBeDefined();
    expect(layout('A->>B: x', { mirrorActors: false }).participants[0]!.footer).toBeUndefined();
  });

  it('computes boxes around their members', () => {
    const l = layout('box Aqua Team\nparticipant A\nparticipant B\nend\nA->>B: x\nB->>C: y');
    const box = l.boxes[0]!.rect;
    const [a, b, c] = l.participants;
    expect(box.x).toBeLessThan(a!.header.x);
    expect(box.x + box.w).toBeGreaterThan(b!.header.x + b!.header.w);
    expect(box.x + box.w).toBeLessThan(c!.header.x);
  });
});

describe('determinism and bounds', () => {
  it('produces identical layouts for identical input', () => {
    const body = 'A->>+B: x\nloop l\nB->>C: y\nend\nNote right of C: n\nB-->>-A: z';
    expect(JSON.stringify(layout(body))).toBe(JSON.stringify(layout(body)));
  });

  it('gives every step bounds inside the diagram', () => {
    const l = layout('A->>B: x\nNote over B: n\nB->>A: y');
    expect(l.stepBounds).toHaveLength(3);
    for (const r of l.stepBounds) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(l.width);
      expect(r.y + r.h).toBeLessThanOrEqual(l.height);
    }
  });
});
