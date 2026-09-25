import { describe, expect, it } from 'vitest';
import { approximateMeasure, compileDiagram, layoutSequence, stepEnd } from '@mermaid-animator/core';
import { cubicBezier, DEFAULT_DISPLAY, EASE, effectiveDisplay, prepareScene, sceneAt, type DisplayOptions } from '../src';

function model(body: string) {
  const d = compileDiagram(`sequenceDiagram\n${body}`);
  if (!d.sequence) throw new Error(JSON.stringify(d.diagnostics));
  const { model: m, compiled, timeline } = d.sequence;
  const layout = layoutSequence(m, compiled, { measure: approximateMeasure });
  return { scene: prepareScene(layout, compiled, timeline), compiled, timeline, layout };
}

const serialise = (s: ReturnType<typeof sceneAt>) =>
  JSON.stringify({ ...s, messages: [...s.messages], notes: [...s.notes], participants: [...s.participants], fragments: [...s.fragments] });

describe('easing', () => {
  it('matches CSS cubic-bezier endpoints and is monotonic for the standard curve', () => {
    const ease = cubicBezier(0.2, 0, 0, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    let last = 0;
    for (let i = 1; i <= 20; i++) {
      const v = ease(i / 20);
      expect(v).toBeGreaterThanOrEqual(last - 1e-9);
      last = v;
    }
    expect(EASE.linear(0.3)).toBeCloseTo(0.3);
  });

  it('never overshoots in the Formal curves', () => {
    for (const ease of [EASE.standard, EASE.enter, EASE.exit, EASE.travel]) {
      for (let i = 0; i <= 50; i++) expect(ease(i / 50)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('sceneAt', () => {
  const { scene, compiled, timeline } = model('participant A\nparticipant B\nA->>+B: one\nB-->>-A: two\nNote over A: note');
  const [one, two] = compiled.steps[0]!.messages.concat(compiled.steps[1]!.messages);

  it('shows nothing played at time 0 (hidden future)', () => {
    const s = sceneAt(scene, 0);
    expect(s.position.index).toBe(-1);
    expect(s.messages.get(one!)).toMatchObject({ state: 'future', opacity: 0 });
    expect([...s.notes.values()][0]?.opacity).toBe(0);
  });

  it('half-draws the arrow at mid-transition with the pulse at its tip and the label hidden', () => {
    const T = timeline.transitions[0]!;
    // Halfway through the transition window the eased arrow is partially drawn (travel curve ≈ 0.73).
    const s = sceneAt(scene, T / 2);
    const m = s.messages.get(one!)!;
    expect(m.state).toBe('current');
    expect(m.draw).toBeCloseTo(EASE.travel(0.5), 5);
    expect(m.draw).toBeGreaterThan(0.25);
    expect(m.draw).toBeLessThan(0.75);
    expect(m.pulse?.at).toBeCloseTo(m.draw, 9);
    expect(m.label).toBe(0);
    expect(m.head).toBe(0);
  });

  it('completes the message by the end of the transition window', () => {
    const s = sceneAt(scene, stepEnd(timeline, 0) + 200);
    const m = s.messages.get(one!)!;
    expect(m).toMatchObject({ draw: 1, label: 1, head: 1, labelRise: 0 });
    expect(m.pulse).toBeUndefined();
  });

  it('is a pure function of time: seeking equals playing', () => {
    const t = timeline.starts[1]! + 120;
    const played: string[] = [];
    for (let x = 0; x <= t; x += 16) sceneAt(scene, x);
    played.push(serialise(sceneAt(scene, t)));
    expect(serialise(sceneAt(scene, t))).toBe(played[0]);
  });

  it('marks earlier steps as past and fades the previous highlight', () => {
    const s = sceneAt(scene, timeline.starts[1]! + 1);
    const m = s.messages.get(one!)!;
    expect(m.state).toBe('past');
    expect(m.highlight).toBeGreaterThan(0.9);
    const later = sceneAt(scene, timeline.starts[1]! + 400).messages.get(one!)!;
    expect(later.highlight).toBe(0);
    expect(s.messages.get(two!)!.state).toBe('current');
  });

  it('grows the activation bar after the message arrives and closes it at the deactivating step', () => {
    const T = timeline.transitions[0]!;
    expect(sceneAt(scene, T / 2).activations[0]!.opacity).toBe(0);
    const grown = sceneAt(scene, T + 300).activations[0]!;
    expect(grown.opacity).toBe(1);
    const closed = sceneAt(scene, timeline.duration).activations[0]!;
    expect(closed.y2).toBeCloseTo(scene.layout.activations[0]!.y2);
  });

  it('lights the sender lifeline first and the receiver on arrival', () => {
    const T = timeline.transitions[0]!;
    const early = sceneAt(scene, 130);
    expect(early.participants.get('A')!.glow).toBe(1);
    expect(early.participants.get('B')!.glow).toBe(0);
    expect(sceneAt(scene, T + 200).participants.get('B')!.glow).toBe(1);
  });
});

describe('display options', () => {
  const { scene, compiled, timeline } = model('A->>B: 1\nB->>A: 2\nA->>B: 3\nB->>A: 4\nA->>B: 5');
  const ids = compiled.steps.map((s) => s.messages[0]!);
  const at = (o: Partial<DisplayOptions>, index: number) => sceneAt(scene, stepEnd(timeline, index), { ...DEFAULT_DISPLAY, ...o });

  it('ghosts or shows future steps', () => {
    expect(at({ futureSteps: 'ghosted' }, 0).messages.get(ids[3]!)!.opacity).toBe(0.12);
    expect(at({ futureSteps: 'visible' }, 0).messages.get(ids[3]!)!.opacity).toBe(1);
  });

  it('mutes past steps or fades them along a trail', () => {
    expect(at({ pastSteps: 'muted' }, 4).messages.get(ids[0]!)!.opacity).toBe(0.45);
    const trail = at({ pastSteps: 'trail', trailLength: 3 }, 4);
    const opacities = ids.slice(0, 4).map((id) => trail.messages.get(id)!.opacity);
    expect(opacities).toEqual([...opacities].sort((a, b) => a - b));
    expect(opacities[0]).toBe(0.45);
  });

  it('uses fades only under the Minimal profile and jumps under None', () => {
    const minimal = sceneAt(scene, 50, { ...DEFAULT_DISPLAY, motion: 'minimal' }).messages.get(ids[0]!)!;
    expect(minimal.draw).toBe(1);
    expect(minimal.pulse).toBeUndefined();
    expect(minimal.opacity).toBeGreaterThan(0);
    expect(minimal.opacity).toBeLessThan(1);
    const none = sceneAt(scene, 1, { ...DEFAULT_DISPLAY, motion: 'none' }).messages.get(ids[0]!)!;
    expect(none).toMatchObject({ opacity: 1, draw: 1, label: 1 });
  });

  it('maps reduced motion to Minimal without a travelling indicator', () => {
    expect(effectiveDisplay(DEFAULT_DISPLAY, true)).toMatchObject({ motion: 'minimal', indicator: 'none' });
    expect(effectiveDisplay(DEFAULT_DISPLAY, false)).toBe(DEFAULT_DISPLAY);
  });

  it('draws emphasised steps and unplayed alt branches distinctly', () => {
    const m = model('%% @emphasis\nA->>B: important\nalt a\nA->>B: x\nelse b\nA->>B: y\nend');
    const s = sceneAt(m.scene, m.timeline.duration);
    const states = [...s.messages.values()];
    expect(states[0]!.emphasis).toBe(true);
    expect(states[2]).toMatchObject({ state: 'unplayed', opacity: 0.12 });
  });
});
