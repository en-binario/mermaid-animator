import '@mermaid-animator/renderer/tokens.css';
import '@mermaid-animator/renderer/diagram.css';
import './styles/app.css';
import { render } from 'preact';
import { effect, signal } from '@preact/signals';
import { resolvePalette } from '@mermaid-animator/renderer';
import { PROTOCOL_VERSION, WEBVIEW_STRINGS, webviewMessage, type CommandAction, type ExportFormat, type HostMessage } from '@mermaid-animator/protocol';
import { buildJob, runJob, type AnimatedOptions, type ExportHandle } from './animated/exporter';
import type { AnimatedSvgRequest } from './animated/svgExport';
import { exportPalette, playerPalette, type PlayerTheme } from './animated/theme';
import { App, type ExportAction, type UiState } from './App';
import type { InspectorSection } from './Inspector';
import { DiagramController } from './controller';
import { Host } from './host';
import { SPEEDS } from './player';
import { format, initialHostState, reduce, resolveReduceMotion, type HostState } from './state';

const host = new Host();
const hostState = signal<HostState>(initialHostState);
const controller = signal<DiagramController | undefined>(undefined);
const osReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const osPrefersReduced = signal(osReducedMotion.matches);
osReducedMotion.addEventListener('change', (e) => (osPrefersReduced.value = e.matches));

const t = (key: string, ...args: (string | number)[]) => format({ ...WEBVIEW_STRINGS, ...hostState.value.strings }, key, ...args);
const reducedMotion = () => resolveReduceMotion(hostState.value.reduceMotionPreference, osPrefersReduced.value);

// -- transient UI state -------------------------------------------------------------------------------------
/** UI preferences persisted with the panel's webview state (survive hide/show and reload). */
interface PersistedUi {
  sections?: InspectorSection[];
  inspectorWide?: boolean;
}
interface PanelState {
  uri?: string;
  diagramIndex?: number;
  ui?: PersistedUi;
}
const persisted: PersistedUi = host.getState<PanelState>()?.ui ?? {};
const WIDE = 880;
const uiFlags = signal<Omit<UiState, 'set'>>({
  shortcuts: false,
  exportMenu: false,
  goTo: false,
  speedMenu: false,
  zoomMenu: false,
  themeMenu: false,
  wide: window.innerWidth >= WIDE,
  inspectorWide: persisted.inspectorWide ?? true,
  inspectorSheet: false,
  sections: persisted.sections ?? [],
  search: false,
  transcript: false,
  presenting: false,
  titleCard: false,
  blank: false,
  laser: false,
  idle: false,
});
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let inspectorPreference = persisted.inspectorWide !== undefined;
function setUi(patch: Partial<Omit<UiState, 'set'>>): void {
  const before = uiFlags.value;
  uiFlags.value = { ...before, ...patch };
  if (patch.sections !== undefined || patch.inspectorWide !== undefined) {
    if (patch.inspectorWide !== undefined) inspectorPreference = true;
    const next = uiFlags.value;
    host.setState({ ...(host.getState<PanelState>() ?? {}), ui: { sections: next.sections, inspectorWide: next.inspectorWide } });
  }
}
new ResizeObserver(() => {
  const wide = window.innerWidth >= WIDE;
  if (wide !== uiFlags.value.wide) setUi({ wide, inspectorSheet: false });
}).observe(document.documentElement);

/** `D`: toggles the inspector beside the canvas on wide panels, or as an overlay sheet on narrow ones. */
function toggleInspector(): void {
  const ui = uiFlags.value;
  if (ui.wide) setUi({ inspectorWide: !ui.inspectorWide });
  else setUi({ inspectorSheet: !ui.inspectorSheet });
}

// -- presentation -------------------------------------------------------------------------------------------------
let titleTimer: ReturnType<typeof setTimeout> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function armIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (uiFlags.value.idle) setUi({ idle: false });
  idleTimer = setTimeout(() => uiFlags.value.presenting && setUi({ idle: true }), 2000);
}

