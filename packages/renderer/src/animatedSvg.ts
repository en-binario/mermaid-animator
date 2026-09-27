/**
 * Animated SVG compiler (spec animated-svg-export, M3 D4): a self-contained, script-free SVG in
 * which a range of the timeline plays through CSS @keyframes — opacity, translate, scaleY, stroke
 * drawing (masks with `pathLength="1"`) and colours (CSS variables, so a dark palette can swap in).
 *
 * Every animated property is sampled at 30 Hz, merged (constant runs and linear runs collapse to
 * their end points) and emitted as one @keyframes rule per element; linear timing between dense
 * stops reproduces the motion system's easing. Each element's base style is its final state, so
 * `prefers-reduced-motion: reduce` (animations off) shows the last frame.
 */
import { edgeWidth, type FontRole, type Point, type SequenceLayout, type TextRun, type TextStyle, type Topology, type TopologyGeometry } from '@mermaid-animator/core';
import { BOLD_WEIGHT } from './measure';
import { partialPath, pointAlong } from './geometry';
import { arrowHead } from './svg';
import { sceneAt, type DisplayOptions, type Scene, type SceneModel } from './scene';
import { PALETTES, type ColorToken } from './theme';
import { topologySceneAt, type TopologyScene, type TopologySceneModel } from './topologyScene';

export type AnimatedSvgTheme = 'github' | 'ivory' | 'graphite';

/**
 * GitHub-safe palette (transparent background, works on #ffffff and #0d1117): dark ink with a
 * white halo on text and a white casing under strokes. No flat colour reaches 4.5:1 on both page
 * colours (the best is ≈ 4.34:1), so legibility comes from the ink/casing pair: ink ≥ 4.5:1 on the
 * light page, casing ≥ 4.5:1 on the dark page, ink ≥ 4.5:1 on its casing.
 */
export const GITHUB_SAFE = {
  ink: '#1f2328',
  ink2: '#424a53',
  ink3: '#59636e',
  accent: '#0550ae',
  brass: '#7d4e00',
  casing: '#ffffff',
  fill: '#ffffff',
  sunken: '#f6f8fa',
  noteFill: '#fff8c5',
  noteRule: '#9a6700',
  accentMuted: '#ddf4ff',
  crimson: '#a40e26',
  hairline: '#d1d9e0',
};

type Vars = Record<string, string>;

/** CSS variables for a theme; `casing` is `none` where no casing is needed. */
export function themeVars(theme: AnimatedSvgTheme): Vars {
  if (theme === 'github') {
    const g = GITHUB_SAFE;
    return {
      '--i1': g.ink, '--i2': g.ink2, '--i3': g.ink3, '--ac': g.accent, '--br': g.brass, '--cs': g.casing, '--sf': g.fill, '--sk': g.sunken,
      '--nf': g.noteFill, '--nr': g.noteRule, '--am': g.accentMuted, '--cr': g.crimson, '--hl': g.hairline, '--rl': g.ink3, '--halo': g.casing,
    };
  }
  const c: Record<ColorToken, string> = PALETTES[theme];
  return {
    '--i1': c['ink-1'], '--i2': c['ink-2'], '--i3': c['ink-3'], '--ac': c.accent, '--br': c.brass, '--cs': 'none', '--sf': c.surface, '--sk': c['surface-sunken'],
    '--nf': c['note-fill'], '--nr': c['note-rule'], '--am': c['accent-muted'], '--cr': c.crimson, '--hl': c.hairline, '--rl': c.rule, '--halo': c.canvas,
  };
}

export interface AnimatedSvgOptions {
  /** Timeline range in ms. */
  start: number;
  end: number;
  speed: number;
  /** End hold in seconds. */
  hold: number;
  /** 0 = forever, n = number of plays. */
  loop: number;
  theme: AnimatedSvgTheme;
  /** Adds a `prefers-color-scheme: dark` block with the Graphite palette. */
  adaptive: boolean;
  display: DisplayOptions;
  /** Font-face CSS (embedded data URIs) and a text measure for `textLength`. */
  fontCss: string;
  measure: (text: string, font: FontRole, style?: TextStyle) => number;
}

// -- keyframe tracks ---------------------------------------------------------------------------------------------

type Value = number | string;
interface Prop {
  /** CSS property name. */
  name: string;
  /** Value at a scene sample. */
  at: (i: number) => Value;
  format: (v: Value) => string;
  eps: number;
}

interface Track {
  cls: string;
  props: Prop[];
}

