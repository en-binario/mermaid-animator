/**
 * Animated SVG exports (spec animated-svg-export): chooses the palette (GitHub-safe by default,
 * Ivory/Graphite for the light/dark pair), embeds fonts, names files, and compiles generic
 * diagrams by keyframing Mermaid's own groups with the same reveal the panel uses.
 */
import { stepEnd } from '@mermaid-animator/core';
import {
  ANIMATED_SVG_WARN_BYTES, compileSequenceSvg, compileTopologySvg, createCanvasMeasure, DURATION, prepareScene, prepareTopologyScene,
  type AnimatedSvgOptions, type AnimatedSvgTheme,
} from '@mermaid-animator/renderer';
import type { GenericDiagram } from '../fallback';
import { exportRange, type RangeKind } from './frames';
import type { ExportMaterial } from './material';

export interface AnimatedSvgRequest {
  range: RangeKind;
  view: 'sequence' | 'topology';
  speed: number;
  hold: number;
  loop: number;
  /** A light/dark pair (Ivory + Graphite) instead of one GitHub-safe file. */
  pair: boolean;
  /** `export.svgAdaptiveTheme`: add a `prefers-color-scheme: dark` palette to the single file. */
  adaptive: boolean;
}

/** File names: `<stem>.anim.svg`, or `<stem>.light.anim.svg` + `<stem>.dark.anim.svg` for a pair. */
export function animatedSvgNames(stem: string, pair: boolean): string[] {
  return pair ? [`${stem}.light.anim.svg`, `${stem}.dark.anim.svg`] : [`${stem}.anim.svg`];
}

export { ANIMATED_SVG_WARN_BYTES };

/** Embedded font CSS: latin always, latin-ext only when the text needs it. */
async function fontCss(text: string): Promise<string> {
  const { EMBEDDED_FONTS } = await import('../export');
  const needsExt = /[Ā-˿Ḁ-ỿⱠ-Ɀ꜠-ꟿ]/.test(text);
  return EMBEDDED_FONTS.filter((_, i) => i === 0 || needsExt)
    .map((f) => `@font-face{font-family:'Inter Variable';font-style:normal;font-weight:100 900;src:url(${f.url}) format('woff2');unicode-range:${f.unicodeRange}}`)
    .join('\n');
}

export async function compileAnimatedSvg(material: ExportMaterial, request: AnimatedSvgRequest, generic?: GenericDiagram): Promise<{ name: string; text: string }[] | undefined> {
  const range = exportRange(request.range, material.timeline, { rest: material.rest, chapters: material.chapters, ab: material.ab });
  const source = material.source();
  const themes: AnimatedSvgTheme[] = request.pair ? ['ivory', 'graphite'] : ['github'];
  const measure = createCanvasMeasure();
  const texts: string[] = [];
  if (source.kind === 'external') {
    if (!generic) return undefined;
    for (const _ of themes) texts.push(genericAnimatedSvg(generic, material, range, request));
  } else {
    const allText = source.kind === 'sequence' ? JSON.stringify(source.layout.participants.map((p) => p.lines)) + JSON.stringify(source.layout.messages.map((m) => m.label.lines)) : JSON.stringify([...source.labels.nodes.values()]);
    const fonts = await fontCss(allText);
    for (const theme of themes) {
      const options: AnimatedSvgOptions = {
        start: range.start, end: range.end, speed: request.speed, hold: request.hold, loop: request.loop,
        theme, adaptive: !request.pair && request.adaptive, display: material.display, fontCss: fonts, measure,
      };
      texts.push(
        source.kind === 'sequence'
          ? compileSequenceSvg(source.layout, prepareScene(source.layout, source.compiled, source.timeline), options, material.text.title)
          : compileTopologySvg(source.topology, source.geometry, source.labels, prepareTopologyScene(source.topology, source.compiled, source.timeline), options, material.text.title, source.weight),
      );
    }
  }
  return texts.map((text, i) => ({ name: themes[i]!, text }));
}

