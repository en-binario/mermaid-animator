/**
 * SVG renderer for the topology view (spec topology-view, M2b D3). Mirrors SequenceSvgRenderer:
 * the DOM is built once per topology, and each frame writes only changed attributes. Geometry is
 * applied per frame too (node transforms, edge paths), so layout transitions and live-reload
 * glides need no rebuild. Colours come from token CSS classes in diagram.css.
 */
import { edgeWidth, GLYPH_KINDS, runsOf, TOPOLOGY, type LabelMark, type ParticipantKind, type Point, type Rect, type TextRun, type Topology, type TopologyEdge, type TopologyGeometry } from '@mermaid-animator/core';
import { partialPath, pointAlong } from './geometry';
import { runAttributes } from './measure';
import { SVG_NS, textLines } from './svg';
import type { TopologyScene } from './topologyScene';

type Attrs = Record<string, string | number | undefined>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface TopologyRenderOptions {
  comet: boolean;
  /** Edge width weighting (`topology.edgeWeight`). */
  weight: 'count' | 'uniform';
}

export interface TopologyLabels {
  /** Wrapped label lines per node id. */
  nodes: ReadonlyMap<string, string[]>;
  /** Message label per message id (for the transient current-message label). */
  messages: ReadonlyMap<string, string>;
  /** Styled runs per line for node labels with bold / italic text (spec label-formatting). */
  nodeRuns?: ReadonlyMap<string, TextRun[][]>;
  /** Bold / italic ranges of message labels. */
  messageMarks?: ReadonlyMap<string, LabelMark[]>;
}

interface NodeNodes {
  group: SVGGElement;
  glow: SVGRectElement;
  rings: SVGRectElement[];
  size: { w: number; h: number };
}

interface EdgeNodes {
  group: SVGGElement;
  hit: SVGPathElement;
  line: SVGPathElement;
  highlight: SVGPathElement;
  head: SVGPathElement;
  badge?: SVGGElement;
  label: SVGTextElement;
  edge: TopologyEdge;
}

/** Node shape in local coordinates (0,0)–(w,h); glyph kinds draw above the label. */
function nodeShape(kind: ParticipantKind, g: SVGGElement, w: number, h: number, lines: string[], runs?: TextRun[][]): void {
  const label = (y: number) => {
    textLines(g, lines, w / 2, y, 'ma-participant-label', 'middle', 18, { runs, role: 'participant' });
  };
  const extra = (lines.length - 1) * 18;
  const cx = w / 2;
  if (GLYPH_KINDS.has(kind)) {
    const fig = el('g', { class: kind === 'actor' ? 'ma-actor-figure' : 'ma-topo-glyph' }, g);
    // A transparent plate keeps the whole node clickable.
    el('rect', { class: 'ma-topo-plate', x: 0, y: 0, width: w, height: h, rx: 8 }, g).before(fig);
    if (kind === 'actor') {
      el('circle', { cx, cy: 7, r: 5.5 }, fig);
      el('path', { d: `M${cx} 12.5 V27 M${cx - 9} 17 H${cx + 9} M${cx} 27 L${cx - 7} 34 M${cx} 27 L${cx + 7} 34` }, fig);
    } else if (kind === 'boundary') {
      el('path', { d: `M${cx - 15} 5 V29 M${cx - 15} 17 H${cx - 9}` }, fig);
      el('circle', { cx: cx + 2, cy: 17, r: 11 }, fig);
    } else if (kind === 'control') {
      el('circle', { cx, cy: 18, r: 11 }, fig);
      el('path', { d: `M${cx - 2} 4 L${cx + 3} 7 L${cx - 2} 10` }, fig);
    } else {
      el('circle', { cx, cy: 16, r: 11 }, fig);
      el('path', { d: `M${cx - 12} 30 H${cx + 12}` }, fig);
    }
    label(TOPOLOGY.glyphHeight + 14);
    return;
  }
  const textY = (top: number, height: number) => top + height / 2 + 4.5 - extra / 2;
  switch (kind) {
    case 'database': {
      const ry = 6;
      el('path', { class: 'ma-participant-box', d: `M0 ${ry} A${cx} ${ry} 0 0 1 ${w} ${ry} V${h - ry} A${cx} ${ry} 0 0 1 0 ${h - ry} Z` }, g);
      el('path', { class: 'ma-topo-rim', d: `M0 ${ry} A${cx} ${ry} 0 0 0 ${w} ${ry}` }, g);
      label(textY(ry * 2, h - ry * 2));
      break;
    }
    case 'queue': {
      const rx = 10;
      el('path', { class: 'ma-participant-box', d: `M${rx} 0 H${w - rx} A${rx} ${h / 2} 0 0 1 ${w - rx} ${h} H${rx} A${rx} ${h / 2} 0 0 1 ${rx} 0 Z` }, g);
      el('path', { class: 'ma-topo-rim', d: `M${w - rx} 0 A${rx} ${h / 2} 0 0 0 ${w - rx} ${h}` }, g);
      label(textY(0, h) );
      break;
    }
    case 'collections':
      el('rect', { class: 'ma-participant-box', x: 6, y: 0, width: w - 6, height: h - 6, rx: 6 }, g);
      el('rect', { class: 'ma-participant-box', x: 0, y: 6, width: w - 6, height: h - 6, rx: 6 }, g);
      label(textY(6, h - 6));
      break;
    default:
      el('rect', { class: 'ma-participant-box', x: 0, y: 0, width: w, height: h, rx: 8 }, g);
      label(textY(0, h));
  }
}