const SAMPLE_HZ = 30;
const num = (digits: number) => (v: Value) => (typeof v === 'number' ? String(Math.round(v * 10 ** digits) / 10 ** digits) : String(v));

/** Collapses constant and linear runs; returns kept indices. */
function mergeStops(values: Value[], eps: number): number[] {
  const keep = [0];
  for (let i = 1; i < values.length - 1; i++) {
    const a = values[keep[keep.length - 1]!]!;
    const b = values[i]!;
    const c = values[i + 1]!;
    if (typeof b === 'number' && typeof a === 'number' && typeof c === 'number') {
      const j = keep[keep.length - 1]!;
      const t = (i - j) / (i + 1 - j);
      if (Math.abs(a + (c - a) * t - b) <= eps) continue;
      keep.push(i);
    } else if (b !== a || b !== c) keep.push(i);
  }
  if (values.length > 1) keep.push(values.length - 1);
  return keep;
}

class Compiler {
  readonly tracks: Track[] = [];
  private id = 0;
  readonly samples: number[];
  readonly percents: number[];
  readonly durationMs: number;

  constructor(readonly options: AnimatedSvgOptions) {
    const rangeMs = Math.max(0, options.end - options.start);
    const playMs = rangeMs / options.speed;
    this.durationMs = playMs + options.hold * 1000;
    const count = Math.max(2, Math.ceil((playMs / 1000) * SAMPLE_HZ) + 1);
    this.samples = Array.from({ length: count }, (_, i) => Math.min(options.end, options.start + ((i / (count - 1)) * rangeMs)));
    this.percents = this.samples.map((_, i) => (((i / (count - 1)) * playMs) / Math.max(1, this.durationMs)) * 100);
  }

  cls(): string {
    return `a${(this.id++).toString(36)}`;
  }

  add(cls: string, props: Prop[]): string {
    this.tracks.push({ cls, props });
    return cls;
  }

