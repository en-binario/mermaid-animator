/**
 * The topology view slot (spec topology-view): its own <svg>, camera, renderer and minimap,
 * driven by the controller's player. Layouts are computed asynchronously (ELK in a worker) and
 * applied with a short glide so live edits keep nodes in place (spec: layout stability).
 */
import { signal } from '@preact/signals';
import {
  buildTopology, interpolateGeometry, topologyGeometry, topologyNodeSize, unionBox,
  type CompiledSequence, type EdgeStyle, type LabelMark, type Measure, type TextRun, type Point, type Rect, type ReturnMessages, type SequenceModel, type Timeline, type Topology, type TopologyGeometry,
} from '@mermaid-animator/core';
import { EASE, prepareTopologyScene, SVG_NS, topologySceneAt, TopologySvgRenderer, type DisplayOptions, type TopologyScene, type TopologySceneInputs, type TopologySceneModel } from '@mermaid-animator/renderer';
import { Camera, type Viewport } from '../camera';
import { capture, Minimap, type MinimapDrawing } from '../minimap';
import type { Direction, LayoutKind, LayoutResult, Size } from './layouts';

export interface TopologySettings {
  layout: LayoutKind;
  direction: Direction;
  edgeStyle: EdgeStyle;
  returnMessages: ReturnMessages;
  edgeWeight: 'count' | 'uniform';
}

export interface TopologyViewCallbacks {
  measure: Measure;
  onUserMove(): void;
  requestFrame(): void;
  /** Manual positions changed (debounced): persist them. */
  onSave(positions: Record<string, Point>): void;
  reducedMotion(): boolean;
  minimapLabel: string;
}

const GLIDE_MS = 400;

