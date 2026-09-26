/**
 * Minimap (spec minimap, M2b D6): a simplified drawing (no text) of at most 160 × 110 px at the
 * slot's bottom-right, the viewport rectangle in the accent colour and the current step as a brass
 * dot. Dragging the rectangle pans; clicking elsewhere centres. Both count as user camera moves.
 */
import type { Point, Rect } from '@mermaid-animator/core';
import { SVG_NS } from '@mermaid-animator/renderer';
import type { View, Viewport } from './camera';

/** Pointer capture is best-effort: it must never break the gesture itself. */
export function capture(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* the pointer is no longer active */
  }
}

export const MINIMAP_MAX = { w: 160, h: 110 };

export type MinimapMode = 'auto' | 'always' | 'never';

export interface MinimapDrawing {
  bounds: Rect;
  lines: [number, number, number, number][];
  rects: Rect[];
}

export interface MinimapCallbacks {
  /** Centre the camera on a drawing point. */
  centreOn(point: Point): void;
  /** Pan the camera by a drawing-space delta. */
  panBy(dx: number, dy: number): void;
}

/** Scale that fits `bounds` inside the minimap box. */
export function minimapScale(bounds: Rect): number {
  return Math.min(MINIMAP_MAX.w / Math.max(1, bounds.w), MINIMAP_MAX.h / Math.max(1, bounds.h));
}

/** The viewport rectangle in drawing coordinates for a camera view. */
export function visibleRect(view: View, viewport: Viewport): Rect {
  return { x: -view.x / view.k, y: -view.y / view.k, w: viewport.width / view.k, h: viewport.height / view.k };
}

/** Whether the content exceeds the viewport (auto mode). */
export function contentExceeds(bounds: Rect, view: View, viewport: Viewport): boolean {
  const v = visibleRect(view, viewport);
  const e = 1;
  return bounds.x < v.x - e || bounds.y < v.y - e || bounds.x + bounds.w > v.x + v.w + e || bounds.y + bounds.h > v.y + v.h + e;
}

export class Minimap {
  readonly el: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly content: SVGGElement;
  private readonly frame: SVGRectElement;
  private readonly dot: SVGCircleElement;
  private bounds: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private scale = 1;
  private drag: { x: number; y: number } | undefined;

  constructor(parent: HTMLElement, private readonly callbacks: MinimapCallbacks, label: string) {
    this.el = document.createElement('div');
    this.el.className = 'ma-minimap';
    this.el.hidden = true;
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', label);
    this.content = document.createElementNS(SVG_NS, 'g');
    this.content.setAttribute('class', 'ma-minimap-content');
    this.frame = document.createElementNS(SVG_NS, 'rect');
    this.frame.setAttribute('class', 'ma-minimap-viewport');
    this.dot = document.createElementNS(SVG_NS, 'circle');
    this.dot.setAttribute('class', 'ma-minimap-current');
    this.dot.setAttribute('r', '3');
    this.svg.append(this.content, this.frame, this.dot);
    this.el.appendChild(this.svg);
    parent.appendChild(this.el);

    const toDrawing = (event: PointerEvent): Point => {
      const r = this.svg.getBoundingClientRect();
      return { x: this.bounds.x + (event.clientX - r.left) / this.scale, y: this.bounds.y + (event.clientY - r.top) / this.scale };
    };
    this.svg.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();
      capture(this.svg, event.pointerId);
      if (event.target === this.frame) this.drag = toDrawing(event);
      else {
        this.drag = undefined;
        this.callbacks.centreOn(toDrawing(event));
      }
    });
    this.svg.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      const at = toDrawing(event);
      this.callbacks.panBy(at.x - this.drag.x, at.y - this.drag.y);
      this.drag = at;
    });
    const end = () => (this.drag = undefined);
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointercancel', end);
  }

  setDrawing(drawing: MinimapDrawing): void {
    this.bounds = drawing.bounds;
    this.scale = minimapScale(drawing.bounds);
    const w = Math.round(drawing.bounds.w * this.scale);
    const h = Math.round(drawing.bounds.h * this.scale);
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(h));
    this.content.replaceChildren();
    this.content.setAttribute('transform', `scale(${this.scale}) translate(${-drawing.bounds.x} ${-drawing.bounds.y})`);
    for (const r of drawing.rects) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(r.x));
      rect.setAttribute('y', String(r.y));
      rect.setAttribute('width', String(r.w));
      rect.setAttribute('height', String(r.h));
      this.content.appendChild(rect);
    }
    for (const [x1, y1, x2, y2] of drawing.lines) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      this.content.appendChild(line);
    }
  }

  update(view: View, viewport: Viewport, current: Point | undefined, mode: MinimapMode, suppressed: boolean): void {
    const show = !suppressed && mode !== 'never' && (mode === 'always' || contentExceeds(this.bounds, view, viewport));
    if (this.el.hidden === show) this.el.hidden = !show;
    if (!show) return;
    const v = visibleRect(view, viewport);
    const s = this.scale;
    // Clamp the rectangle to the minimap so it stays grabbable when zoomed far out.
    const x = Math.max(0, (v.x - this.bounds.x) * s);
    const y = Math.max(0, (v.y - this.bounds.y) * s);
    const x2 = Math.min(this.bounds.w * s, (v.x + v.w - this.bounds.x) * s);
    const y2 = Math.min(this.bounds.h * s, (v.y + v.h - this.bounds.y) * s);
    this.frame.setAttribute('x', String(Math.round(x * 10) / 10));
    this.frame.setAttribute('y', String(Math.round(y * 10) / 10));
    this.frame.setAttribute('width', String(Math.max(4, Math.round((x2 - x) * 10) / 10)));
    this.frame.setAttribute('height', String(Math.max(4, Math.round((y2 - y) * 10) / 10)));
    if (current) {
      this.dot.setAttribute('cx', String(Math.round((current.x - this.bounds.x) * s * 10) / 10));
      this.dot.setAttribute('cy', String(Math.round((current.y - this.bounds.y) * s * 10) / 10));
      this.dot.removeAttribute('display');
    } else this.dot.setAttribute('display', 'none');
  }
}