  /** CSS for every track: base style = last sample; keyframes only for properties that change. */
  css(): string {
    const iteration = this.options.loop <= 0 ? 'infinite' : String(this.options.loop);
    const duration = `${Math.round(this.durationMs)}ms`;
    const out: string[] = [];
    for (const t of this.tracks) {
      const base: string[] = [];
      const frames = new Map<number, string[]>();
      let animated = false;
      for (const p of t.props) {
        const values = this.samples.map((_, i) => p.at(i));
        const last = values[values.length - 1]!;
        base.push(`${p.name}:${p.format(last)}`);
        if (values.every((v) => v === values[0])) continue;
        animated = true;
        for (const i of mergeStops(values, p.eps)) {
          const pct = Math.round(this.percents[i]! * 1000) / 1000;
          const list = frames.get(pct) ?? [];
          list.push(`${p.name}:${p.format(values[i]!)}`);
          frames.set(pct, list);
        }
        // Hold the last value through the end hold.
        const list = frames.get(100) ?? [];
        list.push(`${p.name}:${p.format(last)}`);
        frames.set(100, list);
      }
      if (!animated) {
        out.push(`.${t.cls}{${base.join(';')}}`);
        continue;
      }
      out.push(`.${t.cls}{${base.join(';')};animation:k${t.cls} ${duration} linear ${iteration} both}`);
      const stops = [...frames.entries()].sort((a, b) => a[0] - b[0]).map(([pct, decl]) => `${pct}%{${decl.join(';')}}`);
      out.push(`@keyframes k${t.cls}{${stops.join('')}}`);
    }
    return out.join('\n');
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (n: number) => Math.round(n * 100) / 100;

type Width = (line: string, style?: TextStyle) => number;

/** Text lines with advances pinned by `textLength`; formatted lines pin each styled run (spec label-formatting). */
function textEl(lines: string[], x: number, y: number, cls: string, anchor: string, width: Width, extraStyle = '', styled?: { runs?: TextRun[][]; role: FontRole }): string {
  const pin = (w: number) => (w > 0 ? ` textLength="${r2(w)}" lengthAdjust="spacing"` : '');
  const spans = lines
    .map((line, i) => {
      const runs = styled?.runs?.[i];
      if (!runs || !styled) return `<tspan x="${r2(x)}" dy="${i === 0 ? 0 : 18}"${pin(width(line))}>${esc(line)}</tspan>`;
      const inner = runs
        .map((r) => {
          const style = r.bold || r.italic ? { bold: r.bold, italic: r.italic } : undefined;
          const attrs = `${r.bold ? ` font-weight="${BOLD_WEIGHT[styled.role]}"` : ''}${r.italic ? ' font-style="italic"' : ''}`;
          return `<tspan${attrs}${pin(width(r.text, style))}>${esc(r.text)}</tspan>`;
        })
        .join('');
      return `<tspan x="${r2(x)}" dy="${i === 0 ? 0 : 18}">${inner}</tspan>`;
    })
    .join('');
  return `<text class="${cls}" x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}"${extraStyle}>${spans}</text>`;
}

const bracketed = (label: string, runs: TextRun[] | undefined): { lines: string[]; runs?: TextRun[][] } =>
  runs ? { lines: [`[${label}]`], runs: [[{ text: '[' }, ...runs, { text: ']' }]] } : { lines: [`[${label}]`] };

// -- shared static CSS ------------------------------------------------------------------------------------------

function baseCss(theme: AnimatedSvgTheme, adaptive: boolean): string {
  const vars = (v: Vars) => Object.entries(v).map(([k, val]) => `${k}:${val}`).join(';');
  const rules = [
    `svg{${vars(themeVars(theme))}}`,
    adaptive ? `@media (prefers-color-scheme: dark){svg{${vars(themeVars('graphite'))}}}` : '',
    'text{font-family:"Inter Variable",Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}',
    '.t{fill:var(--i2);font-size:13px;font-weight:450;paint-order:stroke fill;stroke:var(--halo);stroke-width:4px;stroke-linejoin:round}',
    '.tp{fill:var(--i1);font-size:13.5px;font-weight:560;paint-order:stroke fill;stroke:var(--halo);stroke-width:3px;stroke-linejoin:round}',
    '.tm{fill:var(--i3);font-size:10.5px;font-weight:650;letter-spacing:.08em;paint-order:stroke fill;stroke:var(--halo);stroke-width:3px}',
    '.tn{fill:var(--i1);font-size:13px}',
    '.cs{fill:none;stroke:var(--cs);stroke-linecap:round;stroke-linejoin:round}',
    '.bx{fill:var(--sf);stroke:var(--rl);stroke-width:1.25}',
    '.lf{stroke:var(--rl);stroke-width:1;stroke-dasharray:2 4}',
    '.lg{stroke:var(--ac);stroke-width:1}',
    '.ln{fill:none;stroke-width:1.25}',
    '.dt{stroke-dasharray:5 4}',
    '.hl{fill:none;stroke:var(--ac);stroke-width:2}',
    '.fr{fill:none;stroke:var(--hl);stroke-width:1}',
    '.fg{fill:none;stroke:var(--br);stroke-width:1.5}',
    '.ft{fill:var(--sk);stroke:var(--hl);stroke-width:1}',
    '.ac{fill:var(--am);stroke:var(--ac);stroke-opacity:.6;stroke-width:1;transform-box:fill-box;transform-origin:50% 0}',
    '.nt{fill:var(--nf);stroke:var(--nr);stroke-width:1}',
    '.pd{fill:var(--ac)}',
    '.ph{fill:var(--ac);opacity:.22}',
    '.mk{fill:none;stroke:#fff;stroke-width:14;stroke-linecap:butt;stroke-dasharray:1 1}',
    '@media (prefers-reduced-motion: reduce){*{animation:none!important}}',
  ];
  return rules.filter(Boolean).join('\n');
}

function document(width: number, height: number, pad: number, css: string, body: string, fontCss: string, title: string): string {
  const w = Math.ceil(width + 2 * pad);
  const h = Math.ceil(height + 2 * pad);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${-pad} ${-pad} ${w} ${h}" role="img" aria-label="${esc(title)}">`,
    `<title>${esc(title)}</title>`,
    `<style>${fontCss}\n${css}</style>`,
    body,
    '</svg>',
  ].join('\n');
}

// -- sequence -----------------------------------------------------------------------------------------------------

export function compileSequenceSvg(layout: SequenceLayout, model: SceneModel, options: AnimatedSvgOptions, title: string): string {
  const k = new Compiler(options);
  const scenes: Scene[] = k.samples.map((t) => sceneAt(model, t, options.display));
  const at = (f: (s: Scene) => Value) => (i: number) => f(scenes[i]!);
  const width = (font: Parameters<AnimatedSvgOptions['measure']>[1]): Width => (line, style) => options.measure(line, font, style);
  const opacity = (f: (s: Scene) => number): Prop => ({ name: 'opacity', at: at(f), format: num(3), eps: 0.004 });
  const translateY = (f: (s: Scene) => number): Prop => ({ name: 'transform', at: at((s) => Math.round(f(s) * 10) / 10), format: (v) => `translate(0px,${v}px)`, eps: 0.25 });
  const color = (f: (s: Scene) => string): Prop => ({ name: 'fill', at: at(f), format: String, eps: 0 });
  const strokeColor = (f: (s: Scene) => string): Prop => ({ name: 'stroke', at: at(f), format: String, eps: 0 });
  const casing = options.theme === 'github';
  const parts: string[] = [];
  const defs: string[] = [];

  for (const box of layout.boxes) {
    const r = box.rect;
    parts.push(`<rect x="${r2(r.x)}" y="${r2(r.y)}" width="${r2(r.w)}" height="${r2(r.h)}" rx="10" fill="var(--sk)" fill-opacity=".7" stroke="var(--hl)"/>`);
    if (box.label) parts.push(textEl([box.label.toUpperCase()], r.x + r.w / 2, r.y + 16, 'tm', 'middle', width('micro'), '', { runs: box.labelRuns && [box.labelRuns.map((x) => ({ ...x, text: x.text.toUpperCase() }))], role: 'micro' }));
  }

  // Fragments: frame and glow, then tabs and labels (after lifelines, like the live renderer).
  const tabs: string[] = [];
  for (const f of layout.fragments) {
    const r = f.rect;
    const g = k.add(k.cls(), [opacity((s) => s.fragments.get(f.id)?.opacity ?? 1)]);
    const glow = k.add(k.cls(), [opacity((s) => s.fragments.get(f.id)?.active ?? 0)]);
    if (f.kind === 'rect') {
      parts.push(`<g class="${g}"><rect x="${r2(r.x)}" y="${r2(r.y)}" width="${r2(r.w)}" height="${r2(r.h)}" rx="4" fill="var(--am)" fill-opacity=".55"/><rect class="fg ${glow}" x="${r2(r.x)}" y="${r2(r.y)}" width="${r2(r.w)}" height="${r2(r.h)}" rx="4"/></g>`);
      continue;
    }
    const seps = f.separators.map((sep) => `<path class="fr" stroke-dasharray="4 4" d="M${r2(r.x)} ${r2(sep.y)}H${r2(r.x + r.w)}"/>`).join('');
    parts.push(`<g class="${g}"><rect class="fr" x="${r2(r.x)}" y="${r2(r.y)}" width="${r2(r.w)}" height="${r2(r.h)}" rx="4"/><rect class="fg ${glow}" x="${r2(r.x)}" y="${r2(r.y)}" width="${r2(r.w)}" height="${r2(r.h)}" rx="4"/>${seps}</g>`);
    const tabFill = k.add(k.cls(), [color((s) => ((s.fragments.get(f.id)?.active ?? 0) > 0.5 ? 'var(--am)' : 'var(--sk)'))]);
    const labels = [
      `<path class="ft ${tabFill}" d="M${r2(r.x)} ${r2(r.y + 20)}H${r2(r.x + f.tabWidth - 6)}L${r2(r.x + f.tabWidth)} ${r2(r.y + 14)}V${r2(r.y)}H${r2(r.x)}Z"/>`,
      textEl([f.kind.toUpperCase()], r.x + 10, r.y + 14, 'tm', 'start', width('micro')),
      f.label ? (() => { const b = bracketed(f.label, f.labelRuns); return textEl(b.lines, r.x + f.tabWidth + 8, r.y + 14, 't', 'start', () => 0, ' font-style="italic"', { runs: b.runs, role: 'label' }); })() : '',
      ...f.separators.filter((s) => s.label).map((sep) => { const b = bracketed(sep.label, sep.runs); return textEl(b.lines, r.x + 10, sep.y + 16, 't', 'start', () => 0, ' font-style="italic"', { runs: b.runs, role: 'label' }); }),
    ];
    // Loop counters: one text per value, each visible while that iteration plays.
    const counts = new Set(scenes.map((s) => s.fragments.get(f.id)?.iteration).filter(Boolean).map((it) => `${it!.n} / ${it!.of}`));
    for (const value of counts) {
      const c = k.add(k.cls(), [opacity((s) => {
        const it = s.fragments.get(f.id)?.iteration;
        return it && `${it.n} / ${it.of}` === value ? 1 : 0;
      })]);
      labels.push(`<text class="t ${c}" x="${r2(r.x + r.w - 10)}" y="${r2(r.y + 14)}" text-anchor="end" style="fill:var(--br);font-weight:600;font-size:11.5px">${esc(value)}</text>`);
    }
    tabs.push(`<g class="${g}">${labels.join('')}</g>`);
  }

  // Lifelines and glows
  for (const p of layout.participants) {
    const o = k.add(k.cls(), [opacity((s) => s.participants.get(p.id)?.opacity ?? 1)]);
    const glow = k.add(k.cls(), [opacity((s) => (s.participants.get(p.id)?.glow ?? 0) * (s.participants.get(p.id)?.opacity ?? 1))]);
    const y2 = p.destroyedAt !== undefined ? p.lifeline.y2 : p.lifeline.full;
    parts.push(`<path class="lf ${o}" d="M${r2(p.x)} ${r2(p.lifeline.y1)}V${r2(y2)}"/><path class="lg ${glow}" d="M${r2(p.x)} ${r2(p.lifeline.y1)}V${r2(y2)}"/>`);
  }

  // Activations: drawn at their fullest extent and scaled from the top.
  layout.activations.forEach((a, index) => {
    const max = Math.max(10, ...scenes.map((s) => (s.activations[index]?.y2 ?? a.y1) - a.y1));
    const cls = k.add(k.cls(), [
      opacity((s) => s.activations[index]?.opacity ?? 0),
      { name: 'transform', at: at((s) => Math.round((Math.max(0, (s.activations[index]?.y2 ?? a.y1) - a.y1) / max) * 1000) / 1000), format: (v) => `scaleY(${v})`, eps: 0.004 },
    ]);
    parts.push(`<rect class="ac ${cls}" x="${r2(a.x)}" y="${r2(a.y1)}" width="10" height="${r2(max)}"/>`);
  });
  parts.push(...tabs);

  // Participant headers (and footers)
  for (const p of layout.participants) {
    const cls = k.add(k.cls(), [opacity((s) => s.participants.get(p.id)?.opacity ?? 1), translateY((s) => s.participants.get(p.id)?.headerDy ?? 0)]);
    const header = (rect: { x: number; y: number; w: number; h: number }) => {
      if (p.kind === 'actor') {
        const cx = rect.x + rect.w / 2;
        const top = rect.y + 4;
        const figure = `M${r2(cx + 5.5)} ${r2(top + 6)}A5.5 5.5 0 1 1 ${r2(cx - 5.5)} ${r2(top + 6)}A5.5 5.5 0 1 1 ${r2(cx + 5.5)} ${r2(top + 6)}M${r2(cx)} ${r2(top + 11.5)}V${r2(top + 26)}M${r2(cx - 9)} ${r2(top + 16)}H${r2(cx + 9)}M${r2(cx)} ${r2(top + 26)}L${r2(cx - 7)} ${r2(top + 35)}M${r2(cx)} ${r2(top + 26)}L${r2(cx + 7)} ${r2(top + 35)}`;
        return `${casing ? `<path class="cs" stroke-width="3.75" d="${figure}"/>` : ''}<path fill="none" stroke="var(--i1)" stroke-width="1.25" stroke-linecap="round" d="M${r2(cx + 5.5)} ${r2(top + 6)}A5.5 5.5 0 1 1 ${r2(cx - 5.5)} ${r2(top + 6)}A5.5 5.5 0 1 1 ${r2(cx + 5.5)} ${r2(top + 6)}M${r2(cx)} ${r2(top + 11.5)}V${r2(top + 26)}M${r2(cx - 9)} ${r2(top + 16)}H${r2(cx + 9)}M${r2(cx)} ${r2(top + 26)}L${r2(cx - 7)} ${r2(top + 35)}M${r2(cx)} ${r2(top + 26)}L${r2(cx + 7)} ${r2(top + 35)}"/>${textEl(p.lines, cx, rect.y + rect.h - 6 - (p.lines.length - 1) * 18, 'tp', 'middle', width('participant'), '', { runs: p.runs, role: 'participant' })}`;
      }
      const cy = rect.y + rect.h / 2 + 4.5 - ((p.lines.length - 1) * 18) / 2;
      return `<rect class="bx" x="${r2(rect.x)}" y="${r2(rect.y)}" width="${r2(rect.w)}" height="${r2(rect.h)}" rx="6"/>${textEl(p.lines, rect.x + rect.w / 2, cy, 'tp', 'middle', width('participant'), '', { runs: p.runs, role: 'participant' })}`;
    };
    parts.push(`<g class="${cls}">${header(p.header)}</g>`);
    if (p.footer) {
      const fcls = k.add(k.cls(), [opacity((s) => s.participants.get(p.id)?.opacity ?? 1)]);
      parts.push(`<g class="${fcls}">${header(p.footer)}</g>`);
    }
  }

  // Messages
  const pulses: string[] = [];
  for (const m of layout.messages) {
    const full = partialPath(m.points, 1);
    const maskId = `m${k.cls()}`;
    const draw = k.add(k.cls(), [{ name: 'stroke-dashoffset', at: at((s) => Math.round((1 - (s.messages.get(m.id)?.draw ?? 1)) * 1000) / 1000), format: num(3), eps: 0.003 }]);
    defs.push(`<mask id="${maskId}" maskUnits="userSpaceOnUse"><path class="mk ${draw}" pathLength="1" d="${full}"/></mask>`);
    const state = (s: Scene) => s.messages.get(m.id);
    const group = k.add(k.cls(), [opacity((s) => state(s)?.opacity ?? 0)]);
    const lineColor = k.add(k.cls(), [strokeColor((s) => (state(s)?.emphasis ? 'var(--br)' : state(s)?.state === 'future' || state(s)?.state === 'unplayed' ? 'var(--i3)' : 'var(--i2)'))]);
    const hl = k.add(k.cls(), [opacity((s) => (state(s)?.highlighted ? 1 : state(s)?.highlight ?? 0))]);
    const head = arrowHead(m.arrow);
    const headColor = (s: Scene) => (m.arrow === 'solidCross' ? 'var(--cr)' : state(s)?.emphasis ? 'var(--br)' : state(s)?.state === 'current' ? 'var(--ac)' : state(s)?.state === 'future' || state(s)?.state === 'unplayed' ? 'var(--i3)' : 'var(--i2)');
    const headCls = k.add(k.cls(), [opacity((s) => state(s)?.head ?? 0), strokeColor(headColor), ...(head.filled ? [color(headColor)] : [])]);
    const start = pointAlong(m.points, 0);
    const end = pointAlong(m.points, 1);
    const place = (a: { x: number; y: number; angle: number }) => `<g transform="translate(${r2(a.x)} ${r2(a.y)}) rotate(${r2((a.angle * 180) / Math.PI)})"><path class="${headCls}" d="${head.d}" fill="${head.filled ? 'var(--i2)' : 'none'}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    const heads = [place(head.atStart ? { x: start.x, y: start.y, angle: start.angle + Math.PI } : end), head.bothEnds ? place({ x: start.x, y: start.y, angle: start.angle + Math.PI }) : ''].join('');
    const label = k.add(k.cls(), [
      opacity((s) => state(s)?.label ?? 0),
      translateY((s) => state(s)?.labelRise ?? 0),
      color((s) => (state(s)?.state === 'current' ? 'var(--i1)' : state(s)?.state === 'future' || state(s)?.state === 'unplayed' || (state(s)?.state === 'past' && (state(s)?.opacity ?? 1) < 1) ? 'var(--i3)' : 'var(--i2)')),
    ]);
    const dotted = m.dotted ? ' dt' : '';
    parts.push(
      `<g class="${group}">${casing ? `<path class="cs" stroke-width="3.5" d="${full}" mask="url(#${maskId})"/>` : ''}<path class="ln${dotted} ${lineColor}" d="${full}" mask="url(#${maskId})"/><path class="hl${dotted} ${hl}" d="${full}" mask="url(#${maskId})"/>${heads}${textEl(m.label.lines, m.label.x, m.label.y, `t ${label}`, m.label.anchor === 'start' ? 'start' : 'middle', width('label'), '', { runs: m.label.runs, role: 'label' })}${
        m.badge ? `<circle cx="${r2(m.badge.x)}" cy="${r2(m.badge.y)}" r="9" fill="var(--sf)" stroke="var(--rl)"/><text x="${r2(m.badge.x)}" y="${r2(m.badge.y + 4)}" text-anchor="middle" style="fill:var(--i2);font-size:10.5px;font-weight:560">${m.badge.n}</text>` : ''
      }</g>`,
    );
    if (options.display.indicator !== 'none' && scenes.some((s) => state(s)?.pulse)) {
      const pos = (s: Scene): Point => {
        const p = state(s)?.pulse;
        return p ? pointAlong(m.points, p.at) : pointAlong(m.points, 0);
      };
      const pulse = k.add(k.cls(), [
        opacity((s) => (state(s)?.pulse?.opacity ?? 0) * (state(s)?.dimmed ? 0.4 : 1)),
        { name: 'transform', at: at((s) => `${Math.round(pos(s).x * 10) / 10}px,${Math.round(pos(s).y * 10) / 10}px`), format: (v) => `translate(${v})`, eps: 0 },
      ]);
      pulses.push(`<g class="${pulse}"><circle class="ph" r="10"/><circle class="pd" r="2.75"/></g>`);
    }
  }

  // Notes
  for (const n of layout.notes) {
    const cls = k.add(k.cls(), [opacity((s) => s.notes.get(n.id)?.opacity ?? 0), translateY((s) => s.notes.get(n.id)?.rise ?? 0)]);
    const { x, y, w, h } = n.rect;
    parts.push(`<g class="${cls}"><path class="nt" d="M${r2(x)} ${r2(y)}H${r2(x + w - 8)}L${r2(x + w)} ${r2(y + 8)}V${r2(y + h)}H${r2(x)}Z"/><path fill="none" stroke="var(--nr)" d="M${r2(x + w - 8)} ${r2(y)}V${r2(y + 8)}H${r2(x + w)}"/>${textEl(n.lines, x + w / 2, y + 21, 'tn', 'middle', width('note'), '', { runs: n.runs, role: 'note' })}</g>`);
  }

  const body = `<defs>${defs.join('')}</defs>\n${parts.join('\n')}\n${pulses.join('\n')}`;
  return document(layout.width, layout.height, 16, `${baseCss(options.theme, options.adaptive)}\n${k.css()}`, body, options.fontCss, title);
}

// -- topology -----------------------------------------------------------------------------------------------------

export function compileTopologySvg(topology: Topology, geometry: TopologyGeometry, labels: { nodes: Map<string, string[]>; messages: Map<string, string>; nodeRuns?: ReadonlyMap<string, TextRun[][]> }, model: TopologySceneModel, options: AnimatedSvgOptions, title: string, weight: 'count' | 'uniform' = 'count'): string {
  const k = new Compiler(options);
  const scenes: TopologyScene[] = k.samples.map((t) => topologySceneAt(model, t, options.display));
  const at = (f: (s: TopologyScene) => Value) => (i: number) => f(scenes[i]!);
  const opacity = (f: (s: TopologyScene) => number): Prop => ({ name: 'opacity', at: at(f), format: num(3), eps: 0.004 });
  const width = (font: Parameters<AnimatedSvgOptions['measure']>[1]): Width => (line, style) => options.measure(line, font, style);
  const casing = options.theme === 'github';
  const b = geometry.bounds;
  const parts: string[] = [`<g transform="translate(${r2(-b.x)} ${r2(-b.y)})">`];
  const defs: string[] = [];

  for (const c of topology.clusters) {
    const r = geometry.clusters.get(c.id);
    if (!r) continue;
    parts.push(`<rect x="${r2(r.x)}" y="${r2(r.y)}" width="${r2(r.w)}" height="${r2(r.h)}" rx="12" fill="var(--sk)" fill-opacity=".7" stroke="var(--hl)"/>`);
    if (c.label) parts.push(textEl([c.label.toUpperCase()], r.x + 12, r.y + 16, 'tm', 'start', width('micro')));
  }
  const pulses: string[] = [];
  const overlay: string[] = [];
  for (const edge of topology.edges) {
    const route = geometry.edges.get(edge.key);
    if (!route) continue;
    const full = partialPath(route.points, 1);
    const maskId = `m${k.cls()}`;
    const state = (s: TopologyScene) => s.edges.get(edge.key);
    const draw = k.add(k.cls(), [{ name: 'stroke-dashoffset', at: at((s) => Math.round((1 - (state(s)?.draw ?? 1)) * 1000) / 1000), format: num(3), eps: 0.003 }]);
    defs.push(`<mask id="${maskId}" maskUnits="userSpaceOnUse"><path class="mk ${draw}" pathLength="1" d="${full}"/></mask>`);
    const group = k.add(k.cls(), [opacity((s) => state(s)?.opacity ?? 0)]);
    const hl = k.add(k.cls(), [opacity((s) => state(s)?.highlight ?? 0)]);
    const w = weight === 'count' && edge.messages.length ? edgeWidth(edge.messages.length) : 1.25;
    const tip = pointAlong(route.points, 1);
    const headCls = k.add(k.cls(), [opacity((s) => ((state(s)?.draw ?? 1) >= 0.98 ? 1 : 0)), { name: 'fill', at: at((s) => (state(s)?.state === 'current' ? 'var(--ac)' : state(s)?.state === 'future' || state(s)?.state === 'unplayed' ? 'var(--i3)' : 'var(--i2)')), format: String, eps: 0 }]);
    const dotted = edge.kind === 'return' ? ' dt' : '';
    parts.push(
      `<g class="${group}">${casing ? `<path class="cs" stroke-width="${r2(w + 2.5)}" d="${full}" mask="url(#${maskId})"/>` : ''}<path class="ln${dotted}" stroke="var(--i2)" stroke-width="${r2(w)}" stroke-linecap="round" d="${full}" mask="url(#${maskId})"/><path class="hl${dotted} ${hl}" style="stroke-width:${r2(Math.max(2, w))}px" d="${full}" mask="url(#${maskId})"/><g transform="translate(${r2(tip.x)} ${r2(tip.y)}) rotate(${r2((tip.angle * 180) / Math.PI)})"><path class="${headCls}" d="M0 0L-8.5 -3.2L-8.5 3.2Z"/></g></g>`,
    );
    if (edge.messages.length > 1) {
      const text = `×${edge.messages.length}`;
      const bw = 12 + text.length * 7.2;
      overlay.push(`<g class="${group}"><rect x="${r2(route.label.x - bw / 2)}" y="${r2(route.label.y - 8)}" width="${r2(bw)}" height="16" rx="8" fill="var(--sf)" stroke="var(--rl)"/><text x="${r2(route.label.x)}" y="${r2(route.label.y + 4)}" text-anchor="middle" style="fill:var(--i2);font-size:11.5px;font-weight:600">${text}</text></g>`);
    }
    for (const message of edge.messages) {
      const lbl = k.add(k.cls(), [opacity((s) => (state(s)?.current[state(s)!.current.length - 1] === message ? state(s)!.label : 0))]);
      if (scenes.some((s) => state(s)?.current.includes(message))) {
        const y = route.label.y - (edge.messages.length > 1 ? 14 : 8);
        overlay.push(`<text class="t ${lbl}" x="${r2(route.label.x)}" y="${r2(y)}" text-anchor="middle" style="fill:var(--i1);font-weight:560">${esc((labels.messages.get(message) ?? '').replace(/\n/g, ' '))}</text>`);
      }
      if (options.display.indicator === 'none') continue;
      const pulseAt = (s: TopologyScene) => state(s)?.pulses.find((p) => p.message === message);
      if (!scenes.some((s) => pulseAt(s))) continue;
      const pos = (s: TopologyScene) => pointAlong(route.points, pulseAt(s)?.at ?? 0);
      const pulse = k.add(k.cls(), [
        opacity((s) => pulseAt(s)?.opacity ?? 0),
        { name: 'transform', at: at((s) => `${Math.round(pos(s).x * 10) / 10}px,${Math.round(pos(s).y * 10) / 10}px`), format: (v) => `translate(${v})`, eps: 0 },
      ]);
      pulses.push(`<g class="${pulse}"><circle class="ph" r="10"/><circle class="pd" r="2.75"/></g>`);
    }
  }
  for (const n of topology.nodes) {
    const r = geometry.nodes.get(n.id);
    if (!r) continue;
    const state = (s: TopologyScene) => s.nodes.get(n.id);
    const group = k.add(k.cls(), [opacity((s) => state(s)?.opacity ?? 1)]);
    const glow = k.add(k.cls(), [opacity((s) => state(s)?.glow ?? 0)]);
    const ring = k.add(k.cls(), [opacity((s) => (state(s)?.ring ?? 0) * 0.55)]);
    const lines = labels.nodes.get(n.id) ?? [n.label];
    const cy = r.h / 2 + 4.5 - ((lines.length - 1) * 18) / 2;
    parts.push(
      `<g class="${group}" transform="translate(${r2(r.x)} ${r2(r.y)})"><rect class="${ring}" x="-6" y="-6" width="${r2(r.w + 12)}" height="${r2(r.h + 12)}" rx="13" fill="none" stroke="var(--ac)" stroke-dasharray="3 3"/><rect class="${glow}" x="-2.5" y="-2.5" width="${r2(r.w + 5)}" height="${r2(r.h + 5)}" rx="10" fill="none" stroke="var(--ac)" stroke-width="1.5"/><rect class="bx" width="${r2(r.w)}" height="${r2(r.h)}" rx="8"/>${textEl(lines, r.w / 2, cy, 'tp', 'middle', width('participant'), '', { runs: labels.nodeRuns?.get(n.id), role: 'participant' })}</g>`,
    );
  }
  parts.push(...overlay, ...pulses, '</g>');
  const body = `<defs>${defs.join('')}</defs>\n${parts.join('\n')}`;
  // Masks use the referencing element's user space, i.e. the translated group's coordinates.
  return document(b.w, b.h, 0, `${baseCss(options.theme, options.adaptive)}\n${k.css()}`, body, options.fontCss, title);
}

/** Warn above this size (spec animated-svg-export). */
export const ANIMATED_SVG_WARN_BYTES = 1024 * 1024;
