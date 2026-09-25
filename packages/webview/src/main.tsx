import '@mermaid-animator/renderer/tokens.css';
import '@mermaid-animator/renderer/diagram.css';
import './styles/app.css';
import { render } from 'preact';
import { effect, signal } from '@preact/signals';
import { resolvePalette } from '@mermaid-animator/renderer';
import { PROTOCOL_VERSION, WEBVIEW_STRINGS, webviewMessage, type CommandAction, type HostMessage } from '@mermaid-animator/protocol';
import { App, type ExportAction, type UiState } from './App';
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
const uiFlags = signal<Omit<UiState, 'set'>>({ shortcuts: false, exportMenu: false, goTo: false, speedMenu: false });
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function setUi(patch: Partial<Omit<UiState, 'set'>>): void {
  uiFlags.value = { ...uiFlags.value, ...patch };
}
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
  if (doc) host.setState({ uri: doc.uri, diagramIndex: doc.diagramIndex ?? 0 });
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
  }
}

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
  if (e.ctrlKey || e.metaKey) return; // leave editor keybindings alone
  const c = controller.value;
  const ui = uiFlags.value;
  if (e.key === 'Escape') {
    setUi({ shortcuts: false, exportMenu: false, goTo: false, speedMenu: false });
    return;
  }
  if (!c) return;
  const p = c.playback;
  const speedStep = (dir: number) => {
    const i = SPEEDS.indexOf(p.snapshot().speed as (typeof SPEEDS)[number]);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 3 : i) + dir))];
    if (next) p.setSpeed(next);
  };
  const handled: Record<string, () => void> = {
    ' ': () => p.toggle(),
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
      ui={ui}
    />
  );
}

const container = document.getElementById('app');
if (container) render(<AppRoot />, container);

host.post(webviewMessage('ready', { protocol: PROTOCOL_VERSION }));
