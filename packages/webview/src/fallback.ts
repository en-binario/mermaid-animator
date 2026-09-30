/**
 * Generic engine (spec §10.12): Mermaid renders the diagram; its groups are revealed in order,
 * one per step, with the same transport, camera and export as native diagrams.
 */
import type { Point, Rect } from '@mermaid-animator/core';
import { buildTimeline, positionAt, type Step, type Timeline, type TimelineOptions } from '@mermaid-animator/core';
import type { WebviewSettings } from '@mermaid-animator/protocol';
import { PALETTES, SVG_NS, type PaletteName } from '@mermaid-animator/renderer';
import { GENERIC_TRANSITION_MS, groupReveal } from './fallbackReveal';
import { markFormatting, stripMarkers, styleMarkers } from './fallbackMarkup';
import { monochromeColours } from './fallbackMonochrome';
import { orderGroups, stepBoundsOf, type GroupInfo } from './fallbackOrder';

import type mermaidDefault from 'mermaid';

type MermaidApi = typeof mermaidDefault;

let mermaidPromise: Promise<MermaidApi> | undefined;

/** Text of every <style> element in an SVG string. */
function extractCss(svgText: string): string {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  return [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
}

let renderCount = 0;

/** Mermaid's configuration is global, so every initialize + render pair runs in turn. */
let queue: Promise<unknown> = Promise.resolve();
function serially<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then((m) => m.default);
  return mermaidPromise;
}

/** The palette the panel shows (its `data-palette`). */
function activePalette(): PaletteName {
  return (document.documentElement.dataset.palette ?? 'ivory') as PaletteName;
}

/**
 * Mermaid `base` theme variables derived from an Ink & Ivory palette. Monochrome (spec visual-theme)
 * adds its own rules: white pie slices, ER rows and tertiary fills (Mermaid would otherwise derive
 * tints from them), and black branches, pie strokes and pie text. Colours the source sets itself
 * are neutralised after rendering (`monochromeColours`).
 */
export function themeVariables(palette: PaletteName): Record<string, string> {
  const c = PALETTES[palette];
  const vars: Record<string, string> = {
    fontFamily: '"Inter Variable", system-ui, sans-serif',
    fontSize: '13px',
    background: c.canvas,
    primaryColor: c.surface,
    primaryBorderColor: c.rule,
    primaryTextColor: c['ink-1'],
    secondaryColor: c['surface-sunken'],
    secondaryBorderColor: c.rule,
    secondaryTextColor: c['ink-1'],
    tertiaryColor: c['accent-muted'],
    tertiaryBorderColor: c.rule,
    tertiaryTextColor: c['ink-1'],
    lineColor: c['ink-2'],
    textColor: c['ink-1'],
    mainBkg: c.surface,
    nodeBorder: c.rule,
    clusterBkg: c['surface-sunken'],
    clusterBorder: c.hairline,
    edgeLabelBackground: c.canvas,
    noteBkgColor: c['note-fill'],
    noteBorderColor: c['note-rule'],
    noteTextColor: c['ink-1'],
    actorBkg: c.surface,
    actorBorder: c.rule,
    actorTextColor: c['ink-1'],
    signalColor: c['ink-2'],
    signalTextColor: c['ink-1'],
    labelBoxBkgColor: c['surface-sunken'],
    labelBoxBorderColor: c.hairline,
    labelTextColor: c['ink-1'],
    loopTextColor: c['ink-2'],
    activationBkgColor: c['accent-muted'],
    activationBorderColor: c.accent,
    git0: c.accent,
    git1: c.brass,
    git2: c.sage,
    git3: c.viridian,
    pie1: c.accent,
    pie2: c.brass,
    pie3: c.sage,
    pie4: c['ink-3'],
    pieSectionTextColor: c.surface,
    pieTitleTextColor: c['ink-1'],
    pieLegendTextColor: c['ink-1'],
    pieStrokeColor: c.canvas,
    pieStrokeWidth: '1.5px',
    pieOuterStrokeColor: c.rule,
    pieOuterStrokeWidth: '1px',
  };
  if (palette !== 'monochrome') return vars;
  const ink = c['ink-1'];
  const pie = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`pie${i + 1}`, c.surface]));
  const git = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`git${i}`, ink]));
  return {
    ...vars,
    ...pie,
    ...git,
    tertiaryColor: c.surface,
    edgeLabelBackground: c.surface,
    pieSectionTextColor: ink,
    pieStrokeColor: ink,
    pieOuterStrokeColor: ink,
    rowOdd: c.surface,
    rowEven: c.surface,
    attributeBackgroundColorOdd: c.surface,
    attributeBackgroundColorEven: c.surface,
  };
}

