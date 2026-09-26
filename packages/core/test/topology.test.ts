import { describe, expect, it } from 'vitest';
import { approximateMeasure, boxExit, buildTopology, compileDiagram, edgeWidth, interpolateGeometry, offsetPolyline, pointOnPolyline, topologyGeometry, topologyNodeSize, type CompileOptions, type Rect, type TopologyOptions } from '../src';

function topology(body: string, options: TopologyOptions = {}, compile: CompileOptions = {}) {
  const d = compileDiagram(`sequenceDiagram\n${body}`, compile);
  if (!d.sequence) throw new Error(JSON.stringify(d.diagnostics));
  return { topo: buildTopology(d.sequence.model, d.sequence.compiled, options), model: d.sequence.model, steps: d.sequence.compiled.steps };
}

const flow = 'participant U\nparticipant G\nparticipant A\nU->>G: login\nG->>A: verify\nA-->>G: ok\nG->>A: verify again\nG->>A: audit\nA-->>G: ok\nG-->>U: token\nG->>G: log';

describe('buildTopology', () => {
  it('aggregates messages per ordered pair with counts and steps', () => {
    const { topo } = topology(flow);
    const ga = topo.edges.find((e) => e.key === 'G->A')!;
    expect(ga.messages).toHaveLength(3);
    expect(ga.steps).toEqual([1, 3, 4]);
    expect(ga.kind).toBe('request');
    expect(topo.edges.find((e) => e.key === 'U->G')!.messages).toHaveLength(1);
  });

  it('turns self-calls into self edges', () => {
    const { topo } = topology(flow);
    expect(topo.edges.find((e) => e.key === 'G->G')).toMatchObject({ kind: 'self', steps: [7] });
  });

  it('merges return messages into a lane beside their request edge', () => {
    const { topo } = topology(flow, { returnMessages: 'merge' });
    const ret = topo.edges.find((e) => e.key === 'A->G|return')!;
    expect(ret).toMatchObject({ kind: 'return', laneOf: 'G->A' });
    expect(ret.messages).toHaveLength(2);
    // A return without a request in the opposite direction has no lane to join.
    expect(topo.edges.find((e) => e.key === 'G->U|return')).toMatchObject({ laneOf: 'U->G' });
  });

  it('draws returns as their own edges when separate', () => {
    const { topo } = topology(flow, { returnMessages: 'separate' });
    expect(topo.edges.find((e) => e.key === 'A->G|return')!.laneOf).toBeUndefined();
    expect(topo.edges.filter((e) => e.kind === 'return')).toHaveLength(2);
  });

  it('omits returns when hidden and leaves them out of the message map', () => {
    const { topo, model } = topology(flow, { returnMessages: 'hide' });
    expect(topo.edges.some((e) => e.kind === 'return')).toBe(false);
    const ok = model.body.find((n) => n.type === 'message' && n.message.label === 'ok');
    expect(ok?.type === 'message' && topo.messageEdge.has(ok.message.id)).toBe(false);
  });

  it('maps every visible message to its edge', () => {
    const { topo, model } = topology(flow);
    for (const n of model.body) if (n.type === 'message') expect(topo.messageEdge.has(n.message.id)).toBe(true);
  });

  it('orders nodes by first call and puts silent participants last', () => {
    const { topo } = topology('participant Z\nparticipant A\nparticipant B\nB->>A: x\nA->>B: y');
    expect(topo.nodes.map((n) => [n.id, n.order])).toEqual([
      ['B', 0],
      ['A', 1],
      ['Z', 2],
    ]);
  });

  it('turns boxes into clusters and applies @type kinds', () => {
    const { topo } = topology('box Aqua Core\nparticipant G\n%% @type database\nparticipant L\nend\nparticipant U\nU->>G: x\nG->>L: y');
    expect(topo.clusters).toEqual([expect.objectContaining({ label: 'Core', members: ['G', 'L'] })]);
    expect(topo.nodes.find((n) => n.id === 'L')).toMatchObject({ kind: 'database', cluster: topo.clusters[0]!.id });
    expect(topo.nodes.find((n) => n.id === 'U')!.cluster).toBeUndefined();
  });

  it('includes messages of unplayed branches with no steps', () => {
    const { topo } = topology('A->>B: x\nalt ok\nB->>C: yes\nelse no\nB->>D: no\nend');
    expect(topo.edges.find((e) => e.key === 'B->D')).toMatchObject({ steps: [] });
    expect(topo.edges.find((e) => e.key === 'B->C')!.steps).toEqual([1]);
  });

  it('records every loop iteration step on the edge', () => {
    const { topo } = topology('loop retry\nA->>B: try\nend', {}, { loopIterations: 3 });
    expect(topo.edges[0]!.steps).toEqual([0, 1, 2]);
  });
});

