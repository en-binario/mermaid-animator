/**
 * Camera (spec §8.6): d3-zoom for gestures and limits, plus automatic framing with smooth
 * van Wijk–Nuij interpolation and motion limits. User moves never turn following off; the
 * controller re-frames from the user's zoom at the next step (spec camera).
 */
import { select, type Selection } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { interpolateZoom } from 'd3-interpolate';
import type { Rect } from '@mermaid-animator/core';

export type CameraMode = 'auto' | 'fit' | 'follow' | 'cinematic' | 'manual';

export interface Viewport {
  width: number;
  height: number;
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;

const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

/** Transform that fits `content` in the viewport with `padding`, never enlarging past `maxScale`. */
export function fitView(content: Rect, viewport: Viewport, padding = 24, maxScale = 1.25): View {
  const k = clamp(ZOOM_MIN, Math.min((viewport.width - 2 * padding) / content.w, (viewport.height - 2 * padding) / content.h, maxScale), ZOOM_MAX);
  return { k, x: viewport.width / 2 - (content.x + content.w / 2) * k, y: viewport.height / 2 - (content.y + content.h / 2) * k };
}

/** Whether Auto mode should behave as Fit: the whole diagram fits at 0.75× or more. */
export function autoFits(content: Rect, viewport: Viewport): boolean {
  return fitView(content, viewport, 24, Number.POSITIVE_INFINITY).k >= 0.75;
}

/** Margin kept around a framed step and between the drawing's edge and the view's edge (spec camera). */
export const FRAME_MARGIN = 24;
/** A following camera never zooms out below this to fit a wide step (spec camera: wide-step zoom-out). */
export const WIDE_STEP_FLOOR = 0.75;

/**
 * Keeps an automatic framing on the drawing (spec camera: framing stays on the drawing): on an
 * axis where the drawing is larger than the view less the margins, at most `margin` of canvas shows
 * beyond its edge; on an axis where it is not, the drawing is centred.
 */
export function clampToContent(view: View, content: Rect, viewport: Viewport, margin = FRAME_MARGIN): View {
  const axis = (t: number, start: number, size: number, extent: number) => {
    if (size * view.k + 2 * margin <= extent) return extent / 2 - (start + size / 2) * view.k;
    return clamp(extent - margin - (start + size) * view.k, t, margin - start * view.k);
  };
  return { k: view.k, x: axis(view.x, content.x, content.w, viewport.width), y: axis(view.y, content.y, content.h, viewport.height) };
}

/** Zoom for framing `target` at session zoom `zoom`: zooms out for a wide step, never below 75 % (or `zoom` when lower). */
export function playZoomFor(target: Rect, viewport: Viewport, zoom: number): number {
  const fitting = Math.min((viewport.width - 2 * FRAME_MARGIN) / target.w, (viewport.height - 2 * FRAME_MARGIN) / target.h);
  const k = fitting >= zoom ? zoom : Math.max(fitting, Math.min(zoom, WIDE_STEP_FLOOR));
  return clamp(ZOOM_MIN, k, ZOOM_MAX);
}

/**
 * A following camera's framing of `target` (spec camera: session play zoom, wide-step zoom-out,
 * framing stays on the drawing). At an unchanged zoom it pans by the minimum distance that brings
 * the target inside the central 80 % (centring it on an axis where it is larger than that); when
 * the zoom changes it centres the target. The result is kept on the drawing. Returns undefined when
 * the camera need not move.
 */
export function playView(current: View, target: Rect, content: Rect, viewport: Viewport, zoom: number): View | undefined {
  const k = playZoomFor(target, viewport, zoom);
  const centre = (start: number, size: number, extent: number) => extent / 2 - (start + size / 2) * k;
  let view: View;
  if (Math.abs(k - current.k) > 1e-3) view = { k, x: centre(target.x, target.w, viewport.width), y: centre(target.y, target.h, viewport.height) };
  else {
    const pan = (t: number, start: number, size: number, extent: number) => {
      const safeStart = extent * 0.1;
      const safeEnd = extent * 0.9;
      if (size * k + 2 * FRAME_MARGIN > safeEnd - safeStart) return centre(start, size, extent);
      const s0 = start * k + t - FRAME_MARGIN;
      const s1 = (start + size) * k + t + FRAME_MARGIN;
      if (s0 < safeStart) return t + safeStart - s0;
      if (s1 > safeEnd) return t - (s1 - safeEnd);
      return t;
    };
    view = { k, x: pan(current.x, target.x, target.w, viewport.width), y: pan(current.y, target.y, target.h, viewport.height) };
  }
  const next = clampToContent(view, content, viewport);
  const same = Math.abs(next.x - current.x) < 0.5 && Math.abs(next.y - current.y) < 0.5 && Math.abs(next.k - current.k) < 1e-3;
  return same ? undefined : next;
}

/** A following camera's view before the first step without the overview: the drawing's top at the session zoom. */
export function playStartView(content: Rect, viewport: Viewport, zoom: number): View {
  const k = clamp(ZOOM_MIN, zoom, ZOOM_MAX);
  return clampToContent({ k, x: viewport.width / 2 - (content.x + content.w / 2) * k, y: FRAME_MARGIN - content.y * k }, content, viewport);
}

/** Session zoom levels of one view, as factors (spec camera: session play zoom). */
export interface SessionZoom {
  normal: number;
  presenting: number;
}

export type SessionZoomEvent =
  /** A diagram was loaded into the panel. */
  | { kind: 'load'; playZoom: number; presentationZoom: number }
  /** A zoom setting's resolved value changed. */
  | { kind: 'setting'; mode: keyof SessionZoom; zoom: number }
  /** A user zoom (wheel, pinch, keys, toolbar, preset) left the view at `k`. */
  | { kind: 'userZoom'; presenting: boolean; k: number }
  /** Fit, frame step, pan, automatic move, presentation toggle or live reload. */
  | { kind: 'other' };

export function nextSessionZoom(state: SessionZoom, event: SessionZoomEvent): SessionZoom {
  switch (event.kind) {
    case 'load':
      return { normal: event.playZoom, presenting: event.presentationZoom };
    case 'setting':
      return { ...state, [event.mode]: event.zoom };
    case 'userZoom':
      return { ...state, [event.presenting ? 'presenting' : 'normal']: event.k };
    default:
      return state;
  }
}

/** How a camera frames steps (spec camera: framing zoom matrix). `mode` has `auto` already resolved. */
export type Framing = { kind: 'none' } | { kind: 'fit' } | { kind: 'cinematic' } | { kind: 'play'; zoom: number };

export function framingFor(presenting: boolean, mode: Exclude<CameraMode, 'auto'>, session: SessionZoom): Framing {
  if (mode === 'manual') return { kind: 'none' };
  if (presenting) return { kind: 'play', zoom: session.presenting };
  if (mode === 'fit') return { kind: 'fit' };
  if (mode === 'cinematic') return { kind: 'cinematic' };
  return { kind: 'play', zoom: session.normal };
}

/** The view zoomed to `k` (clamped to the zoom range) about the screen point `at`. */
export function zoomAbout(view: View, k: number, at: { x: number; y: number }): View {
  const next = clamp(ZOOM_MIN, k, ZOOM_MAX);
  return { k: next, x: at.x - ((at.x - view.x) / view.k) * next, y: at.y - ((at.y - view.y) / view.k) * next };
}

/** Zoom presets offered by the toolbar's percentage menu (spec zoom-controls). */
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4] as const;