function startPresentation(): void {
  const c = controller.value;
  if (!c || uiFlags.value.presenting) return;
  setUi({ presenting: true, titleCard: true, blank: false, laser: false, inspectorSheet: false, search: false, transcript: false, shortcuts: false, exportMenu: false, goTo: false, speedMenu: false, zoomMenu: false, themeMenu: false });
  c.setPresenting(true);
  host.post(webviewMessage('presentation/toggle', { on: true }));
  if (titleTimer) clearTimeout(titleTimer);
  titleTimer = setTimeout(() => setUi({ titleCard: false }), 1600);
  armIdle();
}

function stopPresentation(notifyHost = true): void {
  if (!uiFlags.value.presenting) return;
  if (titleTimer) clearTimeout(titleTimer);
  if (idleTimer) clearTimeout(idleTimer);
  setUi({ presenting: false, titleCard: false, blank: false, laser: false, idle: false });
  controller.value?.setPresenting(false);
  if (notifyHost) host.post(webviewMessage('presentation/toggle', { on: false }));
}

function togglePresentation(): void {
  if (uiFlags.value.presenting) stopPresentation();
  else startPresentation();
}

window.addEventListener('pointermove', () => {
  if (uiFlags.value.presenting) armIdle();
});

// Default inspector visibility follows `display.showInspector` until the user toggles it.
effect(() => {
  const c = controller.value;
  const show = c?.effective.value.showInspector;
  if (show !== undefined && !inspectorPreference && show !== uiFlags.value.inspectorWide) uiFlags.value = { ...uiFlags.value, inspectorWide: show };
});
function toast(text: string): void {
  setUi({ toast: text });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUi({ toast: undefined }), 2400);
}

// -- theme & reduced motion -------------------------------------------------------------------------------------
effect(() => {
  const state = hostState.value;
  const root = document.documentElement;
  root.dataset.palette = resolvePalette(state.settings.themeMode, state.themeKind);
  root.dataset.reducedMotion = String(resolveReduceMotion(state.reduceMotionPreference, osPrefersReduced.value));
  if (state.locale) root.lang = state.locale;
});

effect(() => {
  const doc = hostState.value.document;
  if (doc) host.setState({ ...(host.getState<PanelState>() ?? {}), uri: doc.uri, diagramIndex: doc.diagramIndex ?? 0 });
});

window.addEventListener('error', (event) => host.log('error', `${event.message} (${event.filename}:${event.lineno})`));
window.addEventListener('unhandledrejection', (event) => host.log('error', `Unhandled rejection: ${String(event.reason)}`));

// -- export ------------------------------------------------------------------------------------------------------
const CHUNK = 8 * 1024 * 1024;

function fileStem(): string {
  const doc = hostState.value.document;
  const stem = controller.value?.fileStem || (doc?.fileName ?? 'diagram').replace(/\.[^.]+$/, '');
  const index = doc?.diagrams && doc.diagrams.length > 1 ? `-${(doc.diagramIndex ?? 0) + 1}` : '';
  return `${stem}${index}`;
}

function suggestedName(ext: string): string {
  return `${fileStem()}.${ext}`;
}

function sendFile(format: ExportFormat, name: string, bytes: Uint8Array, pair?: 'light' | 'dark'): void {
  const total = Math.max(1, Math.ceil(bytes.length / CHUNK));
  for (let i = 0; i < total; i++) host.post(webviewMessage('export/data', { format, suggestedName: name, data: bytes.slice(i * CHUNK, (i + 1) * CHUNK), index: i, total, ...(pair ? { pair } : {}) }));
}

// -- animated exports (M3) ---------------------------------------------------------------------------------------
/** Progress of the running animated export, for the sheet. */
const animatedProgress = signal<{ fraction: number; phase: string } | undefined>(undefined);
let animatedHandle: ExportHandle | undefined;