describe('edgeWidth', () => {
  it('grows with the log of the count and caps at 5 px', () => {
    expect(edgeWidth(1)).toBe(1.25);
    expect(edgeWidth(2)).toBe(2.75);
    expect(edgeWidth(1000)).toBe(5);
  });
});

describe('topology geometry', () => {
  const place = (ids: string[], gap = 240) => new Map<string, Rect>(ids.map((id, i) => [id, { x: i * gap, y: 0, w: 112, h: 40 }]));

  it('sizes boxes like sequence headers and glyph kinds taller', () => {
    const box = topologyNodeSize({ label: 'Gateway', kind: 'participant' }, approximateMeasure);
    const actor = topologyNodeSize({ label: 'Gateway', kind: 'actor' }, approximateMeasure);
    const db = topologyNodeSize({ label: 'Gateway', kind: 'database' }, approximateMeasure);
    expect(box).toMatchObject({ w: 112, h: 40 });
    expect(actor.h).toBeGreaterThan(box.h);
    expect(db.h).toBeGreaterThan(box.h);
  });

  it('leaves boxes on their border toward the target', () => {
    expect(boxExit({ x: 0, y: 0, w: 100, h: 40 }, { x: 500, y: 20 }, 0)).toEqual({ x: 100, y: 20 });
  });

  it('offsets polylines to the left of travel', () => {
    expect(offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5)).toEqual([{ x: 0, y: 5 }, { x: 10, y: 5 }]);
  });

  it('routes straight edges border to border and separates opposite pairs', () => {
    const { topo } = topology('A->>B: x\nB->>A: y');
    const g = topologyGeometry(topo, place(['A', 'B']), 'straight');
    const ab = g.edges.get('A->B')!.points;
    const ba = g.edges.get('B->A')!.points;
    expect(ab[0]!.x).toBeCloseTo(115, 0);
    expect(ab[ab.length - 1]!.x).toBeCloseTo(237, 0);
    expect(Math.abs(ab[0]!.y - ba[ba.length - 1]!.y)).toBeGreaterThan(8);
  });

  it('runs merged return lanes beside the request edge, in the return direction', () => {
    const { topo } = topology('A->>B: call\nB-->>A: back');
    const g = topologyGeometry(topo, place(['A', 'B']), 'curved');
    const request = g.edges.get('A->B')!.points;
    const lane = g.edges.get('B->A|return')!.points;
    expect(lane[0]!.x).toBeGreaterThan(lane[lane.length - 1]!.x);
    const mid = pointOnPolyline(request, 0.5);
    const laneMid = pointOnPolyline(lane, 0.5);
    expect(Math.hypot(mid.x - laneMid.x, mid.y - laneMid.y)).toBeGreaterThan(6);
  });

  it('draws orthogonal routes with axis-aligned segments', () => {
    const { topo } = topology('A->>B: x');
    const nodes = new Map<string, Rect>([['A', { x: 0, y: 0, w: 112, h: 40 }], ['B', { x: 300, y: 200, w: 112, h: 40 }]]);
    const pts = topologyGeometry(topo, nodes, 'orthogonal').edges.get('A->B')!.points;
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.x === pts[i - 1]!.x || pts[i]!.y === pts[i - 1]!.y).toBe(true);
  });

  it('wraps clusters around members and bounds around everything', () => {
    const { topo } = topology('box Core\nparticipant A\nparticipant B\nend\nA->>B: x\nA->>A: self');
    const g = topologyGeometry(topo, place(['A', 'B']), 'curved');
    const c = [...g.clusters.values()][0]!;
    expect(c.x).toBeLessThan(0);
    expect(c.w).toBeGreaterThan(352);
    expect(g.edges.get('A->A')!.points.length).toBeGreaterThan(10);
    expect(g.bounds.x).toBeLessThan(c.x);
  });

  it('interpolates shared nodes and places new ones directly', () => {
    const { topo } = topology('A->>B: x\nB->>C: y');
    const a = topologyGeometry(topo, place(['A', 'B']), 'straight');
    const b = topologyGeometry(topo, new Map([...place(['A', 'B', 'C']), ['A', { x: 100, y: 0, w: 112, h: 40 }]]), 'straight');
    const half = interpolateGeometry(a, b, 0.5);
    expect(half.nodes.get('A')!.x).toBe(50);
    expect(half.nodes.get('C')).toEqual(b.nodes.get('C'));
  });
});
