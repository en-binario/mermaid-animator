/**
 * Drives one diagram in the webview: compile → layout → scene → renderer, the playback clock,
 * the camera, live reload with position preservation, and state reporting to the host.
 */
import { signal } from '@preact/signals';
import {
  compileDiagram, layoutSequence, offsetRange, resolvePosition, stepEnd, unionRects,
  type BranchChoice, type CompiledDiagram, type Diagnostic, type FragmentInfo, type Rect, type SequenceLayout, type Step,
} from '@mermaid-animator/core';
import { webviewMessage, type DocumentRange, type SidecarEntry, type WebviewSettings } from '@mermaid-animator/protocol';
import { createCanvasMeasure, EASE, effectiveDisplay, morphAt, MORPH_FADE_MS, MORPH_MS, MorphRenderer, prepareScene, sceneAt, SequenceSvgRenderer, SVG_NS, type SceneModel } from '@mermaid-animator/renderer';
import { announcement } from './announce';
import { autoFits, Camera, cinematicView, fitView, focusTarget, followView, type View, type Viewport } from './camera';
import { Minimap } from './minimap';
import { TopologyView } from './topology/view';
import { chapterTarget, deriveChapters, focusSkipSet, stepInvolves, stepText, type Chapter } from './narrative';
import { buildSearchIndex, type SearchEntry } from './search';
import { parseInline } from './narrative';
import type { ExportMaterial } from './animated/material';
import type { PaletteName } from '@mermaid-animator/renderer';
import { Player, type PlayerSnapshot } from './player';
import { resolveSettings, type AnimatorSettings } from './settings';
import type { Host } from './host';
import { GenericDiagram } from './fallback';
import { chooseEngine } from './engine';
import { resolveGenericSidecar, resolveSidecar, withSidecarSettings, type UnresolvedKey } from './sidecar';
import { arrowTags, edgeMarkers, panToReveal, railEntries, stepMessages, stepParticipants, tagOpacity } from './orientation/model';
import { canvasMeasure, OrientationOverlay } from './orientation/overlay';

export type Translate = (key: string, ...args: (string | number)[]) => string;

export interface Banner {
  kind: 'error' | 'info' | 'warning';
  text: string;
  range?: DocumentRange;
}

export interface TooltipInfo {
  x: number;
  y: number;
  text: string;
  line?: number;
}

const EMPTY_TIMELINE = { starts: [], transitions: [], settles: [], dwells: [], holds: [], duration: 0 };

export type ViewKind = 'sequence' | 'topology' | 'split';
type CameraMode = 'fit' | 'follow' | 'cinematic' | 'manual';

/** One drawing surface with its own camera (spec split-view: independent cameras). */
interface CameraSlot {
  kind: 'sequence' | 'topology';
  camera: Camera;
  size(): Viewport;
  content(): Rect;
  stepBounds(step: number): Rect | undefined;
  /** Frame for Cinematic mode, honouring `@focus`. */
  cinematicTarget(step: number, bounds: Rect): Rect;
  mode: CameraMode;
}

export interface EdgeCard {
  x: number;
  y: number;
  title: string;
  items: { id: string; text: string; step?: number }[];
}

/** Split view lays the slots out in columns from this width (spec split-view). */
const SPLIT_COLUMNS = 1100;

export class DiagramController {
  readonly svg: SVGSVGElement;
  readonly viewport: SVGGElement;
  readonly snapshot = signal<PlayerSnapshot>({ t: 0, playing: false, displayStep: 0, stepCount: 0, speed: 1, loop: false, scrubbing: false, animating: false });
  readonly banner = signal<Banner | undefined>(undefined);
  readonly notice = signal<string | undefined>(undefined);
  readonly following = signal(true);
  readonly followSuspended = signal(false);
  readonly live = signal('');
  readonly stale = signal(false);
  readonly tooltip = signal<TooltipInfo | undefined>(undefined);
  readonly stepLabels = signal<string[]>([]);
  /** Compiled steps of the native sequence (empty for the generic fallback). */
  readonly stepList = signal<Step[]>([]);
  readonly fragments = signal<FragmentInfo[]>([]);
  readonly participants = signal<{ id: string; label: string }[]>([]);
  readonly chapters = signal<Chapter[]>([]);
  readonly title = signal('');
  /** Focused participants (spec exploration). */
  readonly focus = signal<ReadonlySet<string>>(new Set());
  readonly focusedOnly = signal(false);
  readonly skipped = signal<ReadonlySet<number>>(new Set());
  readonly searchIndex = signal<SearchEntry[]>([]);
  /** Steps holding search matches, for scrubber marks. */
  readonly matchSteps = signal<number[]>([]);
  /** Effective settings, for components (captions, inspector, chapter cards). */
  readonly effective = signal<AnimatorSettings>(resolveSettings({ themeMode: 'auto' }));
  /** A chapter card to show while presenting (spec presentation-mode). */
  readonly chapterCard = signal<{ n: number; title: string } | undefined>(undefined);
  /** Current view (spec view-switching). */
  readonly view = signal<ViewKind>('sequence');
  /** Whether this diagram offers the topology and split views (native sequences only). */
  readonly canSwitch = signal(false);
  /** Messages of the hovered topology edge (spec topology-view). */
  readonly edgeCard = signal<EdgeCard | undefined>(undefined);
  readonly topologyView: TopologyView;

