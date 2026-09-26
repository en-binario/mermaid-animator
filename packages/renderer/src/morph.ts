/**
 * Sequence ↔ Topology morph (spec view-switching, M2b D5). `morphAt` is a pure function of the
 * two drawings and the elapsed time; `MorphRenderer` draws the resulting transient frame.
 *
 * Windows at 1× (spec §8.4), for Sequence → Topology:
 *   A   0–160 ms  lifelines retract; activations, notes, fragments and boxes fade
 *   B  80–480 ms  headers travel and reshape into nodes; arrows become chords following them
 *   C 320–560 ms  chords of one pair merge into the aggregated edge; badges count up
 *   D 480–640 ms  edges settle into their routes; labels fade in
 * Topology → Sequence plays the same frames in reverse.
 */
import { boxExit, resample, type Point, type Rect, type SequenceLayout, type Topology, type TopologyGeometry } from '@mermaid-animator/core';
import { EASE, windowed } from './easing';
import { partialPath } from './geometry';
import type { Scene } from './scene';
import { SVG_NS } from './svg';
import type { TopologyScene } from './topologyScene';

export const MORPH_MS = 640;
export const MORPH_FADE_MS = 150;

export interface MorphInput {
  layout: SequenceLayout;
  sequence: Scene;
  topology: Topology;
  geometry: TopologyGeometry;
  topologyScene: TopologyScene;
}

export interface MorphNode {
  id: string;
  rect: Rect;
  radius: number;
  lines: string[];
  glyph: boolean;
  opacity: number;
}

export interface MorphChord {
  id: string;
  from: Point;
  to: Point;
  opacity: number;
  dotted: boolean;
  current: boolean;
}

export interface MorphEdge {
  key: string;
  points: Point[];
  opacity: number;
  dotted: boolean;
  current: boolean;
  badge?: { at: Point; text: string; opacity: number };
}

