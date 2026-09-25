/**
 * Drives one diagram in the webview: compile → layout → scene → renderer, the playback clock,
 * the camera, live reload with position preservation, and state reporting to the host.
 */
import { signal } from '@preact/signals';
import {
  compileDiagram, layoutSequence, offsetRange, resolvePosition, stepEnd, unionRects,
  type CompiledDiagram, type Diagnostic, type Rect, type SequenceLayout, type Step,
} from '@mermaid-animator/core';
import { webviewMessage, type DocumentRange, type WebviewSettings } from '@mermaid-animator/protocol';
import { createCanvasMeasure, effectiveDisplay, prepareScene, sceneAt, SequenceSvgRenderer, SVG_NS, type SceneModel } from '@mermaid-animator/renderer';
import { announcement } from './announce';
import { autoFits, Camera, fitView, followView, type Viewport } from './camera';
import { Player, type PlayerSnapshot } from './player';
import { resolveSettings, type AnimatorSettings } from './settings';
import type { Host } from './host';
import { GenericDiagram } from './fallback';
import { chooseEngine } from './engine';

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

  private readonly measure = createCanvasMeasure();
  private readonly camera: Camera;
  private readonly player: Player;
  private sequence?: { compiled: CompiledDiagram; layout: SequenceLayout; scene: SceneModel; renderer: SequenceSvgRenderer };
  private generic?: GenericDiagram;
  private settings: AnimatorSettings = resolveSettings({ themeMode: 'auto' });
  private hostSettings: WebviewSettings = { themeMode: 'auto' };
  private reducedMotion = false;
  private origin = { line: 0, character: 0 };
  private source = '';
  private cursorLine: number | undefined;
  private frame = 0;
  private lastFrame = 0;
  private lastStep = -2;
  private lastAnnounced = -2;
  private cameraMode: 'fit' | 'follow' | 'manual' = 'fit';
  private viewportSize: Viewport = { width: 800, height: 600 };
  private readonly resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    private readonly host: Host,
    private readonly t: Translate,
  ) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'ma-svg');
    this.svg.setAttribute('role', 'img');
    this.viewport = document.createElementNS(SVG_NS, 'g');
    this.viewport.setAttribute('class', 'ma-viewport');
    this.svg.appendChild(this.viewport);
    container.appendChild(this.svg);

    this.player = new Player(EMPTY_TIMELINE, { speed: 1, loop: false, onEnd: 'stop', reverse: 'animate', snap: true });
    this.player.subscribe((s) => {
      this.snapshot.value = s;
      this.requestFrame();
    });
    this.camera = new Camera(this.svg, this.viewport, {
      onUserMove: () => {
        if (this.cameraMode === 'follow') this.followSuspended.value = true;
      },
      onChange: () => undefined,
    });

    this.resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      this.viewportSize = { width: rect.width, height: rect.height };
      if (this.cameraMode === 'fit') this.fit(false);
    });
    this.resizeObserver.observe(container);
    const rect = container.getBoundingClientRect();
    this.viewportSize = { width: rect.width || 800, height: rect.height || 600 };

    document.addEventListener('visibilitychange', () => this.player.hold('hidden', document.visibilityState === 'hidden'));
    this.svg.addEventListener('pointerenter', () => this.player.hold('hover', this.settings.pauseOnHover));
    this.svg.addEventListener('pointerleave', () => {
      this.player.hold('hover', false);
      this.tooltip.value = undefined;
    });
    this.svg.addEventListener('pointermove', (event) => this.hover(event));
    this.svg.addEventListener('dblclick', (event) => {
      if (event.altKey) this.revealElement(event.target);
    });
  }

  // -- loading -------------------------------------------------------------------------------------------------

  async load(source: string, origin: { line: number; character: number }, settings: WebviewSettings, reducedMotion: boolean): Promise<void> {
    await document.fonts?.ready;
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

  /** Compiles and mounts; on errors keeps the last good drawing and shows a banner. Returns success. */
  private async build(source: string, { preserve }: { preserve: boolean }): Promise<boolean> {
    const previousSteps = this.steps();
    const previousIndex = this.snapshot.value.displayStep - 1;
    const compiled = compileDiagram(source, {});
    this.settings = resolveSettings(this.hostSettings, compiled.settings);
    const recompiled = compileDiagram(source, { notes: this.settings.notes, dwell: this.settings.dwell, dwellMs: this.settings.dwellMs });
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
      this.banner.value = undefined;
      this.notice.value = undefined;
      this.stale.value = false;
      this.describe(recompiled);
      if (preserve) {
        const restIndex = resolvePosition(previousSteps, previousIndex, steps.steps, this.cursorLine);
        this.player.setTimeline(timeline, restIndex);
      }
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
    if (preserve) this.player.setTimeline(this.generic.timeline, Math.min(previousIndex, this.generic.stepCount - 1));
    return true;
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
    this.stepLabels.value = seq.compiled.steps.map((s) => (s.kind === 'message' ? `${s.from} → ${s.to}: ${s.label}` : s.label).replace(/\n/g, ' '));
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
    const cameraMoving = this.camera.tick(now, this.viewportSize);
    // Release the playhead once the camera has brought the step into view.
    if (!cameraMoving && this.player.waitingForCamera) this.player.hold('camera', false);
    const advancing = this.player.isActive ? this.player.tick(dt) : false;
    this.render(now);
    if (advancing || cameraMoving || this.player.isActive || this.player.waitingForCamera) this.requestFrame();
    else this.lastFrame = 0;
  }

  private render(now: number): void {
    const time = this.player.time;
    if (this.sequence) {
      const display = effectiveDisplay(this.settings.display, this.reducedMotion && this.settings.respectReducedMotion);
      const scene = sceneAt(this.sequence.scene, time, display);
      this.sequence.renderer.render(scene, { comet: display.indicator === 'comet' });
    } else this.generic?.renderAt(time, this.reducedMotion);
    const step = this.snapshot.value.displayStep - 1;
    if (step !== this.lastStep) {
      const forward = step > this.lastStep;
      this.lastStep = step;
      this.onStepChanged(step, forward, now);
    }
  }

  private onStepChanged(step: number, forward: boolean, now: number): void {
    const steps = this.steps();
    const count = this.stepCount();
    const current = steps[step];
    const ranges = (current?.sources ?? []).map((r) => offsetRange(r, this.origin));
    this.host.post(webviewMessage('state/changed', { stepIndex: step, stepCount: count, playing: this.snapshot.value.playing, sourceRanges: ranges }));
    if (this.snapshot.value.speed <= 2 && step !== this.lastAnnounced) {
      this.lastAnnounced = step;
      const participants = this.sequence?.compiled.sequence?.model.participants ?? [];
      this.live.value = this.sequence ? announcement(current, step, count, participants, this.t) : this.t('announce.step', step + 1, count);
    }
    if (this.cameraMode === 'follow' && !this.followSuspended.value && step >= 0 && forward) this.followStep(step, now);
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
    const content = this.contentBounds();
    this.cameraMode = mode === 'auto' ? (autoFits(content, this.viewportSize) ? 'fit' : 'follow') : mode;
    this.following.value = this.cameraMode === 'follow';
    if (this.cameraMode === 'fit' || (initial && this.cameraMode === 'manual')) this.fit(false);
    else if (initial) {
      // Follow: start at the top, as wide as fits (never enlarged).
      const k = Math.min(1, (this.viewportSize.width - 48) / content.w);
      this.camera.moveTo({ k, x: this.viewportSize.width / 2 - (content.x + content.w / 2) * k, y: 24 - content.y * k }, { animate: false, viewport: this.viewportSize, now: performance.now() });
    }
  }

  fit(animate = true): void {
    const view = fitView(this.contentBounds(), this.viewportSize);
    this.camera.moveTo(view, { animate: animate && !this.reducedMotion, viewport: this.viewportSize, now: performance.now() });
    this.requestFrame();
  }

  frameStep(): void {
    const step = this.snapshot.value.displayStep - 1;
    const bounds = step >= 0 ? this.stepBounds(step) : this.contentBounds();
    if (!bounds) return;
    const padded = { x: bounds.x - 48, y: bounds.y - 48, w: bounds.w + 96, h: bounds.h + 96 };
    this.camera.moveTo(fitView(padded, this.viewportSize, 0, 2.5), { animate: !this.reducedMotion, viewport: this.viewportSize, now: performance.now(), speed: this.snapshot.value.speed });
    this.requestFrame();
  }

  private followStep(step: number, now: number): void {
    const bounds = this.stepBounds(step);
    if (!bounds) return;
    const next = followView(this.camera.view, bounds, this.viewportSize);
    if (!next) return;
    const animate = !this.reducedMotion;
    this.camera.moveTo(next, { animate, viewport: this.viewportSize, now, speed: this.snapshot.value.speed });
    // Hold the playhead at the step's start until the camera arrives (spec camera: in view before drawing).
    if (animate) this.player.hold('camera', true);
    this.requestFrame();
  }

  toggleFollow(): void {
    if (this.cameraMode !== 'follow') {
      this.cameraMode = 'follow';
      this.following.value = true;
      this.followSuspended.value = false;
    } else if (this.followSuspended.value) this.followSuspended.value = false;
    else {
      this.cameraMode = 'manual';
      this.following.value = false;
      return;
    }
    const step = this.snapshot.value.displayStep - 1;
    if (step >= 0) this.followStep(step, performance.now());
  }

  zoom(factor: number): void {
    this.camera.zoomBy(factor, this.viewportSize);
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

  private hover(event: PointerEvent): void {
    const ref = SequenceSvgRenderer.elementAt(event.target);
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    if (!ref) {
      this.tooltip.value = undefined;
      return;
    }
    const info = this.elementInfo(ref);
    if (!info) return;
    const bounds = this.svg.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    this.hoverTimer = setTimeout(() => {
      this.tooltip.value = { x, y, text: info.text, line: info.range ? info.range.startLine + 1 : undefined };
    }, 400);
  }

  private revealElement(target: EventTarget | null): void {
    const ref = SequenceSvgRenderer.elementAt(target);
    const info = ref ? this.elementInfo(ref) : undefined;
    if (info?.range) this.host.post(webviewMessage('source/reveal', { range: info.range }));
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
    this.resizeObserver.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.generic?.destroy();
  }
}

export { stepEnd };
