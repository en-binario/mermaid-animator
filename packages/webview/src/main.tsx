import '@mermaid-animator/renderer/tokens.css';
import '@mermaid-animator/renderer/diagram.css';
import './styles/app.css';
import { render } from 'preact';
import { effect, signal } from '@preact/signals';
import { resolvePalette } from '@mermaid-animator/renderer';
import { PROTOCOL_VERSION, WEBVIEW_STRINGS, webviewMessage, type CommandAction, type HostMessage } from '@mermaid-animator/protocol';
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
  setUi({ presenting: true, titleCard: true, blank: false, laser: false, inspectorSheet: false, search: false, transcript: false, shortcuts: false, exportMenu: false, goTo: false, speedMenu: false });
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

function suggestedName(ext: string): string {
  const doc = hostState.value.document;
  const stem = controller.value?.fileStem || (doc?.fileName ?? 'diagram').replace(/\.[^.]+$/, '');
  const index = doc?.diagrams && doc.diagrams.length > 1 ? `-${(doc.diagramIndex ?? 0) + 1}` : '';
  return `${stem}${index}.${ext}`;
}

function sendFile(format: 'svg' | 'png', name: string, bytes: Uint8Array): void {
  const total = Math.max(1, Math.ceil(bytes.length / CHUNK));
  for (let i = 0; i < total; i++) host.post(webviewMessage('export/data', { format, suggestedName: name, data: bytes.slice(i * CHUNK, (i + 1) * CHUNK), index: i, total }));
}

async function runExport(action: ExportAction): Promise<void> {
  const c = controller.value;
  if (!c) return;
  try {
    const { serializeSvg, rasterize, exportSize, copyPng } = await import('./export');
    const drawing = c.exportDrawing(1.08);
    if (!drawing) return;
    const size = exportSize(drawing);
    const transparent = action.kind === 'png' && action.transparent;
    const svg = serializeSvg(drawing, { background: transparent ? 'transparent' : 'theme' });
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
    case 'export':
      return setUi({ exportMenu: true });
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
    const overlays = ui.shortcuts || ui.exportMenu || ui.goTo || ui.speedMenu || ui.search || ui.inspectorSheet;
    if (overlays) setUi({ shortcuts: false, exportMenu: false, goTo: false, speedMenu: false, search: false, inspectorSheet: false });
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
      else void c.load(message.payload.source, message.payload.origin, hostState.value.settings, reducedMotion());
      break;
    case 'document/update':
      if (message.payload.unbound) c?.markUnbound();
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

function mountCanvas(el: HTMLElement): void {
  if (controller.value) return;
  const c = new DiagramController(el, host, t);
  controller.value = c;
  if (pendingLoad?.type === 'document/load') {
    const { source, origin } = pendingLoad.payload;
    pendingLoad = undefined;
    void c.load(source, origin, hostState.value.settings, reducedMotion());
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
      onTogglePresentation={togglePresentation}
      onToggleInspector={toggleInspector}
      reducedMotion={reducedMotion()}
      ui={ui}
    />
  );
}

const container = document.getElementById('app');
if (container) render(<AppRoot />, container);

host.post(webviewMessage('ready', { protocol: PROTOCOL_VERSION }));
