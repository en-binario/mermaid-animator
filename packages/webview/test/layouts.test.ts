import { describe, expect, it } from 'vitest';
import ELK from 'elkjs/lib/elk.bundled.js';
import { approximateMeasure, buildTopology, compileDiagram, topologyNodeSize } from '@mermaid-animator/core';
import { elkGraph, forceLayout, layeredLayout, lcg, manualLayout, stabilise } from '../src/topology/layouts';

function setup(body: string) {
  const d = compileDiagram(`sequenceDiagram\n${body}`);
  if (!d.sequence) throw new Error(JSON.stringify(d.diagnostics));
  const topology = buildTopology(d.sequence.model, d.sequence.compiled);
  const sizes = new Map(topology.nodes.map((n) => [n.id, topologyNodeSize(n, approximateMeasure)]));
  return { topology, sizes };
}

const flow = 'box Core\nparticipant G\nparticipant A\nend\nparticipant U\nparticipant L\nU->>G: login\nG->>A: verify\nA-->>G: ok\nG->>L: write\nL-->>G: ack\nG-->>U: token';

describe('force layout', () => {
  it('is deterministic for the same diagram', () => {
    const { topology, sizes } = setup(flow);
    const a = forceLayout(topology, sizes).nodes;
    const b = forceLayout(topology, sizes).nodes;
    expect([...a]).toEqual([...b]);
  });

  it('keeps nodes apart', () => {
    const { topology, sizes } = setup(flow);
    const rects = [...forceLayout(topology, sizes).nodes.values()];
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });

  it('uses a seeded random source', () => {
    const r1 = lcg(42);
    const r2 = lcg(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe('layered layout', () => {
  it('builds clusters as compound nodes in first-call order', () => {
    const { topology, sizes } = setup(flow);
    const graph = elkGraph(topology, sizes, { direction: 'LR', orthogonal: false });
    expect(graph.children!.map((c) => c.id)).toEqual(['U', expect.stringMatching(/^cluster:/), 'L']);
    expect(graph.children![1]!.children!.map((c) => c.id)).toEqual(['G', 'A']);
    expect(graph.layoutOptions!['elk.direction']).toBe('RIGHT');
    expect(graph.edges!.every((e) => !e.id.includes('|return'))).toBe(true);
  });

  it('lays out left to right with absolute positions, deterministically', async () => {
    const { topology, sizes } = setup(flow);
    const elk = new ELK();
    const a = await layeredLayout(elk, topology, sizes, { direction: 'LR', orthogonal: false });
    const b = await layeredLayout(elk, topology, sizes, { direction: 'LR', orthogonal: false });
    expect([...a.nodes]).toEqual([...b.nodes]);
    expect(a.nodes.get('U')!.x).toBeLessThan(a.nodes.get('G')!.x);
    expect(a.nodes.get('G')!.x).toBeLessThan(a.nodes.get('A')!.x);
  });

  it('lays out top to bottom and returns orthogonal routes', async () => {
    const { topology, sizes } = setup(flow);
    const r = await layeredLayout(new ELK(), topology, sizes, { direction: 'TB', orthogonal: true });
    expect(r.nodes.get('U')!.y).toBeLessThan(r.nodes.get('G')!.y);
    const route = r.routes!.get('G->A')!;
    expect(route.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < route.length; i++) expect(route[i]!.x === route[i - 1]!.x || route[i]!.y === route[i - 1]!.y).toBe(true);
  });
});

describe('manual layout', () => {
  it('uses stored centres and places unknown nodes by the layered layout', () => {
    const { topology, sizes } = setup('A->>B: x\nB->>C: y');
    const fallback = new Map(topology.nodes.map((n, i) => [n.id, { x: i * 200, y: 0, w: 112, h: 40 }]));
    const r = manualLayout(topology, sizes, new Map([['A', { x: 500, y: 300 }], ['B', { x: 800, y: 300 }]]), fallback).nodes;
    expect(r.get('A')).toMatchObject({ x: 444, y: 280 });
    expect(r.get('C')).toMatchObject({ x: 400, y: 0 });
  });
});

describe('layout stability', () => {
  const rect = (x: number, y: number) => ({ x, y, w: 100, h: 40 });

  it('keeps surviving nodes in place and aligns new ones when the order is unchanged', () => {
    const previous = new Map([['A', rect(0, 0)], ['B', rect(200, 0)]]);
    const next = new Map([['A', rect(0, 6)], ['B', rect(200, 4)], ['C', rect(400, 4)]]);
    const r = stabilise(previous, next);
    expect(r.kept).toBe(true);
    expect(r.nodes.get('A')).toEqual(rect(0, 0));
    expect(r.nodes.get('B')).toEqual(rect(200, 0));
    expect(r.nodes.get('C')).toEqual(rect(400, -1));
  });

  it('accepts the new layout when the strategy re-ordered the nodes', () => {
    const previous = new Map([['A', rect(0, 0)], ['B', rect(200, 0)]]);
    const next = new Map([['A', rect(200, 0)], ['B', rect(0, 0)]]);
    expect(stabilise(previous, next)).toEqual({ nodes: next, kept: false });
  });
});
