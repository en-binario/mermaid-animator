import { describe, expect, it } from 'vitest';
import { approximateMeasure, buildTopology, compileDiagram, layoutSequence, stepEnd, type CompileOptions } from '@mermaid-animator/core';
import { DEFAULT_DISPLAY, prepareScene, prepareTopologyScene, sceneAt, topologySceneAt } from '../src';

function model(body: string, options: CompileOptions = {}) {
  const d = compileDiagram(`sequenceDiagram\n${body}`, options);
  if (!d.sequence) throw new Error(JSON.stringify(d.diagnostics));
  const { model: m, compiled, timeline } = d.sequence;
  const topology = buildTopology(m, compiled);
  return { topo: prepareTopologyScene(topology, compiled, timeline), topology, compiled, timeline, m };
}

const flow = 'participant U\nparticipant G\nparticipant A\nU->>+G: login\nG->>A: verify\nA-->>G: ok\nG->>A: audit\nG-->>-U: token\nG->>G: log';

describe('topology scene', () => {
  it('rests on the same step as the sequence view with earlier edges played', () => {
    const { topo, compiled, timeline, m } = model(flow);
    const layout = layoutSequence(m, compiled, { measure: approximateMeasure });
    const seq = prepareScene(layout, compiled, timeline);
    const t = stepEnd(timeline, 4);
    const s = sceneAt(seq, t);
    const tp = topologySceneAt(topo, t);
    expect(s.position.index).toBe(4);
    expect(tp.position.index).toBe(4);
    expect(tp.edges.get('U->G')!.state).toBe('past');
    expect(tp.edges.get('G->A')!.state).toBe('past');
    expect(tp.edges.get('G->U|return')!.state).toBe('current');
    expect(tp.edges.get('G->G')!.state).toBe('future');
    expect(tp.edges.get('G->G')!.opacity).toBe(0);
  });

  it('draws an edge the first time it plays and pulses along it afterwards', () => {
    const { topo, timeline } = model(flow);
    const mid = (k: number) => timeline.starts[k]! + timeline.transitions[k]! / 2;
    const first = topologySceneAt(topo, mid(1)).edges.get('G->A')!;
    expect(first.draw).toBeGreaterThan(0);
    expect(first.draw).toBeLessThan(1);
    expect(first.pulses).toHaveLength(1);
    const again = topologySceneAt(topo, mid(3)).edges.get('G->A')!;
    expect(again.draw).toBe(1);
    expect(again.pulses[0]!.at).toBeGreaterThan(0);
  });

  it('pulses every edge of a concurrent step at once', () => {
    const { topo, timeline } = model('par a\nA->>B: x\nand b\nC->>D: y\nend', { parallel: 'concurrent' });
    const s = topologySceneAt(topo, timeline.transitions[0]! / 2);
    expect(s.edges.get('A->B')!.pulses).toHaveLength(1);
    expect(s.edges.get('C->D')!.pulses).toHaveLength(1);
  });

  it('rings a node while it has an open activation', () => {
    const { topo, timeline } = model(flow);
    expect(topologySceneAt(topo, stepEnd(timeline, 0)).nodes.get('G')).toMatchObject({ ring: 1, depth: 1 });
    expect(topologySceneAt(topo, stepEnd(timeline, 4)).nodes.get('G')!.ring).toBe(0);
    expect(topologySceneAt(topo, 0).nodes.get('G')!.ring).toBe(0);
  });

  it('lights the sender at the start and the receiver on arrival', () => {
    const { topo, timeline } = model(flow);
    const early = topologySceneAt(topo, timeline.starts[1]! + 130).nodes;
    expect(early.get('G')!.glow).toBe(1);
    expect(early.get('A')!.glow).toBe(0);
    const late = topologySceneAt(topo, stepEnd(timeline, 1)).nodes;
    expect(late.get('A')!.glow).toBe(1);
  });

  it('dims nodes and edges outside the focus and marks cross-highlights', () => {
    const { topo, timeline } = model(flow);
    const s = topologySceneAt(topo, timeline.duration, DEFAULT_DISPLAY, { focus: new Set(['A']), highlight: new Set(['U', 'G->A']) });
    expect(s.nodes.get('U')).toMatchObject({ dimmed: true, highlighted: true });
    expect(s.nodes.get('A')).toMatchObject({ focused: true });
    expect(s.edges.get('U->G')!.dimmed).toBe(true);
    expect(s.edges.get('G->A')).toMatchObject({ highlighted: true });
    expect(s.edges.get('G->A')!.dimmed).toBeUndefined();
  });

  it('ghosts edges whose messages never play', () => {
    const { topo, timeline } = model('A->>B: x\nalt ok\nB->>C: yes\nelse no\nB->>D: no\nend');
    expect(topologySceneAt(topo, timeline.duration).edges.get('B->D')).toMatchObject({ state: 'unplayed', opacity: 0.12 });
  });
});