/** Selectors for animatable groups, most specific first (nodes, then edges). */
const NODE_SELECTORS = ['g.node', 'g.cluster', 'g.actor', 'g.stateGroup', 'g.classGroup', 'g.er.entityBox', 'g.commit-bullets > *', 'g.task', 'rect.task', 'g.pieCircle', 'path.pieCircle', 'g.section', 'g.mindmap-node', 'g.timeline-node', 'g.label-container'];
const EDGE_SELECTORS = ['path.flowchart-link', 'g.edgePath', 'path.transition', 'path.relation', 'path.relationshipLine', 'path.messageLine0', 'path.messageLine1', 'line.messageLine0', 'line.messageLine1', 'path.commit-arrow', 'g.edge'];

interface Group {
  element: SVGGraphicsElement;
  info: GroupInfo;
  paths: { el: SVGGeometryElement; length: number; dashed: boolean }[];
  label: string;
  /** Elements revealed together with this group (edge labels). */
  extra: SVGGraphicsElement[];
  /** The group's box with its edge labels: what the camera frames for this step. */
  bounds: Rect;
}

/**
 * Mermaid measured bold words at regular weight: where a node's label now overflows its shape,
 * tighten the bold words' letter spacing just enough to fit (at most 0.6 px per character).
 */
function fitBoldLabels(svg: SVGSVGElement): void {
  for (const node of svg.querySelectorAll<SVGGElement>('g.node')) {
    const label = node.querySelector<SVGGraphicsElement>('text');
    const shape = node.querySelector<SVGGraphicsElement>('rect, polygon, path, circle, ellipse');
    const bold = [...node.querySelectorAll<SVGTSpanElement>('tspan[font-weight]')];
    if (!label || !shape || !bold.length) continue;
    try {
      const over = label.getBBox().width - (shape.getBBox().width - 8);
      if (over <= 0) continue;
      const chars = bold.reduce((n, t) => n + (t.textContent ?? '').length, 0);
      const spacing = Math.max(-0.6, -over / Math.max(1, chars));
      for (const t of bold) t.setAttribute('letter-spacing', spacing.toFixed(2));
    } catch {
      // getBBox is unavailable while detached; the label keeps Mermaid's size.
    }
  }
}

export class GenericDiagram {
  private readonly holder: SVGGElement;
  private groups: Group[] = [];
  private sheet: CSSStyleSheet | undefined;
  timeline: Timeline = { starts: [], transitions: [], settles: [], dwells: [], holds: [], duration: 0 };
  bounds: Rect = { x: 0, y: 0, w: 100, h: 100 };
  /** The palette this drawing was rendered in. */
  palette: PaletteName = 'ivory';
  /** The last render's inputs, for export twins. */
  private last: { source: string; settings: WebviewSettings; timing: TimelineOptions } | undefined;
  /** The off-screen <svg> an export twin owns. */
  private root: SVGSVGElement | undefined;

  constructor(parent: SVGGElement) {
    this.holder = document.createElementNS(SVG_NS, 'g');
    this.holder.setAttribute('class', 'ma-generic');
    parent.appendChild(this.holder);
  }

  static async canRender(source: string): Promise<boolean> {
    try {
      const mermaid = await loadMermaid();
      await serially(async () => {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
        await mermaid.parse(source);
      });
      return true;
    } catch {
      return false;
    }
  }

  get stepCount(): number {
    return this.groups.length;
  }

  get labels(): string[] {
    return this.groups.map((g) => g.label);
  }

  async render(source: string, settings: WebviewSettings, timing: TimelineOptions = {}, palette: PaletteName = activePalette()): Promise<{ ok: true } | { ok: false; error: string }> {
    this.last = { source, settings, timing };
    this.palette = palette;
    let svgText: string;
    try {
      // `initialize` is global: renders (panel and export twins) run one at a time.
      svgText = await serially(() => this.mermaidSvg(source, palette));
    } catch (error) {
      return { ok: false, error: String((error as Error)?.message ?? error).split('\n').slice(0, 3).join(' ') };
    }
    return this.mount(svgText, timing);
  }

