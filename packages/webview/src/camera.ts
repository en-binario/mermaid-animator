/**
 * Camera (spec §8.6): d3-zoom for gestures and limits, plus automatic framing with smooth
 * van Wijk–Nuij interpolation, motion limits and a Manual override with "Resume following".
 */
import { select, type Selection } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { interpolateZoom } from 'd3-interpolate';
import type { Rect } from '@mermaid-animator/core';

export type CameraMode = 'auto' | 'fit' | 'follow' | 'manual';

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

/**
 * Follow mode (§8.6.2): if `target` leaves the central 80% of the viewport, returns the view
 * that brings it back with the minimum pan and 24 px padding (zooming out, by at most 1.6×,
 * only when it is larger than the viewport). Returns undefined when no move is needed.
 */
export function followView(current: View, target: Rect, viewport: Viewport): View | undefined {
  const pad = 24;
  const safe = { x: viewport.width * 0.1, y: viewport.height * 0.1, w: viewport.width * 0.8, h: viewport.height * 0.8 };
  let k = current.k;
  const fitting = Math.min((safe.w - 2 * pad) / target.w, (safe.h - 2 * pad) / target.h);
  if (fitting < k) k = Math.max(fitting, k / 1.6, ZOOM_MIN);
  if (k !== current.k) {
    // Zooming out: centre the target.
    return { k, x: viewport.width / 2 - (target.x + target.w / 2) * k, y: viewport.height / 2 - (target.y + target.h / 2) * k };
  }
  const sx = target.x * k + current.x;
  const sy = target.y * k + current.y;
  const sw = target.w * k;
  const sh = target.h * k;
  const inside = sx >= safe.x && sy >= safe.y && sx + sw <= safe.x + safe.w && sy + sh <= safe.y + safe.h;
  if (inside) return undefined;
  let x = current.x;
  let y = current.y;
  // Minimum pan that brings the target, with padding, back inside the safe area.
  if (sx - pad < safe.x) x += safe.x - (sx - pad);
  else if (sx + sw + pad > safe.x + safe.w) x -= sx + sw + pad - (safe.x + safe.w);
  if (sy - pad < safe.y) y += safe.y - (sy - pad);
  else if (sy + sh + pad > safe.y + safe.h) y -= sy + sh + pad - (safe.y + safe.h);
  return { x, y, k };
}

/** Limits a zoom change for one automatic move to at most 1.6× in either direction. */
export function limitZoomChange(from: number, to: number): number {
  return clamp(from / 1.6, to, from * 1.6);
}

export interface CameraCallbacks {
  onUserMove(): void;
  onChange(view: View): void;
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
    this.view = { x: transform.x, y: transform.y, k: transform.k };
    this.viewportGroup.setAttribute('transform', `translate(${transform.x} ${transform.y}) scale(${transform.k})`);
    if (sourceEvent && !this.programmatic) {
      this.tween = undefined;
      this.callbacks.onUserMove();
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
    this.tween = undefined;
    this.write(view);
    this.callbacks.onUserMove();
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

  zoomBy(factor: number, viewport: Viewport): void {
    const k = clamp(ZOOM_MIN, this.view.k * factor, ZOOM_MAX);
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    this.userSet({ k, x: cx - ((cx - this.view.x) / this.view.k) * k, y: cy - ((cy - this.view.y) / this.view.k) * k });
  }
}