async function runAnimated(options: AnimatedOptions): Promise<{ bytes: Uint8Array; mime: string; frames: number } | undefined> {
  const c = controller.value;
  if (!c || animatedHandle) return undefined;
  let twin: Awaited<ReturnType<DiagramController['exportTwin']>>;
  try {
    twin = await c.exportTwin(exportPalette(options.theme, c.activePalette));
  } catch (error) {
    toast(t('export.failed', String((error as Error)?.message ?? error)));
    host.log('error', `Animated export failed: ${String(error)}`);
    return undefined;
  }
  const material = c.exportMaterial(options.view, twin);
  if (!material) {
    twin?.destroy();
    return undefined;
  }
  const { EMBEDDED_FONTS, dataUrlBytes } = await import('./export');
  const fonts = EMBEDDED_FONTS.map((f) => ({ family: f.family, data: dataUrlBytes(f.url), unicodeRange: f.unicodeRange }));
  const job = buildJob(material, options, fonts);
  animatedProgress.value = { fraction: 0, phase: 'frames' };
  host.post(webviewMessage('export/progress', { fraction: 0, phase: 'frames' }));
  let lastPosted = 0;
  const handle = runJob(job, material, {
    onProgress: (fraction, phase) => {
      animatedProgress.value = { fraction, phase };
      if (fraction - lastPosted >= 0.02 || fraction >= 1) {
        lastPosted = fraction;
        host.post(webviewMessage('export/progress', { fraction, phase }));
      }
    },
  });
  animatedHandle = handle;
  try {
    const result = await handle.result;
    if (!result) {
      host.post(webviewMessage('export/cancelled', {}));
      return undefined;
    }
    sendFile(options.format, suggestedName(options.format), result.bytes);
    return result;
  } catch (error) {
    host.post(webviewMessage('export/cancelled', {}));
    toast(t('export.failed', String((error as Error)?.message ?? error)));
    host.log('error', `Animated export failed: ${String(error)}`);
    return undefined;
  } finally {
    twin?.destroy();
    animatedHandle = undefined;
    animatedProgress.value = undefined;
  }
}

/** Animated SVG (spec animated-svg-export): one GitHub-safe file or a light/dark pair. Returns the byte sizes. */
async function runAnimatedSvg(request: AnimatedSvgRequest): Promise<number[] | undefined> {
  const c = controller.value;
  if (!c) return undefined;
  let twin: Awaited<ReturnType<DiagramController['exportTwin']>>;
  try {
    const { compileAnimatedSvg, animatedSvgNames, svgVariant } = await import('./animated/svgExport');
    // A fixed theme draws a generic diagram from a rendering in that palette (spec export-theme).
    if (request.theme !== 'current') twin = await c.exportTwin(exportPalette(request.theme, c.activePalette));
    const material = c.exportMaterial(request.view, twin);
    if (!material) return undefined;
    const files = await compileAnimatedSvg(material, request, twin ?? c.genericDiagram);
    if (!files) return undefined;
    const pair = svgVariant(request).pair;
    const names = animatedSvgNames(fileStem(), pair);
    const encoder = new TextEncoder();
    const sizes: number[] = [];
    files.forEach((file, i) => {
      const bytes = encoder.encode(file.text);
      sizes.push(bytes.length);
      sendFile('svg', names[i]!, bytes, pair ? (i === 0 ? 'light' : 'dark') : undefined);
    });
    c.requestFrame();
    return sizes;
  } catch (error) {
    toast(t('export.failed', String((error as Error)?.message ?? error)));
    host.log('error', `Animated SVG export failed: ${String(error)}`);
    return undefined;
  } finally {
    twin?.destroy();
  }
}

/** HTML player (spec html-player): the webview builds the data; the host inlines the player bundle. */
async function runPlayer(theme: PlayerTheme, view: 'sequence' | 'topology' | 'split'): Promise<string | undefined> {
  const c = controller.value;
  if (!c) return undefined;
  let twin: Awaited<ReturnType<DiagramController['exportTwin']>>;
  try {
    const { buildPlayerData } = await import('./animated/playerExport');
    // A fixed theme embeds a generic drawing rendered in that palette; `auto` keeps the panel's.
    if (theme !== 'auto') twin = await c.exportTwin(playerPalette(theme, false));
    const data = await buildPlayerData(c, theme, view, twin);
    if (!data) return undefined;
    host.post(webviewMessage('export/player', { suggestedName: suggestedName('html'), title: c.title.value || fileStem(), data, theme }));
    return data;
  } catch (error) {
    toast(t('export.failed', String((error as Error)?.message ?? error)));
    host.log('error', `Player export failed: ${String(error)}`);
    return undefined;
  } finally {
    twin?.destroy();
  }
}

