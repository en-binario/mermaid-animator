import { describe, expect, it } from 'vitest';
import { approximateMeasure, CLEAR_MS, compileDiagram, layoutSequence, stepEnd } from '@mermaid-animator/core';
import { DEFAULT_DISPLAY, EASE, prepareScene, sceneAt, type DisplayOptions } from '../src';

function model(body: string, overview = true) {
  const d = compileDiagram(`sequenceDiagram\n${body}`, { overview, dwellMs: 900 });
  if (!d.sequence) throw new Error(JSON.stringify(d.diagnostics));
  const { model: m, compiled, timeline } = d.sequence;
  const layout = layoutSequence(m, compiled, { measure: approximateMeasure });
  return { scene: prepareScene(layout, compiled, timeline), compiled, timeline, layout };
}

const serialise = (s: ReturnType<typeof sceneAt>) =>
  JSON.stringify({ ...s, messages: [...s.messages], notes: [...s.notes], participants: [...s.participants], fragments: [...s.fragments] });

const ON: DisplayOptions = { ...DEFAULT_DISPLAY, overview: true };
const BODY = 'participant A\nparticipant B\nA->>+B: one\ncreate participant C\nB->>C: make\nB-->>-A: two\nNote over A: note\nloop again\nA->>B: three\nend';

describe('initial overview (sceneAt)', () => {
  const { scene, compiled, timeline, layout } = model(BODY);
  const ids = compiled.steps.flatMap((s) => s.messages);
  const clearStart = timeline.starts[0]!;

  it('shows every message, note, fragment and created participant at step 0 without emphasis', () => {
    const s = sceneAt(scene, 0, ON);
    expect(s.position.index).toBe(-1);
    for (const m of layout.messages) expect(s.messages.get(m.id)).toMatchObject({ state: 'past', opacity: 1, draw: 1, label: 1, highlight: 0 });
    for (const m of s.messages.values()) expect(m.pulse).toBeUndefined();
    for (const n of s.notes.values()) expect(n.opacity).toBe(1);
    for (const p of s.participants.values()) expect(p).toMatchObject({ opacity: 1, glow: 0 });
    for (const f of s.fragments.values()) expect(f).toMatchObject({ opacity: 1, active: 0 });
    expect(s.fragments.values().next().value?.iteration).toBeUndefined();
    expect(s.activations.every((a) => a.opacity === 1)).toBe(true);
  });

  it('does not dim the overview with ghosted future or muted past steps', () => {
    for (const display of [{ ...ON, futureSteps: 'ghosted' as const }, { ...ON, pastSteps: 'muted' as const }, { ...ON, pastSteps: 'trail' as const }]) {
      const s = sceneAt(scene, 0, display);
      for (const m of s.messages.values()) expect(m.opacity).toBe(1);
    }
  });

  it('keeps the overview through the lead-in', () => {
    expect(serialise(sceneAt(scene, clearStart, ON))).toBe(serialise(sceneAt(scene, 0, ON)));
  });

  it('fades the overview out to the pre-reveal state before step 1 draws', () => {
    const mid = sceneAt(scene, clearStart + CLEAR_MS / 2, ON);
    const expected = 1 - EASE.standard(0.5);
    expect(mid.position.index).toBe(0);
    for (const id of ids) {
      expect(mid.messages.get(id)!.opacity).toBeCloseTo(expected, 5);
      expect(mid.messages.get(id)!.draw).toBe(1);
    }
    const created = mid.participants.get('C')!;
    expect(created.opacity).toBeCloseTo(expected, 5);
    // Participants present from the start stay put.
    expect(mid.participants.get('A')!.opacity).toBe(1);

    const cleared = sceneAt(scene, clearStart + CLEAR_MS, ON);
    const first = cleared.messages.get(compiled.steps[0]!.messages[0]!)!;
    expect(first).toMatchObject({ state: 'current', draw: 0 });
    for (const id of compiled.steps[1]!.messages) expect(cleared.messages.get(id)!.opacity).toBe(0);
  });

  it('draws step 1 on its own transition window after the clear', () => {
    const { timeline: plainTimeline, scene: plainScene } = model(BODY, false);
    const T = plainTimeline.transitions[0]!;
    const withOverview = sceneAt(scene, clearStart + CLEAR_MS + T / 2, ON).messages.get(ids[0]!)!;
    const without = sceneAt(plainScene, T / 2).messages.get(ids[0]!)!;
    expect(withOverview.draw).toBeCloseTo(without.draw, 9);
    expect(withOverview.label).toBeCloseTo(without.label, 9);
  });

  it('cuts instead of fading under minimal motion', () => {
    const s = sceneAt(scene, clearStart + 1, { ...ON, motion: 'minimal' });
    for (const id of compiled.steps[1]!.messages) expect(s.messages.get(id)!.opacity).toBe(0);
  });

  it('matches the scene without an overview from the rest of step 1 onward', () => {
    const { scene: plainScene, timeline: plainTimeline } = model(BODY, false);
    for (let k = 0; k < compiled.steps.length; k++) {
      const a = sceneAt(scene, stepEnd(timeline, k), ON);
      const b = sceneAt(plainScene, stepEnd(plainTimeline, k));
      expect(serialise({ ...a, position: b.position })).toBe(serialise(b));
    }
  });

  it('renders step 0 as before when the overview is off', () => {
    const { scene: plainScene } = model(BODY, false);
    const s = sceneAt(plainScene, 0, DEFAULT_DISPLAY);
    for (const id of ids) expect(s.messages.get(id)!.opacity).toBe(0);
  });

  it('applies focus dimming to the overview', () => {
    const s = sceneAt(scene, 0, ON, { focus: new Set(['C']) });
    const make = layout.messages.find((m) => m.to === 'C')!;
    const one = layout.messages.find((m) => m.from === 'A' && m.to === 'B')!;
    expect(s.messages.get(make.id)!.opacity).toBe(1);
    expect(s.messages.get(one.id)!.opacity).toBeLessThan(0.2);
  });
});
