/**
 * Topology layout engines (spec topology-view, M2b D2): `layered` (ELK in a web worker),
 * `force` (seeded d3-force, deterministic) and `manual` (stored positions, the rest layered).
 * Each returns node boxes; routes, clusters and bounds come from `topologyGeometry` in core.
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import type { ELK, ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';
import { fnv1a64, type Point, type Rect, type Topology } from '@mermaid-animator/core';

export type LayoutKind = 'layered' | 'force' | 'manual';
export type Direction = 'LR' | 'TB';

export interface Size {
  w: number;
  h: number;
}

export interface LayoutResult {
  nodes: Map<string, Rect>;
  /** Routes computed by the engine (ELK orthogonal), used as given. */
  routes?: Map<string, Point[]>;
}

// -- force -------------------------------------------------------------------------------------------------------

/** Park–Miller style LCG in [0, 1), seeded — d3-force's randomness made reproducible. */
export function lcg(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => (state = (state * 48271) % 2147483647) / 2147483647;
}

/** Deterministic seed from the node ids. */
export function layoutSeed(topology: Topology): number {
  return parseInt(fnv1a64(topology.nodes.map((n) => n.id).join('\u0000')).slice(0, 8), 16);
}

interface ForceNode extends SimulationNodeDatum {
  id: string;
  size: Size;
}

/** Seeded force layout: 300 synchronous ticks, identical output for the same diagram. */
export function forceLayout(topology: Topology, sizes: ReadonlyMap<string, Size>): LayoutResult {
  const nodes: ForceNode[] = topology.nodes.map((n) => ({ id: n.id, size: sizes.get(n.id) ?? { w: 112, h: 40 } }));
  const known = new Set(nodes.map((n) => n.id));
  const links: SimulationLinkDatum<ForceNode>[] = topology.edges
    .filter((e) => e.kind !== 'self' && !e.laneOf && known.has(e.from) && known.has(e.to))
    .map((e) => ({ source: e.from, target: e.to }));
  const radius = (n: ForceNode) => Math.hypot(n.size.w, n.size.h) / 2 + 24;
  const simulation = forceSimulation(nodes)
    .randomSource(lcg(layoutSeed(topology)))
    .force('link', forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(links).id((n) => n.id).distance(190).strength(0.7))
    .force('charge', forceManyBody<ForceNode>().strength(-900))
    .force('collide', forceCollide<ForceNode>(radius).strength(1))
    .force('x', forceX<ForceNode>(0).strength(0.04))
    .force('y', forceY<ForceNode>(0).strength(0.06))
    .stop();
  simulation.tick(300);
  const out = new Map<string, Rect>();
  for (const n of nodes) out.set(n.id, { x: Math.round((n.x ?? 0) - n.size.w / 2), y: Math.round((n.y ?? 0) - n.size.h / 2), w: n.size.w, h: n.size.h });
  return { nodes: normalise(out) };
}

/** Shifts boxes so the drawing starts at (0, 0). */
function normalise(nodes: Map<string, Rect>): Map<string, Rect> {
  const rects = [...nodes.values()];
  if (!rects.length) return nodes;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return new Map([...nodes].map(([id, r]) => [id, { ...r, x: r.x - x, y: r.y - y }]));
}

// -- layered (ELK) --------------------------------------------------------------------------------------------------

export interface LayeredOptions {
  direction: Direction;
  orthogonal: boolean;
  /** Previous positions, used to keep the order stable across live reloads. */
  hints?: ReadonlyMap<string, Rect>;
}

/** The ELK graph for a topology: nodes in first-call order, clusters as compound nodes. */
export function elkGraph(topology: Topology, sizes: ReadonlyMap<string, Size>, options: LayeredOptions): ElkNode {
  const hinted = options.hints && topology.nodes.every((n) => options.hints!.has(n.id));
  const nodeOf = (id: string): ElkNode => {
    const size = sizes.get(id) ?? { w: 112, h: 40 };
    const hint = hinted ? options.hints!.get(id) : undefined;
    return {
      id,
      width: size.w,
      height: size.h,
      ...(hint ? { layoutOptions: { 'elk.position': `(${Math.round(hint.x)},${Math.round(hint.y)})` } } : {}),
    };
  };
  const ordered = [...topology.nodes].sort((a, b) => a.order - b.order);
  const children: ElkNode[] = [];
  const clusterNodes = new Map<string, ElkNode>();
  for (const c of topology.clusters) {
    const node: ElkNode = { id: `cluster:${c.id}`, children: [], layoutOptions: { 'elk.padding': '[top=38,left=16,bottom=16,right=16]' } };
    clusterNodes.set(c.id, node);
  }
  for (const n of ordered) {
    const cluster = n.cluster ? clusterNodes.get(n.cluster) : undefined;
    if (cluster) {
      if (!children.includes(cluster)) children.push(cluster);
      cluster.children!.push(nodeOf(n.id));
    } else children.push(nodeOf(n.id));
  }
  const known = new Set(topology.nodes.map((n) => n.id));
  const edges: ElkExtendedEdge[] = topology.edges
    .filter((e) => e.kind !== 'self' && !e.laneOf && known.has(e.from) && known.has(e.to))
    .map((e) => ({ id: e.key, sources: [e.from], targets: [e.to] }));
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': options.direction === 'TB' ? 'DOWN' : 'RIGHT',
      'elk.randomSeed': '1',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.semiInteractive': hinted ? 'true' : 'false',
      'elk.edgeRouting': options.orthogonal ? 'ORTHOGONAL' : 'POLYLINE',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '14',
    },
    children,
    edges,
  };
}