export class TopologyView {
  readonly el: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly viewport: SVGGElement;
  readonly camera: Camera;
  readonly renderer: TopologySvgRenderer;
  readonly minimap: Minimap;
  /** A layout is being computed. */
  readonly pending = signal(false);
  size: Viewport = { width: 800, height: 600 };
  topology: Topology | undefined;
  model: TopologySceneModel | undefined;
  /** The settled geometry of the latest layout. */
  geometry: TopologyGeometry | undefined;
  /** Node label lines and message labels of the mounted topology (exports reuse them). */
  labels: { nodes: Map<string, string[]>; messages: Map<string, string>; nodeRuns?: Map<string, TextRun[][]>; messageMarks?: Map<string, LabelMark[]> } = { nodes: new Map(), messages: new Map() };
  private glide: { from: TopologyGeometry; start: number } | undefined;
  private settings: TopologySettings = { layout: 'layered', direction: 'LR', edgeStyle: 'curved', returnMessages: 'merge', edgeWeight: 'count' };
  private stored = new Map<string, Point>();
  private layered: Map<string, Rect> | undefined;
  private sizes = new Map<string, Size>();
  private generation = 0;
  private waiters: (() => void)[] = [];
  private drag: { id: string; offset: Point; moved: boolean } | undefined;
  private suppressClick = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private lastScene: TopologyScene | undefined;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: TopologyViewCallbacks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'ma-slot ma-slot--topology';
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'ma-svg');
    this.svg.setAttribute('role', 'img');
    this.viewport = document.createElementNS(SVG_NS, 'g');
    this.viewport.setAttribute('class', 'ma-viewport');
    this.svg.appendChild(this.viewport);
    this.el.appendChild(this.svg);
    parent.appendChild(this.el);
    this.renderer = new TopologySvgRenderer(this.viewport);
    this.camera = new Camera(this.svg, this.viewport, {
      onUserMove: () => callbacks.onUserMove(),
      onChange: () => callbacks.requestFrame(),
      blockGesture: (event) => this.settings.layout === 'manual' && !!this.nodeAt(event.target),
    });
    this.minimap = new Minimap(
      this.el,
      {
        centreOn: (p) => this.camera.userSet({ ...this.camera.view, x: this.size.width / 2 - p.x * this.camera.view.k, y: this.size.height / 2 - p.y * this.camera.view.k }),
        panBy: (dx, dy) => this.camera.userSet({ ...this.camera.view, x: this.camera.view.x - dx * this.camera.view.k, y: this.camera.view.y - dy * this.camera.view.k }),
      },
      callbacks.minimapLabel,
    );
    new ResizeObserver(() => {
      const r = this.el.getBoundingClientRect();
      if (r.width && r.height) this.size = { width: r.width, height: r.height };
    }).observe(this.el);
    this.installDrag();
  }

  private nodeAt(target: EventTarget | null): string | undefined {
    let node = target instanceof Element ? target : null;
    while (node && node !== this.svg) {
      if (node.getAttribute('data-kind') === 'participant') return node.getAttribute('data-id') ?? undefined;
      node = node.parentElement;
    }
    return undefined;
  }

  // -- layout -----------------------------------------------------------------------------------------------------

  /** Stored manual positions (from `document/load`). */
  setStored(positions: Record<string, Point> | undefined): void {
    this.stored = new Map(Object.entries(positions ?? {}));
  }

  /** Node centres of the current layout (what *Save Topology Layout* writes). */
  positions(): Record<string, Point> | undefined {
    if (!this.geometry) return undefined;
    return Object.fromEntries([...this.geometry.nodes].map(([id, r]) => [id, { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }]));
  }

  get hasLayout(): boolean {
    return !!this.geometry;
  }

  /** Resolves once a layout for the current topology exists. */
  ready(): Promise<void> {
    return this.geometry && !this.pending.value ? Promise.resolve() : new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Rebuilds the topology for a compiled sequence and lays it out (asynchronously for ELK). */
  async update(model: SequenceModel, compiled: CompiledSequence, timeline: Timeline, settings: TopologySettings): Promise<void> {
    const generation = ++this.generation;
    const relayout = !this.topology || JSON.stringify(settings) !== JSON.stringify(this.settings);
    this.settings = settings;
    const topology = buildTopology(model, compiled, { returnMessages: settings.returnMessages });
    const sizes = new Map(topology.nodes.map((n) => [n.id, topologyNodeSize(n, this.callbacks.measure)] as const));
    this.pending.value = true;
    let result: LayoutResult;
    const started = performance.now();
    try {
      result = await this.layout(topology, sizes, relayout);
      // Layout latency (NFR-PERF-08), readable with performance.getEntriesByName('ma:topology-layout').
      performance.measure('ma:topology-layout', { start: started, detail: { layout: settings.layout, nodes: topology.nodes.length } });
    } catch (error) {
      // A failed worker falls back to the synchronous force layout rather than an empty view.
      console.error(error);
      const { forceLayout } = await import('./layouts');
      result = forceLayout(topology, sizes);
    }
    if (generation !== this.generation) return;
    const labels = {
      nodes: new Map([...sizes].map(([id, s]) => [id, (s as Size & { lines?: string[] }).lines ?? [id]])),
      nodeRuns: new Map([...sizes].flatMap(([id, s]) => ((s as Size & { runs?: TextRun[][] }).runs ? [[id, (s as Size & { runs: TextRun[][] }).runs] as const] : []))),
      messages: new Map<string, string>(),
      messageMarks: new Map<string, LabelMark[]>(),
    };
    const visit = (nodes: SequenceModel['body']) => {
      for (const n of nodes) {
        if (n.type === 'message') {
          labels.messages.set(n.message.id, n.message.label);
          if (n.message.labelMarks) labels.messageMarks.set(n.message.id, n.message.labelMarks);
        }
        else if (n.type === 'fragment') n.fragment.branches.forEach((b) => visit(b.children));
      }
    };
    visit(model.body);
    const previous = this.currentGeometry(performance.now());
    // Keep surviving nodes where they were unless the strategy re-ordered them (manual keeps its own).
    let nodes = result.nodes;
    let routes = result.routes;
    if (previous && !relayout && settings.layout !== 'manual') {
      const { stabilise } = await import('./layouts');
      const stable = stabilise(previous.nodes, result.nodes);
      nodes = stable.nodes;
      if (stable.kept) routes = undefined; // ELK's routes belong to its own positions
    }
    if (generation !== this.generation) return;
    const geometry = topologyGeometry(topology, nodes, settings.edgeStyle, routes);
    this.topology = topology;
    this.sizes = sizes;
    this.model = prepareTopologyScene(topology, compiled, timeline);
    this.renderer.mount(topology, geometry, labels);
    this.labels = labels;
    this.glide = previous && !this.callbacks.reducedMotion() ? { from: previous, start: performance.now() } : undefined;
    this.geometry = geometry;
    this.minimap.setDrawing(this.minimapDrawing(geometry));
    this.pending.value = false;
    for (const resolve of this.waiters.splice(0)) resolve();
    this.callbacks.requestFrame();
  }

  private async layout(topology: Topology, sizes: Map<string, Size>, relayout: boolean): Promise<LayoutResult> {
    const layouts = await import('./layouts');
    const orthogonal = this.settings.edgeStyle === 'orthogonal';
    const hints = !relayout && this.geometry ? this.geometry.nodes : undefined;
    const layered = async () => {
      const { elk } = await import('./elk');
      const r = await layouts.layeredLayout(await elk(), topology, sizes, { direction: this.settings.direction, orthogonal, hints });
      this.layered = r.nodes;
      return r;
    };
    if (this.settings.layout === 'force') return layouts.forceLayout(topology, sizes);
    if (this.settings.layout === 'manual') {
      const allStored = topology.nodes.every((n) => this.stored.has(n.id));
      const fallback = allStored ? new Map<string, Rect>() : (this.layered && topology.nodes.every((n) => this.layered!.has(n.id)) ? this.layered : (await layered()).nodes);
      return layouts.manualLayout(topology, sizes, this.stored, fallback);
    }
    return layered();
  }

  /** Clears manual positions (Reset Topology Layout) and lays out again. */
  resetManual(): void {
    this.stored.clear();
  }

  /** The geometry to draw now, including the live-reload glide. */
  currentGeometry(now: number): TopologyGeometry | undefined {
    if (!this.geometry) return undefined;
    if (!this.glide) return this.geometry;
    const p = Math.min(1, (now - this.glide.start) / GLIDE_MS);
    if (p >= 1) {
      this.glide = undefined;
      return this.geometry;
    }
    return interpolateGeometry(this.glide.from, this.geometry, EASE.standard(p));
  }

  get edgeWeight(): 'count' | 'uniform' {
    return this.settings.edgeWeight;
  }

  get gliding(): boolean {
    return !!this.glide;
  }

  // -- drawing ------------------------------------------------------------------------------------------------------

  scene(t: number, display: DisplayOptions, inputs: TopologySceneInputs): TopologyScene | undefined {
    if (!this.model) return undefined;
    this.lastScene = topologySceneAt(this.model, t, display, inputs);
    return this.lastScene;
  }

  render(t: number, display: DisplayOptions, inputs: TopologySceneInputs, now: number): void {
    const geometry = this.currentGeometry(now);
    const scene = this.scene(t, display, inputs);
    if (!geometry || !scene) return;
    this.renderer.render(scene, geometry, { comet: display.indicator === 'comet', weight: this.settings.edgeWeight });
  }

  content(): Rect {
    return this.geometry?.bounds ?? { x: 0, y: 0, w: 100, h: 100 };
  }

  /** Bounds of a step: its edges and their nodes. */
  stepBounds(step: number, compiled: CompiledSequence | undefined): Rect | undefined {
    const g = this.geometry;
    const topology = this.topology;
    const s = compiled?.steps[step];
    if (!g || !topology || !s) return undefined;
    const rects: Rect[] = [];
    for (const m of s.messages) {
      const key = topology.messageEdge.get(m);
      const edge = key ? topology.edges.find((e) => e.key === key) : undefined;
      if (!edge) continue;
      for (const id of [edge.from, edge.to]) if (g.nodes.get(id)) rects.push(g.nodes.get(id)!);
      const route = g.edges.get(edge.key);
      if (route) rects.push(unionBox(route.points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))!);
    }
    for (const id of [s.from, s.to]) if (id && g.nodes.get(id)) rects.push(g.nodes.get(id)!);
    return unionBox(rects);
  }

  /** Node boxes of the given participants, for `@focus` framing. */
  focusBounds(ids: readonly string[] | undefined): Rect | undefined {
    if (!ids?.length || !this.geometry) return undefined;
    return unionBox(ids.flatMap((id) => (this.geometry!.nodes.get(id) ? [this.geometry!.nodes.get(id)!] : [])));
  }

  /** The current step's marker for the minimap. */
  marker(step: number, compiled: CompiledSequence | undefined): Point | undefined {
    const b = this.stepBounds(step, compiled);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : undefined;
  }

  private minimapDrawing(g: TopologyGeometry): MinimapDrawing {
    const lines: MinimapDrawing['lines'] = [];
    for (const route of g.edges.values()) {
      const step = Math.max(1, Math.floor(route.points.length / 6));
      for (let i = step; i < route.points.length; i += step) {
        const a = route.points[i - step]!;
        const b = route.points[i]!;
        lines.push([a.x, a.y, b.x, b.y]);
      }
    }
    return { bounds: g.bounds, lines, rects: [...g.nodes.values(), ...g.clusters.values()] };
  }

  // -- manual layout ----------------------------------------------------------------------------------------------

  private installDrag(): void {
    this.svg.addEventListener('pointerdown', (event) => {
      if (this.settings.layout !== 'manual' || event.button !== 0 || !this.geometry) return;
      const id = this.nodeAt(event.target);
      const rect = id ? this.geometry.nodes.get(id) : undefined;
      if (!id || !rect) return;
      const at = this.camera.toDrawing(event.clientX, event.clientY, this.svg);
      this.drag = { id, offset: { x: at.x - (rect.x + rect.w / 2), y: at.y - (rect.y + rect.h / 2) }, moved: false };
      capture(this.svg, event.pointerId);
      this.svg.classList.add('ma-svg--dragging');
    });
    this.svg.addEventListener('pointermove', (event) => {
      if (!this.drag || !this.geometry || !this.topology) return;
      const at = this.camera.toDrawing(event.clientX, event.clientY, this.svg);
      const centre = { x: Math.round(at.x - this.drag.offset.x), y: Math.round(at.y - this.drag.offset.y) };
      const old = this.geometry.nodes.get(this.drag.id)!;
      if (!this.drag.moved && Math.hypot(centre.x - (old.x + old.w / 2), centre.y - (old.y + old.h / 2)) < 3) return;
      this.drag.moved = true;
      // Every node becomes explicitly placed once the user starts arranging them.
      for (const [id, r] of this.geometry.nodes) if (!this.stored.has(id)) this.stored.set(id, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
      this.stored.set(this.drag.id, centre);
      const nodes = new Map(this.geometry.nodes);
      nodes.set(this.drag.id, { ...old, x: centre.x - old.w / 2, y: centre.y - old.h / 2 });
      this.geometry = topologyGeometry(this.topology, nodes, this.settings.edgeStyle);
      this.glide = undefined;
      this.callbacks.requestFrame();
    });
    const end = () => {
      if (!this.drag) return;
      const moved = this.drag.moved;
      this.drag = undefined;
      this.svg.classList.remove('ma-svg--dragging');
      if (!moved || !this.geometry) return;
      this.suppressClick = true;
      this.minimap.setDrawing(this.minimapDrawing(this.geometry));
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.callbacks.onSave(Object.fromEntries(this.stored)), 500);
    };
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointercancel', end);
    // A drag must not also count as a click (which would toggle focus).
    this.svg.addEventListener(
      'click',
      (event) => {
        if (!this.suppressClick) return;
        this.suppressClick = false;
        event.stopImmediatePropagation();
      },
      { capture: true },
    );
  }

  destroy(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.el.remove();
  }
}