export class TopologySvgRenderer {
  readonly root: SVGGElement;
  private readonly cache = new WeakMap<Element, Map<string, string>>();
  private nodes = new Map<string, NodeNodes>();
  private edges = new Map<string, EdgeNodes>();
  private clusters = new Map<string, { group: SVGGElement; rect: SVGRectElement; label?: SVGTextElement }>();
  private pulses: { group: SVGGElement; tail: SVGPathElement }[] = [];
  private overlay!: SVGGElement;
  private labels: TopologyLabels = { nodes: new Map(), messages: new Map() };
  topology: Topology | undefined;

  constructor(parent: SVGGElement) {
    this.root = el('g', { class: 'ma-topology' }, parent);
  }

  private set(node: Element, name: string, value: string | number): void {
    const v = typeof value === 'number' ? String(round(value)) : value;
    let map = this.cache.get(node);
    if (!map) this.cache.set(node, (map = new Map()));
    if (map.get(name) === v) return;
    map.set(name, v);
    node.setAttribute(name, v);
  }

  private setText(node: Element, text: string): void {
    if (node.textContent !== text) node.textContent = text;
  }

  /** Builds the DOM for a topology; node sizes come from the geometry used at mount. */
  mount(topology: Topology, geometry: TopologyGeometry, labels: TopologyLabels): void {
    this.topology = topology;
    this.labels = labels;
    this.root.replaceChildren();
    this.nodes.clear();
    this.edges.clear();
    this.clusters.clear();
    this.pulses = [];
    const layers = Object.fromEntries(['clusters', 'edges', 'nodes', 'edgeLabels', 'overlay'].map((n) => [n, el('g', { class: `ma-layer-${n}` }, this.root)])) as Record<string, SVGGElement>;
    this.overlay = layers.overlay as SVGGElement;

    for (const c of topology.clusters) {
      const group = el('g', { class: 'ma-topo-cluster', 'data-kind': 'cluster', 'data-id': c.id }, layers.clusters);
      const rect = el('rect', { class: 'ma-box-fill', rx: 12 }, group);
      const label = c.label ? el('text', { class: 'ma-box-label', 'text-anchor': 'start' }, group) : undefined;
      if (label) label.textContent = (c.label ?? '').toUpperCase();
      this.clusters.set(c.id, { group, rect, label });
    }

    for (const edge of topology.edges) {
      const cls = ['ma-topo-edge', edge.kind === 'return' ? 'ma-topo-edge--return' : '', edge.kind === 'self' ? 'ma-topo-edge--self' : ''].filter(Boolean).join(' ');
      const group = el('g', { class: cls, 'data-kind': 'edge', 'data-id': edge.key }, layers.edges);
      const hit = el('path', { class: 'ma-hit' }, group);
      const line = el('path', { class: 'ma-topo-line' }, group);
      const highlight = el('path', { class: 'ma-topo-hl', opacity: 0 }, group);
      const head = el('path', { class: 'ma-arrowhead ma-arrowhead--filled', d: 'M0 0 L-8.5 -3.2 L-8.5 3.2 Z' }, group);
      let badge: SVGGElement | undefined;
      if (edge.messages.length > 1) {
        badge = el('g', { class: 'ma-topo-badge' }, layers.edgeLabels);
        const text = `×${edge.messages.length}`;
        el('rect', { x: -(6 + text.length * 3.6), y: -8, width: 12 + text.length * 7.2, height: 16, rx: 8 }, badge);
        el('text', { x: 0, y: 4, 'text-anchor': 'middle' }, badge).textContent = text;
      }
      const label = el('text', { class: 'ma-topo-label', 'text-anchor': 'middle', opacity: 0 }, layers.edgeLabels);
      if (edge.messages.length > 0) {
        // The weighted width rides on a custom property so the token CSS stays in charge.
        group.style.setProperty('--ma-edge-width', `${round(edgeWidth(edge.messages.length))}px`);
      }
      this.edges.set(edge.key, { group, hit, line, highlight, head, badge, label, edge });
    }

    for (const n of topology.nodes) {
      const r = geometry.nodes.get(n.id) ?? { x: 0, y: 0, w: 112, h: 40 };
      const group = el('g', { class: 'ma-participant ma-topo-node', 'data-kind': 'participant', 'data-id': n.id }, layers.nodes);
      const rings = [el('rect', { class: 'ma-topo-ring', x: -6, y: -6, width: r.w + 12, height: r.h + 12, rx: 13, opacity: 0 }, group), el('rect', { class: 'ma-topo-ring', x: -11, y: -11, width: r.w + 22, height: r.h + 22, rx: 17, opacity: 0 }, group)];
      const glow = el('rect', { class: 'ma-topo-glow', x: -2.5, y: -2.5, width: r.w + 5, height: r.h + 5, rx: 10, opacity: 0 }, group);
      nodeShape(n.kind, group, r.w, r.h, this.labels.nodes.get(n.id) ?? [n.label], this.labels.nodeRuns?.get(n.id));
      this.nodes.set(n.id, { group, glow, rings, size: { w: r.w, h: r.h } });
    }
  }

