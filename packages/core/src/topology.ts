/**
 * Topology model (spec topology-view, M2b D1): participants as nodes, `box` groups as clusters and
 * messages aggregated into directed edges, derived purely from the sequence IR and the step list.
 */
import type { ParticipantKind, SequenceModel, SequenceNode } from './sequence/model';
import type { CompiledSequence } from './steps';
import { LAYOUT, wrapMarkedText, wrappedWidth, type Measure, type Point, type Rect } from './layout';
import type { LabelMark, TextRun } from './markup';

export type ReturnMessages = 'merge' | 'separate' | 'hide';

export interface TopologyNode {
  id: string;
  label: string;
  /** Bold / italic ranges of `label` (spec label-formatting). */
  labelMarks?: LabelMark[];
  kind: ParticipantKind;
  /** Cluster (box) id, when the participant belongs to one. */
  cluster?: string;
  /** Position in first-call order (layered layout ordering). */
  order: number;
}

export interface TopologyCluster {
  id: string;
  label?: string;
  labelMarks?: LabelMark[];
  color: string;
  members: string[];
}

export type TopologyEdgeKind = 'request' | 'return' | 'self';

export interface TopologyEdge {
  /** `from->to` for requests and self-calls, `from->to|return` for return edges. */
  key: string;
  from: string;
  to: string;
  kind: TopologyEdgeKind;
  /** Aggregated message ids, in document order. */
  messages: string[];
  /** Steps in which any of its messages plays, ascending and unique. */
  steps: number[];
  /** For merged returns: the request edge whose lane this return runs beside. */
  laneOf?: string;
}

export interface Topology {
  nodes: TopologyNode[];
  clusters: TopologyCluster[];
  edges: TopologyEdge[];
  /** Message id → edge key (hidden returns are absent). */
  messageEdge: Map<string, string>;
}

export interface TopologyOptions {
  returnMessages?: ReturnMessages;
}

/** Messages in document order, including those inside every fragment branch. */
function messagesOf(nodes: SequenceNode[], out: { id: string; from: string; to: string; dotted: boolean }[] = []) {
  for (const n of nodes) {
    if (n.type === 'message') out.push({ id: n.message.id, from: n.message.from, to: n.message.to, dotted: n.message.dotted });
    else if (n.type === 'fragment') for (const b of n.fragment.branches) messagesOf(b.children, out);
  }
  return out;
}

export const edgeKey = (from: string, to: string, kind: TopologyEdgeKind = 'request') => `${from}->${to}${kind === 'return' ? '|return' : ''}`;

export function buildTopology(model: SequenceModel, compiled: Pick<CompiledSequence, 'steps' | 'participantKinds'>, options: TopologyOptions = {}): Topology {
  const returns = options.returnMessages ?? 'merge';
  const messages = messagesOf(model.body);

  // Nodes in first-call order; participants that never talk follow in declaration order.
  const order: string[] = [];
  const see = (id: string) => {
    if (!order.includes(id)) order.push(id);
  };
  for (const m of messages) {
    see(m.from);
    see(m.to);
  }
  const declared = new Set(model.participants.map((p) => p.id));
  for (const p of model.participants) see(p.id);
  const byId = new Map(model.participants.map((p) => [p.id, p]));
  const clusterOf = new Map<string, string>();
  for (const box of model.boxes) for (const member of box.members) clusterOf.set(member, box.id);
  const nodes: TopologyNode[] = order
    .filter((id) => declared.has(id))
    .map((id, i) => {
      const p = byId.get(id)!;
      return { id, label: p.label, ...(p.labelMarks ? { labelMarks: p.labelMarks } : {}), kind: compiled.participantKinds[id] ?? p.kind, cluster: clusterOf.get(id), order: i };
    });

  const stepsOf = new Map<string, number[]>();
  for (const step of compiled.steps) for (const id of step.messages) stepsOf.set(id, [...(stepsOf.get(id) ?? []), step.index]);

  const edges = new Map<string, TopologyEdge>();
  const messageEdge = new Map<string, string>();
  for (const m of messages) {
    const kind: TopologyEdgeKind = m.from === m.to ? 'self' : m.dotted ? 'return' : 'request';
    if (kind === 'return' && returns === 'hide') continue;
    const key = edgeKey(m.from, m.to, kind);
    const edge = edges.get(key) ?? { key, from: m.from, to: m.to, kind, messages: [], steps: [] };
    edge.messages.push(m.id);
    for (const s of stepsOf.get(m.id) ?? []) if (!edge.steps.includes(s)) edge.steps.push(s);
    edges.set(key, edge);
    messageEdge.set(m.id, key);
  }
  if (returns === 'merge') {
    for (const edge of edges.values()) {
      const request = edgeKey(edge.to, edge.from);
      if (edge.kind === 'return' && edges.has(request)) edge.laneOf = request;
    }
  }
  for (const edge of edges.values()) edge.steps.sort((a, b) => a - b);

  const clusters: TopologyCluster[] = model.boxes.map((b) => ({ id: b.id, label: b.label, ...(b.labelMarks ? { labelMarks: b.labelMarks } : {}), color: b.color, members: [...b.members] }));
  return { nodes, clusters, edges: [...edges.values()], messageEdge };
}