export interface MorphFrame {
  nodes: MorphNode[];
  lifelines: { id: string; x: number; y1: number; y2: number; opacity: number }[];
  /** Notes, activations, fragments and boxes, drawn as fading outlines. */
  fades: { rect: Rect; opacity: number; kind: 'note' | 'activation' | 'fragment' | 'box' }[];
  chords: MorphChord[];
  edges: MorphEdge[];
  /** Opacity of labels that only exist in the target view. */
  labels: number;
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) });
const lerpPoint = (a: Point, b: Point, p: number): Point => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });
const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The morph frame `ms` into a Sequence → Topology switch (use `MORPH_MS - ms` for the reverse). */
export function morphAt(input: MorphInput, ms: number): MorphFrame {
  const { layout, sequence, topology, geometry, topologyScene } = input;
  const a = windowed(ms, 0, 160, EASE.exit);
  const b = windowed(ms, 80, 480, EASE.standard);
  const c = windowed(ms, 320, 560, EASE.standard);
  const d = windowed(ms, 480, 640, EASE.standard);

  const kinds = new Map(topology.nodes.map((n) => [n.id, n.kind]));
  const headerAt = new Map<string, Rect>();
  const nodes: MorphNode[] = [];
  for (const p of layout.participants) {
    const target = geometry.nodes.get(p.id);
    const rect = target ? lerpRect(p.header, target, b) : p.header;
    headerAt.set(p.id, rect);
    const kind = kinds.get(p.id) ?? p.kind;
    const opacity = (sequence.participants.get(p.id)?.opacity ?? 1) * (target ? 1 : 1 - b);
    nodes.push({ id: p.id, rect, radius: lerp(6, 8, b), lines: p.lines, glyph: kind === 'actor' || kind === 'boundary' || kind === 'control' || kind === 'entity', opacity });
  }

  const lifelines = layout.participants.map((p) => ({ id: p.id, x: headerAt.get(p.id)!.x + headerAt.get(p.id)!.w / 2, y1: p.lifeline.y1 + (headerAt.get(p.id)!.y - p.header.y), y2: lerp(p.lifeline.full, p.lifeline.y1, a) + (headerAt.get(p.id)!.y - p.header.y), opacity: 1 - a }));

  const fades: MorphFrame['fades'] = [];
  const fade = 1 - a;
  for (const n of layout.notes) {
    const o = sequence.notes.get(n.id)?.opacity ?? 0;
    if (o > 0) fades.push({ rect: n.rect, opacity: o * fade, kind: 'note' });
  }
  layout.activations.forEach((act, i) => {
    const s = sequence.activations[i];
    if (s && s.opacity > 0) fades.push({ rect: { x: act.x, y: act.y1, w: 10, h: Math.max(0, s.y2 - act.y1) }, opacity: s.opacity * fade, kind: 'activation' });
  });
  for (const f of layout.fragments) {
    const o = sequence.fragments.get(f.id)?.opacity ?? 0;
    if (o > 0) fades.push({ rect: f.rect, opacity: o * fade, kind: 'fragment' });
  }
  for (const box of layout.boxes) fades.push({ rect: box.rect, opacity: fade, kind: 'box' });

  // Arrows become chords whose endpoints follow their participants, then merge (window C).
  const chords: MorphChord[] = [];
  for (const m of layout.messages) {
    const s = sequence.messages.get(m.id);
    if (!s || s.opacity <= 0 || m.self) continue;
    const ra = headerAt.get(m.from);
    const rb = headerAt.get(m.to);
    if (!ra || !rb) continue;
    const start = m.points[0]!;
    const end = m.points[m.points.length - 1]!;
    const from = lerpPoint(start, boxExit(ra, centre(rb)), b);
    const to = lerpPoint(end, boxExit(rb, centre(ra)), b);
    const merged = topology.messageEdge.has(m.id) ? 1 - c : 1 - Math.max(c, b);
    chords.push({ id: m.id, from, to, opacity: s.opacity * merged, dotted: m.dotted, current: s.state === 'current' });
  }

  // Aggregated edges appear as straight chords between the nodes, then settle into their routes (D).
  const edges: MorphEdge[] = [];
  for (const edge of topology.edges) {
    const s = topologyScene.edges.get(edge.key);
    const route = geometry.edges.get(edge.key);
    const ra = geometry.nodes.get(edge.from);
    const rb = geometry.nodes.get(edge.to);
    if (!s || !route || !ra || !rb || s.opacity <= 0) continue;
    const straight = edge.kind === 'self' ? route.points : [boxExit(ra, centre(rb)), boxExit(rb, centre(ra))];
    const n = Math.max(route.points.length, 2);
    const from = resample(straight, n);
    const to = route.points.length === n ? route.points : resample(route.points, n);
    const points = to.map((q, i) => lerpPoint(from[i]!, q, d));
    const count = edge.messages.length;
    const shown = Math.max(1, Math.round(lerp(1, count, c)));
    edges.push({
      key: edge.key,
      points,
      opacity: s.opacity * c,
      dotted: edge.kind === 'return',
      current: s.state === 'current',
      badge: count > 1 ? { at: route.label, text: `×${shown}`, opacity: c } : undefined,
    });
  }

  return { nodes, lifelines, fades, chords, edges, labels: d };
}

// -- renderer ----------------------------------------------------------------------------------------------------

type Attrs = Record<string, string | number | undefined>;
const round = (n: number) => Math.round(n * 100) / 100;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

/** Draws morph frames into a transient group; elements are pooled per id across frames. */
export class MorphRenderer {
  readonly root: SVGGElement;
  private readonly layers: Record<'fades' | 'lifelines' | 'edges' | 'chords' | 'nodes' | 'badges', SVGGElement>;
  private readonly pools = new Map<string, Element>();

  constructor(parent: SVGGElement) {
    this.root = el('g', { class: 'ma-morph' }, parent);
    this.layers = Object.fromEntries(['fades', 'lifelines', 'edges', 'chords', 'nodes', 'badges'].map((n) => [n, el('g', {}, this.root)])) as MorphRenderer['layers'];
  }

  private pooled<K extends keyof SVGElementTagNameMap>(key: string, tag: K, layer: SVGGElement, attrs: Attrs = {}): SVGElementTagNameMap[K] {
    let node = this.pools.get(key) as SVGElementTagNameMap[K] | undefined;
    if (!node) {
      node = el(tag, attrs, layer);
      this.pools.set(key, node);
    }
    return node;
  }

