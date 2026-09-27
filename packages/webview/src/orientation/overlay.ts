/**
 * The participant-orientation overlay of the sequence slot (spec participant-orientation, design D2):
 * the top rail, the off-screen edge markers and the arrow-end tags, as HTML over the canvas. Elements
 * are created once per key and only repositioned each frame (CSSOM, CSP-safe).
 */
import type { TextRun } from '@mermaid-animator/core';
import type { ArrowTag, EdgeMarker, Measure, RailEntry } from './model';

export interface OrientationFrame {
  rail: RailEntry[];
  markers: EdgeMarker[];
  tags: ArrowTag[];
  /** Opacity of the tags (they fade in while the arrow draws). */
  tagOpacity: number;
}

export interface OrientationCallbacks {
  /** A rail name was clicked (focus, like a header click). */
  focus(id: string, additive: boolean): void;
  /** A marker was activated: pan the participant's lifeline into view. */
  reveal(id: string): void;
}

/** Canvas text measurement with a cache (the model fits names with it). */
export function canvasMeasure(): Measure {
  const cache = new Map<string, number>();
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  return (text, font) => {
    const key = `${font}|${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      ctx ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1).getContext('2d') : document.createElement('canvas').getContext('2d');
      if (!ctx) return text.length * 7;
      ctx.font = font;
      width = ctx.measureText(text).width;
      if (cache.size > 2000) cache.clear();
      cache.set(key, width);
    }
    return width;
  };
}

function reuse<T extends HTMLElement>(pool: Map<string, T>, key: string, create: () => T, parent: HTMLElement): T {
  let el = pool.get(key);
  if (!el) {
    el = create();
    pool.set(key, el);
    parent.appendChild(el);
  }
  return el;
}

/** Sets a name's text, as `<b>` / `<i>` runs when it has formatting (spec label-formatting). */
function setRuns(el: HTMLElement, text: string, runs: readonly TextRun[] | undefined): void {
  if (!runs) {
    el.textContent = text;
    return;
  }
  el.replaceChildren(
    ...runs.map((r) => {
      if (!r.bold && !r.italic) return document.createTextNode(r.text);
      const outer = document.createElement(r.bold ? 'b' : 'i');
      if (r.bold && r.italic) outer.appendChild(document.createElement('i')).textContent = r.text;
      else outer.textContent = r.text;
      return outer;
    }),
  );
}

function hideUnused(pool: Map<string, HTMLElement>, used: Set<string>): void {
  for (const [key, el] of pool) if (!used.has(key)) el.hidden = true;
}

export class OrientationOverlay {
  readonly el: HTMLDivElement;
  private readonly rail: HTMLDivElement;
  private readonly markerLayer: HTMLDivElement;
  private readonly tagLayer: HTMLDivElement;
  private readonly names = new Map<string, HTMLSpanElement>();
  private readonly markers = new Map<string, HTMLButtonElement>();
  private readonly tags = new Map<string, HTMLSpanElement>();
  private railShown = false;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: OrientationCallbacks,
    private readonly t: (key: string, ...args: (string | number)[]) => string,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'ma-orient';
    this.rail = document.createElement('div');
    this.rail.className = 'ma-orient__rail';
    // Names duplicate what announcements, the inspector and the transcript already say.
    this.rail.setAttribute('aria-hidden', 'true');
    this.markerLayer = document.createElement('div');
    this.markerLayer.className = 'ma-orient__markers';
    this.tagLayer = document.createElement('div');
    this.tagLayer.className = 'ma-orient__tags';
    this.tagLayer.setAttribute('aria-hidden', 'true');
    this.el.append(this.rail, this.tagLayer, this.markerLayer);
    parent.appendChild(this.el);
  }

  /** Draws a frame, or hides everything (`undefined`). */
  update(frame: OrientationFrame | undefined): void {
    this.el.hidden = !frame;
    if (!frame) {
      this.setRail(false);
      return;
    }
    this.updateRail(frame.rail);
    this.updateMarkers(frame.markers);
    this.updateTags(frame.tags, frame.tagOpacity);
  }

  private setRail(shown: boolean): void {
    if (shown === this.railShown) return;
    this.railShown = shown;
    this.rail.classList.toggle('is-shown', shown);
  }

  private updateRail(entries: RailEntry[]): void {
    const used = new Set<string>();
    for (const e of entries) {
      used.add(e.id);
      const name = reuse(this.names, e.id, () => this.createName(e.id), this.rail);
      name.hidden = false;
      name.classList.toggle('ma-orient__name--tick', e.tick);
      name.dataset.state = e.state;
      if (name.textContent !== e.label) setRuns(name, e.label, e.runs);
      name.title = e.name;
      name.style.transform = `translate(${(e.tick ? e.lifelineX : e.x).toFixed(1)}px, 0) translateX(-50%)`;
    }
    hideUnused(this.names, used);
    // Keep the names laid out while the band fades out.
    this.setRail(entries.length > 0);
  }

  private createName(id: string): HTMLSpanElement {
    const el = document.createElement('span');
    el.className = 'ma-orient__name';
    el.addEventListener('pointerdown', (event) => event.stopPropagation());
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      this.callbacks.focus(id, event.ctrlKey || event.metaKey);
    });
    return el;
  }

  private updateMarkers(markers: EdgeMarker[]): void {
    const used = new Set<string>();
    for (const m of markers) {
      used.add(m.id);
      const button = reuse(this.markers, m.id, () => this.createMarker(m.id), this.markerLayer);
      button.hidden = false;
      button.dataset.side = m.side;
      const label = this.t('orientation.show', m.name);
      if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label);
        button.title = label;
        button.querySelector('.ma-orient__marker-text')!.textContent = m.name;
        button.querySelector('.codicon')!.className = `codicon codicon-chevron-${m.side}`;
      }
      button.style.transform = `translateY(${m.y.toFixed(1)}px) translateY(-50%)`;
    }
    hideUnused(this.markers, used);
  }

  private createMarker(id: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ma-orient__marker';
    const icon = document.createElement('span');
    icon.className = 'codicon';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'ma-orient__marker-text';
    button.append(icon, text);
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    // Buttons activate on click, Enter and Space.
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.callbacks.reveal(id);
    });
    button.addEventListener('keydown', (event) => event.stopPropagation());
    return button;
  }

  private updateTags(tags: ArrowTag[], opacity: number): void {
    const used = new Set<string>();
    this.tagLayer.style.opacity = opacity.toFixed(3);
    for (const tag of tags) {
      used.add(tag.key);
      const el = reuse(this.tags, tag.key, () => {
        const span = document.createElement('span');
        span.className = 'ma-orient__tag';
        return span;
      }, this.tagLayer);
      el.hidden = false;
      if (el.textContent !== tag.text) setRuns(el, tag.text, tag.runs);
      el.style.transform = `translate(${tag.x.toFixed(1)}px, ${tag.y.toFixed(1)}px) translate(${tag.anchor === 'end' ? '-100%' : '0'}, -50%)`;
    }
    hideUnused(this.tags, used);
  }

  destroy(): void {
    this.el.remove();
  }
}
