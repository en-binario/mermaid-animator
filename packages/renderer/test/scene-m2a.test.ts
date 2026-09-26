import { describe, expect, it } from 'vitest';
import { approximateMeasure, compileDiagram, layoutSequence, stepEnd, type CompileOptions } from '@mermaid-animator/core';
import { DEFAULT_DISPLAY, prepareScene, sceneAt } from '../src';

function model(body: string, options: CompileOptions = {}) {
  const d = compileDiagram(`sequenceDiagram\n${body}`, options);
  if (!d.sequence) throw new Error(JSON.stringify(d.diagnostics));
  const { model: m, compiled, timeline } = d.sequence;
  const layout = layoutSequence(m, compiled, { measure: approximateMeasure });
  return { scene: prepareScene(layout, compiled, timeline), compiled, timeline, layout };
}

describe('loops in the scene', () => {
  const { scene, compiled, timeline, layout } = model('%% @iterations 3\nloop retry\nA->>B: try\nend\nB->>A: done');
  const tryId = layout.messages[0]!.id;
  const loopId = layout.fragments[0]!.id;

  it('maps a repeated message to every iteration step', () => {
    expect(scene.messageSteps.get(tryId)).toEqual([0, 1, 2]);
  });

  it('redraws the message in each iteration', () => {
    const T = timeline.transitions[1]!;
    const midSecond = sceneAt(scene, timeline.starts[1]! + T / 2).messages.get(tryId)!;
    expect(midSecond.state).toBe('current');
    expect(midSecond.draw).toBeGreaterThan(0);
    expect(midSecond.draw).toBeLessThan(1);
    const afterLoop = sceneAt(scene, stepEnd(timeline, 3)).messages.get(tryId)!;
    expect(afterLoop.state).toBe('past');
  });

  it('shows the iteration counter only while the loop plays', () => {
    expect(sceneAt(scene, stepEnd(timeline, 1)).fragments.get(loopId)!.iteration).toEqual({ n: 2, of: 3 });
    expect(sceneAt(scene, stepEnd(timeline, 3)).fragments.get(loopId)!.iteration).toBeUndefined();
    expect(compiled.steps).toHaveLength(4);
  });

  it('never lets activation bars retract when a loop jumps back up', () => {
    const r = model('A->>+B: open\nloop l\nB->>C: a\nB->>C: b\nend\nB-->>-A: close', { loopIterations: 2 });
    const bottoms = r.timeline.starts.map((_, i) => sceneAt(r.scene, stepEnd(r.timeline, i)).activations[0]!.y2);
    for (let i = 1; i < bottoms.length; i++) expect(bottoms[i]).toBeGreaterThanOrEqual(bottoms[i - 1]!);
  });
});

describe('concurrent lanes in the scene', () => {
  it('gives every message of a concurrent step its own pulse', () => {
    const { scene, timeline } = model('par a\nA->>B: x\nand b\nC->>D: y\nend', { parallel: 'concurrent' });
    const s = sceneAt(scene, timeline.transitions[0]! / 2);
    const pulses = [...s.messages.values()].filter((m) => m.pulse);
    expect(pulses).toHaveLength(2);
  });
});

describe('focus dimming', () => {
  const { scene, timeline, layout } = model('A->>B: ab\nB->>C: bc\nC->>A: ca\nNote over C: n');
  const end = timeline.duration;
  const byLabel = (s: ReturnType<typeof sceneAt>, label: string) => s.messages.get(layout.messages.find((m) => m.label.lines[0] === label)!.id)!;

  it('dims everything not touching a single focused participant', () => {
    const s = sceneAt(scene, end, DEFAULT_DISPLAY, { focus: new Set(['A']) });
    expect(byLabel(s, 'ab').dimmed).toBeUndefined();
    expect(byLabel(s, 'ca').dimmed).toBeUndefined();
    expect(byLabel(s, 'bc')).toMatchObject({ dimmed: true, opacity: 0.18 });
    expect([...s.notes.values()][0]).toMatchObject({ dimmed: true });
    expect(s.participants.get('A')!.focused).toBe(true);
  });

  it('keeps only interactions among several focused participants', () => {
    const s = sceneAt(scene, end, DEFAULT_DISPLAY, { focus: new Set(['A', 'B']) });
    expect(byLabel(s, 'ab').dimmed).toBeUndefined();
    expect(byLabel(s, 'ca').dimmed).toBe(true);
  });

  it('does nothing without focus', () => {
    const s = sceneAt(scene, end);
    expect([...s.messages.values()].every((m) => !m.dimmed)).toBe(true);
  });
});