function cancelAnimated(): void {
  animatedHandle?.cancel();
}

async function runExport(action: ExportAction): Promise<void> {
  const c = controller.value;
  if (!c) return;
  let twin: Awaited<ReturnType<DiagramController['exportTwin']>>;
  try {
    const { serializeSvg, rasterize, exportSize, copyPng } = await import('./export');
    // The sheet's theme, or `export.theme` for the direct commands (spec export-theme).
    const palette = exportPalette(action.theme ?? c.effective.value.exportDefaults.theme, c.activePalette);
    twin = await c.exportTwin(palette);
    const drawing = c.exportDrawing(1.08, twin);
    if (!drawing) return;
    const size = exportSize(drawing);
    const transparent = action.kind === 'png' && action.transparent;
    const svg = serializeSvg(drawing, { background: transparent ? 'transparent' : 'theme', palette });
    if (action.kind === 'svg') {
      sendFile('svg', suggestedName('svg'), new TextEncoder().encode(svg));
    } else if (action.kind === 'png') {
      const blob = await rasterize(svg, size.width, size.height, action.scale);
      sendFile('png', suggestedName('png'), new Uint8Array(await blob.arrayBuffer()));
    } else {
      try {
        await copyPng(rasterize(svg, size.width, size.height, 2));
        toast(t('export.copied'));
      } catch (error) {
        host.post(webviewMessage('clipboard/fallback', { reason: String((error as Error)?.message ?? error) }));
      }
    }
  } catch (error) {
    toast(t('export.failed', String((error as Error)?.message ?? error)));
    host.log('error', `Export failed: ${String(error)}`);
  } finally {
    twin?.destroy();
  }
}

// -- commands & keyboard -----------------------------------------------------------------------------------------
function command(action: CommandAction, args?: Record<string, unknown>): void {
  const c = controller.value;
  if (!c) return;
  const p = c.playback;
  switch (action) {
    case 'togglePlay':
      return p.toggle();
    case 'play':
      return p.play();
    case 'pause':
      return p.pause();
    case 'next':
      return p.next();
    case 'previous':
      return p.previous();
    case 'first':
      return p.first();
    case 'last':
      return p.last();
    case 'goToStep':
      if (typeof args?.step === 'number') p.goTo(args.step);
      else setUi({ goTo: true });
      return;
    case 'goToStepId':
      if (typeof args?.id === 'string') c.goToStepId(args.id, typeof args.near === 'number' ? args.near : undefined);
      return;
    case 'export':
      return setUi({ exportMenu: true, exportFormat: typeof args?.format === 'string' ? args.format : undefined, exportStart: args?.start === true });
    case 'exportSvg':
      void runExport({ kind: 'svg' });
      return;
    case 'exportPng':
      void runExport({ kind: 'png', scale: typeof args?.scale === 'number' ? args.scale : 2, transparent: args?.transparent === true });
      return;
    case 'copyImage':
      void runExport({ kind: 'copy' });
      return;
    case 'revealSource':
      return c.revealCurrent();
    case 'fit':
      return c.fit();
    case 'seekToLine':
      if (typeof args?.line === 'number') c.seekToLine(args.line);
      return;
    case 'nextChapter':
      return c.chapter(1);
    case 'previousChapter':
      return c.chapter(-1);
    case 'toggleTranscript':
      return setUi({ transcript: !uiFlags.value.transcript });
    case 'toggleInspector':
      return toggleInspector();
    case 'search':
      return setUi({ search: true });
    case 'startPresentation':
      return startPresentation();
    case 'stopPresentation':
      return stopPresentation();
    case 'setView':
      if (args?.view === 'sequence' || args?.view === 'topology' || args?.view === 'split') void c.setView(args.view);
      return;
    case 'toggleView':
      return c.toggleView();
    case 'resetLayout':
      return c.resetLayout();
    case 'saveLayout':
      void c
        .sidecarLayout()
        .then((layout) => {
          if (layout) host.post(webviewMessage('sidecar/write', { patch: { layout } }));
          else toast(t('sidecar.noLayout'));
        })
        .catch((error: unknown) => host.post(webviewMessage('log', { level: 'error', message: `Save Topology Layout failed: ${String((error as Error)?.stack ?? error)}` })));
      return;
    case 'saveDefaults':
      host.post(webviewMessage('sidecar/write', { patch: { settings: c.sidecarDefaults() } }));
      return;
  }
}