  /**
   * An off-screen copy of this drawing rendered in `palette`, for exports in another theme (spec
   * export-theme). It has its own render id and stylesheet; destroy it when the export ends.
   */
  async renderTwin(palette: PaletteName): Promise<GenericDiagram> {
    if (!this.last) throw new Error('Nothing is rendered.');
    const root = document.createElementNS(SVG_NS, 'svg');
    root.setAttribute('aria-hidden', 'true');
    // Off-screen but laid out: group discovery needs real geometry.
    Object.assign(root.style, { position: 'fixed', left: '-100000px', top: '0', overflow: 'visible' });
    root.setAttribute('width', String(Math.ceil(this.bounds.w)));
    root.setAttribute('height', String(Math.ceil(this.bounds.h)));
    const g = document.createElementNS(SVG_NS, 'g');
    root.appendChild(g);
    document.body.appendChild(root);
    const twin = new GenericDiagram(g);
    twin.root = root;
    const result = await twin.render(this.last.source, this.last.settings, this.last.timing, palette);
    if (!result.ok) {
      twin.destroy();
      throw new Error(result.error);
    }
    if (twin.stepCount !== this.stepCount) {
      twin.destroy();
      throw new Error(`The ${palette} rendering has ${twin.stepCount} steps instead of ${this.stepCount}.`);
    }
    return twin;
  }

  private async mermaidSvg(source: string, palette: PaletteName): Promise<string> {
    let svgText: string;
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: themeVariables(palette),
      fontFamily: '"Inter Variable", system-ui, sans-serif',
      // SVG text labels are measured without depending on CSS (HTML labels are not).
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
    // Mermaid's own <style> element is blocked by our CSP while it measures the diagram. Render once
    // to obtain the CSS, adopt it as a constructed stylesheet, then render again with the same id so
    // the measuring pass sees the real styles.
    const id = `ma-generic-${++renderCount}`;
    const renderTwice = async (text: string) => {
      const first = (await mermaid.render(id, text)).svg;
      this.adoptStyles(extractCss(first));
      return (await mermaid.render(id, text)).svg;
    };
    // Inline formatting (spec label-formatting): render with word markers in place of the tags,
    // or, if Mermaid rejects them, the original source (the tags then show as text).
    const marked = markFormatting(source);
    if (marked === source) svgText = await renderTwice(source);
    else {
      try {
        svgText = await renderTwice(marked);
      } catch (error) {
        console.debug('Mermaid Animator: formatting markers rejected, rendering the original source', error);
        svgText = await renderTwice(source);
      }
    }
    return svgText;
  }