/** Edge width for count weighting (spec topology-view): 1.25 + 1.5·log₂(n) px, capped at 5 px. */
export function edgeWidth(count: number): number {
  return Math.min(5, 1.25 + 1.5 * Math.log2(Math.max(1, count)));
}

// -- geometry ---------------------------------------------------------------------------------------------------

export type EdgeStyle = 'curved' | 'orthogonal' | 'straight';

export interface EdgeRoute {
  /** Polyline from source to target (curves are pre-sampled), in drawing coordinates. */
  points: Point[];
  /** Where the `×n` badge sits. */
  label: Point;
}

export interface TopologyGeometry {
  /** Node boxes (shape plus label). */
  nodes: Map<string, Rect>;
  clusters: Map<string, Rect>;
  edges: Map<string, EdgeRoute>;
  bounds: Rect;
}

export interface NodeSize {
  w: number;
  h: number;
  lines: string[];
  /** Styled runs per line when the label has bold / italic text. */
  runs?: TextRun[][];
}

/** Kinds drawn as a glyph above the label (the rest are boxes with the label inside). */
export const GLYPH_KINDS: ReadonlySet<ParticipantKind> = new Set(['actor', 'boundary', 'control', 'entity']);

export const TOPOLOGY = {
  margin: 32,
  glyphHeight: 34,
  clusterPad: 16,
  clusterLabel: 22,
  pairOffset: 9,
  laneOffset: 7,
  selfRadius: 14,
  curveSamples: 16,
};

/** Node box size for a participant kind and label (labels wrap like sequence headers). */
export function topologyNodeSize(node: Pick<TopologyNode, 'label' | 'kind' | 'labelMarks'>, measure: Measure): NodeSize {
  const L = LAYOUT;
  const wrapped = wrapMarkedText(node.label, node.labelMarks, measure, 'participant', 200, 3);
  const lines = wrapped.lines;
  const text = wrappedWidth(wrapped, measure, 'participant');
  const extraLines = (lines.length - 1) * L.lineHeight;
  const runs = wrapped.runs ? { runs: wrapped.runs } : {};
  if (GLYPH_KINDS.has(node.kind)) return { w: Math.max(72, text + 16), h: TOPOLOGY.glyphHeight + 22 + extraLines, lines, ...runs };
  const w = Math.max(L.minHeaderWidth, text + 2 * L.headerPaddingX);
  if (node.kind === 'database') return { w, h: L.headerHeight + 16 + extraLines, lines, ...runs };
  if (node.kind === 'queue') return { w: w + 20, h: L.headerHeight + extraLines, lines, ...runs };
  if (node.kind === 'collections') return { w: w + 6, h: L.headerHeight + 6 + extraLines, lines, ...runs };
  return { w, h: L.headerHeight + extraLines, lines, ...runs };
}

const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Point) => Math.hypot(v.x, v.y) || 1;

/** Where the ray from the rect's centre toward `toward` leaves the rect (plus `pad`). */
export function boxExit(r: Rect, toward: Point, pad = 3): Point {
  const c = centre(r);
  const d = sub(toward, c);
  const hw = r.w / 2 + pad;
  const hh = r.h / 2 + pad;
  const s = Math.min(Math.abs(d.x) > 1e-9 ? hw / Math.abs(d.x) : Infinity, Math.abs(d.y) > 1e-9 ? hh / Math.abs(d.y) : Infinity);
  return Number.isFinite(s) ? { x: c.x + d.x * s, y: c.y + d.y * s } : c;
}