/** Limits a zoom change for one automatic move to at most 1.6× in either direction. */
export function limitZoomChange(from: number, to: number): number {
  return clamp(from / 1.6, to, from * 1.6);
}

/**
 * Cinematic mode (spec camera): frames `target` tightly with 48 px padding, centred, changing
 * zoom by at most 1.6× from the current view and never enlarging past `maxScale`.
 */
export function cinematicView(target: Rect, viewport: Viewport, current: View, padding = 48, maxScale = 2.5): View {
  const padded = { x: target.x - padding, y: target.y - padding, w: target.w + 2 * padding, h: target.h + 2 * padding };
  const ideal = fitView(padded, viewport, 0, maxScale);
  const k = clamp(ZOOM_MIN, limitZoomChange(current.k, ideal.k), ZOOM_MAX);
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  return { k, x: viewport.width / 2 - cx * k, y: viewport.height / 2 - cy * k };
}

/**
 * The region `@focus` asks the camera to frame: the named participants' columns over the
 * step's rows. Unknown ids are ignored; returns `stepBounds` when none are known.
 */
export function focusTarget(stepBounds: Rect, participants: readonly { id: string; header: Rect }[], focus: readonly string[] | undefined): Rect {
  const columns = participants.filter((p) => focus?.includes(p.id)).map((p) => p.header);
  if (!columns.length) return stepBounds;
  const x1 = Math.min(...columns.map((c) => c.x));
  const x2 = Math.max(...columns.map((c) => c.x + c.w));
  return { x: x1, y: stepBounds.y, w: x2 - x1, h: stepBounds.h };
}

/** Whether a user move from `from` to `to` changed the zoom (spec camera: a user zoom sets the session zoom). */
export function isZoomChange(from: View, to: View): boolean {
  return Math.abs(from.k - to.k) > 1e-6;
}

export interface CameraCallbacks {
  /** A user camera move; `zoomed` when it changed the zoom rather than only panning. */
  onUserMove(zoomed: boolean): void;
  onChange(view: View): void;
  /** Returns true for pointer gestures the camera must ignore (e.g. dragging a node). */
  blockGesture?(event: Event): boolean;
}

export class Camera {
  private readonly behavior: ZoomBehavior<SVGSVGElement, unknown>;
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private tween: { from: View; to: View; start: number; duration: number } | undefined;
  private programmatic = false;
  view: View = { x: 0, y: 0, k: 1 };