  render(frame: MorphFrame): void {
    const seen = new Set<string>();
    const use = <K extends keyof SVGElementTagNameMap>(key: string, tag: K, layer: SVGGElement, attrs: Attrs = {}) => {
      seen.add(key);
      return this.pooled(key, tag, layer, attrs);
    };
    frame.fades.forEach((f, i) => {
      const r = use(`fade:${i}`, 'rect', this.layers.fades, { class: `ma-morph-fade ma-morph-fade--${f.kind}`, rx: f.kind === 'box' ? 10 : 4 });
      r.setAttribute('x', String(round(f.rect.x)));
      r.setAttribute('y', String(round(f.rect.y)));
      r.setAttribute('width', String(round(f.rect.w)));
      r.setAttribute('height', String(round(f.rect.h)));
      r.setAttribute('opacity', String(round(f.opacity)));
    });
    for (const l of frame.lifelines) {
      const line = use(`life:${l.id}`, 'line', this.layers.lifelines, { class: 'ma-lifeline' });
      line.setAttribute('x1', String(round(l.x)));
      line.setAttribute('x2', String(round(l.x)));
      line.setAttribute('y1', String(round(l.y1)));
      line.setAttribute('y2', String(round(Math.max(l.y1, l.y2))));
      line.setAttribute('opacity', String(round(l.opacity)));
    }
    for (const ch of frame.chords) {
      const line = use(`chord:${ch.id}`, 'line', this.layers.chords, { class: `ma-morph-chord${ch.dotted ? ' ma-morph-chord--dotted' : ''}` });
      line.setAttribute('x1', String(round(ch.from.x)));
      line.setAttribute('y1', String(round(ch.from.y)));
      line.setAttribute('x2', String(round(ch.to.x)));
      line.setAttribute('y2', String(round(ch.to.y)));
      line.setAttribute('opacity', String(round(ch.opacity)));
      line.setAttribute('data-current', ch.current ? 'true' : 'false');
    }
    for (const e of frame.edges) {
      const path = use(`edge:${e.key}`, 'path', this.layers.edges, { class: `ma-morph-edge${e.dotted ? ' ma-morph-chord--dotted' : ''}` });
      path.setAttribute('d', partialPath(e.points, 1));
      path.setAttribute('opacity', String(round(e.opacity)));
      path.setAttribute('data-current', e.current ? 'true' : 'false');
      if (e.badge) {
        const g = use(`badge:${e.key}`, 'g', this.layers.badges, { class: 'ma-topo-badge' });
        if (!g.firstChild) {
          el('rect', { x: -16, y: -8, width: 32, height: 16, rx: 8 }, g);
          el('text', { x: 0, y: 4, 'text-anchor': 'middle' }, g);
        }
        g.setAttribute('transform', `translate(${round(e.badge.at.x)} ${round(e.badge.at.y)})`);
        g.setAttribute('opacity', String(round(e.badge.opacity)));
        const text = g.lastChild as SVGTextElement;
        if (text.textContent !== e.badge.text) text.textContent = e.badge.text;
      }
    }
    for (const n of frame.nodes) {
      const g = use(`node:${n.id}`, 'g', this.layers.nodes, { class: 'ma-participant ma-morph-node' });
      if (!g.firstChild) {
        el('rect', { class: n.glyph ? 'ma-topo-plate' : 'ma-participant-box' }, g);
        const text = el('text', { class: 'ma-participant-label', 'text-anchor': 'middle' }, g);
        n.lines.forEach((line, i) => {
          const span = el('tspan', { dy: i === 0 ? 0 : 18 }, text);
          span.textContent = line;
        });
      }
      const rect = g.firstChild as SVGRectElement;
      rect.setAttribute('x', String(round(n.rect.x)));
      rect.setAttribute('y', String(round(n.rect.y)));
      rect.setAttribute('width', String(round(n.rect.w)));
      rect.setAttribute('height', String(round(n.rect.h)));
      rect.setAttribute('rx', String(round(n.radius)));
      const text = g.lastChild as SVGTextElement;
      const cx = n.rect.x + n.rect.w / 2;
      const y = n.glyph ? n.rect.y + n.rect.h - 6 - (n.lines.length - 1) * 18 : n.rect.y + n.rect.h / 2 + 4.5 - ((n.lines.length - 1) * 18) / 2;
      text.setAttribute('x', String(round(cx)));
      text.setAttribute('y', String(round(y)));
      for (const span of text.children) span.setAttribute('x', String(round(cx)));
      g.setAttribute('opacity', String(round(n.opacity)));
    }
    for (const [key, node] of this.pools) {
      if (!seen.has(key)) {
        node.remove();
        this.pools.delete(key);
      }
    }
  }

  clear(): void {
    for (const node of this.pools.values()) node.remove();
    this.pools.clear();
  }
}