/** Generic diagrams: Mermaid's drawing with each reveal group keyframed (opacity and path drawing). */
function genericAnimatedSvg(generic: GenericDiagram, material: ExportMaterial, range: { start: number; end: number }, request: AnimatedSvgRequest): string {
  const inner = generic.drawingElement;
  if (!inner) return '';
  const groups = generic.revealGroups();
  // Tag the live groups, clone, then untag (the clone keeps the classes).
  const tagged: [Element, string | null][] = [];
  const tag = (el: Element, cls: string) => {
    tagged.push([el, el.getAttribute('class')]);
    el.setAttribute('class', `${el.getAttribute('class') ?? ''} ${cls}`.trim());
  };
  groups.forEach((g, i) => {
    for (const el of [g.element, ...g.extra]) tag(el, `ma-g${i}`);
    g.paths.forEach((p, j) => {
      if (!p.dashed && p.length) tag(p.el, `ma-p${i}-${j}`);
    });
  });
  const clone = inner.cloneNode(true) as SVGSVGElement;
  for (const [el, cls] of tagged) {
    if (cls === null) el.removeAttribute('class');
    else el.setAttribute('class', cls);
  }
  // Remove the live reveal's inline styles from the clone: the keyframes own opacity and dashes.
  for (const el of clone.querySelectorAll<SVGElement>('[class*="ma-g"], [class*="ma-p"]')) {
    el.style.removeProperty('opacity');
    el.style.removeProperty('display');
    el.style.removeProperty('stroke-dasharray');
    el.style.removeProperty('stroke-dashoffset');
  }
  const timeline = material.timeline;
  const playMs = (range.end - range.start) / request.speed;
  const total = playMs + request.hold * 1000;
  const pct = (t: number) => Math.round((Math.min(Math.max(t - range.start, 0), range.end - range.start) / request.speed / total) * 100000) / 1000;
  const iteration = request.loop <= 0 ? 'infinite' : String(request.loop);
  const css: string[] = [];
  // Initial overview (spec initial-overview): every group shows until step 0 starts, fades out
  // during the clear, then the reveal runs as usual (step 0's reveal starts after the clear).
  const clear = timeline.clear ?? 0;
  const first = timeline.starts[0] ?? 0;
  const overview = clear > 0 && range.start < first + clear;
  const pctRaw = (t: number) => (Math.min(Math.max(t - range.start, 0), range.end - range.start) / request.speed / total) * 100;
  const before = (t: number) => Math.round(Math.max(0, pctRaw(t) - 0.001) * 1000) / 1000;
  groups.forEach((g, i) => {
    const start = (timeline.starts[i] ?? 0) + (i === 0 ? clear : 0);
    const shown = overview || start <= range.start ? 1 : 0;
    const end = stepEnd(timeline, i);
    const final = end <= range.end ? 1 : 0;
    if (start >= range.start && start < range.end) {
      const a = pct(start);
      const b = pct(start + (g.kind === 'edge' ? 105 : DURATION.base));
      const fade = overview ? `0%{opacity:1}${pct(first)}%{opacity:1}${pct(first + clear)}%{opacity:0}` : '0%{opacity:0}';
      css.push(`.ma-g${i}{opacity:${final};animation:ka${i} ${Math.round(total)}ms linear ${iteration} both}@keyframes ka${i}{${fade}${a}%{opacity:0}${b}%{opacity:1}100%{opacity:1}}`);
      g.paths.forEach((p, j) => {
        if (p.dashed || !p.length) return;
        const c = pct(start + 420);
        const L = Math.round(p.length * 10) / 10;
        // Drawn during the overview, then reset (while invisible) just before the group's reveal.
        const undrawn = overview ? `0%{stroke-dashoffset:0}${before(start)}%{stroke-dashoffset:0}` : `0%{stroke-dashoffset:${L}}`;
        css.push(`.ma-p${i}-${j}{stroke-dasharray:${L};stroke-dashoffset:0;animation:kp${i}-${j} ${Math.round(total)}ms linear ${iteration} both}@keyframes kp${i}-${j}{${undrawn}${a}%{stroke-dashoffset:${L}}${c}%{stroke-dashoffset:0}100%{stroke-dashoffset:0}}`);
      });
    } else if (overview && start >= range.end) {
      // Not revealed within the range: shown in the overview, then cleared.
      css.push(`.ma-g${i}{opacity:0;animation:ka${i} ${Math.round(total)}ms linear ${iteration} both}@keyframes ka${i}{0%{opacity:1}${pct(first)}%{opacity:1}${pct(first + clear)}%{opacity:0}100%{opacity:0}}`);
    } else css.push(`.ma-g${i}{opacity:${shown}}`);
  });
  css.push('@media (prefers-reduced-motion: reduce){*{animation:none!important}}');
  const b = generic.bounds;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(Math.ceil(b.w)));
  clone.setAttribute('height', String(Math.ceil(b.h)));
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `${generic.stylesheetText}\n${css.join('\n')}`;
  clone.insertBefore(style, clone.firstChild);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}