  private mount(svgText: string, timing: TimelineOptions): { ok: true } {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement as unknown as SVGSVGElement;
    // Mermaid's <style> elements would be blocked by the CSP: apply them as a constructed stylesheet.
    const css = [...svg.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    svg.querySelectorAll('style, script, foreignObject script').forEach((s) => s.remove());
    this.adoptStyles(css);
    const imported = document.importNode(svg, true) as SVGSVGElement;
    const vb = imported.viewBox?.baseVal;
    const width = vb && vb.width ? vb.width : Number.parseFloat(imported.getAttribute('width') ?? '400') || 400;
    const height = vb && vb.height ? vb.height : Number.parseFloat(imported.getAttribute('height') ?? '300') || 300;
    imported.removeAttribute('style');
    imported.setAttribute('width', String(width));
    imported.setAttribute('height', String(height));
    imported.setAttribute('x', '0');
    imported.setAttribute('y', '0');
    this.holder.replaceChildren(imported);
    if (styleMarkers(imported)) fitBoldLabels(imported);
    // Author colours become black ink on white (spec visual-theme); needs the adopted styles.
    if (this.palette === 'monochrome') monochromeColours(imported);
    this.bounds = { x: 0, y: 0, w: width, h: height };
    const offset = { x: vb?.x ?? 0, y: vb?.y ?? 0 };
    this.discover(imported, offset);
    this.timeline = buildTimeline(
      this.groups.map((_, i) => ({ timing: { transitionMs: GENERIC_TRANSITION_MS, dwellMs: 650, hold: false }, index: i }) as unknown as Step),
      timing,
    );
    return { ok: true };
  }

  private adoptStyles(css: string): void {
    const sheets = document.adoptedStyleSheets.filter((s) => s !== this.sheet);
    if (!css) {
      document.adoptedStyleSheets = sheets;
      return;
    }
    this.sheet ??= new CSSStyleSheet();
    this.sheet.replaceSync(css);
    document.adoptedStyleSheets = [...sheets, this.sheet];
  }

  private discover(svg: SVGSVGElement, offset: Point): void {
    const seen = new Set<Element>();
    const candidates: { el: SVGGraphicsElement; kind: 'node' | 'edge' }[] = [];
    const collect = (selectors: string[], kind: 'node' | 'edge') => {
      for (const selector of selectors) {
        for (const el of svg.querySelectorAll<SVGGraphicsElement>(selector)) {
          if (seen.has(el) || [...seen].some((s) => s.contains(el) || el.contains(s))) continue;
          seen.add(el);
          candidates.push({ el, kind });
        }
      }
    };
    collect(NODE_SELECTORS, 'node');
    collect(EDGE_SELECTORS, 'edge');
    if (candidates.length === 0) {
      const root = svg.querySelector(':scope > g') ?? svg;
      for (const el of root.children) if (el instanceof SVGGraphicsElement) candidates.push({ el, kind: 'node' });
    }
    // Edge labels travel with the nearest edge.
    const edgeLabels = [...svg.querySelectorAll<SVGGraphicsElement>('g.edgeLabel, g.edgeLabels > g')].filter((el) => !seen.has(el));

    // An element's getCTM() is relative to the nearest viewport (this nested <svg>), but the <svg>'s
    // own getCTM() includes the camera: compare screen CTMs so bounds never depend on the camera.
    const toUser = (el: SVGGraphicsElement): DOMMatrix | undefined => {
      const m = el.getScreenCTM();
      const root = svg.getScreenCTM();
      return m && root ? root.inverse().multiply(m) : undefined;
    };
    const toRect = (el: SVGGraphicsElement): Rect => {
      try {
        const b = el.getBBox();
        const inv = toUser(el);
        if (inv) {
          return { x: b.x * inv.a + inv.e - offset.x, y: b.y * inv.d + inv.f - offset.y, w: b.width * inv.a, h: b.height * inv.d };
        }
        return { x: b.x - offset.x, y: b.y - offset.y, w: b.width, h: b.height };
      } catch {
        return { x: 0, y: 0, w: 0, h: 0 };
      }
    };
    const pathsOf = (el: Element) =>
      [...(el instanceof SVGGeometryElement ? [el] : []), ...el.querySelectorAll<SVGGeometryElement>('path, line, polyline')].map((p) => {
        let length: number;
        try {
          length = p.getTotalLength();
        } catch {
          length = 0;
        }
        const dashed = !!getComputedStyle(p).strokeDasharray && getComputedStyle(p).strokeDasharray !== 'none';
        return { el: p, length, dashed };
      });

    const infos = candidates.map(({ el, kind }, i) => {
      const bbox = toRect(el);
      let endpoints: Point[] | undefined;
      if (kind === 'edge') {
        const path = el instanceof SVGGeometryElement ? el : el.querySelector<SVGGeometryElement>('path');
        try {
          if (path) {
            const len = path.getTotalLength();
            const ctm = toUser(path);
            const map = (p: DOMPoint) => (ctm ? p.matrixTransform(ctm) : p);
            endpoints = [map(path.getPointAtLength(0)), map(path.getPointAtLength(len))].map((p) => ({ x: p.x - offset.x, y: p.y - offset.y }));
          }
        } catch {
          endpoints = undefined;
        }
      }
      return { el, info: { id: String(i), kind, bbox, endpoints } as GroupInfo };
    });
    const byId = new Map(infos.map((x) => [x.info.id, x.el]));
    const ordered = orderGroups(infos.map((x) => x.info));
    this.groups = ordered.map((info) => {
      const element = byId.get(info.id) as SVGGraphicsElement;
      return { element, info, paths: info.kind === 'edge' ? pathsOf(element) : [], label: stripMarkers(element.textContent ?? '').replace(/\s+/g, ' ').trim() || `${info.kind} ${Number(info.id) + 1}`, extra: [], bounds: info.bbox };
    });
    // Attach each edge label to the closest edge so they appear together.
    const labelRects = new Map<Group, Rect[]>();
    for (const label of edgeLabels) {
      const r = toRect(label);
      const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      let best: Group | undefined;
      let bestD = Infinity;
      for (const g of this.groups) {
        if (g.info.kind !== 'edge') continue;
        const b = g.info.bbox;
        const d = Math.hypot(b.x + b.w / 2 - c.x, b.y + b.h / 2 - c.y);
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      if (!best) continue;
      best.extra.push(label);
      labelRects.set(best, [...(labelRects.get(best) ?? []), r]);
    }
    for (const [group, rects] of labelRects) group.bounds = stepBoundsOf(group.info.bbox, rects);
  }

  stepBounds(step: number): Rect | undefined {
    return this.groups[step]?.bounds;
  }

  /** Applies the reveal state for time `t`. */
  renderAt(t: number, reducedMotion: boolean): void {
    const pos = positionAt(this.timeline, t);
    const overview = this.timeline.clear !== undefined;
    this.groups.forEach((g, i) => {
      const { opacity, draw } = groupReveal(i, g.info.kind, pos, reducedMotion, overview);
      for (const el of [g.element, ...g.extra]) {
        el.style.opacity = String(opacity);
        el.style.display = opacity <= 0 ? 'none' : '';
      }
      for (const p of g.paths) {
        if (p.dashed || !p.length) continue;
        p.el.style.strokeDasharray = draw < 1 ? `${p.length}` : '';
        p.el.style.strokeDashoffset = draw < 1 ? `${p.length * (1 - draw)}` : '';
      }
    });
  }

  /**
   * A standalone SVG document of the reveal at `t` with full motion, for animated exports
   * (M3 D3). The live drawing is re-rendered by the controller on its next frame.
   */
  frameSvgText(t: number): string | undefined {
    const inner = this.holder.firstElementChild as SVGSVGElement | null;
    if (!inner) return undefined;
    this.renderAt(t, false);
    const svg = inner.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(Math.ceil(this.bounds.w)));
    svg.setAttribute('height', String(Math.ceil(this.bounds.h)));
    if (this.sheet) {
      const style = document.createElementNS(SVG_NS, 'style');
      style.textContent = [...this.sheet.cssRules].map((r) => r.cssText).join('\n');
      svg.insertBefore(style, svg.firstChild);
    }
    return new XMLSerializer().serializeToString(svg);
  }

  /** Group reveal data for exports that replay the reveal themselves (animated SVG, HTML player). */
  revealGroups(): { element: SVGGraphicsElement; extra: Element[]; kind: string; paths: { el: SVGGeometryElement; length: number; dashed: boolean }[] }[] {
    return this.groups.map((g) => ({ element: g.element, extra: g.extra, kind: g.info.kind, paths: g.paths }));
  }

  /** The inner Mermaid <svg>, for exports that embed the drawing. */
  get drawingElement(): SVGSVGElement | undefined {
    return (this.holder.firstElementChild as SVGSVGElement | null) ?? undefined;
  }

  get stylesheetText(): string {
    return this.sheet ? [...this.sheet.cssRules].map((r) => r.cssText).join('\n') : '';
  }

  exportDrawing(t: number): { svg: SVGSVGElement; width: number; height: number } | undefined {
    const inner = this.holder.firstElementChild as SVGSVGElement | null;
    if (!inner) return undefined;
    this.renderAt(t, true);
    const svg = inner.cloneNode(true) as SVGSVGElement;
    if (this.sheet) {
      const style = document.createElementNS(SVG_NS, 'style');
      style.textContent = [...this.sheet.cssRules].map((r) => r.cssText).join('\n');
      svg.insertBefore(style, svg.firstChild);
    }
    return { svg, width: this.bounds.w, height: this.bounds.h };
  }

  destroy(): void {
    this.holder.remove();
    this.root?.remove();
    if (this.sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== this.sheet);
  }
}