  private pulse(index: number): { group: SVGGElement; tail: SVGPathElement } {
    while (this.pulses.length <= index) {
      const group = el('g', { class: 'ma-pulse', opacity: 0 }, this.overlay);
      const tail = el('path', { class: 'ma-pulse-tail', d: 'M0 0' }, group);
      el('circle', { class: 'ma-pulse-halo', r: 10, cx: 0, cy: 0 }, group);
      el('circle', { class: 'ma-pulse-dot', r: 2.75, cx: 0, cy: 0 }, group);
      this.pulses.push({ group, tail });
    }
    return this.pulses[index]!;
  }

  /** Applies geometry and scene. */
  render(scene: TopologyScene, geometry: TopologyGeometry, options: TopologyRenderOptions): void {
    this.set(this.root, 'data-weight', options.weight);
    for (const [id, c] of this.clusters) {
      const r = geometry.clusters.get(id);
      if (!r) continue;
      this.set(c.rect, 'x', r.x);
      this.set(c.rect, 'y', r.y);
      this.set(c.rect, 'width', r.w);
      this.set(c.rect, 'height', r.h);
      if (c.label) {
        this.set(c.label, 'x', r.x + 12);
        this.set(c.label, 'y', r.y + 16);
      }
      this.set(c.group, 'data-active', (scene.clusters.get(id)?.active ?? 0) > 0.5 ? 'true' : 'false');
    }

    let pulses = 0;
    for (const [key, e] of this.edges) {
      const route = geometry.edges.get(key);
      const s = scene.edges.get(key);
      if (!route || !s) {
        this.set(e.group, 'display', 'none');
        continue;
      }
      this.set(e.group, 'display', s.opacity <= 0 ? 'none' : 'inline');
      const full = partialPath(route.points, 1);
      this.set(e.hit, 'd', full);
      this.set(e.line, 'd', s.draw < 1 ? partialPath(route.points, s.draw) : full);
      this.set(e.highlight, 'd', s.draw < 1 ? partialPath(route.points, s.draw) : full);
      this.set(e.highlight, 'opacity', s.highlight);
      this.set(e.group, 'opacity', s.opacity);
      this.set(e.group, 'data-state', s.state);
      this.set(e.group, 'data-emphasis', s.emphasis ? 'true' : 'false');
      this.set(e.group, 'data-dimmed', s.dimmed ? 'true' : 'false');
      this.set(e.group, 'data-highlighted', s.highlighted ? 'true' : 'false');
      const tip = pointAlong(route.points, s.draw);
      this.set(e.head, 'transform', `translate(${round(tip.x)} ${round(tip.y)}) rotate(${round((tip.angle * 180) / Math.PI)})`);
      this.set(e.head, 'opacity', s.draw >= 0.98 ? 1 : 0);
      if (e.badge) {
        this.set(e.badge, 'transform', `translate(${round(route.label.x)} ${round(route.label.y)})`);
        this.set(e.badge, 'opacity', s.opacity > 0 ? s.opacity : 0);
        this.set(e.badge, 'data-state', s.state);
      }
      const message = s.current[s.current.length - 1];
      const text = message ? (this.labels.messages.get(message) ?? '').replace(/\n/g, ' ') : '';
      const marks = message ? this.labels.messageMarks?.get(message) : undefined;
      if (marks && e.label.textContent !== text) {
        // Formatted message label: one run per style (spec label-formatting).
        e.label.replaceChildren();
        for (const run of runsOf(text, marks)) {
          if (!run.bold && !run.italic) e.label.appendChild(document.createTextNode(run.text));
          else el('tspan', runAttributes(run, 'label'), e.label).textContent = run.text;
        }
      } else if (!marks) this.setText(e.label, text);
      this.set(e.label, 'opacity', message ? s.label : 0);
      this.set(e.label, 'x', route.label.x);
      this.set(e.label, 'y', route.label.y - (e.badge ? 14 : 8));
      for (const p of s.pulses) {
        const node = this.pulse(pulses++);
        const at = pointAlong(route.points, p.at);
        this.set(node.group, 'transform', `translate(${round(at.x)} ${round(at.y)})`);
        this.set(node.group, 'opacity', p.opacity * (s.dimmed ? 0.4 : 1));
        this.set(node.group, 'data-emphasis', s.emphasis ? 'true' : 'false');
        const tail = options.comet ? 24 : 0;
        this.set(node.tail, 'd', tail ? `M0 0 L${round(-Math.cos(at.angle) * tail)} ${round(-Math.sin(at.angle) * tail)}` : 'M0 0');
      }
    }
    for (let i = pulses; i < this.pulses.length; i++) this.set(this.pulses[i]!.group, 'opacity', 0);

    for (const [id, n] of this.nodes) {
      const r: Rect | undefined = geometry.nodes.get(id);
      const s = scene.nodes.get(id);
      if (!r || !s) continue;
      // Boxes can differ from the mounted size mid-transition; scale around the node's centre.
      const sx = r.w / n.size.w;
      const sy = r.h / n.size.h;
      const scale = Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01 ? ` scale(${round(sx)} ${round(sy)})` : '';
      this.set(n.group, 'transform', `translate(${round(r.x)} ${round(r.y)})${scale}`);
      this.set(n.group, 'opacity', s.opacity);
      this.set(n.group, 'display', s.opacity <= 0 ? 'none' : 'inline');
      this.set(n.glow, 'opacity', s.glow);
      this.set(n.rings[0]!, 'opacity', s.ring);
      this.set(n.rings[1]!, 'opacity', s.depth > 1 ? s.ring : 0);
      this.set(n.group, 'data-focused', s.focused ? 'true' : 'false');
      this.set(n.group, 'data-dimmed', s.dimmed ? 'true' : 'false');
      this.set(n.group, 'data-highlighted', s.highlighted ? 'true' : 'false');
      this.set(n.group, 'data-destroyed', s.destroyed ? 'true' : 'false');
    }
  }

  /** Centre of a node in drawing coordinates (for the camera and tooltips). */
  nodeCentre(geometry: TopologyGeometry, id: string): Point | undefined {
    const r = geometry.nodes.get(id);
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : undefined;
  }
}