/** Reads absolute node boxes (and orthogonal routes) back from a laid-out ELK graph. */
export function readElk(graph: ElkNode, orthogonal: boolean): LayoutResult {
  const nodes = new Map<string, Rect>();
  const offsets = new Map<string, Point>([['root', { x: 0, y: 0 }]]);
  const visit = (node: ElkNode, ox: number, oy: number) => {
    for (const child of node.children ?? []) {
      const x = ox + (child.x ?? 0);
      const y = oy + (child.y ?? 0);
      offsets.set(child.id, { x, y });
      if (child.id.startsWith('cluster:')) visit(child, x, y);
      else nodes.set(child.id, { x, y, w: child.width ?? 0, h: child.height ?? 0 });
    }
  };
  visit(graph, 0, 0);
  if (!orthogonal) return { nodes };
  const routes = new Map<string, Point[]>();
  const collect = (node: ElkNode) => {
    for (const e of (node.edges ?? []) as ElkExtendedEdge[]) {
      const section = e.sections?.[0];
      if (!section) continue;
      // Edge coordinates are relative to the edge's container.
      const o = offsets.get((e as { container?: string }).container ?? node.id) ?? { x: 0, y: 0 };
      const pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
      routes.set(e.id, pts);
    }
    for (const child of node.children ?? []) collect(child);
  };
  collect(graph);
  return { nodes, routes };
}

export async function layeredLayout(elk: ELK, topology: Topology, sizes: ReadonlyMap<string, Size>, options: LayeredOptions): Promise<LayoutResult> {
  const graph = await elk.layout(elkGraph(topology, sizes, options));
  return readElk(graph, options.orthogonal);
}

// -- manual -------------------------------------------------------------------------------------------------------

/**
 * Manual layout (spec topology-view): stored centre positions where known; nodes without one are
 * placed where the layered layout (`fallback`) puts them.
 */
export function manualLayout(topology: Topology, sizes: ReadonlyMap<string, Size>, stored: ReadonlyMap<string, Point>, fallback: ReadonlyMap<string, Rect>): LayoutResult {
  const nodes = new Map<string, Rect>();
  for (const n of topology.nodes) {
    const size = sizes.get(n.id) ?? { w: 112, h: 40 };
    const at = stored.get(n.id);
    const f = fallback.get(n.id);
    if (at) nodes.set(n.id, { x: at.x - size.w / 2, y: at.y - size.h / 2, w: size.w, h: size.h });
    else nodes.set(n.id, f ? { x: f.x, y: f.y, w: size.w, h: size.h } : { x: 0, y: 0, w: size.w, h: size.h });
  }
  return { nodes };
}

/** Centre positions of node boxes, for `layout/save`. */
export function centres(nodes: ReadonlyMap<string, Rect>): Record<string, Point> {
  return Object.fromEntries([...nodes].map(([id, r]) => [id, { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }]));
}

// -- stability under edits ---------------------------------------------------------------------------------------

/**
 * Layout stability (spec topology-view): after a relayout, nodes that still exist keep their
 * previous centres when their relative order along both axes is unchanged; new nodes are moved by
 * the mean shift of the surviving nodes so they sit in the same frame. When the order changed —
 * the strategy re-ordered the graph — the new layout is returned as is.
 */
export function stabilise(previous: ReadonlyMap<string, Rect>, next: Map<string, Rect>): { nodes: Map<string, Rect>; kept: boolean } {
  const shared = [...next.keys()].filter((id) => previous.has(id));
  if (!shared.length) return { nodes: next, kept: false };
  const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  // Re-ordered when some pair clearly swaps sides on an axis (differences under 8 px are wobble).
  const tolerance = 8;
  const sameOrder = (axis: 'x' | 'y') => {
    for (let i = 0; i < shared.length; i++)
      for (let j = i + 1; j < shared.length; j++) {
        const a = shared[i]!;
        const b = shared[j]!;
        const before = centre(previous.get(a)!)[axis] - centre(previous.get(b)!)[axis];
        const after = centre(next.get(a)!)[axis] - centre(next.get(b)!)[axis];
        if ((before > tolerance && after < -tolerance) || (before < -tolerance && after > tolerance)) return false;
      }
    return true;
  };
  if (!sameOrder('x') || !sameOrder('y')) return { nodes: next, kept: false };
  let dx = 0;
  let dy = 0;
  for (const id of shared) {
    dx += centre(previous.get(id)!).x - centre(next.get(id)!).x;
    dy += centre(previous.get(id)!).y - centre(next.get(id)!).y;
  }
  dx /= shared.length;
  dy /= shared.length;
  const nodes = new Map<string, Rect>();
  for (const [id, r] of next) {
    const old = previous.get(id);
    if (old) {
      const c = centre(old);
      nodes.set(id, { x: c.x - r.w / 2, y: c.y - r.h / 2, w: r.w, h: r.h });
    } else nodes.set(id, { ...r, x: r.x + dx, y: r.y + dy });
  }
  return { nodes, kept: true };
}
