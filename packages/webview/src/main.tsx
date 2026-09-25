import '@mermaid-animator/renderer/tokens.css';
import './styles/app.css';
import { render } from 'preact';
import { signal } from '@preact/signals';
import { effect } from '@preact/signals';
import { resolvePalette } from '@mermaid-animator/renderer';
import { PROTOCOL_VERSION, webviewMessage } from '@mermaid-animator/protocol';
import { App } from './App';
import { Host } from './host';
import { initialHostState, reduce, resolveReduceMotion, type HostState } from './state';

const host = new Host();
const hostState = signal<HostState>(initialHostState);
const osReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const osPrefersReduced = signal(osReducedMotion.matches);
osReducedMotion.addEventListener('change', (e) => (osPrefersReduced.value = e.matches));

/** Effective reduced-motion flag, read by all animation code. */
export const reducedMotion = signal(false);

effect(() => {
  const state = hostState.value;
  const root = document.documentElement;
  root.dataset.palette = resolvePalette(state.settings.themeMode, state.themeKind);
  reducedMotion.value = resolveReduceMotion(state.reduceMotionPreference, osPrefersReduced.value);
  root.dataset.reducedMotion = String(reducedMotion.value);
  if (state.locale) root.lang = state.locale;
});

effect(() => {
  const doc = hostState.value.document;
  if (doc) host.setState({ uri: doc.uri });
});

window.addEventListener('error', (event) => host.log('error', `${event.message} (${event.filename}:${event.lineno})`));
window.addEventListener('unhandledrejection', (event) => host.log('error', `Unhandled rejection: ${String(event.reason)}`));

host.listen((message) => {
  hostState.value = reduce(hostState.value, message);
});

const container = document.getElementById('app');
if (container) render(<AppRoot />, container);

function AppRoot() {
  return <App state={hostState.value} />;
}

host.post(webviewMessage('ready', { protocol: PROTOCOL_VERSION }));
