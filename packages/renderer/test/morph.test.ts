import { describe, expect, it } from 'vitest';
import { approximateMeasure, buildTopology, compileDiagram, layoutSequence, stepEnd, topologyGeometry, topologyNodeSize, type Rect } from '@mermaid-animator/core';
import { morphAt, MORPH_MS, prepareScene, prepareTopologyScene, sceneAt, topologySceneAt, type MorphInput } from '../src';

function input(): MorphInput {
  const d = compileDiagram('sequenceDiagram\nparticipant U\nparticipant G\nparticipant A\nU->>+G: login\nG->>A: verify\nG->>A: audit\nA-->>G: ok\nG-->>-U: token\nNote over G: done');
  const { model, compiled, timeline } = d.sequence!;
  const layout = layoutSequence(model, compiled, { measure: approximateMeasure });
  const topology = buildTopology(model, compiled);
  const nodes = new Map<string, Rect>(topology.nodes.map((n, i) => {
    const s = topologyNodeSize(n, approximateMeasure);
    return [n.id, { x: 100 + i * 260, y: 400, w: s.w, h: s.h }];
  }));
  const geometry = topologyGeometry(topology, nodes, 'curved');
  const t = stepEnd(timeline, timeline.starts.length - 1);
  return {
    layout,
    sequence: sceneAt(prepareScene(layout, compiled, timeline), t),
    topology,
    geometry,
    topologyScene: topologySceneAt(prepareTopologyScene(topology, compiled, timeline), t),
  };
}

describe('morphAt', () => {
  const data = input();
  const header = (id: string) => data.layout.participants.find((p) => p.id === id)!.header;

  it('starts exactly on the sequence drawing', () => {
    const f = morphAt(data, 0);
    expect(f.nodes.find((n) => n.id === 'G')!.rect).toEqual(header('G'));
    expect(f.lifelines.every((l) => l.opacity === 1)).toBe(true);
    expect(f.chords.filter((c) => c.opacity > 0)).toHaveLength(5);
    expect(f.edges.every((e) => e.opacity === 0)).toBe(true);
    expect(f.fades.some((x) => x.kind === 'note' && x.opacity > 0)).toBe(true);
  });

  it('is mid-way at 300 ms: headers between views, lifelines gone', () => {
    const f = morphAt(data, 300);
    const g = f.nodes.find((n) => n.id === 'G')!.rect;
    const target = data.geometry.nodes.get('G')!;
    expect(g.y).toBeGreaterThan(header('G').y);
    expect(g.y).toBeLessThan(target.y);
    expect(f.lifelines.every((l) => l.opacity === 0)).toBe(true);
    expect(f.fades.every((x) => x.kind === 'box' || x.opacity === 0)).toBe(true);
  });

  it('merges chords into edges with the badge counting up', () => {
    const f = morphAt(data, 440);
    const ga = f.edges.find((e) => e.key === 'G->A')!;
    expect(ga.opacity).toBeGreaterThan(0);
    expect(ga.opacity).toBeLessThan(1);
    expect(ga.badge!.text).toMatch(/^×[12]$/);
  });

  it('ends exactly on the topology drawing', () => {
    const f = morphAt(data, MORPH_MS);
    expect(f.nodes.find((n) => n.id === 'G')!.rect).toEqual(data.geometry.nodes.get('G'));
    expect(f.chords.every((c) => c.opacity === 0)).toBe(true);
    const ga = f.edges.find((e) => e.key === 'G->A')!;
    expect(ga.opacity).toBe(1);
    expect(ga.badge!.text).toBe('×2');
    expect(ga.points).toEqual(data.geometry.edges.get('G->A')!.points);
    expect(f.labels).toBe(1);
  });
});
