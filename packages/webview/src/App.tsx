import { useEffect, useRef, useState } from 'preact/hooks';
import { stepEnd } from '@mermaid-animator/core';
import { WEBVIEW_STRINGS, type DiagramSummary } from '@mermaid-animator/protocol';
import type { DiagramController, ViewKind } from './controller';
import { SPEEDS } from './player';
import type { HostState } from './state';
import { format } from './state';
import { chapterIndexAt } from './narrative';
import { CaptionStrip, ChoiceChips } from './Captions';
import { Inspector, type InspectorSection } from './Inspector';
import { SearchBox } from './SearchBox';
import { ExportSheet, type SheetActions } from './ExportSheet';
import { Transcript } from './Transcript';
import { BlankScreen, ChapterCard, Hairline, LaserPointer, TitleCard } from './Presentation';

export type ExportAction = { kind: 'svg' } | { kind: 'png'; scale: number; transparent: boolean } | { kind: 'copy' };

interface AppProps {
  state: HostState;
  controller: DiagramController | undefined;
  mountCanvas: (el: HTMLElement) => void;
  onSelectDiagram: (index: number) => void;
  onExport: (action: ExportAction) => void;
  sheetActions: SheetActions;
  onTogglePresentation: () => void;
  onToggleInspector: () => void;
  reducedMotion: boolean;
  ui: UiState;
}

/** Transient UI flags owned by main.tsx so keyboard shortcuts can toggle them. */
export interface UiState {
  shortcuts: boolean;
  exportMenu: boolean;
  /** Format preselected when the sheet was opened by a format command (`export.gif`, …). */
  exportFormat?: string;
  /** Export right away with the sheet's initial choices (`{ "start": true }` on a format command). */
  exportStart?: boolean;
  goTo: boolean;
  speedMenu: boolean;
  toast?: string;
  /** Panel is at least 880 px wide: the inspector sits beside the canvas. */
  wide: boolean;
  /** Inspector shown beside the canvas (wide panels; persisted). */
  inspectorWide: boolean;
  /** Inspector open as an overlay sheet (narrow panels). */
  inspectorSheet: boolean;
  /** Collapsed inspector sections (persisted). */
  sections: InspectorSection[];
  search: boolean;
  transcript: boolean;
  presenting: boolean;
  titleCard: boolean;
  blank: boolean;
  laser: boolean;
  /** Presentation chrome hidden after 2 s without pointer movement. */
  idle: boolean;
  set(patch: Partial<Omit<UiState, 'set'>>): void;
}

type T = (k: string, ...a: (string | number)[]) => string;

function IconButton(props: { icon: string; label: string; onClick?: () => void; primary?: boolean; pressed?: boolean; disabled?: boolean; id?: string }) {
  return (
    <button
      type="button"
      id={props.id}
      class={`ma-button${props.primary ? ' ma-button--primary' : ''}${props.pressed ? ' ma-button--pressed' : ''}`}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span class={`codicon codicon-${props.icon}`} aria-hidden="true" />
    </button>
  );
}

