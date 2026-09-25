/**
 * SVG renderer for sequence diagrams (spec §9.6.1, §13.9). The DOM is built once per layout;
 * each frame applies a Scene by writing only attributes that changed. All colour comes from
 * CSS classes bound to Ink & Ivory tokens (diagram.css), so themes switch without re-rendering
 * and nothing relies on inline styles (CSP).
 */
import type { ArrowKind, LaidMessage, ParticipantKind, SequenceLayout } from '@mermaid-animator/core';
import type { ElementState, Scene } from './scene';
import { partialPath, pointAlong } from './geometry';

export const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number | undefined>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

function textLines(parent: Element, lines: string[], x: number, y: number, cls: string, anchor: 'start' | 'middle' | 'end' = 'middle', lineHeight = 18): SVGTextElement {
  const text = el('text', { class: cls, x, y, 'text-anchor': anchor }, parent);
  lines.forEach((line, i) => {
    const span = el('tspan', { x, dy: i === 0 ? 0 : lineHeight }, text);
    span.textContent = line;
  });
  return text;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Arrowhead geometry drawn at the origin pointing along +x. */
function arrowHead(kind: ArrowKind): { d: string; filled: boolean; atStart: boolean; bothEnds: boolean } {
  switch (kind) {
    case 'solidArrow':
      return { d: 'M0 0 L-8.5 -3 L-8.5 3 Z', filled: true, atStart: false, bothEnds: false };
    case 'solidBidirectional':
      return { d: 'M0 0 L-8.5 -3 L-8.5 3 Z', filled: true, atStart: false, bothEnds: true };
    case 'solidOpen':
      return { d: 'M-8 -3.5 L0 0 L-8 3.5', filled: false, atStart: false, bothEnds: false };
    case 'solidCross':
      return { d: 'M-7 -3.5 L0 3.5 M-7 3.5 L0 -3.5', filled: false, atStart: false, bothEnds: false };
    case 'solid':
      return { d: 'M0 -3 L0 3', filled: false, atStart: false, bothEnds: false };
    case 'halfTop':
      return { d: 'M0 0 L-9 -3.5 L-9 0 Z', filled: true, atStart: false, bothEnds: false };
    case 'halfBottom':
      return { d: 'M0 0 L-9 3.5 L-9 0 Z', filled: true, atStart: false, bothEnds: false };
    case 'stickTop':
      return { d: 'M0 0 L-8 -4', filled: false, atStart: false, bothEnds: false };
    case 'stickBottom':
      return { d: 'M0 0 L-8 4', filled: false, atStart: false, bothEnds: false };
    case 'halfTopReverse':
      return { d: 'M0 0 L-9 -3.5 L-9 0 Z', filled: true, atStart: true, bothEnds: false };
    case 'halfBottomReverse':
      return { d: 'M0 0 L-9 3.5 L-9 0 Z', filled: true, atStart: true, bothEnds: false };
    case 'stickTopReverse':
      return { d: 'M0 0 L-8 -4', filled: false, atStart: true, bothEnds: false };
    case 'stickBottomReverse':
      return { d: 'M0 0 L-8 4', filled: false, atStart: true, bothEnds: false };
  }
}

/** 16 px line glyphs for typed participants (spec §9.6.1). */
function participantGlyph(kind: ParticipantKind, parent: Element, x: number, y: number): void {
  const g = el('g', { class: 'ma-glyph', transform: `translate(${round(x)} ${round(y)})` }, parent);
  const path = (d: string) => el('path', { d }, g);
  switch (kind) {
    case 'database':
      el('ellipse', { cx: 0, cy: -5, rx: 6, ry: 2.5 }, g);
      path('M-6 -5 V5 A6 2.5 0 0 0 6 5 V-5');
      break;
    case 'queue':
      el('ellipse', { cx: 5, cy: 0, rx: 2.5, ry: 5 }, g);
      path('M5 -5 H-5 A2.5 5 0 0 0 -5 5 H5');
      break;
    case 'collections':
      path('M-4 -6 H6 V4 M-6 -4 H4 V6 H-6 Z');
      break;
    case 'boundary':
      path('M-7 -5 V5 M-7 0 H-2');
      el('circle', { cx: 3, cy: 0, r: 5 }, g);
      break;
    case 'control':
      el('circle', { cx: 0, cy: 1, r: 5.5 }, g);
      path('M-1 -6.5 L2 -4.5 L-1 -2.5');
      break;
    case 'entity':
      el('circle', { cx: 0, cy: -1, r: 5.5 }, g);
      path('M-6 6 H6');
      break;
    default:
      g.remove();
  }
}

interface MessageNodes {
  group: SVGGElement;
  line: SVGPathElement;
  highlight: SVGPathElement;
  heads: SVGPathElement[];
  label: SVGTextElement;
  layout: LaidMessage;
  head: ReturnType<typeof arrowHead>;
}

export interface RenderedElementRef {
  kind: 'message' | 'note' | 'participant' | 'fragment';
  id: string;
}

export class SequenceSvgRenderer {
  readonly root: SVGGElement;
  private readonly cache = new WeakMap<Element, Map<string, string>>();
  private messages = new Map<string, MessageNodes>();
  private notes = new Map<string, SVGGElement>();
  private participants = new Map<string, { group: SVGGElement; footer?: SVGGElement; lifeline: SVGLineElement; glow: SVGLineElement; cross?: SVGPathElement; y2: number; full: number }>();
  private activations: SVGRectElement[] = [];
  private fragments = new Map<string, { group: SVGGElement; labels?: SVGGElement; glow: SVGRectElement }>();
  private pulse!: { group: SVGGElement; tail: SVGPathElement };
  private layout!: SequenceLayout;

  constructor(parent: SVGGElement) {
    this.root = el('g', { class: 'ma-sequence' }, parent);
  }

  private set(node: Element, name: string, value: string | number): void {
    const v = typeof value === 'number' ? String(round(value)) : value;
    let map = this.cache.get(node);
    if (!map) this.cache.set(node, (map = new Map()));
    if (map.get(name) === v) return;
    map.set(name, v);
    node.setAttribute(name, v);
  }

  /** Builds the DOM for a layout, replacing any previous drawing. */
  mount(layout: SequenceLayout): void {
    this.layout = layout;
    this.root.replaceChildren();
    this.messages.clear();
    this.notes.clear();
    this.participants.clear();
    this.fragments.clear();
    this.activations = [];

    const layers = Object.fromEntries(
      ['boxes', 'rects', 'fragments', 'lifelines', 'activations', 'fragmentLabels', 'participants', 'messages', 'notes', 'overlay'].map((name) => [name, el('g', { class: `ma-layer-${name}` }, this.root)]),
    ) as Record<string, SVGGElement>;

    for (const box of layout.boxes) {
      const g = el('g', { class: 'ma-box' }, layers.boxes);
      el('rect', { class: 'ma-box-fill', x: box.rect.x, y: box.rect.y, width: box.rect.w, height: box.rect.h, rx: 10 }, g);
      if (box.label) textLines(g, [box.label.toUpperCase()], box.rect.x + box.rect.w / 2, box.rect.y + 16, 'ma-box-label');
    }

    for (const f of layout.fragments) {
      const r = f.rect;
      if (f.kind === 'rect') {
        const g = el('g', { class: 'ma-rect', 'data-kind': 'fragment', 'data-id': f.id }, layers.rects);
        el('rect', { class: 'ma-rect-fill', x: r.x, y: r.y, width: r.w, height: r.h, rx: 4 }, g);
        const glow = el('rect', { class: 'ma-fragment-glow', x: r.x, y: r.y, width: r.w, height: r.h, rx: 4, opacity: 0 }, g);
        this.fragments.set(f.id, { group: g, glow });
        continue;
      }
      const g = el('g', { class: 'ma-fragment', 'data-kind': 'fragment', 'data-id': f.id }, layers.fragments);
      el('rect', { class: 'ma-fragment-frame', x: r.x, y: r.y, width: r.w, height: r.h, rx: 4 }, g);
      const glow = el('rect', { class: 'ma-fragment-glow', x: r.x, y: r.y, width: r.w, height: r.h, rx: 4, opacity: 0 }, g);
      for (const sep of f.separators) el('line', { class: 'ma-fragment-separator', x1: r.x, x2: r.x + r.w, y1: sep.y, y2: sep.y }, g);
      // Tabs and labels sit above lifelines and activation bars so they stay legible.
      const labels = el('g', { class: 'ma-fragment ma-fragment-labels', 'data-kind': 'fragment', 'data-id': f.id }, layers.fragmentLabels);
      const tabH = 20;
      el('path', { class: 'ma-fragment-tab', d: `M${round(r.x)} ${round(r.y + tabH)} H${round(r.x + f.tabWidth - 6)} L${round(r.x + f.tabWidth)} ${round(r.y + tabH - 6)} V${round(r.y)} H${round(r.x)} Z` }, labels);
      const keyword = el('text', { class: 'ma-fragment-keyword', x: r.x + 10, y: r.y + 14 }, labels);
      keyword.textContent = f.kind === 'par' ? 'PAR' : f.kind.toUpperCase();
      if (f.label) {
        const label = el('text', { class: 'ma-fragment-label', x: r.x + f.tabWidth + 8, y: r.y + 14 }, labels);
        label.textContent = `[${f.label}]`;
      }
      for (const sep of f.separators) if (sep.label) textLines(labels, [`[${sep.label}]`], r.x + 10, sep.y + 16, 'ma-fragment-label', 'start');
      this.fragments.set(f.id, { group: g, labels, glow });
    }

    for (const p of layout.participants) {
      const lifeline = el('line', { class: 'ma-lifeline', x1: p.x, x2: p.x, y1: p.lifeline.y1, y2: p.lifeline.full }, layers.lifelines);
      const glow = el('line', { class: 'ma-lifeline-glow', x1: p.x, x2: p.x, y1: p.lifeline.y1, y2: p.lifeline.full, opacity: 0 }, layers.lifelines);
      const drawHeader = (rect: { x: number; y: number; w: number; h: number }, footer: boolean) => {
        const g = el('g', { class: footer ? 'ma-participant ma-participant--footer' : 'ma-participant', 'data-kind': 'participant', 'data-id': p.id }, layers.participants);
        if (p.kind === 'actor') {
          const cx = rect.x + rect.w / 2;
          const top = rect.y + 4;
          const fig = el('g', { class: 'ma-actor-figure' }, g);
          el('circle', { cx, cy: top + 6, r: 5.5 }, fig);
          el('path', { d: `M${round(cx)} ${round(top + 11.5)} V${round(top + 26)} M${round(cx - 9)} ${round(top + 16)} H${round(cx + 9)} M${round(cx)} ${round(top + 26)} L${round(cx - 7)} ${round(top + 35)} M${round(cx)} ${round(top + 26)} L${round(cx + 7)} ${round(top + 35)}` }, fig);
          textLines(g, p.lines, cx, rect.y + rect.h - 6 - (p.lines.length - 1) * 18, 'ma-participant-label');
        } else {
          el('rect', { class: 'ma-participant-box', x: rect.x, y: rect.y, width: rect.w, height: rect.h, rx: 6 }, g);
          const glyph = p.kind !== 'participant';
          const cy = rect.y + rect.h / 2 + 4.5 - ((p.lines.length - 1) * 18) / 2;
          textLines(g, p.lines, rect.x + rect.w / 2 + (glyph ? 9 : 0), cy, 'ma-participant-label');
          if (glyph) participantGlyph(p.kind, g, rect.x + rect.w / 2 - Math.max(...p.lines.map((l) => l.length)) * 3.8 - 6, rect.y + rect.h / 2);
        }
        return g;
      };
      const group = drawHeader(p.header, false);
      const footer = p.footer ? drawHeader(p.footer, true) : undefined;
      let cross: SVGPathElement | undefined;
      if (p.destroyedAt !== undefined) cross = el('path', { class: 'ma-destroy', d: `M${round(p.x - 6)} ${round(p.destroyedAt - 6)} L${round(p.x + 6)} ${round(p.destroyedAt + 6)} M${round(p.x - 6)} ${round(p.destroyedAt + 6)} L${round(p.x + 6)} ${round(p.destroyedAt - 6)}`, opacity: 0 }, layers.participants);
      this.participants.set(p.id, { group, footer, lifeline, glow, cross, y2: p.lifeline.y2, full: p.lifeline.full });
    }

    for (const a of layout.activations) {
      this.activations.push(el('rect', { class: 'ma-activation', x: a.x, y: a.y1, width: 10, height: 10, opacity: 0 }, layers.activations));
    }

    for (const m of layout.messages) {
      const group = el('g', { class: `ma-message${m.dotted ? ' ma-message--dotted' : ''}${m.arrow === 'solidCross' ? ' ma-message--cross' : ''}`, 'data-kind': 'message', 'data-id': m.id }, layers.messages);
      const full = partialPath(m.points, 1);
      el('path', { class: 'ma-hit', d: full }, group);
      const line = el('path', { class: 'ma-message-line', d: full }, group);
      const highlight = el('path', { class: 'ma-message-hl', d: full, opacity: 0 }, group);
      const head = arrowHead(m.arrow);
      const heads = [el('path', { class: head.filled ? 'ma-arrowhead ma-arrowhead--filled' : 'ma-arrowhead', d: head.d }, group)];
      if (head.bothEnds) heads.push(el('path', { class: 'ma-arrowhead ma-arrowhead--filled', d: head.d }, group));
      const label = textLines(group, m.label.lines, m.label.x, m.label.y, 'ma-message-label', m.label.anchor);
      if (m.badge) {
        const b = el('g', { class: 'ma-badge' }, group);
        el('circle', { cx: m.badge.x, cy: m.badge.y, r: 9 }, b);
        const t = el('text', { x: m.badge.x, y: m.badge.y + 4, 'text-anchor': 'middle' }, b);
        t.textContent = String(m.badge.n);
      }
      if (m.central) {
        const first = m.points[0]!;
        const last = m.points[m.points.length - 1]!;
        if (m.central !== 'target') el('circle', { class: 'ma-central', cx: first.x, cy: first.y, r: 4 }, group);
        if (m.central !== 'source') el('circle', { class: 'ma-central', cx: last.x, cy: last.y, r: 4 }, group);
      }
      this.messages.set(m.id, { group, line, highlight, heads, label, layout: m, head });
    }

    for (const n of layout.notes) {
      const g = el('g', { class: 'ma-note', 'data-kind': 'note', 'data-id': n.id }, layers.notes);
      const { x, y, w, h } = n.rect;
      el('path', { class: 'ma-note-shape', d: `M${round(x)} ${round(y)} H${round(x + w - 8)} L${round(x + w)} ${round(y + 8)} V${round(y + h)} H${round(x)} Z` }, g);
      el('path', { class: 'ma-note-fold', d: `M${round(x + w - 8)} ${round(y)} V${round(y + 8)} H${round(x + w)}` }, g);
      textLines(g, n.lines, x + w / 2, y + 8 + 13, 'ma-note-text');
      this.notes.set(n.id, g);
    }

    const pulse = el('g', { class: 'ma-pulse', opacity: 0 }, layers.overlay);
    const tail = el('path', { class: 'ma-pulse-tail', d: 'M0 0' }, pulse);
    el('circle', { class: 'ma-pulse-halo', r: 10, cx: 0, cy: 0 }, pulse);
    el('circle', { class: 'ma-pulse-dot', r: 2.75, cx: 0, cy: 0 }, pulse);
    this.pulse = { group: pulse, tail };
  }

  /** Applies a scene. Only attributes that changed since the last frame are written. */
  render(scene: Scene, options: { comet?: boolean } = {}): void {
    let pulseShown = false;
    for (const [id, nodes] of this.messages) {
      const s = scene.messages.get(id);
      if (!s) continue;
      this.set(nodes.group, 'data-state', s.state);
      this.set(nodes.group, 'data-emphasis', s.emphasis ? 'true' : 'false');
      this.set(nodes.group, 'data-muted', s.state === 'past' && s.opacity < 1 ? 'true' : 'false');
      this.set(nodes.group, 'opacity', s.opacity);
      this.set(nodes.group, 'display', s.opacity <= 0 ? 'none' : 'inline');
      if (s.opacity <= 0) continue;
      const d = partialPath(nodes.layout.points, s.draw);
      this.set(nodes.line, 'd', d);
      this.set(nodes.highlight, 'd', d);
      this.set(nodes.highlight, 'opacity', s.highlight);
      const pts = nodes.layout.points;
      const end = pointAlong(pts, 1);
      const start = pointAlong(pts, 0);
      const headAt = nodes.head.atStart ? { x: start.x, y: start.y, angle: start.angle + Math.PI } : end;
      const placeHead = (node: SVGPathElement, at: { x: number; y: number; angle: number }) => {
        this.set(node, 'transform', `translate(${round(at.x)} ${round(at.y)}) rotate(${round((at.angle * 180) / Math.PI)}) scale(${round(s.headScale)})`);
        this.set(node, 'opacity', s.head);
      };
      placeHead(nodes.heads[0]!, headAt);
      if (nodes.heads[1]) placeHead(nodes.heads[1], { x: start.x, y: start.y, angle: start.angle + Math.PI });
      this.set(nodes.label, 'opacity', s.label);
      this.set(nodes.label, 'transform', `translate(0 ${round(s.labelRise)})`);
      if (s.pulse && !pulseShown) {
        pulseShown = true;
        const at = pointAlong(pts, s.pulse.at);
        this.set(this.pulse.group, 'transform', `translate(${round(at.x)} ${round(at.y)})`);
        this.set(this.pulse.group, 'opacity', s.pulse.opacity);
        this.set(this.pulse.group, 'data-emphasis', s.emphasis ? 'true' : 'false');
        const tailLength = options.comet ? 24 : 0;
        const back = { x: -Math.cos(at.angle) * tailLength, y: -Math.sin(at.angle) * tailLength };
        this.set(this.pulse.tail, 'd', tailLength ? `M0 0 L${round(back.x)} ${round(back.y)}` : 'M0 0');
      }
    }
    if (!pulseShown) this.set(this.pulse.group, 'opacity', 0);

    for (const [id, g] of this.notes) {
      const s = scene.notes.get(id);
      if (!s) continue;
      this.set(g, 'data-state', s.state);
      this.set(g, 'opacity', s.opacity);
      this.set(g, 'display', s.opacity <= 0 ? 'none' : 'inline');
      this.set(g, 'transform', `translate(0 ${round(s.rise)})`);
    }

    for (const [id, p] of this.participants) {
      const s = scene.participants.get(id);
      if (!s) continue;
      for (const g of [p.group, p.lifeline, p.glow]) this.set(g, 'opacity', g === p.glow ? s.glow * s.opacity : s.opacity);
      this.set(p.group, 'transform', `translate(0 ${round(s.headerDy)})`);
      this.set(p.group, 'display', s.opacity <= 0 ? 'none' : 'inline');
      const y2 = s.destroyed > 0 ? p.y2 : p.full;
      this.set(p.lifeline, 'y2', y2);
      this.set(p.glow, 'y2', y2);
      if (p.footer) this.set(p.footer, 'opacity', s.opacity);
      if (p.cross) {
        this.set(p.cross, 'opacity', s.destroyed);
        this.set(p.cross, 'transform', `translate(0 0)`);
      }
    }

    scene.activations.forEach((a, i) => {
      const rect = this.activations[i];
      const laid = this.layout.activations[i];
      if (!rect || !laid) return;
      this.set(rect, 'opacity', a.opacity);
      this.set(rect, 'display', a.opacity <= 0 ? 'none' : 'inline');
      this.set(rect, 'height', Math.max(0, a.y2 - laid.y1));
      this.set(rect, 'data-ghost', a.ghost ? 'true' : 'false');
    });

    for (const [id, f] of this.fragments) {
      const s = scene.fragments.get(id);
      if (!s) continue;
      for (const g of f.labels ? [f.group, f.labels] : [f.group]) {
        this.set(g, 'opacity', s.opacity);
        this.set(g, 'display', s.opacity <= 0 ? 'none' : 'inline');
        this.set(g, 'data-active', s.active > 0.5 ? 'true' : 'false');
      }
      this.set(f.glow, 'opacity', s.active);
    }
  }

  /** Finds the diagram element under a DOM node (for tooltips and reveal-source). */
  static elementAt(target: EventTarget | null): RenderedElementRef | undefined {
    let node = target instanceof Element ? target : null;
    while (node && !(node instanceof SVGSVGElement)) {
      const kind = node.getAttribute('data-kind');
      const id = node.getAttribute('data-id');
      if (kind && id) return { kind: kind as RenderedElementRef['kind'], id };
      node = node.parentElement;
    }
    return undefined;
  }
}

export type { ElementState };