function markRange(bound: 'from' | 'to'): void {
  const p = controller.value?.playback;
  if (!p) return;
  p.markRange(bound);
  const range = p.snapshot().range;
  if (range?.from !== undefined && range.to !== undefined) toast(t('range.set', range.from + 1, range.to + 1));
  else if (range?.from !== undefined) toast(t('range.from', range.from + 1));
}

window.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'z' && uiFlags.value.laser) setUi({ laser: false });
});

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
  const c = controller.value;
  const ui = uiFlags.value;
  // Ctrl/Cmd+F opens search; every other chord is left to editor keybindings.
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey) {
    if (c?.stepList.value.length) {
      e.preventDefault();
      setUi({ search: true });
    }
    return;
  }
  if (e.ctrlKey || e.metaKey) return;
  if (e.key === 'Escape') {
    const overlays = ui.shortcuts || ui.exportMenu || ui.goTo || ui.speedMenu || ui.zoomMenu || ui.themeMenu || ui.search || ui.inspectorSheet;
    if (overlays) setUi({ shortcuts: false, exportMenu: false, goTo: false, speedMenu: false, zoomMenu: false, themeMenu: false, search: false, inspectorSheet: false });
    else if (ui.presenting) stopPresentation();
    else c?.clearFocus();
    return;
  }
  if (!c) return;
  const p = c.playback;
  // Any key dismisses the presentation cards, then acts as usual (spec presentation-mode).
  if (ui.presenting && ui.titleCard) setUi({ titleCard: false });
  if (ui.presenting && c.chapterCard.value && e.key !== 'Shift') c.dismissChapterCard();
  if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    c.chapter(e.key === 'ArrowRight' ? 1 : -1);
    return;
  }
  if (e.shiftKey && (e.key === 'I' || e.key === 'O')) {
    e.preventDefault();
    p.clearRange();
    toast(t('range.cleared'));
    return;
  }
  const speedStep = (dir: number) => {
    const i = SPEEDS.indexOf(p.snapshot().speed as (typeof SPEEDS)[number]);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 3 : i) + dir))];
    if (next) p.setSpeed(next);
  };
  const presenting = ui.presenting;
  const handled: Record<string, () => void> = {
    ' ': () => (presenting ? p.next() : p.toggle()),
    k: () => p.toggle(),
    ArrowRight: () => p.next(),
    ArrowLeft: () => p.previous(),
    PageDown: () => p.next(),
    PageUp: () => p.previous(),
    Home: () => p.first(),
    End: () => p.last(),
    g: () => setUi({ goTo: true }),
    '[': () => speedStep(-1),
    ']': () => speedStep(1),
    l: () => p.setOptions({ loop: !p.snapshot().loop }),
    '+': () => c.zoom(1.2),
    '=': () => c.zoom(1.2),
    '-': () => c.zoom(1 / 1.2),
    '0': () => c.fit(),
    f: () => c.frameStep(),
    c: () => c.toggleFollow(),
    e: () => setUi({ exportMenu: !ui.exportMenu }),
    '?': () => setUi({ shortcuts: !ui.shortcuts }),
    i: () => markRange('from'),
    o: () => markRange('to'),
    d: () => toggleInspector(),
    r: () => c.stepList.value.length && setUi({ transcript: !ui.transcript }),
    '/': () => c.stepList.value.length && setUi({ search: true }),
    p: () => togglePresentation(),
    t: () => c.toggleView(),
    s: () => c.toggleSplit(),
    ...(presenting
      ? {
          b: () => setUi({ blank: !ui.blank }),
          '.': () => setUi({ blank: !ui.blank }),
          z: () => !e.repeat && setUi({ laser: true }),
        }
      : {}),
  };
  const action = handled[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? handled[e.key];
  if (!action) return;
  if (e.key === ' ' && target?.tagName === 'BUTTON') return; // let the focused button activate
  e.preventDefault();
  action();
});