  constructor(
    svgElement: SVGSVGElement,
    private readonly viewportGroup: SVGGElement,
    private readonly callbacks: CameraCallbacks,
  ) {
    this.svg = select(svgElement);
    this.behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .filter((event: Event) => {
        if (event.type === 'wheel' || event.type === 'dblclick') return false;
        if (this.callbacks.blockGesture?.(event)) return false;
        return !(event as MouseEvent).button;
      })
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => this.applied(event.transform, event.sourceEvent));
    this.svg.call(this.behavior).on('dblclick.zoom', null);
    // Plain wheel pans; Ctrl/Cmd + wheel (and trackpad pinch, which sets ctrlKey) zooms.
    this.svg.on('wheel.zoom', null);
    svgElement.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          const factor = 1.12 ** (-Math.sign(event.deltaY) * Math.min(3, Math.abs(event.deltaY) / 60 || 1));
          const [px, py] = [event.offsetX, event.offsetY];
          const k = clamp(ZOOM_MIN, this.view.k * factor, ZOOM_MAX);
          this.userSet({ k, x: px - ((px - this.view.x) / this.view.k) * k, y: py - ((py - this.view.y) / this.view.k) * k });
        } else {
          const dx = event.shiftKey ? event.deltaY : event.deltaX;
          const dy = event.shiftKey ? 0 : event.deltaY;
          this.userSet({ ...this.view, x: this.view.x - dx, y: this.view.y - dy });
        }
      },
      { passive: false },
    );
  }

  private applied(transform: ZoomTransform, sourceEvent: unknown): void {
    const before = this.view;
    this.view = { x: transform.x, y: transform.y, k: transform.k };
    this.viewportGroup.setAttribute('transform', `translate(${transform.x} ${transform.y}) scale(${transform.k})`);
    if (sourceEvent && !this.programmatic) {
      this.tween = undefined;
      this.callbacks.onUserMove(isZoomChange(before, this.view));
    }
    this.callbacks.onChange(this.view);
  }

  private write(view: View): void {
    this.programmatic = true;
    this.svg.call(this.behavior.transform, zoomIdentity.translate(view.x, view.y).scale(view.k));
    this.programmatic = false;
  }

  /** A move initiated by the user through our own handlers (wheel, keyboard). */
  userSet(view: View): void {
    const before = this.view;
    this.tween = undefined;
    this.write(view);
    this.callbacks.onUserMove(isZoomChange(before, this.view));
  }

  /** Programmatic move; animated unless `animate` is false. */
  moveTo(to: View, options: { animate: boolean; speed?: number; viewport: Viewport; now: number }): void {
    const from = this.view;
    if (!options.animate) {
      this.tween = undefined;
      this.write(to);
      return;
    }
    const w = Math.max(1, options.viewport.width);
    const interp = interpolateZoom([(w / 2 - from.x) / from.k, (options.viewport.height / 2 - from.y) / from.k, w / from.k], [(w / 2 - to.x) / to.k, (options.viewport.height / 2 - to.y) / to.k, w / to.k]);
    const duration = clamp(320, 0.6 * interp.duration, 900) / (options.speed ?? 1);
    this.tween = { from, to, start: options.now, duration };
  }

  /** Advances an automatic move; returns true while one is in progress. */
  tick(now: number, viewport: Viewport): boolean {
    if (!this.tween) return false;
    const { from, to, start, duration } = this.tween;
    const p = clamp(0, (now - start) / duration, 1);
    const eased = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
    const w = Math.max(1, viewport.width);
    const interp = interpolateZoom([(w / 2 - from.x) / from.k, (viewport.height / 2 - from.y) / from.k, w / from.k], [(w / 2 - to.x) / to.k, (viewport.height / 2 - to.y) / to.k, w / to.k]);
    const [cx, cy, width] = interp(eased) as [number, number, number];
    const k = w / width;
    this.write({ k, x: w / 2 - cx * k, y: viewport.height / 2 - cy * k });
    if (p >= 1) {
      this.write(to);
      this.tween = undefined;
    }
    return this.tween !== undefined;
  }

  /** Drawing coordinates of a point in the SVG's client space. */
  toDrawing(clientX: number, clientY: number, svg: SVGSVGElement): { x: number; y: number } {
    const r = svg.getBoundingClientRect();
    return { x: (clientX - r.left - this.view.x) / this.view.k, y: (clientY - r.top - this.view.y) / this.view.k };
  }

  zoomBy(factor: number, viewport: Viewport): void {
    this.zoomTo(this.view.k * factor, viewport);
  }

  /** User zoom to `k` about the centre of the view. */
  zoomTo(k: number, viewport: Viewport): void {
    this.userSet(zoomAbout(this.view, k, { x: viewport.width / 2, y: viewport.height / 2 }));
  }
}
