/**
 * The export sheet (spec animated-export, M3 D6): every format and option, irrelevant options
 * disabled, a live preview drawn with the Canvas backend, duration and size estimates, the MP4
 * availability note and the animated-SVG size warning.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DiagramController } from './controller';
import type { AnimatedOptions } from './animated/exporter';
import { autoFps, estimate, fieldsFor, formatBytes, initialSheet, mp4Supported, type SheetField, type SheetFormat, type SheetState } from './animated/sheet';
import type { AnimatedSvgRequest } from './animated/svgExport';
import { playerTheme, type ExportTheme, type PlayerTheme } from './animated/theme';

type T = (k: string, ...a: (string | number)[]) => string;

export interface SheetActions {
  animated(options: AnimatedOptions): Promise<unknown>;
  animatedSvg(request: AnimatedSvgRequest): Promise<number[] | undefined>;
  player(theme: PlayerTheme, view: 'sequence' | 'topology' | 'split'): Promise<unknown>;
  still(kind: 'svg' | 'png' | 'copy', options: { scale: number; transparent: boolean; theme: ExportTheme }): Promise<unknown>;
  cancel(): void;
  progress: { fraction: number; phase: string } | undefined;
}

const FORMATS: SheetFormat[] = ['gif', 'webm', 'mp4', 'animated-svg', 'html', 'svg', 'png', 'copy'];

function Field({ label, disabled, children }: { label: string; disabled: boolean; children: ComponentChildren }) {
  return (
    <label class={`ma-field${disabled ? ' ma-field--disabled' : ''}`}>
      <span class="ma-field__label">{label}</span>
      <span class="ma-field__control">{children}</span>
    </label>
  );
}

export function ExportSheet({ controller, t, close, actions, svgAdaptive, format, start }: { controller: DiagramController; t: T; close: () => void; actions: SheetActions; svgAdaptive: boolean; format?: string; start?: boolean }) {
  // *Participant names* follows `display.participantNames` (spec animated-export).
  const names = controller.effective.value.participantNames !== 'off';
  const defaults = { ...controller.effective.value.exportDefaults, names, ...(format ? { format: format as SheetFormat } : {}) };
  const [mp4, setMp4] = useState(false);
  const [state, setState] = useState<SheetState>(() => initialSheet(defaults, false));
  const [svgBytes, setSvgBytes] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const first = useRef<HTMLSelectElement>(null);
  const native = controller.canSwitch.value;
  const fields = fieldsFor(state.sheetFormat);
  const on = (f: SheetField) => fields.has(f);
  // The light + dark pair is the GitHub-safe export's alternative: Current theme only (spec animated-svg-export).
  const pairOn = on('pair') && state.theme === 'current';
  const set = (patch: Partial<SheetState>) => setState((s) => ({ ...s, ...patch }));

  // Ready once the H.264 check has settled (it may switch the initial format to MP4).
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    first.current?.focus();
    void mp4Supported().then((ok) => {
      setMp4(ok);
      if (ok && defaults.format === 'mp4') set({ sheetFormat: 'mp4', format: 'mp4' });
      setReady(true);
    });
  }, []);

  const material = controller.exportMaterial(native ? state.view === 'split' ? 'sequence' : state.view : 'sequence');
  const est = material ? estimate(state, material.timeline, material.content, { rest: material.rest, chapters: material.chapters, ab: material.ab }) : {};

  // Animated SVG: measure by compiling (debounced), to warn above 1 MB.
  useEffect(() => {
    setSvgBytes(undefined);
    if (state.sheetFormat !== 'animated-svg' || !material) return;
    const timer = setTimeout(async () => {
      const { compileAnimatedSvg } = await import('./animated/svgExport');
      const files = await compileAnimatedSvg(material, { range: state.range, view: state.view === 'split' ? 'sequence' : state.view, speed: state.speed, hold: state.hold, loop: state.loop, pair: state.pair, adaptive: svgAdaptive, theme: state.theme }, controller.genericDiagram);
      setSvgBytes(files ? Math.max(...files.map((f) => new TextEncoder().encode(f.text).length)) : undefined);
      controller.requestFrame();
    }, 300);
    return () => clearTimeout(timer);
  }, [state.sheetFormat, state.range, state.view, state.speed, state.hold, state.loop, state.pair, state.theme]);

  // Live preview of the chosen range and options (scene sources), looping.
  useEffect(() => {
    const canvas = preview.current;
    if (!canvas || !material || material.kind === 'generic') return;
    let frame = 0;
    let stopped = false;
    void (async () => {
      const { buildJob } = await import('./animated/exporter');
      const { prepareJob, drawFrame } = await import('./animated/draw');
      const { frameTime } = await import('./animated/frames');
      const width = 320;
      const height = 180;
      const job = buildJob(material, { ...state, format: state.format, size: 'custom', custom: { width, height }, scale: 1, view: state.view === 'split' ? 'sequence' : state.view }, []);
      const prepared = prepareJob(job);
      const ctx = canvas.getContext('2d')!;
      const started = performance.now();
      const loop = (now: number) => {
        if (stopped) return;
        const total = Math.max(1, job.plan.total);
        const n = Math.floor(((now - started) / 1000) * job.plan.fps) % total;
        drawFrame(ctx, prepared, frameTime(job.range, job.plan, n), (n * 1000) / job.plan.fps);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [JSON.stringify(state), material?.kind]);

  const chooseFormat = (f: SheetFormat) => set({ sheetFormat: f, ...(state.fpsAuto ? { fps: autoFps(f) } : {}), format: f === 'webm' || f === 'mp4' ? f : 'gif', background: f === 'webm' || f === 'mp4' ? (state.background === 'transparent' ? 'theme' : state.background) : state.background });

  const run = async () => {
    setBusy(true);
    try {
      const view = state.view;
      if (state.sheetFormat === 'animated-svg') await actions.animatedSvg({ range: state.range, view: view === 'split' ? 'sequence' : view, speed: state.speed, hold: state.hold, loop: state.loop, pair: state.pair, adaptive: svgAdaptive, theme: state.theme });
      else if (state.sheetFormat === 'html') await actions.player(playerTheme(state.theme), native ? view : 'sequence');
      else if (state.sheetFormat === 'svg' || state.sheetFormat === 'png' || state.sheetFormat === 'copy') await actions.still(state.sheetFormat, { scale: state.scale, transparent: state.background === 'transparent', theme: state.theme });
      else await actions.animated({ ...state, view: view === 'split' ? 'sequence' : view });
      close();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!ready || !start || started.current) return;
    started.current = true;
    void run();
  }, [ready]);

  const progress = actions.progress;
  const warnSvg = state.sheetFormat === 'animated-svg' && svgBytes !== undefined && svgBytes > 1024 * 1024;
  const optionLabel = (f: SheetFormat) => t(`sheet.format.${f}`);

  return (
    <aside class="ma-export-sheet" role="dialog" aria-modal="false" aria-labelledby="ma-export-title" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close(); }}>
      <header class="ma-export-sheet__head">
        <h2 id="ma-export-title" class="ma-inspector__title">{t('sheet.title')}</h2>
        <button type="button" class="ma-button" aria-label={t('sheet.close')} title={t('sheet.close')} onClick={close}>
          <span class="codicon codicon-close" aria-hidden="true" />
        </button>
      </header>
      <div class="ma-export-sheet__body">
        <canvas ref={preview} class="ma-export-preview" width={320} height={180} aria-label={t('sheet.preview')} hidden={!material || material.kind === 'generic' || !['gif', 'webm', 'mp4'].includes(state.sheetFormat)} />
        <Field label={t('sheet.format')} disabled={false}>
          <select ref={first} class="ma-input" value={state.sheetFormat} onChange={(e) => chooseFormat((e.target as HTMLSelectElement).value as SheetFormat)}>
            {FORMATS.map((f) => (
              <option key={f} value={f} disabled={f === 'mp4' && !mp4}>
                {optionLabel(f)}
              </option>
            ))}
          </select>
        </Field>
        {!mp4 && <p class="ma-export-note">{t('sheet.mp4Unavailable')}</p>}
        <Field label={t('sheet.range')} disabled={!on('range')}>
          <select class="ma-input" disabled={!on('range')} value={state.range} onChange={(e) => set({ range: (e.target as HTMLSelectElement).value as SheetState['range'] })}>
            <option value="all">{t('sheet.range.all')}</option>
            <option value="chapter" disabled={!material?.chapters.length}>{t('sheet.range.chapter')}</option>
            <option value="ab" disabled={!material?.ab}>{t('sheet.range.ab')}</option>
            <option value="step">{t('sheet.range.step')}</option>
          </select>
        </Field>
        <Field label={t('sheet.view')} disabled={!on('view') || !native}>
          <select class="ma-input" disabled={!on('view') || !native} value={state.view} onChange={(e) => set({ view: (e.target as HTMLSelectElement).value as SheetState['view'] })}>
            <option value="sequence">{t('view.sequenceShort')}</option>
            <option value="topology">{t('view.topologyShort')}</option>
            {state.sheetFormat === 'html' && <option value="split">{t('view.splitShort')}</option>}
          </select>
        </Field>
        <Field label={t('sheet.camera')} disabled={!on('camera')}>
          <select class="ma-input" disabled={!on('camera')} value={state.camera} onChange={(e) => set({ camera: (e.target as HTMLSelectElement).value as SheetState['camera'] })}>
            <option value="fit">{t('sheet.camera.fit')}</option>
            <option value="cinematic">{t('sheet.camera.cinematic')}</option>
            <option value="current">{t('sheet.camera.current')}</option>
          </select>
        </Field>
        <Field label={t('sheet.size')} disabled={!on('size')}>
          <select class="ma-input" disabled={!on('size')} value={state.size} onChange={(e) => set({ size: (e.target as HTMLSelectElement).value as SheetState['size'] })}>
            <option value="hd">1280 × 720</option>
            <option value="fhd">1920 × 1080</option>
            <option value="square">1080 × 1080</option>
            <option value="portrait">1080 × 1920</option>
            <option value="fit">{t('sheet.size.fit')}</option>
            <option value="custom">{t('sheet.size.custom')}</option>
          </select>
        </Field>
        {state.size === 'custom' && on('size') && (
          <div class="ma-field ma-field--pair">
            <input class="ma-input" type="number" min={64} max={3840} aria-label={t('sheet.width')} value={state.custom?.width ?? 1280} onInput={(e) => set({ custom: { width: Number((e.target as HTMLInputElement).value), height: state.custom?.height ?? 720 } })} />
            <span>×</span>
            <input class="ma-input" type="number" min={64} max={3840} aria-label={t('sheet.height')} value={state.custom?.height ?? 720} onInput={(e) => set({ custom: { width: state.custom?.width ?? 1280, height: Number((e.target as HTMLInputElement).value) } })} />
          </div>
        )}
        <Field label={t('sheet.scale')} disabled={!on('scale')}>
          <select class="ma-input" disabled={!on('scale')} value={String(state.scale)} onChange={(e) => set({ scale: Number((e.target as HTMLSelectElement).value) })}>
            {[1, 2, 3].map((s) => <option key={s} value={String(s)}>{`${s}×`}</option>)}
          </select>
        </Field>
        <Field label={t('sheet.fps')} disabled={!on('fps')}>
          <select class="ma-input" disabled={!on('fps')} value={String(state.fps)} onChange={(e) => set({ fps: Number((e.target as HTMLSelectElement).value), fpsAuto: false })}>
            {[12, 15, 24, 30, 60].map((f) => <option key={f} value={String(f)}>{`${f} fps`}</option>)}
          </select>
        </Field>
        <Field label={t('sheet.speed')} disabled={!on('speed')}>
          <select class="ma-input" disabled={!on('speed')} value={String(state.speed)} onChange={(e) => set({ speed: Number((e.target as HTMLSelectElement).value) })}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => <option key={s} value={String(s)}>{`${s}×`}</option>)}
          </select>
        </Field>
        <Field label={t('sheet.theme')} disabled={!on('theme')}>
          <select class="ma-input" disabled={!on('theme')} value={state.theme} onChange={(e) => set({ theme: (e.target as HTMLSelectElement).value as SheetState['theme'] })}>
            <option value="current">{state.sheetFormat === 'html' ? t('sheet.theme.auto') : t('sheet.theme.current')}</option>
            <option value="ivory">Ivory</option>
            <option value="graphite">Graphite</option>
            <option value="monochrome">{t('sheet.theme.monochrome')}</option>
          </select>
        </Field>
        <Field label={t('sheet.background')} disabled={!on('background')}>
          <select class="ma-input" disabled={!on('background')} value={state.background.startsWith('#') ? 'custom' : state.background} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; set({ background: v === 'custom' ? '#ffffff' : v }); }}>
            <option value="theme">{t('sheet.background.theme')}</option>
            <option value="transparent" disabled={!on('transparent')}>{t('sheet.background.transparent')}</option>
            {on('size') && <option value="custom">{t('sheet.background.custom')}</option>}
          </select>
          {state.background.startsWith('#') && on('background') && <input class="ma-color" type="color" aria-label={t('sheet.background.custom')} value={state.background} onInput={(e) => set({ background: (e.target as HTMLInputElement).value })} />}
        </Field>
        <fieldset class={`ma-field ma-field--group${on('burnIn') ? '' : ' ma-field--disabled'}`} disabled={!on('burnIn')}>
          <legend class="ma-field__label">{t('sheet.burnIn')}</legend>
          {(['captions', 'title', 'counter', 'transport', 'names'] as const).map((k) => (
            <label key={k} class="ma-inspector__check">
              {/* Participant names apply to the sequence view only. */}
              <input type="checkbox" disabled={k === 'names' && (!native || state.view === 'topology')} checked={state.burnIn[k]} onChange={(e) => set({ burnIn: { ...state.burnIn, [k]: (e.target as HTMLInputElement).checked } })} />
              {t(`sheet.burnIn.${k}`)}
            </label>
          ))}
        </fieldset>
        <Field label={t('sheet.loop')} disabled={!on('loop')}>
          <select class="ma-input" disabled={!on('loop')} value={String(state.loop)} onChange={(e) => set({ loop: Number((e.target as HTMLSelectElement).value) })}>
            <option value="0">{t('sheet.loop.forever')}</option>
            <option value="1">{t('sheet.loop.once')}</option>
            {[2, 3, 5].map((n) => <option key={n} value={String(n)}>{t('sheet.loop.times', n)}</option>)}
          </select>
        </Field>
        <Field label={t('sheet.hold', state.hold)} disabled={!on('hold')}>
          <input class="ma-range" type="range" min={0} max={5} step={0.5} disabled={!on('hold')} value={state.hold} onInput={(e) => set({ hold: Number((e.target as HTMLInputElement).value) })} />
        </Field>
        <Field label={t('sheet.quality')} disabled={!on('quality')}>
          <select class="ma-input" disabled={!on('quality')} value={state.quality} onChange={(e) => set({ quality: (e.target as HTMLSelectElement).value as SheetState['quality'] })}>
            <option value="low">{t('sheet.quality.low')}</option>
            <option value="medium">{t('sheet.quality.medium')}</option>
            <option value="high">{t('sheet.quality.high')}</option>
          </select>
        </Field>
        <label class={`ma-inspector__check${on('dither') ? '' : ' ma-field--disabled'}`}>
          <input type="checkbox" disabled={!on('dither')} checked={state.dither} onChange={(e) => set({ dither: (e.target as HTMLInputElement).checked })} />
          {t('sheet.dither')}
        </label>
        <label class={`ma-inspector__check${pairOn ? '' : ' ma-field--disabled'}`}>
          <input type="checkbox" disabled={!pairOn} checked={state.pair && pairOn} onChange={(e) => set({ pair: (e.target as HTMLInputElement).checked })} />
          {t('sheet.pair')}
        </label>
        <p class="ma-export-estimate" role="status">
          {est.seconds !== undefined && t('sheet.estimate.duration', est.seconds.toFixed(1))}
          {est.bytes !== undefined && ` · ${t('sheet.estimate.size', formatBytes(est.bytes))}`}
          {est.width !== undefined && ` · ${est.width} × ${est.height}`}
          {state.sheetFormat === 'animated-svg' && svgBytes !== undefined && ` · ${t('sheet.estimate.size', formatBytes(svgBytes))}`}
        </p>
        {warnSvg && <p class="ma-export-warning" role="alert">{t('sheet.svgTooLarge')}</p>}
        {progress && (
          <div class="ma-export-progress" role="progressbar" aria-label={t('sheet.exporting')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction * 100)}>
            <div class="ma-export-progress__bar" style={{ width: `${progress.fraction * 100}%` }} />
          </div>
        )}
      </div>
      <footer class="ma-export-sheet__foot">
        {busy && progress ? (
          <button type="button" class="ma-text-button" onClick={() => actions.cancel()}>
            {t('sheet.cancel')}
          </button>
        ) : (
          <button type="button" class="ma-text-button" onClick={close}>
            {t('sheet.close')}
          </button>
        )}
        <button type="button" class="ma-primary-button" disabled={busy || !material} onClick={() => void run()}>
          {state.sheetFormat === 'copy' ? t('toolbar.copyImage') : t('sheet.export')}
        </button>
      </footer>
    </aside>
  );
}
