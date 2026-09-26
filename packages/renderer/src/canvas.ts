/**
 * Canvas 2D render backend (M3 D1, ADR-010): draws sequence and topology scenes onto any
 * CanvasRenderingContext2D-compatible context — including OffscreenCanvas in the export worker —
 * with resolved palette colours instead of CSS variables. It mirrors SequenceSvgRenderer,
 * TopologySvgRenderer and diagram.css; the geometry helpers and arrowhead paths are shared.
 */
import { edgeWidth, GLYPH_KINDS, TOPOLOGY, type ParticipantKind, type SequenceLayout, type Topology, type TopologyGeometry } from '@mermaid-animator/core';
import { partialPath, pointAlong } from './geometry';
import { FONTS } from './measure';
import type { Scene } from './scene';
import { arrowHead } from './svg';
import { isHighContrast, PALETTES, type ColorToken, type PaletteName } from './theme';
import type { TopologyScene } from './topologyScene';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CanvasPalette {
  name: PaletteName;
  c: Record<ColorToken, string>;
  /** `--ma-pulse-halo` of the palette. */
  halo: string;
  hc: boolean;
  /** `--ma-stroke-*` of the palette. */
  stroke: { hairline: number; structural: number; active: number };
}

const HALO: Record<PaletteName, string> = {
  ivory: 'rgba(31, 59, 97, 0.22)',
  graphite: 'rgba(157, 188, 227, 0.22)',
  'ivory-hc': 'rgba(15, 74, 133, 0.3)',
  'graphite-hc': 'rgba(243, 133, 24, 0.3)',
};

export function canvasPalette(name: PaletteName): CanvasPalette {
  const hc = isHighContrast(name);
  return { name, c: PALETTES[name], halo: HALO[name], hc, stroke: hc ? { hairline: 2, structural: 2, active: 2 } : { hairline: 1, structural: 1.25, active: 2 } };
}

export interface CanvasRenderOptions {
  comet?: boolean;
}

const pathOf = (points: readonly { x: number; y: number }[], p = 1) => new Path2D(partialPath(points, p) || 'M0 0');

function font(role: keyof typeof FONTS, overrides: { weight?: number; style?: string } = {}): string {
  const base = FONTS[role];
  let f = overrides.weight ? base.replace(/^\d+/, String(overrides.weight)) : base;
  if (overrides.style) f = `${overrides.style} ${f}`;
  return f;
}

/** Draws text lines like `textLines` in svg.ts: baseline at y, 18 px line height, optional halo. */
function text(ctx: Ctx2D, lines: readonly string[], x: number, y: number, style: { font: string; fill: string; anchor?: 'start' | 'middle' | 'end'; halo?: string; letterSpacing?: string }): void {
  ctx.font = style.font;
  ctx.textAlign = style.anchor === 'middle' || !style.anchor ? 'center' : style.anchor === 'end' ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  const spaced = ctx as Ctx2D & { letterSpacing?: string };
  if ('letterSpacing' in spaced) spaced.letterSpacing = style.letterSpacing ?? '0px';
  lines.forEach((line, i) => {
    const ly = y + i * 18;
    if (style.halo) {
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = style.halo;
      ctx.strokeText(line, x, ly);
    }
    ctx.fillStyle = style.fill;
    ctx.fillText(line, x, ly);
  });
  if ('letterSpacing' in spaced) spaced.letterSpacing = '0px';
}

function strokePath(ctx: Ctx2D, path: Path2D, color: string, width: number, dash: number[] = [], cap: CanvasLineCap = 'butt'): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.setLineDash([]);
}

function roundRect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}

function withAlpha(ctx: Ctx2D, alpha: number, draw: () => void): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  draw();
  ctx.restore();
}