/** Offsets a polyline sideways by `d` (positive = left of travel), mitring the joints. */
export function offsetPolyline(points: readonly Point[], d: number): Point[] {
  if (points.length < 2 || d === 0) return points.map((p) => ({ ...p }));
  const normals = points.slice(1).map((p, i) => {
    const v = sub(p, points[i]!);
    const l = len(v);
    return { x: -v.y / l, y: v.x / l };
  });
  return points.map((p, i) => {
    const a = normals[Math.max(0, i - 1)]!;
    const b = normals[Math.min(normals.length - 1, i)]!;
    let n = { x: a.x + b.x, y: a.y + b.y };
    const l = len(n);
    n = { x: n.x / l, y: n.y / l };
    const cos = Math.max(0.35, n.x * b.x + n.y * b.y);
    return { x: p.x + (n.x * d) / cos, y: p.y + (n.y * d) / cos };
  });
}

/** Total length and the point at fraction `t` (0–1) of a polyline. */
export function polylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += len(sub(points[i]!, points[i - 1]!));
  return points.length > 1 ? total : 0;
}

export function pointOnPolyline(points: readonly Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0]! };
  const total = polylineLength(points);
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (target <= l || i === points.length - 1) {
      const f = l ? Math.min(1, target / l) : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    target -= l;
  }
  return { ...points[points.length - 1]! };
}

/** Resamples a polyline to `n` evenly spaced points. */
export function resample(points: readonly Point[], n: number): Point[] {
  return Array.from({ length: n }, (_, i) => pointOnPolyline(points, n === 1 ? 0 : i / (n - 1)));
}

function quadratic(a: Point, c: Point, b: Point, samples: number): Point[] {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  });
}

function selfLoop(r: Rect): Point[] {
  const rad = TOPOLOGY.selfRadius;
  const c = { x: r.x + r.w - 6, y: r.y - rad + 6 };
  // A three-quarter arc leaving the top edge and returning to the right edge.
  return Array.from({ length: 19 }, (_, i) => {
    const a = Math.PI * (0.75 - (1.5 * i) / 18) + Math.PI / 2;
    return { x: c.x + rad * Math.cos(a), y: c.y - rad * Math.sin(a) };
  }).reverse();
}

