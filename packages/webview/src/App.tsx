import type { HostState } from './state';
import { format } from './state';

interface AppProps {
  state: HostState;
}

function IconButton({ icon, label, primary = false }: { icon: string; label: string; primary?: boolean }) {
  return (
    <button type="button" class={primary ? 'ma-button ma-button--primary' : 'ma-button'} aria-label={label} title={label} disabled>
      <span class={`codicon codicon-${icon}`} aria-hidden="true" />
    </button>
  );
}

/** M0 shell: toolbar, canvas and transport placeholders (spec §8.2). */
export function App({ state }: AppProps) {
  const t = (key: string, ...args: (string | number)[]) => format(state.strings, key, ...args);
  const doc = state.document;
  const lines = doc ? doc.source.split(/\r?\n/).length : 0;

  return (
    <div class="ma-shell">
      <header class="ma-toolbar" role="toolbar" aria-label={t('toolbar.label')}>
        <span class="ma-breadcrumb">{doc ? <strong>{doc.fileName}</strong> : t('app.loading')}</span>
      </header>
      <main class="ma-canvas" aria-live="polite">
        {doc ? (
          <div class="ma-placeholder">
            <p class="ma-placeholder__title">{doc.fileName}</p>
            <p class="ma-placeholder__meta">{t('app.lines', lines)}</p>
            <p class="ma-placeholder__hint">{t('app.canvasPlaceholder')}</p>
          </div>
        ) : (
          <div class="ma-progress" role="progressbar" aria-label={t('app.loading')} />
        )}
      </main>
      <footer class="ma-transport" role="group" aria-label={t('transport.label')}>
        <IconButton icon="debug-restart" label={t('transport.first')} />
        <IconButton icon="chevron-left" label={t('transport.previous')} />
        <IconButton icon="play" label={t('transport.play')} primary />
        <IconButton icon="chevron-right" label={t('transport.next')} />
        <IconButton icon="debug-step-out" label={t('transport.last')} />
        <div class="ma-scrubber" aria-hidden="true">
          <div class="ma-scrubber__track" />
        </div>
        <span class="ma-counter">
          <strong>00</strong> / 00
        </span>
      </footer>
    </div>
  );
}