function DiagramSwitcher({ diagrams, current, t, onSelect }: { diagrams: DiagramSummary[]; current: number; t: T; onSelect: (i: number) => void }) {
  if (diagrams.length < 2) return null;
  return (
    <label class="ma-switcher">
      <span class="ma-visually-hidden">{t('app.diagramSwitcher')}</span>
      <select value={String(current)} onChange={(e) => onSelect(Number((e.target as HTMLSelectElement).value))}>
        {diagrams.map((d) => (
          <option value={String(d.index)} key={d.index}>
            {`${t('app.diagramN', d.index + 1)} · ${d.title ?? d.summary}`.slice(0, 80)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Scrubber({ controller, t }: { controller: DiagramController; t: T }) {
  const snap = controller.snapshot.value;
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; label: string } | undefined>();
  const timeline = controller.playback.currentTimeline;
  const total = timeline.duration || 1;
  const fraction = Math.min(1, snap.t / total);
  const chapters = controller.chapters.value;
  const timeAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * total;
  };
  const labelAt = (time: number) => {
    const starts = timeline.starts;
    let index = -1;
    for (let i = 0; i < starts.length; i++) if ((starts[i] as number) < time) index = i;
    const labels = controller.stepLabels.value;
    if (index < 0) return '—';
    const step = t('transport.stepLabel', index + 1, labels[index] ?? '');
    const chapter = chapters[chapterIndexAt(chapters, index)];
    return chapter ? `${chapter.title} · ${step}` : step;
  };
  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    controller.playback.beginScrub();
    controller.playback.scrub(timeAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent) => {
    const time = timeAt(e.clientX);
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setHover({ x: e.clientX - rect.left, label: labelAt(time) });
    if (snap.scrubbing) controller.playback.scrub(time);
  };
  const onPointerUp = () => {
    if (controller.snapshot.value.scrubbing) controller.playback.endScrub();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) controller.chapter(e.key === 'ArrowRight' ? 1 : -1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') controller.playback.next();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') controller.playback.previous();
    else if (e.key === 'Home') controller.playback.first();
    else if (e.key === 'End') controller.playback.last();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const pct = (time: number) => `${(time / total) * 100}%`;
  const rest = (index: number) => (index < 0 ? 0 : stepEnd(timeline, index));
  const ticks = timeline.starts.map((_, i) => stepEnd(timeline, i) / total);
  const range = snap.range;
  const skipped = [...controller.skipped.value].filter((k) => k < timeline.starts.length);
  return (
    <div
      class="ma-scrubber"
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('transport.scrubber')}
      aria-valuemin={0}
      aria-valuemax={snap.stepCount}
      aria-valuenow={snap.displayStep}
      aria-valuetext={t('transport.counter', snap.displayStep, snap.stepCount)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(undefined)}
      onKeyDown={onKey}
    >
      <div class="ma-scrubber__track">
        {skipped.map((k) => (
          <span key={`s${k}`} class="ma-scrubber__skipped" style={{ left: pct(timeline.starts[k] as number), width: pct(stepEnd(timeline, k) - (timeline.starts[k] as number)) }} />
        ))}
        {range && (range.from !== undefined || range.to !== undefined) && (
          <span
            class="ma-scrubber__range"
            style={{ left: pct(rest(range.from ?? -1)), width: pct(rest(range.to ?? timeline.starts.length - 1) - rest(range.from ?? -1)) }}
          />
        )}
        <div class="ma-scrubber__played" style={{ width: `${fraction * 100}%` }} />
        {ticks.length <= 120 && ticks.map((f, i) => <span key={i} class="ma-scrubber__tick" style={{ left: `${f * 100}%` }} />)}
        {controller.matchSteps.value.map((k) => (
          <span key={`m${k}`} class="ma-scrubber__match" style={{ left: pct(rest(k)) }} />
        ))}
      </div>
      {chapters.map((c) => (
        <span key={`c${c.firstStep}`} class="ma-scrubber__chapter" style={{ left: pct(timeline.starts[c.firstStep] ?? 0) }} title={t('chapter.tick', c.title)} aria-hidden="true" />
      ))}
      <div class="ma-scrubber__thumb" style={{ left: `${fraction * 100}%` }} />
      {hover && (
        <div class="ma-tooltip ma-scrubber__hover" style={{ left: `${hover.x}px` }}>
          {hover.label}
        </div>
      )}
    </div>
  );
}

/** Sequence | Topology | Split (spec view-switching); generic diagrams offer only their own view. */
function ViewSwitcher({ controller, t }: { controller: DiagramController; t: T }) {
  if (!controller.canSwitch.value) return null;
  const current = controller.view.value;
  const options: { view: ViewKind; label: string; icon: string }[] = [
    { view: 'sequence', label: t('view.sequence'), icon: 'list-ordered' },
    { view: 'topology', label: t('view.topology'), icon: 'type-hierarchy' },
    { view: 'split', label: t('view.split'), icon: 'split-horizontal' },
  ];
  return (
    <div class="ma-segmented" role="radiogroup" aria-label={t('view.label')} onPointerEnter={() => controller.prewarmTopology()} onFocusIn={() => controller.prewarmTopology()}>
      {options.map((o) => (
        <button
          key={o.view}
          type="button"
          role="radio"
          aria-checked={current === o.view}
          class={`ma-segmented__item${current === o.view ? ' ma-segmented__item--checked' : ''}`}
          title={o.label}
          onClick={() => void controller.setView(o.view)}
        >
          <span class={`codicon codicon-${o.icon}`} aria-hidden="true" />
          <span class="ma-segmented__label">{t(`view.${o.view}Short`)}</span>
        </button>
      ))}
    </div>
  );
}

/** Messages aggregated by a hovered topology edge, each seeking to its step (spec topology-view). */
function EdgeCardView({ controller, t }: { controller: DiagramController; t: T }) {
  const card = controller.edgeCard.value;
  if (!card) return null;
  return (
    <div
      class="ma-edge-card"
      role="dialog"
      aria-label={card.title}
      style={{ left: `${card.x + 12}px`, top: `${card.y + 12}px` }}
      onPointerEnter={() => controller.keepEdgeCard()}
      onPointerLeave={() => controller.hideEdgeCardSoon()}
    >
      <div class="ma-edge-card__title">{card.title}</div>
      <ol class="ma-edge-card__list">
        {card.items.map((item) => (
          <li key={item.id}>
            <button type="button" class="ma-edge-card__item" disabled={item.step === undefined} onClick={() => item.step !== undefined && controller.playback.goTo(item.step + 1)}>
              <span class="ma-edge-card__text">{item.text}</span>
              <span class="ma-edge-card__step">{item.step === undefined ? t('search.unplayed') : t('search.step', item.step + 1)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function GoToStep({ controller, t, close }: { controller: DiagramController; t: T; close: () => void }) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = (e: Event) => {
    e.preventDefault();
    const n = Number(value);
    if (Number.isInteger(n) && value.trim() !== '') controller.playback.goTo(n);
    else {
      const needle = value.toLowerCase();
      const index = controller.stepLabels.value.findIndex((l) => l.toLowerCase().includes(needle));
      if (index >= 0) controller.playback.goTo(index + 1);
    }
    close();
  };
  return (
    <form class="ma-popover ma-goto" onSubmit={submit}>
      <input
        ref={input}
        class="ma-input"
        aria-label={t('transport.goToPrompt')}
        placeholder={t('transport.goToPrompt')}
        value={value}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
      />
    </form>
  );
}

/** Documented shortcuts; kept in step with the keyboard handler in main.tsx. */
export const SHORTCUT_ROWS: [string, string][] = [
  ['Space / K', 'shortcuts.playPause'],
  ['→ / ←', 'shortcuts.step'],
  ['Shift + → / ←', 'shortcuts.chapter'],
  ['Home / End', 'shortcuts.ends'],
  ['G', 'shortcuts.goTo'],
  ['[ / ]', 'shortcuts.speed'],
  ['L', 'shortcuts.loop'],
  ['T', 'shortcuts.toggleView'],
  ['S', 'shortcuts.split'],
  ['I / O', 'shortcuts.range'],
  ['+ / −', 'shortcuts.zoom'],
  ['0', 'shortcuts.fit'],
  ['F', 'shortcuts.frame'],
  ['C', 'shortcuts.follow'],
  ['D', 'shortcuts.inspector'],
  ['/', 'shortcuts.search'],
  ['R', 'shortcuts.transcript'],
  ['P', 'shortcuts.present'],
  ['B / .', 'shortcuts.blank'],
  ['Z', 'shortcuts.laser'],
  ['⌁ / Ctrl + ⌁', 'shortcuts.focus'],
  ['E', 'shortcuts.export'],
  ['Alt + ⌁', 'shortcuts.reveal'],
];

function Shortcuts({ t, close }: { t: T; close: () => void }) {
  return (
    <div class="ma-overlay" role="dialog" aria-modal="true" aria-labelledby="ma-shortcuts-title" onClick={close}>
      <div class="ma-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 id="ma-shortcuts-title" class="ma-sheet__title">
          {t('shortcuts.title')}
        </h2>
        <dl class="ma-shortcuts">
          {SHORTCUT_ROWS.map(([k, v]) => (
            <div key={k} class="ma-shortcuts__row">
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{t(v)}</dd>
            </div>
          ))}
        </dl>
        <button type="button" class="ma-text-button" onClick={close} autoFocus>
          {t('shortcuts.close')}
        </button>
      </div>
    </div>
  );
}

function ExportMenu({ t, onExport, close }: { t: T; onExport: (a: ExportAction) => void; close: () => void }) {
  const choose = (a: ExportAction) => {
    close();
    onExport(a);
  };
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <div class="ma-popover ma-menu" role="menu" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <button ref={first} role="menuitem" class="ma-menu__item" onClick={() => choose({ kind: 'svg' })}>
        {t('toolbar.exportSvg')}
      </button>
      {[1, 2, 3].map((scale) => (
        <button key={scale} role="menuitem" class="ma-menu__item" onClick={() => choose({ kind: 'png', scale, transparent: false })}>
          {`${t('toolbar.exportPng')} · ${scale}×`}
        </button>
      ))}
      <button role="menuitem" class="ma-menu__item" onClick={() => choose({ kind: 'png', scale: 2, transparent: true })}>
        {`${t('toolbar.exportPng')} · 2× · ◌`}
      </button>
      <div class="ma-menu__rule" />
      <button role="menuitem" class="ma-menu__item" onClick={() => choose({ kind: 'copy' })}>
        {t('toolbar.copyImage')}
      </button>
    </div>
  );
}

export function App({ state, controller, mountCanvas, onSelectDiagram, onExport, sheetActions, onTogglePresentation, onToggleInspector, reducedMotion, ui }: AppProps) {
  const t = (key: string, ...args: (string | number)[]) => format({ ...WEBVIEW_STRINGS, ...state.strings }, key, ...args);
  const doc = state.document;
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (canvasRef.current) mountCanvas(canvasRef.current);
  }, []);

  const snap = controller?.snapshot.value;
  const banner = controller?.banner.value;
  const notice = controller?.notice.value;
  const tooltip = controller?.tooltip.value;
  const card = controller?.chapterCard.value;
  const pad = (n: number) => String(n).padStart(2, '0');
  const speedLabel = `${snap?.speed ?? 1}×`.replace(/^(\d)×$/, '$1.0×');
  const native = !!controller?.stepList.value.length;
  const inspectorOpen = native && !ui.presenting && !ui.transcript && (ui.wide ? ui.inspectorWide : ui.inspectorSheet);
  const inspectorBeside = inspectorOpen && ui.wide;
  const total = controller?.playback.currentTimeline.duration || 1;
  const toggleSection = (s: InspectorSection) => ui.set({ sections: ui.sections.includes(s) ? ui.sections.filter((x) => x !== s) : [...ui.sections, s] });
  const shellClass = ['ma-shell', ui.presenting && 'ma-shell--presenting', ui.presenting && ui.idle && 'ma-shell--idle'].filter(Boolean).join(' ');

  return (
    <div class={shellClass}>
      <header class="ma-toolbar" role="toolbar" aria-label={t('toolbar.label')}>
        <span class="ma-breadcrumb">{doc ? <strong>{doc.fileName}</strong> : t('app.loading')}</span>
        {doc?.diagrams && <DiagramSwitcher diagrams={doc.diagrams} current={doc.diagramIndex ?? 0} t={t} onSelect={onSelectDiagram} />}
        <span class="ma-toolbar__spacer" />
        {controller && <ViewSwitcher controller={controller} t={t} />}
        <IconButton icon="screen-full" label={t('toolbar.fit')} onClick={() => controller?.fit()} disabled={!controller} />
        <IconButton icon="target" label={t('toolbar.frame')} onClick={() => controller?.frameStep()} disabled={!controller} />
        <IconButton icon="eye" label={t('toolbar.follow')} pressed={!!controller?.following.value && !controller.followSuspended.value} onClick={() => controller?.toggleFollow()} disabled={!controller} />
        <IconButton icon="go-to-file" label={t('toolbar.revealSource')} onClick={() => controller?.revealCurrent()} disabled={!controller} />
        <span class="ma-toolbar__rule" aria-hidden="true" />
        <div class="ma-anchor">
          <IconButton icon="search" label={t('toolbar.search')} pressed={ui.search} onClick={() => ui.set({ search: !ui.search })} disabled={!native} />
          {ui.search && controller && <SearchBox controller={controller} t={t} close={() => ui.set({ search: false })} />}
        </div>
        <IconButton icon="list-flat" label={t('toolbar.transcript')} pressed={ui.transcript} onClick={() => ui.set({ transcript: !ui.transcript })} disabled={!native} />
        <IconButton icon="layout-sidebar-right" label={t('toolbar.inspector')} pressed={inspectorOpen} onClick={onToggleInspector} disabled={!native} />
        <IconButton icon="play-circle" label={ui.presenting ? t('presentation.exit') : t('toolbar.present')} pressed={ui.presenting} onClick={onTogglePresentation} disabled={!controller} />
        <span class="ma-toolbar__rule" aria-hidden="true" />
        <div class="ma-anchor">
          <IconButton icon="export" label={t('toolbar.export')} onClick={() => ui.set({ exportMenu: !ui.exportMenu })} disabled={!controller} />
          {ui.exportMenu && !controller && <ExportMenu t={t} onExport={onExport} close={() => ui.set({ exportMenu: false })} />}
        </div>
        <IconButton icon="keyboard" label={t('toolbar.shortcuts')} onClick={() => ui.set({ shortcuts: true })} />
      </header>

      <div class={`ma-body${inspectorBeside ? ' ma-body--inspector' : ''}`}>
        <main class={`ma-canvas${controller?.stale.value ? ' ma-canvas--stale' : ''}`} ref={canvasRef} hidden={ui.transcript && native}>
          {!doc && <div class="ma-progress" role="progressbar" aria-label={t('app.loading')} />}
          {banner && (
            <div class={`ma-banner ma-banner--${banner.kind}`} role={banner.kind === 'error' ? 'alert' : 'status'}>
              <span class="ma-banner__text">{banner.text}</span>
              {banner.range && (
                <button type="button" class="ma-text-button" onClick={() => controller?.revealBanner()}>
                  {t('banner.reveal')}
                </button>
              )}
            </div>
          )}
          {!banner && notice && (
            <div class="ma-banner ma-banner--info" role="status">
              <span class="ma-banner__text">{notice}</span>
            </div>
          )}
          {controller?.followSuspended.value && (
            <button type="button" class="ma-chip ma-resume" onClick={() => controller.toggleFollow()}>
              {t('camera.resume')}
            </button>
          )}
          {controller && <ChoiceChips controller={controller} t={t} />}
          {controller && <EdgeCardView controller={controller} t={t} />}
          {controller?.topologyView.pending.value && controller.view.value !== 'sequence' && <div class="ma-progress ma-progress--layout" role="progressbar" aria-label={t('view.layingOut')} />}
          {tooltip && !ui.presenting && (
            <div class="ma-tooltip ma-canvas-tooltip" style={{ left: `${tooltip.x + 12}px`, top: `${tooltip.y + 16}px` }} role="tooltip">
              <div class="ma-tooltip__text">{tooltip.text}</div>
              {tooltip.line !== undefined && <div class="ma-tooltip__meta">{t('tooltip.line', tooltip.line)}</div>}
            </div>
          )}
          {ui.presenting && ui.titleCard && controller && (
            <TitleCard
              title={controller.title.value || doc?.fileName || ''}
              subtitle={t('presentation.subtitle', controller.participants.value.length, controller.chapters.value.length, snap?.stepCount ?? 0)}
            />
          )}
          {ui.presenting && card && <ChapterCard label={t('presentation.chapterN', card.n)} title={card.title} />}
          {ui.presenting && ui.laser && <LaserPointer reducedMotion={reducedMotion} />}
          {ui.presenting && ui.blank && <BlankScreen />}
          {ui.toast && (
            <div class="ma-toast" role="status">
              {ui.toast}
            </div>
          )}
        </main>
        {ui.transcript && controller && native && <Transcript controller={controller} t={t} />}
        {ui.exportMenu && controller && (
          <ExportSheet controller={controller} t={t} format={ui.exportFormat} start={ui.exportStart} close={() => ui.set({ exportMenu: false, exportFormat: undefined, exportStart: undefined })} actions={sheetActions} svgAdaptive={controller.effective.value.exportDefaults.svgAdaptiveTheme} />
        )}
        {inspectorOpen && controller && (
          <Inspector controller={controller} t={t} collapsed={ui.sections} onToggleSection={toggleSection} overlay={!ui.wide} onClose={onToggleInspector} />
        )}
      </div>

      {controller && !ui.transcript && <CaptionStrip controller={controller} presenting={ui.presenting} />}

      <footer class="ma-transport" role="group" aria-label={t('transport.label')}>
        <IconButton icon="debug-restart" label={t('transport.first')} onClick={() => controller?.playback.first()} disabled={!snap?.stepCount} />
        <IconButton icon="chevron-left" label={t('transport.previous')} onClick={() => controller?.playback.previous()} disabled={!snap?.stepCount} />
        <IconButton
          icon={snap?.playing ? 'debug-pause' : 'play'}
          label={snap?.playing ? t('transport.pause') : t('transport.play')}
          primary
          onClick={() => controller?.playback.toggle()}
          disabled={!snap?.stepCount}
        />
        <IconButton icon="chevron-right" label={t('transport.next')} onClick={() => controller?.playback.next()} disabled={!snap?.stepCount} />
        <IconButton icon="debug-step-out" label={t('transport.last')} onClick={() => controller?.playback.last()} disabled={!snap?.stepCount} />
        {controller ? <Scrubber controller={controller} t={t} /> : <div class="ma-scrubber" />}
        <div class="ma-anchor">
          <button
            type="button"
            class="ma-counter"
            aria-label={t('transport.counter', snap?.displayStep ?? 0, snap?.stepCount ?? 0)}
            title={t('transport.counter', snap?.displayStep ?? 0, snap?.stepCount ?? 0)}
            onClick={() => ui.set({ goTo: !ui.goTo })}
            disabled={!snap?.stepCount}
          >
            <strong>{pad(snap?.displayStep ?? 0)}</strong> / {pad(snap?.stepCount ?? 0)}
          </button>
          {ui.goTo && controller && <GoToStep controller={controller} t={t} close={() => ui.set({ goTo: false })} />}
        </div>
        <div class="ma-anchor">
          <button type="button" class="ma-speed" aria-label={t('transport.speed')} title={t('transport.speed')} aria-haspopup="menu" onClick={() => ui.set({ speedMenu: !ui.speedMenu })}>
            {speedLabel}
          </button>
          {ui.speedMenu && (
            <div class="ma-popover ma-menu ma-menu--speed" role="menu">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  role="menuitemradio"
                  aria-checked={snap?.speed === s}
                  class={`ma-menu__item${snap?.speed === s ? ' ma-menu__item--checked' : ''}`}
                  onClick={() => {
                    controller?.playback.setSpeed(s);
                    ui.set({ speedMenu: false });
                  }}
                >
                  {`${s}×`}
                </button>
              ))}
            </div>
          )}
        </div>
        <IconButton icon="sync" label={t('transport.loop')} pressed={!!snap?.loop} onClick={() => controller?.playback.setOptions({ loop: !snap?.loop })} disabled={!snap?.stepCount} />
      </footer>

      {ui.presenting && <Hairline fraction={(snap?.t ?? 0) / total} />}
      <div class="ma-visually-hidden" aria-live="polite" aria-atomic="true">
        {controller?.live.value}
      </div>
      {ui.shortcuts && <Shortcuts t={t} close={() => ui.set({ shortcuts: false })} />}
    </div>
  );
}