  private readonly measure = createCanvasMeasure();
  private readonly camera: Camera;
  private readonly player: Player;
  private sequence?: { compiled: CompiledDiagram; layout: SequenceLayout; scene: SceneModel; renderer: SequenceSvgRenderer };
  private generic?: GenericDiagram;
  private settings: AnimatorSettings = resolveSettings({ themeMode: 'auto' });
  private hostSettings: WebviewSettings = { themeMode: 'auto' };
  /** The diagram's sidecar entry (M3), and whether workspace state holds this user's own manual layout. */
  private sidecar: SidecarEntry | undefined;
  private ownLayout = false;
  private lastUnresolved = '';
  /** Captions for generic diagrams, which come only from the sidecar (by step number). */
  readonly genericCaptions = signal<(string | undefined)[]>([]);
  private reducedMotion = false;
  private origin = { line: 0, character: 0 };
  private source = '';
  private cursorLine: number | undefined;
  private frame = 0;
  private lastFrame = 0;
  private lastStep = -2;
  private lastAnnounced = -2;
  private cameraMode: CameraMode = 'fit';
  /** Mermaid diagram type of a generic drawing (export titles fall back to it). */
  private diagramType = '';
  private readonly container: HTMLElement;
  private readonly views: HTMLDivElement;
  private readonly seqSlotEl: HTMLDivElement;
  /** Participant rail, edge markers and arrow-end tags of the sequence slot (spec participant-orientation). */
  private readonly orientation: OrientationOverlay;
  private readonly orientationMeasure = canvasMeasure();
  private readonly seqSlot: CameraSlot;
  private readonly topoSlot: CameraSlot;
  private readonly seqMinimap: Minimap;
  private readonly morphSvg: SVGSVGElement;
  private readonly morphViewport: SVGGElement;
  private readonly morphRenderer: MorphRenderer;
  private morph: { from: 'sequence' | 'topology'; to: 'sequence' | 'topology'; start: number; fade: boolean; fromView: View; toView: View } | undefined;
  private topologyFitted = false;
  private highlightSeq = new Set<string>();
  private highlightTopo = new Set<string>();
  private edgeCardTimer: ReturnType<typeof setTimeout> | undefined;
  private edgeCardKey: string | undefined;
  /** Branch choices from the inspector and `ask` chips, kept for the panel's lifetime. */
  private branchChoices: Record<string, BranchChoice> = {};
  private presenting = false;
  private matches = new Set<string>();
  private cardTimer: ReturnType<typeof setTimeout> | undefined;
  private viewportSize: Viewport = { width: 800, height: 600 };
  private readonly resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    private readonly host: Host,
    private readonly t: Translate,
  ) {
    this.container = container;
    // Slots: sequence and topology drawings, plus a transient layer for the morph (M2b D4/D5).
    this.views = document.createElement('div');
    this.views.className = 'ma-views';
    this.views.dataset.view = 'sequence';
    container.appendChild(this.views);
    this.seqSlotEl = document.createElement('div');
    this.seqSlotEl.className = 'ma-slot ma-slot--sequence';
    this.views.appendChild(this.seqSlotEl);
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'ma-svg');
    this.svg.setAttribute('role', 'img');
    this.viewport = document.createElementNS(SVG_NS, 'g');
    this.viewport.setAttribute('class', 'ma-viewport');
    this.svg.appendChild(this.viewport);
    this.seqSlotEl.appendChild(this.svg);
    this.morphSvg = document.createElementNS(SVG_NS, 'svg');
    this.morphSvg.setAttribute('class', 'ma-svg ma-morph-layer');
    this.morphSvg.setAttribute('aria-hidden', 'true');
    this.morphViewport = document.createElementNS(SVG_NS, 'g');
    this.morphSvg.appendChild(this.morphViewport);
    this.morphRenderer = new MorphRenderer(this.morphViewport);

    this.player = new Player(EMPTY_TIMELINE, { speed: 1, loop: false, onEnd: 'stop', reverse: 'animate', snap: true });
    // A pending `ask` branch choice waits at rest until a chip is chosen (spec step-compilation).
    this.player.setGate((k) => this.pendingChoice(k) !== undefined);
    this.player.subscribe((s) => {
      this.snapshot.value = s;
      this.requestFrame();
    });
    const onUserMove = () => {
      if (this.cameraMode === 'follow' || this.cameraMode === 'cinematic') this.followSuspended.value = true;
      this.requestFrame();
    };
    this.camera = new Camera(this.svg, this.viewport, { onUserMove, onChange: () => this.requestFrame() });
    this.seqSlot = {
      kind: 'sequence',
      camera: this.camera,
      size: () => this.viewportSize,
      content: () => this.contentBounds(),
      stepBounds: (step) => this.stepBounds(step),
      cinematicTarget: (step, bounds) => focusTarget(bounds, this.sequence?.layout.participants ?? [], this.steps()[step]?.focus),
      mode: 'fit',
    };
    this.seqMinimap = new Minimap(
      this.seqSlotEl,
      {
        centreOn: (p) => this.camera.userSet({ ...this.camera.view, x: this.viewportSize.width / 2 - p.x * this.camera.view.k, y: this.viewportSize.height / 2 - p.y * this.camera.view.k }),
        panBy: (dx, dy) => this.camera.userSet({ ...this.camera.view, x: this.camera.view.x - dx * this.camera.view.k, y: this.camera.view.y - dy * this.camera.view.k }),
      },
      t('minimap.label'),
    );
    this.orientation = new OrientationOverlay(
      this.seqSlotEl,
      {
        focus: (id, additive) => this.toggleFocus(id, additive),
        reveal: (id) => {
          const p = this.sequence?.layout.participants.find((q) => q.id === id);
          if (p) this.camera.userSet(panToReveal(this.camera.view, this.viewportSize, p.x));
        },
      },
      t,
    );

    this.topologyView = new TopologyView(this.views, {
      measure: this.measure,
      onUserMove,
      requestFrame: () => this.requestFrame(),
      onSave: (positions) => {
        this.ownLayout = true;
        this.host.post(webviewMessage('layout/save', { key: this.sequence?.compiled.id ?? '', positions }));
      },
      reducedMotion: () => this.reducedMotion,
      minimapLabel: t('minimap.label'),
    });
    const topo = this.topologyView;
    this.topoSlot = {
      kind: 'topology',
      camera: topo.camera,
      size: () => topo.size,
      content: () => topo.content(),
      stepBounds: (step) => topo.stepBounds(step, this.sequence?.compiled.sequence?.compiled),
      cinematicTarget: (step, bounds) => topo.focusBounds(this.steps()[step]?.focus) ?? bounds,
      mode: 'fit',
    };
    this.views.appendChild(this.morphSvg);

    this.resizeObserver = new ResizeObserver(() => {
      const rect = this.seqSlotEl.getBoundingClientRect();
      if (rect.width && rect.height) this.viewportSize = { width: rect.width, height: rect.height };
      this.reframe(this.seqSlot);
    });
    this.resizeObserver.observe(this.seqSlotEl);
    new ResizeObserver(() => this.reframe(this.topoSlot)).observe(topo.el);
    // Columns or rows follow the panel's width (spec split-view), not the canvas beside the inspector.
    new ResizeObserver(() => {
      this.views.dataset.split = document.documentElement.clientWidth >= SPLIT_COLUMNS ? 'columns' : 'rows';
    }).observe(document.documentElement);
    const rect = container.getBoundingClientRect();
    this.viewportSize = { width: rect.width || 800, height: rect.height || 600 };
    this.views.dataset.split = document.documentElement.clientWidth >= SPLIT_COLUMNS ? 'columns' : 'rows';

    document.addEventListener('visibilitychange', () => this.player.hold('hidden', document.visibilityState === 'hidden'));
    this.attachPointer(this.svg, 'sequence');
    this.attachPointer(topo.svg, 'topology');
  }

  /** Hover, tooltips, cross-highlighting, focus clicks and Alt+double-click reveal for one slot. */
  private attachPointer(svg: SVGSVGElement, kind: 'sequence' | 'topology'): void {
    svg.addEventListener('pointerenter', () => this.player.hold('hover', this.settings.pauseOnHover));
    svg.addEventListener('pointerleave', () => {
      this.player.hold('hover', false);
      this.tooltip.value = undefined;
      if (this.hoverTimer) clearTimeout(this.hoverTimer);
      this.setCrossHighlight(undefined, kind);
      this.hideEdgeCardSoon();
    });
    svg.addEventListener('pointermove', (event) => this.hover(event, kind));
    svg.addEventListener('dblclick', (event) => {
      if (event.altKey) this.revealElement(event.target);
    });
    // Participant focus: click a header or node; Ctrl/Cmd+click adds; click empty canvas clears.
    svg.addEventListener('click', (event) => {
      if (event.altKey) return;
      const ref = SequenceSvgRenderer.elementAt(event.target);
      if (ref?.kind === 'participant') this.toggleFocus(ref.id, event.ctrlKey || event.metaKey);
      else if (!ref) this.clearFocus();
    });
  }

  // -- loading -------------------------------------------------------------------------------------------------

  async load(source: string, origin: { line: number; character: number }, settings: WebviewSettings, reducedMotion: boolean, layout?: Record<string, { x: number; y: number }>, sidecar?: SidecarEntry): Promise<void> {
    await document.fonts?.ready;
    this.sidecar = sidecar;
    this.ownLayout = !!layout && Object.keys(layout).length > 0;
    this.lastUnresolved = '';
    // Workspace-state positions are this user's unsaved arrangement; the sidecar's are shared.
    this.topologyView.setStored(this.ownLayout ? layout : sidecar?.layout);
    this.hostSettings = settings;
    this.reducedMotion = reducedMotion;
    this.origin = origin;
    this.source = source;
    this.lastStep = -2;
    this.lastAnnounced = -2;
    this.followSuspended.value = false;
    const ok = await this.build(source, { preserve: false });
    if (!ok) return;
    const count = this.stepCount();
    const startAt = this.settings.startAt;
    this.player.setTimeline(this.timeline(), startAt === 'end' ? count - 1 : -1);
    this.applyCameraMode(true);
    // Initial view from `view.default` / `@animator view=` (spec view-switching), without a morph.
    await this.setView(this.sequence ? this.settings.view : 'sequence', false);
    if (this.settings.autoplay) this.player.play();
    this.requestFrame();
  }

  async update(source: string, origin: { line: number; character: number }): Promise<void> {
    this.origin = origin;
    if (source === this.source) return;
    this.source = source;
    await this.build(source, { preserve: true });
    this.requestFrame();
  }

  /** The sidecar changed: apply its settings, narration and positions live (spec sidecar-files). */
  async applySidecar(entry: SidecarEntry, source: string, origin: { line: number; character: number }): Promise<void> {
    this.sidecar = entry;
    this.source = source;
    this.origin = origin;
    if (!this.ownLayout) {
      this.topologyView.setStored(entry.layout);
      if (this.topologyView.hasLayout) void this.updateTopology();
    }
    await this.build(this.source, { preserve: true });
    this.requestFrame();
  }

  /** The user's own manual positions were saved into the sidecar (or dragged anew). */
  set hasOwnLayout(value: boolean) {
    this.ownLayout = value;
  }

  /** The bound diagram disappeared from the document: keep the drawing, show a notice. */
  markUnbound(): void {
    this.banner.value = { kind: 'warning', text: this.t('banner.unbound') };
  }

  setCursor(line: number): void {
    this.cursorLine = line - this.origin.line;
  }

  applySettings(settings: WebviewSettings, reducedMotion: boolean): void {
    this.hostSettings = settings;
    this.reducedMotion = reducedMotion;
    void this.build(this.source, { preserve: true }).then(() => this.requestFrame());
  }

  private steps(): Step[] {
    return this.sequence?.compiled.sequence?.compiled.steps ?? [];
  }

  private stepCount(): number {
    return this.sequence ? this.steps().length : (this.generic?.stepCount ?? 0);
  }

  private timeline() {
    return this.sequence?.compiled.sequence?.timeline ?? this.generic?.timeline ?? EMPTY_TIMELINE;
  }

  /**
   * Loads the font subsets the diagram's text needs before measuring: unicode-range faces load on
   * demand, and canvas measurement does not trigger that, so e.g. latin-ext labels would otherwise
   * be measured with a fallback font.
   */
  private async loadFonts(source: string): Promise<void> {
    const fonts = document.fonts;
    if (!fonts?.load) return;
    const text = source.slice(0, 20_000);
    await Promise.all(['450 13px "Inter Variable"', '560 13.5px "Inter Variable"'].map((f) => fonts.load(f, text).catch(() => [])));
  }

  /** Compiles and mounts; on errors keeps the last good drawing and shows a banner. Returns success. */
  private async build(source: string, { preserve }: { preserve: boolean }): Promise<boolean> {
    await this.loadFonts(source);
    const previousSteps = this.steps();
    const previousIndex = this.snapshot.value.displayStep - 1;
    const compiled = compileDiagram(source, {});
    // Precedence (spec §11.8): settings < sidecar < front matter and annotations.
    this.settings = resolveSettings(withSidecarSettings(this.hostSettings, this.sidecar), compiled.settings);
    this.effective.value = this.settings;
    const options = {
      notes: this.settings.notes,
      dwell: this.settings.dwell,
      dwellMs: this.settings.dwellMs,
      loopIterations: this.settings.loopIterations,
      compressRepeats: this.settings.compressRepeats,
      altBranches: this.settings.altBranches,
      parallel: this.settings.parallel,
      branchChoices: this.branchChoices,
    };
    let recompiled = compileDiagram(source, options);
    if (recompiled.sequence && (this.sidecar?.captions || this.sidecar?.chapters)) {
      // Step keys resolve against the compiled steps; captions change dwell, not the step list.
      const resolved = resolveSidecar(recompiled.sequence.compiled.steps, this.sidecar);
      recompiled = compileDiagram(source, { ...options, stepCaptions: resolved.stepCaptions, stepChapters: resolved.stepChapters });
      this.reportUnresolved(resolved.unresolved);
    } else if (recompiled.sequence) this.reportUnresolved([]);
    this.player.setOptions({ speed: this.settings.speed, loop: this.settings.onEnd === 'loop', onEnd: this.settings.onEnd, reverse: this.settings.reverse, snap: this.settings.snap });

    const firstError = recompiled.diagnostics.find((d) => d.severity === 'error');
    const engine = await chooseEngine(recompiled, () => GenericDiagram.canRender(source));
    if (engine === 'native' && recompiled.sequence) {
      this.generic?.destroy();
      this.generic = undefined;
      const { model, compiled: steps, timeline } = recompiled.sequence;
      const layout = layoutSequence(model, steps, { measure: this.measure, mirrorActors: !/mirrorActors["']?\s*:\s*false/.test(source) });
      const renderer = this.sequence?.renderer ?? new SequenceSvgRenderer(this.viewport);
      renderer.mount(layout);
      this.sequence = { compiled: recompiled, layout, scene: prepareScene(layout, steps, timeline), renderer };
      this.genericCaptions.value = [];
      this.banner.value = undefined;
      this.notice.value = undefined;
      this.stale.value = false;
      this.describe(recompiled);
      if (preserve) {
        const restIndex = resolvePosition(previousSteps, previousIndex, steps.steps, this.cursorLine);
        this.player.setTimeline(timeline, restIndex);
      }
      this.refreshFocus();
      this.applyMatches();
      this.canSwitch.value = true;
      this.seqMinimap.setDrawing(this.sequenceMinimap(layout));
      if (this.view.value !== 'sequence' || this.topologyView.hasLayout) void this.updateTopology();
      return true;
    }

    if (engine === 'error' && firstError) {
      // A real error: keep the last good scene, dimmed, with a banner.
      this.showError(firstError);
      if (!this.sequence && !this.generic) this.stale.value = false;
      return false;
    }

    // Generic fallback: other diagram types, or sequences Mermaid accepts but the native parser does not.
    this.sequence?.renderer.root.remove();
    this.sequence = undefined;
    this.generic ??= new GenericDiagram(this.viewport);
    const result = await this.generic.render(source, this.hostSettings);
    if (!result.ok) {
      this.showError({ message: result.error, severity: 'error', code: 'mermaid/error', range: { startLine: 0, startCol: 0, endLine: 0, endCol: 0 } });
      return false;
    }
    this.banner.value = undefined;
    this.stale.value = false;
    this.notice.value = recompiled.type === 'sequence' ? this.t('banner.fallbackNative') : this.t('banner.fallback');
    this.svg.setAttribute('aria-label', recompiled.title ?? recompiled.type);
    this.stepLabels.value = this.generic.labels;
    const generic = resolveGenericSidecar(this.generic.stepCount, this.sidecar);
    this.genericCaptions.value = Array.from({ length: this.generic.stepCount }, (_, i) => generic.stepCaptions[i]);
    this.reportUnresolved(generic.unresolved);
    this.stepList.value = [];
    this.fragments.value = [];
    this.participants.value = [];
    this.chapters.value = [];
    this.searchIndex.value = [];
    this.title.value = recompiled.title ?? '';
    this.diagramType = recompiled.type;
    // Generic diagrams offer only their own view.
    this.canSwitch.value = false;
    this.showView('sequence');
    if (preserve) this.player.setTimeline(this.generic.timeline, Math.min(previousIndex, this.generic.stepCount - 1));
    return true;
  }

  // -- views (M2b) --------------------------------------------------------------------------------------------

  private topologySettings() {
    const s = this.settings;
    return { layout: s.topologyLayout, direction: s.direction, edgeStyle: s.edgeStyle, returnMessages: s.returnMessages, edgeWeight: s.edgeWeight };
  }

  /** Rebuilds and lays out the topology for the current sequence. */
  private async updateTopology(): Promise<void> {
    const seq = this.sequence?.compiled.sequence;
    if (!seq) return;
    await this.topologyView.update(seq.model, seq.compiled, seq.timeline, this.topologySettings());
    if (!this.topologyFitted && this.topologyView.hasLayout) {
      this.topologyFitted = true;
      this.applySlotMode(this.topoSlot, true);
    }
    this.applyMatches();
    this.requestFrame();
  }

  /** Clears manual topology positions (Reset Topology Layout) and lays out again. */
  resetLayout(): void {
    this.topologyView.resetManual();
    // Without this user's positions, the sidecar's shared positions (if any) apply again.
    this.ownLayout = false;
    if (this.sidecar?.layout) this.topologyView.setStored(this.sidecar.layout);
    void this.updateTopology();
  }

  private showView(view: ViewKind): void {
    this.view.value = view;
    this.views.dataset.view = view;
  }

  private slotsFor(view: ViewKind): CameraSlot[] {
    if (view === 'sequence' || !this.sequence) return [this.seqSlot];
    if (view === 'topology') return this.topologyView.hasLayout ? [this.topoSlot] : [];
    return this.topologyView.hasLayout ? [this.seqSlot, this.topoSlot] : [this.seqSlot];
  }

  private visibleSlots(): CameraSlot[] {
    return this.slotsFor(this.view.value);
  }

  /**
   * Switches view keeping the step and focus (spec view-switching). Sequence ↔ Topology morphs for
   * 640 ms (a 150 ms cross-fade under reduced motion); playback pauses for the morph and resumes after.
   */
  async setView(next: ViewKind, animate = true): Promise<void> {
    if (!this.sequence) next = 'sequence';
    const previous = this.view.value;
    if (next === previous || this.morph) return;
    if (next !== 'sequence') {
      if (!this.topologyView.hasLayout) void this.updateTopology();
      await this.topologyView.ready();
      if (!this.sequence) return;
    }
    const pair = (previous === 'sequence' && next === 'topology') || (previous === 'topology' && next === 'sequence');
    if (!animate || !pair) {
      this.showView(next);
      for (const slot of this.slotsFor(next)) this.reframe(slot);
      this.requestFrame();
      return;
    }
    const from = previous as 'sequence' | 'topology';
    const to = next as 'sequence' | 'topology';
    const slotOf = (k: 'sequence' | 'topology') => (k === 'sequence' ? this.seqSlot : this.topoSlot);
    this.player.hold('morph', true);
    this.edgeCard.value = undefined;
    this.tooltip.value = undefined;
    const fade = this.reducedMotion;
    this.morph = { from, to, start: performance.now(), fade, fromView: { ...slotOf(from).camera.view }, toView: { ...slotOf(to).camera.view } };
    this.views.dataset.morphing = fade ? 'fade' : 'morph';
    this.showView(to);
    this.requestFrame();
  }

  /** Lays out the topology if it has not been yet (exports that include the topology view). */
  async ensureTopology(): Promise<void> {
    if (!this.sequence) return;
    if (!this.topologyView.hasLayout) void this.updateTopology();
    await this.topologyView.ready();
  }

  /** The topology positions to save into the sidecar (lays the topology out first if needed). */
  async sidecarLayout(): Promise<Record<string, { x: number; y: number }> | undefined> {
    if (!this.sequence) return undefined;
    await this.ensureTopology();
    const positions = this.topologyView.positions();
    // From now on the sidecar holds this arrangement; later sidecar edits apply live again.
    if (positions) this.ownLayout = false;
    return positions;
  }

  /**
   * Runtime choices saved by *Save Current Settings as Diagram Defaults* (spec §11.8, level 8):
   * playback speed, the current view and the camera mode.
   */
  sidecarDefaults(): Record<string, unknown> {
    const settings: Record<string, unknown> = { 'playback.speed': this.snapshot.value.speed };
    if (this.sequence) settings['view.default'] = this.view.value;
    const configured = this.settings.camera;
    const automatic = configured === 'auto' && this.cameraMode === (autoFits(this.contentBounds(), this.viewportSize) ? 'fit' : 'follow');
    settings['camera.mode'] = automatic || this.cameraMode === 'manual' ? configured : this.cameraMode;
    return settings;
  }

  /** Starts the topology layout in the background (e.g. when the pointer reaches the view switcher). */
  prewarmTopology(): void {
    if (this.sequence && !this.topologyView.hasLayout && !this.topologyView.pending.value) void this.updateTopology();
  }

  toggleView(): void {
    void this.setView(this.view.value === 'sequence' ? 'topology' : this.view.value === 'topology' ? 'sequence' : 'topology');
  }

  toggleSplit(): void {
    void this.setView(this.view.value === 'split' ? 'sequence' : 'split');
  }

  /** Draws one morph frame; returns true while the morph runs. */
  private renderMorph(now: number, time: number): boolean {
    const m = this.morph;
    const seq = this.sequence;
    const topo = this.topologyView;
    if (!m) return false;
    const duration = m.fade ? MORPH_FADE_MS : MORPH_MS;
    const p = Math.min(1, (now - m.start) / duration);
    if (m.fade) {
      const toSeq = m.to === 'sequence';
      this.seqSlotEl.style.opacity = String(toSeq ? p : 1 - p);
      topo.el.style.opacity = String(toSeq ? 1 - p : p);
      this.renderViews(time, now, ['sequence', 'topology']);
    } else if (seq && topo.geometry && topo.model) {
      const display = effectiveDisplay(this.settings.display, false);
      const geometry = topo.currentGeometry(now) ?? topo.geometry;
      const input = {
        layout: seq.layout,
        sequence: sceneAt(seq.scene, time, display, { focus: this.focus.value }),
        topology: topo.topology!,
        geometry,
        topologyScene: topo.scene(time, display, { focus: this.focus.value })!,
      };
      const forward = m.from === 'sequence';
      const ms = p * MORPH_MS;
      this.morphRenderer.render(morphAt(input, forward ? ms : MORPH_MS - ms));
      const e = EASE.standard(p);
      const a = m.fromView;
      const b = m.toView;
      const lerp = (x: number, y: number) => x + (y - x) * e;
      this.morphViewport.setAttribute('transform', `translate(${lerp(a.x, b.x)} ${lerp(a.y, b.y)}) scale(${lerp(a.k, b.k)})`);
    }
    if (p < 1) return true;
    this.morph = undefined;
    this.morphRenderer.clear();
    delete this.views.dataset.morphing;
    this.seqSlotEl.style.removeProperty('opacity');
    topo.el.style.removeProperty('opacity');
    this.player.hold('morph', false);
    this.reframe(m.to === 'sequence' ? this.seqSlot : this.topoSlot);
    return false;
  }

  private sequenceMinimap(layout: SequenceLayout) {
    const lines: [number, number, number, number][] = [];
    for (const p of layout.participants) lines.push([p.x, p.lifeline.y1, p.x, p.lifeline.full]);
    for (const m of layout.messages) {
      const a = m.points[0]!;
      const b = m.points[m.points.length - 1]!;
      lines.push([a.x, a.y, b.x, b.y]);
    }
    return { bounds: { x: 0, y: 0, w: layout.width, h: layout.height }, lines, rects: layout.participants.map((p) => p.header) };
  }

  // -- cross-highlighting and edge cards -----------------------------------------------------------------------

  /** Highlights the counterpart of a hovered element in the other view (split view only). */
  private setCrossHighlight(ref: { kind: string; id: string } | undefined, from: 'sequence' | 'topology'): void {
    const topology = this.topologyView.topology;
    const seq = new Set<string>();
    const topo = new Set<string>();
    if (ref && topology && this.view.value === 'split') {
      if (ref.kind === 'participant') (from === 'sequence' ? topo : seq).add(ref.id);
      else if (ref.kind === 'message' && from === 'sequence') {
        const key = topology.messageEdge.get(ref.id);
        if (key) topo.add(key);
      } else if (ref.kind === 'edge' && from === 'topology') {
        for (const m of topology.edges.find((e) => e.key === ref.id)?.messages ?? []) seq.add(m);
      }
    }
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
    if (same(seq, this.highlightSeq) && same(topo, this.highlightTopo)) return;
    this.highlightSeq = seq;
    this.highlightTopo = topo;
    this.requestFrame();
  }

  private showEdgeCard(key: string, x: number, y: number): void {
    const topology = this.topologyView.topology;
    const edge = topology?.edges.find((e) => e.key === key);
    const model = this.sequence?.compiled.sequence?.model;
    if (!edge || !model) return;
    const labels = new Map<string, string>();
    const visit = (nodes: typeof model.body) => {
      for (const n of nodes) {
        if (n.type === 'message') labels.set(n.message.id, n.message.label.replace(/\n/g, ' '));
        else if (n.type === 'fragment') n.fragment.branches.forEach((b) => visit(b.children));
      }
    };
    visit(model.body);
    const steps = this.steps();
    const firstStep = (id: string) => steps.find((s) => s.messages.includes(id))?.index;
    const name = (id: string) => model.participants.find((p) => p.id === id)?.label.replace(/\n/g, ' ') ?? id;
    this.edgeCardKey = key;
    this.edgeCard.value = {
      x,
      y,
      title: `${name(edge.from)} → ${name(edge.to)}`,
      items: edge.messages.map((id) => ({ id, text: labels.get(id) ?? id, step: firstStep(id) })),
    };
  }

  /** Keeps the edge card open while the pointer is over it. */
  keepEdgeCard(): void {
    if (this.edgeCardTimer) clearTimeout(this.edgeCardTimer);
  }

  hideEdgeCardSoon(): void {
    if (this.edgeCardTimer) clearTimeout(this.edgeCardTimer);
    this.edgeCardTimer = setTimeout(() => {
      this.edgeCard.value = undefined;
      this.edgeCardKey = undefined;
    }, 250);
  }

  /** Tells the host which sidecar keys match no step (for diagnostics), only when that changes. */
  private reportUnresolved(entries: UnresolvedKey[]): void {
    const key = JSON.stringify(entries);
    if (key === this.lastUnresolved || (!this.sidecar && !entries.length)) return;
    this.lastUnresolved = key;
    this.host.post(webviewMessage('sidecar/unresolved', { entries }));
  }

  private showError(error: Diagnostic): void {
    const range = offsetRange(error.range, this.origin);
    this.banner.value = { kind: 'error', text: this.t('banner.error', range.startLine + 1, range.startCol + 1, error.message), range };
    this.stale.value = !!(this.sequence || this.generic);
  }

  private describe(compiled: CompiledDiagram): void {
    const seq = compiled.sequence!;
    const title = seq.model.accTitle ?? compiled.title ?? this.t('aria.sequence');
    const label = this.t('aria.diagram', title, seq.model.participants.length, seq.compiled.steps.length);
    this.svg.setAttribute('aria-label', seq.model.accDescr ? `${label} ${seq.model.accDescr}` : label);
    this.stepLabels.value = seq.compiled.steps.map((s) => stepText(s, this.t));
    this.stepList.value = seq.compiled.steps;
    this.fragments.value = seq.compiled.fragments;
    this.participants.value = seq.model.participants.map((p) => ({ id: p.id, label: p.label.replace(/\n/g, ' ') }));
    this.chapters.value = deriveChapters(seq.compiled.steps);
    this.title.value = title;
    const messages: { id: string; label: string; from: string; to: string }[] = [];
    const notes: { id: string; text: string }[] = [];
    const visit = (nodes: typeof seq.model.body) => {
      for (const n of nodes) {
        if (n.type === 'message') messages.push({ id: n.message.id, label: n.message.label, from: n.message.from, to: n.message.to });
        else if (n.type === 'note') notes.push({ id: n.note.id, text: n.note.text });
        else if (n.type === 'fragment') n.fragment.branches.forEach((b) => visit(b.children));
      }
    };
    visit(seq.model.body);
    this.searchIndex.value = buildSearchIndex({ participants: this.participants.value, messages, notes, steps: seq.compiled.steps });
  }

  // -- frame loop ----------------------------------------------------------------------------------------------

  requestFrame(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame((now) => this.onFrame(now));
  }

  private onFrame(now: number): void {
    this.frame = 0;
    const dt = this.lastFrame ? Math.min(100, now - this.lastFrame) : 16;
    this.lastFrame = now;
    const seqMoving = this.camera.tick(now, this.viewportSize);
    const topoMoving = this.topologyView.camera.tick(now, this.topologyView.size);
    const cameraMoving = seqMoving || topoMoving;
    // Release the playhead once the camera has brought the step into view.
    if (!cameraMoving && this.player.waitingForCamera) this.player.hold('camera', false);
    const advancing = this.player.isActive ? this.player.tick(dt) : false;
    const busy = this.render(now);
    if (advancing || cameraMoving || busy || this.player.isActive || this.player.waitingForCamera) this.requestFrame();
    else this.lastFrame = 0;
  }

  /** Renders the visible views (or the morph); returns true while something still animates. */
  private render(now: number): boolean {
    const time = this.player.time;
    let busy = false;
    if (this.morph) busy = this.renderMorph(now, time);
    else if (this.sequence) {
      const view = this.view.value;
      busy = this.renderViews(time, now, view === 'split' ? ['sequence', 'topology'] : [view]);
    } else this.generic?.renderAt(time, this.reducedMotion);
    this.updateMinimaps();
    this.updateOrientation();
    const step = this.snapshot.value.displayStep - 1;
    if (step !== this.lastStep) {
      const forward = step > this.lastStep;
      this.lastStep = step;
      this.onStepChanged(step, forward, now);
    }
    return busy;
  }

  private renderViews(time: number, now: number, kinds: ('sequence' | 'topology')[]): boolean {
    if (!this.sequence) return false;
    const display = effectiveDisplay(this.settings.display, this.reducedMotion && this.settings.respectReducedMotion);
    if (kinds.includes('sequence')) {
      const scene = sceneAt(this.sequence.scene, time, display, { focus: this.focus.value, highlight: this.highlightSeq });
      this.sequence.renderer.render(scene, { comet: display.indicator === 'comet' });
    }
    if (kinds.includes('topology') && this.topologyView.hasLayout) {
      this.topologyView.render(time, display, { focus: this.focus.value, highlight: this.highlightTopo }, now);
      return this.topologyView.gliding;
    }
    return false;
  }

  private updateMinimaps(): void {
    const step = this.snapshot.value.displayStep - 1;
    const mode = this.settings.showMinimap;
    const hidden = this.presenting || !!this.morph;
    const view = this.view.value;
    if (this.sequence) {
      const b = step >= 0 ? this.stepBounds(step) : undefined;
      this.seqMinimap.update(this.camera.view, this.viewportSize, b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : undefined, mode, hidden || view === 'topology');
    } else this.seqMinimap.update(this.camera.view, this.viewportSize, undefined, 'never', true);
    const topo = this.topologyView;
    if (topo.hasLayout) topo.minimap.update(topo.camera.view, topo.size, topo.marker(step, this.sequence?.compiled.sequence?.compiled), mode, hidden || view === 'sequence' || !this.sequence);
  }

  /**
   * Participant orientation (spec participant-orientation): sequence view and the sequence side of
   * split only, hidden during morphs, kept while presenting.
   */
  private updateOrientation(): void {
    const seq = this.sequence;
    if (!seq || this.morph || this.view.value === 'topology') {
      this.orientation.update(undefined);
      return;
    }
    const { layout } = seq;
    const view = this.camera.view;
    const size = this.viewportSize;
    const index = this.snapshot.value.displayStep - 1;
    const step = index >= 0 ? this.steps()[index] : undefined;
    const involved = step ? stepParticipants(step, layout) : [];
    const names = this.settings.participantNames === 'auto';
    const measure = this.orientationMeasure;
    this.orientation.update({
      rail: names ? railEntries(layout, view, size, { measure, involved: new Set(involved), focus: this.focus.value }) : [],
      markers: names && step ? edgeMarkers(layout, view, size, involved, this.stepBounds(index)) : [],
      tags: step ? arrowTags(layout, stepMessages(step, layout), view, size, this.settings.arrowEndNames, measure) : [],
      tagOpacity: step ? tagOpacity(this.timeline(), index, this.player.time) : 0,
    });
  }

  private onStepChanged(step: number, forward: boolean, now: number): void {
    const steps = this.steps();
    const count = this.stepCount();
    const current = steps[step];
    const ranges = (current?.sources ?? []).map((r) => offsetRange(r, this.origin));
    this.host.post(webviewMessage('state/changed', { stepIndex: step, stepCount: count, playing: this.snapshot.value.playing, sourceRanges: ranges, stepId: current?.id, structuralId: current?.structuralId, caption: current ? current.caption : step >= 0 ? this.genericCaptions.value[step] : undefined }));
    if (this.snapshot.value.speed <= 2 && step !== this.lastAnnounced) {
      this.lastAnnounced = step;
      const participants = this.sequence?.compiled.sequence?.model.participants ?? [];
      this.live.value = this.sequence ? announcement(current, step, count, participants, this.t) : this.t('announce.step', step + 1, count);
    }
    if (this.presenting && forward && step >= 0 && current?.chapter && this.settings.chapterCards) this.showChapterCard(step, current.chapter);
    if (this.followSuspended.value) return;
    for (const slot of this.visibleSlots()) {
      if (slot.mode === 'follow' && step >= 0 && forward) this.followStep(slot, step, now);
      else if (slot.mode === 'cinematic') this.cinematicStep(slot, step, forward, now);
    }
  }

  private showChapterCard(step: number, title: string): void {
    const n = this.chapters.value.findIndex((c) => c.firstStep === step) + 1;
    this.chapterCard.value = { n: n || 1, title };
    // Freeze the playhead while the card is up, then draw the chapter's first step.
    this.player.hold('card', true);
    if (this.cardTimer) clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => this.dismissChapterCard(), 1600);
  }

  dismissChapterCard(): void {
    if (this.cardTimer) clearTimeout(this.cardTimer);
    this.cardTimer = undefined;
    if (this.chapterCard.value) this.chapterCard.value = undefined;
    this.player.hold('card', false);
    this.requestFrame();
  }

  // -- camera ---------------------------------------------------------------------------------------------------

  private contentBounds(): Rect {
    if (this.sequence) return { x: 0, y: 0, w: this.sequence.layout.width, h: this.sequence.layout.height };
    return this.generic?.bounds ?? { x: 0, y: 0, w: 100, h: 100 };
  }

  private stepBounds(step: number): Rect | undefined {
    if (this.sequence) return this.sequence.layout.stepBounds[step];
    return this.generic?.stepBounds(step);
  }

  private applyCameraMode(initial: boolean): void {
    const mode = this.settings.camera;
    this.cameraMode = mode === 'auto' ? (autoFits(this.contentBounds(), this.viewportSize) ? 'fit' : 'follow') : mode;
    this.following.value = this.cameraMode === 'follow' || this.cameraMode === 'cinematic';
    this.applySlotMode(this.seqSlot, initial);
    if (this.topologyView.hasLayout) this.applySlotMode(this.topoSlot, initial);
  }

  /** Resolves `auto` for a slot (the topology is usually compact) and applies the mode. */
  private applySlotMode(slot: CameraSlot, initial: boolean): void {
    const mode = this.presenting ? 'cinematic' : this.settings.camera;
    slot.mode = mode === 'auto' ? (autoFits(slot.content(), slot.size()) ? 'fit' : 'follow') : mode;
    if (slot.kind === 'sequence') this.cameraMode = slot.mode;
    const step = this.snapshot.value.displayStep - 1;
    if (slot.mode === 'cinematic') {
      if (step >= 0) this.cinematicStep(slot, step, false, performance.now());
      else if (initial) this.fitSlot(slot, false);
      return;
    }
    if (slot.mode === 'fit' || (initial && slot.mode === 'manual')) this.fitSlot(slot, false);
    else if (initial) {
      // Follow: start at the top, as wide as fits (never enlarged).
      const content = slot.content();
      const size = slot.size();
      const k = Math.min(1, (size.width - 48) / content.w);
      slot.camera.moveTo({ k, x: size.width / 2 - (content.x + content.w / 2) * k, y: 24 - content.y * k }, { animate: false, viewport: size, now: performance.now() });
    }
  }

  /** Re-applies a slot's framing after its size changed. */
  private reframe(slot: CameraSlot): void {
    if (slot.kind === 'topology' && !this.topologyView.hasLayout) return;
    const step = this.snapshot.value.displayStep - 1;
    if (slot.mode === 'fit') this.fitSlot(slot, false);
    else if (this.followSuspended.value) return;
    else if (slot.mode === 'cinematic') this.cinematicStep(slot, step, false, performance.now());
    else if (slot.mode === 'follow' && step >= 0) this.followStep(slot, step, performance.now(), false);
  }

  private fitSlot(slot: CameraSlot, animate: boolean): void {
    const size = slot.size();
    slot.camera.moveTo(fitView(slot.content(), size), { animate: animate && !this.reducedMotion, viewport: size, now: performance.now() });
    this.requestFrame();
  }

  fit(animate = true): void {
    for (const slot of this.visibleSlots()) this.fitSlot(slot, animate);
  }

  frameStep(): void {
    const step = this.snapshot.value.displayStep - 1;
    for (const slot of this.visibleSlots()) {
      const bounds = step >= 0 ? slot.stepBounds(step) : slot.content();
      if (!bounds) continue;
      const size = slot.size();
      const padded = { x: bounds.x - 48, y: bounds.y - 48, w: bounds.w + 96, h: bounds.h + 96 };
      slot.camera.moveTo(fitView(padded, size, 0, 2.5), { animate: !this.reducedMotion, viewport: size, now: performance.now(), speed: this.snapshot.value.speed });
    }
    this.requestFrame();
  }

  private followStep(slot: CameraSlot, step: number, now: number, hold = true): void {
    const bounds = slot.stepBounds(step);
    if (!bounds) return;
    const size = slot.size();
    const next = followView(slot.camera.view, bounds, size);
    if (!next) return;
    const animate = !this.reducedMotion;
    slot.camera.moveTo(next, { animate, viewport: size, now, speed: this.snapshot.value.speed });
    // Hold the playhead at the step's start until the camera arrives (spec camera: in view before drawing).
    if (animate && hold) this.player.hold('camera', true);
    this.requestFrame();
  }

  /** Cinematic mode: frames the step (or its `@focus` participants) tightly, before it draws when moving forward. */
  private cinematicStep(slot: CameraSlot, step: number, forward: boolean, now: number): void {
    if (step < 0) {
      this.fitSlot(slot, !this.reducedMotion);
      return;
    }
    const bounds = slot.stepBounds(step);
    if (!bounds) return;
    const size = slot.size();
    const next = cinematicView(slot.cinematicTarget(step, bounds), size, slot.camera.view);
    const view = slot.camera.view;
    if (Math.abs(next.x - view.x) < 0.5 && Math.abs(next.y - view.y) < 0.5 && Math.abs(next.k - view.k) < 0.001) return;
    const animate = !this.reducedMotion;
    slot.camera.moveTo(next, { animate, viewport: size, now, speed: this.snapshot.value.speed });
    if (animate && forward) this.player.hold('camera', true);
    this.requestFrame();
  }

  /** Presentation mode uses Cinematic framing and restores the configured camera afterwards. */
  setPresenting(on: boolean): void {
    if (on === this.presenting) return;
    this.presenting = on;
    this.followSuspended.value = false;
    if (on) {
      this.cameraMode = 'cinematic';
      this.following.value = true;
      for (const slot of [this.seqSlot, this.topoSlot]) slot.mode = 'cinematic';
      for (const slot of this.visibleSlots()) this.cinematicStep(slot, this.snapshot.value.displayStep - 1, false, performance.now());
    } else {
      this.dismissChapterCard();
      this.applyCameraMode(false);
      for (const slot of this.visibleSlots()) if (slot.mode === 'fit') this.fitSlot(slot, true);
    }
    this.requestFrame();
  }

  toggleFollow(): void {
    const step = this.snapshot.value.displayStep - 1;
    const slots = [this.seqSlot, this.topoSlot];
    if (this.cameraMode === 'cinematic') {
      this.followSuspended.value = !this.followSuspended.value;
      if (!this.followSuspended.value) for (const slot of this.visibleSlots()) this.cinematicStep(slot, step, false, performance.now());
      return;
    }
    if (this.cameraMode !== 'follow') {
      this.cameraMode = 'follow';
      this.following.value = true;
      this.followSuspended.value = false;
    } else if (this.followSuspended.value) this.followSuspended.value = false;
    else {
      this.cameraMode = 'manual';
      this.following.value = false;
      for (const slot of slots) slot.mode = 'manual';
      return;
    }
    for (const slot of slots) slot.mode = 'follow';
    if (step >= 0) for (const slot of this.visibleSlots()) this.followStep(slot, step, performance.now());
  }

  zoom(factor: number): void {
    for (const slot of this.visibleSlots()) slot.camera.zoomBy(factor, slot.size());
    this.requestFrame();
  }

  // -- interaction ------------------------------------------------------------------------------------------------

  get playback(): Player {
    return this.player;
  }

  get layout(): SequenceLayout | undefined {
    return this.sequence?.layout;
  }

  get diagram(): CompiledDiagram | undefined {
    return this.sequence?.compiled;
  }

  /** The generic (Mermaid-rendered) drawing, when one is shown. */
  get genericDiagram(): GenericDiagram | undefined {
    return this.generic;
  }

  get hasGeneric(): boolean {
    return !!this.generic;
  }

  private elementInfo(ref: { kind: string; id: string }): { text: string; range?: DocumentRange } | undefined {
    const model = this.sequence?.compiled.sequence?.model;
    if (!model) return undefined;
    const find = (nodes: typeof model.body): { text: string; range: Rect | undefined; r?: DocumentRange } | undefined => {
      for (const n of nodes) {
        if (n.type === 'message' && n.message.id === ref.id) return { text: `${n.message.from} → ${n.message.to}: ${n.message.label}`, range: undefined, r: offsetRange(n.message.range, this.origin) };
        if (n.type === 'note' && n.note.id === ref.id) return { text: n.note.text, range: undefined, r: offsetRange(n.note.range, this.origin) };
        if (n.type === 'fragment') {
          if (n.fragment.id === ref.id) return { text: `${n.fragment.kind} ${n.fragment.label}`.trim(), range: undefined, r: offsetRange(n.fragment.range, this.origin) };
          for (const b of n.fragment.branches) {
            const hit = find(b.children);
            if (hit) return hit;
          }
        }
      }
      return undefined;
    };
    if (ref.kind === 'participant') {
      const p = model.participants.find((x) => x.id === ref.id);
      return p ? { text: p.label === p.id ? p.label : `${p.label} (${p.id})`, range: offsetRange(p.range, this.origin) } : undefined;
    }
    const hit = find(model.body);
    return hit ? { text: hit.text, range: hit.r } : undefined;
  }

  private hoverTimer: ReturnType<typeof setTimeout> | undefined;

  private hover(event: PointerEvent, kind: 'sequence' | 'topology'): void {
    if (this.morph) return;
    const ref = SequenceSvgRenderer.elementAt(event.target);
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.setCrossHighlight(ref, kind);
    // Tooltips and cards are positioned in the canvas, whichever slot the pointer is in.
    const bounds = this.container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (ref?.kind === 'edge') {
      this.tooltip.value = undefined;
      this.keepEdgeCard();
      // Keep an open card where it is while the pointer moves along the same edge.
      if (this.edgeCard.value && this.edgeCardKey === ref.id) return;
      this.hoverTimer = setTimeout(() => this.showEdgeCard(ref.id, x, y), 250);
      return;
    }
    if (this.edgeCard.value) this.hideEdgeCardSoon();
    if (!ref) {
      this.tooltip.value = undefined;
      return;
    }
    const info = this.elementInfo(ref);
    if (!info) return;
    this.hoverTimer = setTimeout(() => {
      this.tooltip.value = { x, y, text: info.text, line: info.range ? info.range.startLine + 1 : undefined };
    }, 400);
  }

  private revealElement(target: EventTarget | null): void {
    const ref = SequenceSvgRenderer.elementAt(target);
    const info = ref ? this.elementInfo(ref) : undefined;
    if (info?.range) this.host.post(webviewMessage('source/reveal', { range: info.range }));
  }

  // -- narrative & exploration ------------------------------------------------------------------------------------

  /** The pending `ask` choice that must be made before step `k` plays, if any. */
  pendingChoice(k: number): { fragmentKey: string; labels: string[] } | undefined {
    const choice = this.steps()[k]?.choice;
    return choice && this.branchChoices[choice.fragmentKey] === undefined ? choice : undefined;
  }

  /** Chooses a branch (inspector or `ask` chip): recompiles keeping the playhead on the current step. */
  async choose(fragmentKey: string, choice: BranchChoice, resume = false): Promise<void> {
    this.branchChoices = { ...this.branchChoices, [fragmentKey]: choice };
    await this.build(this.source, { preserve: true });
    this.requestFrame();
    if (resume) this.player.play();
  }

  /** Seeks to the next or previous chapter's first step (`Shift+→` / `Shift+←`). */
  chapter(direction: 1 | -1): void {
    const target = chapterTarget(this.chapters.value, this.player.restingIndex(), direction);
    if (target !== undefined) this.player.goTo(target + 1);
  }

  toggleFocus(id: string, additive: boolean): void {
    const current = this.focus.value;
    let next: Set<string>;
    if (additive) {
      next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
    } else next = current.size === 1 && current.has(id) ? new Set() : new Set([id]);
    this.focus.value = next;
    this.refreshFocus();
  }

  clearFocus(): void {
    if (!this.focus.value.size) return;
    this.focus.value = new Set();
    this.refreshFocus();
  }

  setFocusedOnly(on: boolean): void {
    this.focusedOnly.value = on;
    this.refreshFocus();
  }

  /** Recomputes the focused-playback skip set after focus, option or step-list changes. */
  private refreshFocus(): void {
    const seq = this.sequence?.compiled.sequence;
    const known = new Set(seq?.model.participants.map((p) => p.id) ?? []);
    const focus = new Set([...this.focus.value].filter((id) => known.has(id)));
    if (focus.size !== this.focus.value.size) this.focus.value = focus;
    let skip = new Set<number>();
    if (seq && this.sequence && this.focusedOnly.value && focus.size) {
      const layout = this.sequence.layout;
      const ends = new Map(layout.messages.map((m) => [m.id, [m.from, m.to] as const]));
      const notes = new Map(layout.notes.map((n) => [n.id, n.participants]));
      skip = focusSkipSet(seq.compiled.steps, focus, (step) => stepInvolves(step, ends, notes));
      // Never skip everything.
      if (skip.size === seq.compiled.steps.length) skip = new Set();
    }
    this.skipped.value = skip;
    this.player.setSkip(skip);
    this.requestFrame();
  }

  /** Highlights search matches on the canvas (`data-match`) and the scrubber. */
  setMatches(entries: readonly SearchEntry[]): void {
    this.matches = new Set(entries.flatMap((e) => (e.elementId ? [e.elementId] : [])));
    this.matchSteps.value = [...new Set(entries.flatMap((e) => (e.step === undefined ? [] : [e.step])))];
    this.applyMatches();
  }

  private applyMatches(): void {
    for (const el of [...this.viewport.querySelectorAll('[data-kind][data-id]'), ...this.topologyView.viewport.querySelectorAll('[data-kind][data-id]')]) {
      if (this.matches.has(el.getAttribute('data-id') ?? '')) el.setAttribute('data-match', 'true');
      else el.removeAttribute('data-match');
    }
  }

  /** Seeks to the step containing a document line (spec source-sync); lines outside every step are ignored. */
  seekToLine(documentLine: number): void {
    const line = documentLine - this.origin.line;
    this.cursorLine = line;
    const steps = this.steps();
    const contains = (s: Step) => s.sources.some((r) => r.startLine <= line && line <= r.endLine);
    const rest = this.player.restingIndex();
    const resting = steps[rest];
    if (resting && contains(resting)) return;
    const hit = steps.find(contains);
    if (hit) this.player.goTo(hit.index + 1);
  }

  /**
   * Rests on the step a deep link names (spec deep-links): by step id, then structural id, then the
   * nearest step to the link's 1-based step number (when given). Returns whether a step was found.
   */
  goToStepId(id: string, near?: number): boolean {
    const steps = this.steps();
    const hit = steps.find((s) => s.id === id) ?? steps.find((s) => s.structuralId === id);
    if (hit) {
      this.player.goTo(hit.index + 1);
      return true;
    }
    if (near !== undefined && steps.length) {
      this.player.goTo(Math.min(Math.max(1, near), steps.length));
      return true;
    }
    return false;
  }

  /** 1-based document line for a line of the diagram source. */
  documentLine(line: number): number {
    return line + this.origin.line + 1;
  }

  /** Reveals the current step's statement in the editor. */
  revealCurrent(): void {
    const step = this.steps()[this.snapshot.value.displayStep - 1];
    if (step) this.host.post(webviewMessage('source/reveal', { range: offsetRange(step.source, this.origin) }));
    else if (this.banner.value?.range) this.host.post(webviewMessage('source/reveal', { range: this.banner.value.range }));
  }

  revealBanner(): void {
    if (this.banner.value?.range) this.host.post(webviewMessage('source/reveal', { range: this.banner.value.range }));
  }

  /** What exports need for one view (M3): drawing source, bounds, camera, narrative and position. */
  exportMaterial(view: 'sequence' | 'topology'): ExportMaterial | undefined {
    const timeline = this.timeline();
    const steps = this.steps();
    const palette = (document.documentElement.dataset.palette ?? 'ivory') as PaletteName;
    const display = effectiveDisplay(this.settings.display, false);
    const count = this.stepCount();
    const common = {
      timeline,
      display,
      palette,
      text: {
        title: this.title.value || (this.sequence ? this.t('aria.sequence') : this.diagramType.charAt(0).toUpperCase() + this.diagramType.slice(1)),
        subtitle: this.t('presentation.subtitle', this.participants.value.length, this.chapters.value.length, count),
        captions: this.sequence ? steps.map((s) => (s.caption ? parseInline(s.caption).map((n) => n.text).join('') : undefined)) : this.genericCaptions.value.map((c) => (c ? parseInline(c).map((n) => n.text).join('') : undefined)),
        stepCount: count,
      },
      rest: this.player.restingIndex(),
      chapters: this.chapters.value,
      ab: this.snapshot.value.range,
    };
    const seq = this.sequence;
    const compiled = seq?.compiled.sequence?.compiled;
    if (seq && compiled && view === 'sequence') {
      return {
        kind: 'sequence',
        ...common,
        content: this.contentBounds(),
        view: this.camera.view,
        viewport: this.viewportSize,
        stepBounds: (k) => this.stepBounds(k),
        cinematicTarget: (k, b) => this.seqSlot.cinematicTarget(k, b),
        source: () => ({ kind: 'sequence', layout: seq.layout, compiled, timeline }),
      };
    }
    const topo = this.topologyView;
    if (seq && compiled && view === 'topology' && topo.hasLayout && topo.topology && topo.geometry) {
      const topology = topo.topology;
      const geometry = topo.geometry;
      return {
        kind: 'sequence',
        ...common,
        content: topo.content(),
        view: topo.camera.view,
        viewport: topo.size,
        stepBounds: (k) => this.topoSlot.stepBounds(k),
        cinematicTarget: (k, b) => this.topoSlot.cinematicTarget(k, b),
        source: () => ({ kind: 'topology', topology, geometry, labels: topo.labels, compiled, timeline, weight: topo.edgeWeight }),
      };
    }
    const generic = this.generic;
    if (!generic) return undefined;
    const bounds = generic.bounds;
    return {
      kind: 'generic',
      ...common,
      content: bounds,
      view: this.camera.view,
      viewport: this.viewportSize,
      stepBounds: (k) => generic.stepBounds(k),
      source: () => ({ kind: 'external', timeline }),
      externalFrame: async (t, width, height, v) => {
        const text = generic.frameSvgText(t) ?? '<svg xmlns="http://www.w3.org/2000/svg"/>';
        this.requestFrame();
        const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
        try {
          const image = new Image();
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('A frame could not be rasterised.'));
            image.src = url;
          });
          const canvas = new OffscreenCanvas(width, height);
          const ctx = canvas.getContext('2d')!;
          ctx.setTransform(v.k, 0, 0, v.k, v.x, v.y);
          ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h);
          return canvas.transferToImageBitmap();
        } finally {
          URL.revokeObjectURL(url);
        }
      },
    };
  }

  /** The drawing's content box, for export. */
  exportBounds(): Rect {
    const content = this.contentBounds();
    return unionRects([content]) ?? content;
  }

  /** Re-lays out with extra width for exported SVGs (spec §14.4) and returns a detached drawing. */
  exportDrawing(widthFactor: number): { svg: SVGSVGElement; width: number; height: number } | undefined {
    if (this.generic) return this.generic.exportDrawing(this.player.time);
    if (!this.sequence) return undefined;
    const { compiled } = this.sequence;
    const seq = compiled.sequence!;
    const layout = layoutSequence(seq.model, seq.compiled, { measure: this.measure, widthFactor, mirrorActors: !/mirrorActors["']?\s*:\s*false/.test(this.source) });
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ma-svg');
    const g = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(g);
    const renderer = new SequenceSvgRenderer(g);
    renderer.mount(layout);
    const display = effectiveDisplay(this.settings.display, false);
    renderer.render(sceneAt(prepareScene(layout, seq.compiled, seq.timeline), this.player.time, { ...display, indicator: 'none' }));
    return { svg, width: layout.width, height: layout.height };
  }

  get fileStem(): string {
    return this.sequence?.compiled.id ?? '';
  }

  destroy(): void {
    if (this.cardTimer) clearTimeout(this.cardTimer);
    if (this.edgeCardTimer) clearTimeout(this.edgeCardTimer);
    this.topologyView.destroy();
    this.resizeObserver.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.generic?.destroy();
  }
}

export { stepEnd };