/** The straight, curved or orthogonal route between two boxes, offset sideways by `offset`. */
function routeBetween(a: Rect, b: Rect, style: EdgeStyle, offset: number): Point[] {
  const ca = centre(a);
  const cb = centre(b);
  if (style === 'orthogonal') {
    const horizontal = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
    let pts: Point[];
    if (horizontal) {
      const dir = Math.sign(cb.x - ca.x) || 1;
      const p1 = { x: ca.x + (dir * a.w) / 2 + dir * 3, y: ca.y };
      const p2 = { x: cb.x - (dir * b.w) / 2 - dir * 3, y: cb.y };
      const mx = (p1.x + p2.x) / 2;
      pts = Math.abs(p1.y - p2.y) < 1 ? [p1, p2] : [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
    } else {
      const dir = Math.sign(cb.y - ca.y) || 1;
      const p1 = { x: ca.x, y: ca.y + (dir * a.h) / 2 + dir * 3 };
      const p2 = { x: cb.x, y: cb.y - (dir * b.h) / 2 - dir * 3 };
      const my = (p1.y + p2.y) / 2;
      pts = Math.abs(p1.x - p2.x) < 1 ? [p1, p2] : [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
    }
    return offsetPolyline(pts, offset);
  }
  const v = sub(cb, ca);
  const n = { x: -v.y / len(v), y: v.x / len(v) };
  const shifted = (p: Point) => ({ x: p.x + n.x * offset, y: p.y + n.y * offset });
  const p1 = boxExit(a, shifted(cb));
  const p2 = boxExit(b, shifted(ca));
  const s1 = { x: p1.x + n.x * offset * 0.5, y: p1.y + n.y * offset * 0.5 };
  const s2 = { x: p2.x + n.x * offset * 0.5, y: p2.y + n.y * offset * 0.5 };
  if (style === 'straight') return [s1, s2];
  const bow = Math.min(40, len(sub(s2, s1)) * 0.12) + offset;
  const mid = { x: (s1.x + s2.x) / 2 + n.x * bow, y: (s1.y + s2.y) / 2 + n.y * bow };
  return quadratic(s1, mid, s2, TOPOLOGY.curveSamples);
}

/**
 * Routes every edge between placed nodes: opposite request pairs are offset apart, merged
 * return lanes run beside their request edge in the opposite direction, self-calls are loop arcs.
 * `fixed` routes (e.g. from ELK's orthogonal router) are used as given.
 */
export function routeEdges(topology: Topology, nodes: ReadonlyMap<string, Rect>, style: EdgeStyle, fixed: ReadonlyMap<string, Point[]> = new Map()): Map<string, EdgeRoute> {
  const routes = new Map<string, EdgeRoute>();
  const keys = new Set(topology.edges.map((e) => e.key));
  const withLabel = (points: Point[]): EdgeRoute => ({ points, label: pointOnPolyline(points, 0.5) });
  for (const edge of topology.edges) {
    const a = nodes.get(edge.from);
    const b = nodes.get(edge.to);
    if (!a || !b) continue;
    if (edge.kind === 'self') {
      routes.set(edge.key, withLabel(selfLoop(a)));
      continue;
    }
    if (edge.laneOf) continue; // placed after its request edge
    const opposite = keys.has(edgeKey(edge.to, edge.from, edge.kind === 'return' ? 'return' : 'request'));
    const offset = opposite ? TOPOLOGY.pairOffset : 0;
    routes.set(edge.key, withLabel(fixed.get(edge.key) ?? routeBetween(a, b, style, offset)));
  }
  for (const edge of topology.edges) {
    if (!edge.laneOf) continue;
    const request = routes.get(edge.laneOf);
    if (!request) continue;
    const lane = offsetPolyline(request.points, TOPOLOGY.laneOffset + 2).reverse();
    routes.set(edge.key, withLabel(lane));
  }
  return routes;
}

export function unionBox(rects: readonly Rect[]): Rect | undefined {
  if (!rects.length) return undefined;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Cluster boxes around their members, with room for the label above. */
export function clusterRects(topology: Topology, nodes: ReadonlyMap<string, Rect>): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const { clusterPad: pad, clusterLabel: label } = TOPOLOGY;
  for (const c of topology.clusters) {
    const box = unionBox(c.members.flatMap((m) => (nodes.get(m) ? [nodes.get(m)!] : [])));
    if (box) out.set(c.id, { x: box.x - pad, y: box.y - pad - label, w: box.w + 2 * pad, h: box.h + 2 * pad + label });
  }
  return out;
}

/** Assembles a geometry from placed nodes: clusters, routes and bounds with a margin. */
export function topologyGeometry(topology: Topology, nodes: Map<string, Rect>, style: EdgeStyle, fixed?: ReadonlyMap<string, Point[]>): TopologyGeometry {
  const clusters = clusterRects(topology, nodes);
  const edges = routeEdges(topology, nodes, style, fixed);
  const edgeBoxes = [...edges.values()].map((e) => unionBox(e.points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))!);
  const content = unionBox([...nodes.values(), ...clusters.values(), ...edgeBoxes]) ?? { x: 0, y: 0, w: 0, h: 0 };
  const m = TOPOLOGY.margin;
  return { nodes, clusters, edges, bounds: { x: content.x - m, y: content.y - m, w: content.w + 2 * m, h: content.h + 2 * m } };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) });

/** Interpolates two geometries (live-reload stability): shared nodes glide, new ones appear in place. */
export function interpolateGeometry(a: TopologyGeometry, b: TopologyGeometry, p: number): TopologyGeometry {
  const nodes = new Map([...b.nodes].map(([id, r]) => [id, a.nodes.has(id) ? lerpRect(a.nodes.get(id)!, r, p) : r] as const));
  const clusters = new Map([...b.clusters].map(([id, r]) => [id, a.clusters.has(id) ? lerpRect(a.clusters.get(id)!, r, p) : r] as const));
  const edges = new Map(
    [...b.edges].map(([key, r]) => {
      const from = a.edges.get(key);
      if (!from) return [key, r] as const;
      const n = Math.max(from.points.length, r.points.length, 2);
      const pa = from.points.length === n ? from.points : resample(from.points, n);
      const pb = r.points.length === n ? r.points : resample(r.points, n);
      const points = pb.map((q, i) => ({ x: lerp(pa[i]!.x, q.x, p), y: lerp(pa[i]!.y, q.y, p) }));
      return [key, { points, label: { x: lerp(from.label.x, r.label.x, p), y: lerp(from.label.y, r.label.y, p) } }] as const;
    }),
  );
  return { nodes, clusters, edges, bounds: lerpRect(a.bounds, b.bounds, p) };
}