// -- host messages ----------------------------------------------------------------------------------------------
let pendingLoad: HostMessage | undefined;

function handle(message: HostMessage): void {
  const before = hostState.value;
  hostState.value = reduce(before, message);
  const c = controller.value;
  switch (message.type) {
    case 'document/load':
      if (!c) pendingLoad = message;
      else void c.load(message.payload.source, message.payload.origin, hostState.value.settings, reducedMotion(), message.payload.layout, message.payload.sidecar);
      break;
    case 'document/update':
      if (message.payload.unbound) c?.markUnbound();
      else if (message.payload.sidecar) void c?.applySidecar(message.payload.sidecar, message.payload.source, message.payload.origin);
      else void c?.update(message.payload.source, message.payload.origin);
      break;
    case 'settings/changed':
      c?.applySettings(hostState.value.settings, reducedMotion());
      break;
    case 'command':
      command(message.payload.action, message.payload.args);
      break;
    case 'editor/cursor':
      c?.setCursor(message.payload.line);
      break;
    case 'export/cancel':
      cancelAnimated();
      break;
    case 'export/ack':
      toast(t('export.done', message.payload.path.split(/[\\/]/).pop() ?? message.payload.path));
      break;
    case 'presentation/state':
      // The host left the presentation layout by other means (or refused it): follow.
      if (!message.payload.on) stopPresentation(false);
      break;
    case 'init':
      break;
  }
}

host.listen(handle);

// Harness-only hook for verifying exports (the harness defines window.harness; VS Code never does).
if ((window as unknown as { harness?: unknown }).harness) {
  (window as unknown as { __ma: unknown }).__ma = { controller: () => controller.value, runAnimated, runAnimatedSvg, runPlayer, cancelAnimated, progress: animatedProgress, verify: () => import('./animated/verify') };
}

function mountCanvas(el: HTMLElement): void {
  if (controller.value) return;
  const c = new DiagramController(el, host, t);
  controller.value = c;
  if (pendingLoad?.type === 'document/load') {
    const { source, origin, layout, sidecar } = pendingLoad.payload;
    pendingLoad = undefined;
    void c.load(source, origin, hostState.value.settings, reducedMotion(), layout, sidecar);
  }
}

function AppRoot() {
  const ui: UiState = { ...uiFlags.value, set: setUi };
  return (
    <App
      state={hostState.value}
      controller={controller.value}
      mountCanvas={mountCanvas}
      onSelectDiagram={(index) => host.post(webviewMessage('diagram/select', { index }))}
      onExport={(a) => void runExport(a)}
      sheetActions={{
        animated: (o) => runAnimated(o),
        animatedSvg: (r) => runAnimatedSvg(r),
        player: (theme, view) => runPlayer(theme, view),
        still: (kind, o) => runExport(kind === 'png' ? { kind: 'png', scale: o.scale, transparent: o.transparent, theme: o.theme } : kind === 'svg' ? { kind: 'svg', theme: o.theme } : { kind: 'copy', theme: o.theme }),
        cancel: () => cancelAnimated(),
        progress: animatedProgress.value,
      }}
      onTogglePresentation={togglePresentation}
      onToggleInspector={toggleInspector}
      onOpenSettings={() => host.post(webviewMessage('settings/open', {}))}
      onSetTheme={(message) => host.post(message)}
      reducedMotion={reducedMotion()}
      ui={ui}
    />
  );
}

const container = document.getElementById('app');
if (container) render(<AppRoot />, container);

host.post(webviewMessage('ready', { protocol: PROTOCOL_VERSION }));