function drawPulse(ctx: Ctx2D, pal: CanvasPalette, x: number, y: number, angle: number, opacity: number, emphasis: boolean, comet: boolean): void {
  withAlpha(ctx, opacity, () => {
    if (comet) {
      ctx.save();
      ctx.globalAlpha *= 0.35;
      const p = new Path2D(`M${x} ${y} L${x - Math.cos(angle) * 24} ${y - Math.sin(angle) * 24}`);
      strokePath(ctx, p, pal.c.accent, 2, [], 'round');
      ctx.restore();
    }
    ctx.fillStyle = pal.halo;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = emphasis ? pal.c.brass : pal.c.accent;
    ctx.beginPath();
    ctx.arc(x, y, 2.75, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Small typed-participant glyphs of sequence headers (svg.ts `participantGlyph`). */
function headerGlyph(ctx: Ctx2D, kind: ParticipantKind, x: number, y: number, color: string): void {
  const paths: Record<string, string> = {
    database: 'M-6 -5 V5 A6 2.5 0 0 0 6 5 V-5 M-6 -5 A6 2.5 0 0 1 6 -5 A6 2.5 0 0 1 -6 -5',
    queue: 'M5 -5 H-5 A2.5 5 0 0 0 -5 5 H5 M5 -5 A2.5 5 0 0 1 5 5 A2.5 5 0 0 1 5 -5',
    collections: 'M-4 -6 H6 V4 M-6 -4 H4 V6 H-6 Z',
    boundary: 'M-7 -5 V5 M-7 0 H-2 M8 0 A5 5 0 1 1 -2 0 A5 5 0 1 1 8 0',
    control: 'M5.5 1 A5.5 5.5 0 1 1 -5.5 1 A5.5 5.5 0 1 1 5.5 1 M-1 -6.5 L2 -4.5 L-1 -2.5',
    entity: 'M5.5 -1 A5.5 5.5 0 1 1 -5.5 -1 A5.5 5.5 0 1 1 5.5 -1 M-6 6 H6',
  };
  const d = paths[kind];
  if (!d) return;
  ctx.save();
  ctx.translate(x, y);
  strokePath(ctx, new Path2D(d), color, 1.2, [], 'round');
  ctx.restore();
}

function actorFigure(ctx: Ctx2D, cx: number, top: number, color: string, width: number): void {
  const p = new Path2D();
  p.arc(cx, top + 6, 5.5, 0, Math.PI * 2);
  p.addPath(new Path2D(`M${cx} ${top + 11.5} V${top + 26} M${cx - 9} ${top + 16} H${cx + 9} M${cx} ${top + 26} L${cx - 7} ${top + 35} M${cx} ${top + 26} L${cx + 7} ${top + 35}`));
  strokePath(ctx, p, color, width, [], 'round');
}

// -- sequence ---------------------------------------------------------------------------------------------------

export function drawSequence(ctx: Ctx2D, layout: SequenceLayout, scene: Scene, pal: CanvasPalette, options: CanvasRenderOptions = {}): void {
  const c = pal.c;
  // Boxes
  for (const box of layout.boxes) {
    const r = box.rect;
    const path = roundRect(r.x, r.y, r.w, r.h, 10);
    withAlpha(ctx, 0.7, () => {
      ctx.fillStyle = c['surface-sunken'];
      ctx.fill(path);
    });
    strokePath(ctx, path, c.hairline, pal.stroke.hairline);
    if (box.label) text(ctx, [box.label.toUpperCase()], r.x + r.w / 2, r.y + 16, { font: font('micro', { weight: 600 }), fill: c['ink-3'], letterSpacing: '0.84px' });
  }
  // Fragment frames (rects first, like the SVG layers)
  const frag = (id: string) => scene.fragments.get(id) ?? { opacity: 1, active: 0 };
  for (const f of layout.fragments) {
    if (f.kind !== 'rect') continue;
    const s = frag(f.id);
    withAlpha(ctx, s.opacity, () => {
      const path = roundRect(f.rect.x, f.rect.y, f.rect.w, f.rect.h, 4);
      withAlpha(ctx, 0.55, () => {
        ctx.fillStyle = c['accent-muted'];
        ctx.fill(path);
      });
      withAlpha(ctx, s.active, () => strokePath(ctx, path, c.brass, 1.5));
    });
  }
  for (const f of layout.fragments) {
    if (f.kind === 'rect') continue;
    const s = frag(f.id);
    withAlpha(ctx, s.opacity, () => {
      const r = f.rect;
      const path = roundRect(r.x, r.y, r.w, r.h, 4);
      strokePath(ctx, path, c.hairline, pal.stroke.hairline);
      withAlpha(ctx, s.active, () => strokePath(ctx, path, c.brass, 1.5));
      for (const sep of f.separators) strokePath(ctx, new Path2D(`M${r.x} ${sep.y} H${r.x + r.w}`), c.hairline, 1, [4, 4]);
    });
  }
  // Lifelines
  for (const p of layout.participants) {
    const s = scene.participants.get(p.id);
    if (!s) continue;
    const y2 = s.destroyed > 0 ? p.lifeline.y2 : p.lifeline.full;
    const line = new Path2D(`M${p.x} ${p.lifeline.y1} V${y2}`);
    withAlpha(ctx, s.opacity, () => strokePath(ctx, line, c.rule, pal.hc ? 1.5 : 1, [2, 4]));
    withAlpha(ctx, s.glow * s.opacity, () => strokePath(ctx, line, c.accent, s.focused ? 1.5 : 1));
  }
  // Activations
  scene.activations.forEach((a, i) => {
    const laid = layout.activations[i];
    if (!laid || a.opacity <= 0) return;
    const hcDim = pal.hc && a.dimmed;
    withAlpha(ctx, hcDim ? 1 : a.opacity, () => {
      const path = new Path2D();
      path.rect(laid.x, laid.y1, 10, Math.max(0, a.y2 - laid.y1));
      if (!hcDim) {
        ctx.fillStyle = a.ghost ? c['surface-sunken'] : c['accent-muted'];
        ctx.fill(path);
      }
      withAlpha(ctx, a.ghost ? 1 : 0.6, () => strokePath(ctx, path, a.ghost ? c.rule : c.accent, 1, hcDim ? [1, 3] : []));
    });
  });
  // Fragment tabs and labels
  for (const f of layout.fragments) {
    if (f.kind === 'rect') continue;
    const s = frag(f.id);
    const active = s.active > 0.5;
    withAlpha(ctx, s.opacity, () => {
      const r = f.rect;
      const tabH = 20;
      const tab = new Path2D(`M${r.x} ${r.y + tabH} H${r.x + f.tabWidth - 6} L${r.x + f.tabWidth} ${r.y + tabH - 6} V${r.y} H${r.x} Z`);
      ctx.fillStyle = active ? c['accent-muted'] : c['surface-sunken'];
      ctx.fill(tab);
      strokePath(ctx, tab, c.hairline, 1);
      text(ctx, [f.kind.toUpperCase()], r.x + 10, r.y + 14, { font: font('micro'), fill: c['ink-2'], anchor: 'start', halo: active ? c['accent-muted'] : c['surface-sunken'], letterSpacing: '0.84px' });
      if (f.label) text(ctx, [`[${f.label}]`], r.x + f.tabWidth + 8, r.y + 14, { font: font('label', { style: 'italic', weight: 400 }), fill: c['ink-2'], anchor: 'start', halo: c.canvas });
      for (const sep of f.separators) if (sep.label) text(ctx, [`[${sep.label}]`], r.x + 10, sep.y + 16, { font: font('label', { style: 'italic', weight: 400 }), fill: c['ink-2'], anchor: 'start', halo: c.canvas });
      if (s.iteration) text(ctx, [`${s.iteration.n} / ${s.iteration.of}`], r.x + r.w - 10, r.y + 14, { font: '600 11.5px "Inter Variable", system-ui, sans-serif', fill: c.brass, anchor: 'end', halo: c.canvas });
    });
  }
  // Participants
  for (const p of layout.participants) {
    const s = scene.participants.get(p.id);
    if (!s || s.opacity <= 0) continue;
    const drawHeader = (rect: { x: number; y: number; w: number; h: number }, footer: boolean) => {
      if (p.kind === 'actor') {
        const cx = rect.x + rect.w / 2;
        actorFigure(ctx, cx, rect.y + 4, c['ink-1'], pal.stroke.structural);
        text(ctx, p.lines, cx, rect.y + rect.h - 6 - (p.lines.length - 1) * 18, { font: footer ? font('participant', { weight: 450 }) : font('participant'), fill: footer ? c['ink-2'] : c['ink-1'] });
        return;
      }
      const box = roundRect(rect.x, rect.y, rect.w, rect.h, 6);
      ctx.fillStyle = c.surface;
      ctx.fill(box);
      const lit = !footer && (s.focused || s.highlighted);
      strokePath(ctx, box, lit ? c.accent : pal.hc ? c['ink-1'] : footer ? c.hairline : c.rule, lit ? pal.stroke.active : pal.hc ? 2 : pal.stroke.structural);
      const glyph = p.kind !== 'participant';
      const cy = rect.y + rect.h / 2 + 4.5 - ((p.lines.length - 1) * 18) / 2;
      text(ctx, p.lines, rect.x + rect.w / 2 + (glyph ? 9 : 0), cy, { font: footer ? font('participant', { weight: 450 }) : font('participant'), fill: footer ? c['ink-2'] : c['ink-1'] });
      if (glyph) headerGlyph(ctx, p.kind, rect.x + rect.w / 2 - Math.max(...p.lines.map((l) => l.length)) * 3.8 - 6, rect.y + rect.h / 2, c['ink-2']);
    };
    withAlpha(ctx, s.opacity, () => {
      ctx.save();
      ctx.translate(0, s.headerDy);
      drawHeader(p.header, false);
      ctx.restore();
      if (p.footer) drawHeader(p.footer, true);
      if (p.destroyedAt !== undefined && s.destroyed > 0) {
        const y = p.destroyedAt;
        withAlpha(ctx, s.destroyed, () => strokePath(ctx, new Path2D(`M${p.x - 6} ${y - 6} L${p.x + 6} ${y + 6} M${p.x - 6} ${y + 6} L${p.x + 6} ${y - 6}`), c.crimson, 1.5, [], 'round'));
      }
    });
  }
  // Messages
  const pulses: { x: number; y: number; angle: number; opacity: number; emphasis: boolean }[] = [];
  for (const m of layout.messages) {
    const s = scene.messages.get(m.id);
    if (!s || s.opacity <= 0) continue;
    const future = s.state === 'future' || s.state === 'unplayed';
    const hcDim = pal.hc && s.dimmed;
    withAlpha(ctx, hcDim ? 1 : s.opacity, () => {
      const dash = m.dotted ? [5, 4] : future && pal.hc ? [1, 3] : hcDim ? [1, 3] : [];
      const lineColor = s.emphasis ? c.brass : future ? c['ink-3'] : c['ink-2'];
      const lineWidth = s.emphasis ? pal.stroke.active : future ? 1 : pal.stroke.structural;
      const path = pathOf(m.points, s.draw);
      strokePath(ctx, path, lineColor, lineWidth, dash);
      withAlpha(ctx, s.highlighted ? 1 : s.highlight, () => strokePath(ctx, path, s.emphasis ? c.brass : c.accent, pal.stroke.active, m.dotted ? [5, 4] : []));
      const head = arrowHead(m.arrow);
      const start = pointAlong(m.points, 0);
      const end = pointAlong(m.points, 1);
      const headColor = m.arrow === 'solidCross' ? c.crimson : s.emphasis ? c.brass : s.state === 'current' ? c.accent : future ? c['ink-3'] : c['ink-2'];
      const place = (at: { x: number; y: number; angle: number }) =>
        withAlpha(ctx, s.head, () => {
          ctx.save();
          ctx.translate(at.x, at.y);
          ctx.rotate(at.angle);
          ctx.scale(s.headScale, s.headScale);
          const hp = new Path2D(head.d);
          if (head.filled) {
            ctx.fillStyle = headColor;
            ctx.fill(hp);
          }
          strokePath(ctx, hp, headColor, m.arrow === 'solidCross' ? 1.5 : pal.stroke.structural, [], 'round');
          ctx.restore();
        });
      place(head.atStart ? { x: start.x, y: start.y, angle: start.angle + Math.PI } : end);
      if (head.bothEnds) place({ x: start.x, y: start.y, angle: start.angle + Math.PI });
      withAlpha(ctx, s.label, () => {
        const current = s.state === 'current' || s.highlighted;
        const muted = future || (s.state === 'past' && s.opacity < 1) || s.dimmed;
        text(ctx, m.label.lines, m.label.x, m.label.y + s.labelRise, {
          font: current ? font('label', { weight: 560 }) : font('label'),
          fill: current && !s.dimmed ? c['ink-1'] : muted ? c['ink-3'] : c['ink-2'],
          anchor: m.label.anchor,
          halo: c.canvas,
        });
      });
      if (m.badge) {
        const current = s.state === 'current';
        const circle = new Path2D();
        circle.arc(m.badge.x, m.badge.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = current ? c.accent : c.surface;
        ctx.fill(circle);
        strokePath(ctx, circle, current ? c.accent : c.rule, 1);
        text(ctx, [String(m.badge.n)], m.badge.x, m.badge.y + 4, { font: font('badge'), fill: current ? c.surface : c['ink-2'] });
      }
      if (m.central) {
        const ends = [m.central !== 'target' ? m.points[0] : undefined, m.central !== 'source' ? m.points[m.points.length - 1] : undefined];
        for (const e of ends) {
          if (!e) continue;
          const dot = new Path2D();
          dot.arc(e.x, e.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = c.surface;
          ctx.fill(dot);
          strokePath(ctx, dot, s.state === 'current' ? c.accent : c['ink-2'], 1.25);
        }
      }
    });
    if (s.pulse) {
      const at = pointAlong(m.points, s.pulse.at);
      pulses.push({ x: at.x, y: at.y, angle: at.angle, opacity: s.pulse.opacity * (s.dimmed ? 0.4 : 1), emphasis: s.emphasis });
    }
  }
  // Notes
  for (const n of layout.notes) {
    const s = scene.notes.get(n.id);
    if (!s || s.opacity <= 0) continue;
    withAlpha(ctx, s.opacity, () => {
      const { x, w, h } = n.rect;
      const y = n.rect.y + s.rise;
      const shape = new Path2D(`M${x} ${y} H${x + w - 8} L${x + w} ${y + 8} V${y + h} H${x} Z`);
      ctx.fillStyle = c['note-fill'];
      ctx.fill(shape);
      strokePath(ctx, shape, c['note-rule'], 1);
      strokePath(ctx, new Path2D(`M${x + w - 8} ${y} V${y + 8} H${x + w}`), c['note-rule'], 1);
      const muted = s.state === 'future' || s.state === 'unplayed' || s.dimmed;
      text(ctx, n.lines, x + w / 2, y + 21, { font: font('note'), fill: muted ? c['ink-3'] : c['ink-1'] });
    });
  }
  for (const p of pulses) drawPulse(ctx, pal, p.x, p.y, p.angle, p.opacity, p.emphasis, !!options.comet);
}

// -- topology ---------------------------------------------------------------------------------------------------

export interface CanvasTopologyLabels {
  nodes: ReadonlyMap<string, string[]>;
  messages: ReadonlyMap<string, string>;
}

function topologyNode(ctx: Ctx2D, pal: CanvasPalette, kind: ParticipantKind, w: number, h: number, lines: string[], lit: boolean, destroyed: boolean): void {
  const c = pal.c;
  const cx = w / 2;
  const extra = (lines.length - 1) * 18;
  const label = (y: number) => text(ctx, lines, cx, y, { font: font('participant'), fill: c['ink-1'] });
  const boxStroke = lit ? c.accent : pal.hc ? c['ink-1'] : c.rule;
  const boxWidth = lit ? pal.stroke.active : pal.hc ? 2 : pal.stroke.structural;
  const shape = (p: Path2D) => {
    ctx.fillStyle = c.surface;
    ctx.fill(p);
    strokePath(ctx, p, boxStroke, boxWidth);
  };
  const textY = (top: number, height: number) => top + height / 2 + 4.5 - extra / 2;
  if (GLYPH_KINDS.has(kind)) {
    const color = c['ink-1'];
    const width = pal.stroke.structural;
    if (kind === 'actor') actorFigure(ctx, cx, 1.5, color, width);
    else {
      const p = new Path2D();
      if (kind === 'boundary') {
        p.addPath(new Path2D(`M${cx - 15} 5 V29 M${cx - 15} 17 H${cx - 9}`));
        p.moveTo(cx + 13, 17);
        p.arc(cx + 2, 17, 11, 0, Math.PI * 2);
      } else if (kind === 'control') {
        p.moveTo(cx + 11, 18);
        p.arc(cx, 18, 11, 0, Math.PI * 2);
        p.addPath(new Path2D(`M${cx - 2} 4 L${cx + 3} 7 L${cx - 2} 10`));
      } else {
        p.moveTo(cx + 11, 16);
        p.arc(cx, 16, 11, 0, Math.PI * 2);
        p.addPath(new Path2D(`M${cx - 12} 30 H${cx + 12}`));
      }
      strokePath(ctx, p, color, width, [], 'round');
    }
    label(TOPOLOGY.glyphHeight + 14);
  } else if (kind === 'database') {
    const ry = 6;
    shape(new Path2D(`M0 ${ry} A${cx} ${ry} 0 0 1 ${w} ${ry} V${h - ry} A${cx} ${ry} 0 0 1 0 ${h - ry} Z`));
    strokePath(ctx, new Path2D(`M0 ${ry} A${cx} ${ry} 0 0 0 ${w} ${ry}`), c.rule, pal.stroke.structural);
    label(textY(ry * 2, h - ry * 2));
  } else if (kind === 'queue') {
    const rx = 10;
    shape(new Path2D(`M${rx} 0 H${w - rx} A${rx} ${h / 2} 0 0 1 ${w - rx} ${h} H${rx} A${rx} ${h / 2} 0 0 1 ${rx} 0 Z`));
    strokePath(ctx, new Path2D(`M${w - rx} 0 A${rx} ${h / 2} 0 0 0 ${w - rx} ${h}`), c.rule, pal.stroke.structural);
    label(textY(0, h));
  } else if (kind === 'collections') {
    shape(roundRect(6, 0, w - 6, h - 6, 6));
    shape(roundRect(0, 6, w - 6, h - 6, 6));
    label(textY(6, h - 6));
  } else {
    shape(roundRect(0, 0, w, h, 8));
    label(textY(0, h));
  }
  if (destroyed) {
    // A line through the label stands in for the SVG `text-decoration: line-through`.
    ctx.font = font('participant');
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const y = GLYPH_KINDS.has(kind) ? TOPOLOGY.glyphHeight + 10 : textY(0, h) - 4;
    strokePath(ctx, new Path2D(`M${cx - width / 2} ${y} H${cx + width / 2}`), c['ink-1'], 1);
  }
}

export function drawTopology(ctx: Ctx2D, topology: Topology, geometry: TopologyGeometry, labels: CanvasTopologyLabels, scene: TopologyScene, pal: CanvasPalette, options: CanvasRenderOptions & { weight?: 'count' | 'uniform' } = {}): void {
  const c = pal.c;
  for (const cl of topology.clusters) {
    const r = geometry.clusters.get(cl.id);
    if (!r) continue;
    const path = roundRect(r.x, r.y, r.w, r.h, 12);
    withAlpha(ctx, 0.7, () => {
      ctx.fillStyle = c['surface-sunken'];
      ctx.fill(path);
    });
    const active = (scene.clusters.get(cl.id)?.active ?? 0) > 0.5;
    strokePath(ctx, path, active ? c.brass : c.hairline, active ? 1.5 : pal.stroke.hairline);
    if (cl.label) text(ctx, [cl.label.toUpperCase()], r.x + 12, r.y + 16, { font: font('micro', { weight: 600 }), fill: c['ink-3'], anchor: 'start', letterSpacing: '0.84px' });
  }
  const pulses: { x: number; y: number; angle: number; opacity: number; emphasis: boolean }[] = [];
  const badges: (() => void)[] = [];
  for (const edge of topology.edges) {
    const route = geometry.edges.get(edge.key);
    const s = scene.edges.get(edge.key);
    if (!route || !s || s.opacity <= 0) continue;
    const future = s.state === 'future' || s.state === 'unplayed';
    const hcDim = pal.hc && s.dimmed;
    const weighted = options.weight !== 'uniform' && edge.messages.length > 0 ? edgeWidth(edge.messages.length) : pal.stroke.structural;
    const dotted = edge.kind === 'return';
    withAlpha(ctx, hcDim ? 1 : s.opacity, () => {
      const dash = dotted ? [5, 4] : (future && pal.hc) || hcDim ? [1, 3] : [];
      const color = s.emphasis ? c.brass : future || s.dimmed ? c['ink-3'] : c['ink-2'];
      const path = pathOf(route.points, s.draw);
      strokePath(ctx, path, color, future ? 1 : weighted, dash, 'round');
      withAlpha(ctx, s.highlighted ? 1 : s.highlight, () => strokePath(ctx, path, s.emphasis ? c.brass : c.accent, Math.max(pal.stroke.active, options.weight !== 'uniform' ? weighted : 0), dotted ? [5, 4] : [], 'round'));
      if (s.draw >= 0.98) {
        const tip = pointAlong(route.points, s.draw);
        const headColor = s.state === 'current' ? c.accent : future ? c['ink-3'] : c['ink-2'];
        ctx.save();
        ctx.translate(tip.x, tip.y);
        ctx.rotate(tip.angle);
        const hp = new Path2D('M0 0 L-8.5 -3.2 L-8.5 3.2 Z');
        ctx.fillStyle = headColor;
        ctx.fill(hp);
        strokePath(ctx, hp, headColor, pal.stroke.structural, [], 'round');
        ctx.restore();
      }
    });
    if (edge.messages.length > 1) {
      badges.push(() =>
        withAlpha(ctx, s.opacity, () => {
          const label = `×${edge.messages.length}`;
          const w = 12 + label.length * 7.2;
          const current = s.state === 'current';
          const pill = roundRect(route.label.x - w / 2, route.label.y - 8, w, 16, 8);
          ctx.fillStyle = current ? c.accent : c.surface;
          ctx.fill(pill);
          strokePath(ctx, pill, current ? c.accent : pal.hc ? c['ink-1'] : c.rule, 1);
          text(ctx, [label], route.label.x, route.label.y + 4, { font: '600 11.5px "Inter Variable", system-ui, sans-serif', fill: current ? c.surface : c['ink-2'] });
        }),
      );
    }
    const message = s.current[s.current.length - 1];
    if (message && s.label > 0) {
      const y = route.label.y - (edge.messages.length > 1 ? 14 : 8);
      badges.push(() => withAlpha(ctx, s.label, () => text(ctx, [(labels.messages.get(message) ?? '').replace(/\n/g, ' ')], route.label.x, y, { font: font('label', { weight: 560 }), fill: c['ink-1'], halo: c.canvas })));
    }
    for (const p of s.pulses) {
      const at = pointAlong(route.points, p.at);
      pulses.push({ x: at.x, y: at.y, angle: at.angle, opacity: p.opacity * (s.dimmed ? 0.4 : 1), emphasis: s.emphasis });
    }
  }
  for (const n of topology.nodes) {
    const r = geometry.nodes.get(n.id);
    const s = scene.nodes.get(n.id);
    if (!r || !s || s.opacity <= 0) continue;
    withAlpha(ctx, s.opacity, () => {
      ctx.save();
      ctx.translate(r.x, r.y);
      withAlpha(ctx, s.ring, () => {
        const ring = (pad: number, radius: number) => strokePath(ctx, roundRect(-pad, -pad, r.w + 2 * pad, r.h + 2 * pad, radius), c.accent, pal.hc ? 1.5 : 1, [3, 3]);
        withAlpha(ctx, pal.hc ? 1 : 0.55, () => {
          ring(6, 13);
          if (s.depth > 1) ring(11, 17);
        });
      });
      withAlpha(ctx, s.highlighted ? 1 : s.glow, () => strokePath(ctx, roundRect(-2.5, -2.5, r.w + 5, r.h + 5, 10), c.accent, 1.5));
      topologyNode(ctx, pal, n.kind, r.w, r.h, labels.nodes.get(n.id) ?? [n.label], !!s.focused, s.destroyed);
      ctx.restore();
    });
  }
  for (const draw of badges) draw();
  for (const p of pulses) drawPulse(ctx, pal, p.x, p.y, p.angle, p.opacity, p.emphasis, !!options.comet);
}
