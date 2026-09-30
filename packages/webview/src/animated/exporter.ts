/**
 * Main-thread side of animated exports (M3 D2/D3): turns sheet options and the controller's
 * drawing into an ExportJob, runs the render-and-encode worker through the blob shim, streams
 * main-thread frames for generic diagrams, and reports progress and cancellation.
 */
import { cinematicView } from '../camera';
import { exportWorkerUrl } from '../workers/embedded';
import { cameraAt, exportRange, fitFrame, framePlan, frameTime, type ExportCamera, type RangeKind } from './frames';
import type { AnimatedFormat, BurnIn, ExportJob, SceneSource, WorkerRequest, WorkerResponse } from './job';
import type { ExportMaterial } from './material';
import { exportPalette, type ExportTheme } from './theme';

export type SizePreset = 'hd' | 'fhd' | 'square' | 'portrait' | 'fit' | 'custom';
export type CameraChoice = 'fit' | 'cinematic' | 'current';

export interface AnimatedOptions {
  format: AnimatedFormat;
  range: RangeKind;
  view: 'sequence' | 'topology';
  camera: CameraChoice;
  size: SizePreset;
  custom?: { width: number; height: number };
  scale: number;
  fps: number;
  speed: number;
  theme: ExportTheme;
  background: 'theme' | 'transparent' | string;
  burnIn: BurnIn;
  loop: number;
  hold: number;
  quality: 'low' | 'medium' | 'high';
  dither: boolean;
}

export const SIZE_PRESETS: Record<Exclude<SizePreset, 'fit' | 'custom'>, { width: number; height: number }> = {
  hd: { width: 1280, height: 720 },
  fhd: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1920 },
};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output size in pixels (video encoders need even dimensions). */
export function exportDimensions(options: Pick<AnimatedOptions, 'size' | 'custom' | 'scale'>, content: { w: number; h: number }): { width: number; height: number } {
  const base =
    options.size === 'fit' ? { width: content.w + 48, height: content.h + 48 } : options.size === 'custom' ? (options.custom ?? SIZE_PRESETS.hd) : SIZE_PRESETS[options.size];
  return { width: even(base.width * options.scale), height: even(base.height * options.scale) };
}

/** Estimated file size in bytes (sheet estimates): calibrated on the demo fixtures' flat artwork. */
export function estimateBytes(format: AnimatedFormat, width: number, height: number, frames: number, fps: number, quality: AnimatedOptions['quality'], dither: boolean): number {
  const pixels = width * height;
  // Calibrated on the demo exports (M3 notes): delta-coded GIF frames cost ≈ 0.004 B/px after a
  // full first frame (≈ 0.06 B/px); VP9/H.264 average ≈ 0.02 bit/px/frame at medium quality.
  if (format === 'gif') return Math.round((pixels * 0.06 + Math.max(0, frames - 1) * pixels * 0.004) * (dither ? 1.7 : 1) + 800);
  const factor = quality === 'high' ? 2 : quality === 'low' ? 0.5 : 1;
  const bitsPerSecond = pixels * fps * 0.02 * factor;
  return Math.round(((frames / fps) * bitsPerSecond) / 8 + 1200);
}

/** The export camera: whole drawing, the step-by-step Cinematic framing, or the panel's current view. */
export function planCamera(choice: CameraChoice, material: ExportMaterial, width: number, height: number): ExportCamera {
  const content = material.content;
  const fit = fitFrame(content, width, height, 24 * Math.max(1, width / 1280));
  if (choice === 'current' && material.view && material.viewport) {
    const { view, viewport } = material;
    const s = Math.min(width / viewport.width, height / viewport.height);
    return { kind: 'fixed', view: { k: view.k * s, x: view.x * s + (width - viewport.width * s) / 2, y: view.y * s + (height - viewport.height * s) / 2 } };
  }
  if (choice !== 'cinematic' || !material.stepBounds) return { kind: 'fixed', view: fit };
  const views = [];
  let previous = fit;
  for (let k = 0; k < material.timeline.starts.length; k++) {
    const bounds = material.stepBounds(k);
    const target = bounds ? (material.cinematicTarget?.(k, bounds) ?? bounds) : content;
    previous = cinematicView(target, { width, height }, previous);
    views.push(previous);
  }
  return { kind: 'steps', initial: fit, views, starts: [...material.timeline.starts], glide: material.timeline.transitions.map((t) => Math.min(t, 480)) };
}

export function buildJob(material: ExportMaterial, options: AnimatedOptions, fonts: ExportJob['fonts']): ExportJob {
  const content = material.content;
  const { width, height } = exportDimensions(options, content);
  const range = exportRange(options.range, material.timeline, { rest: material.rest, chapters: material.chapters, ab: material.ab });
  const plan = framePlan(range, options.fps, options.speed, options.hold);
  const source: SceneSource = material.source();
  const palette = exportPalette(options.theme, material.palette);
  return {
    format: options.format,
    width,
    height,
    range,
    plan,
    source,
    camera: planCamera(options.camera, material, width, height),
    display: material.display,
    palette,
    background: options.format === 'gif' ? options.background : options.background === 'transparent' ? 'theme' : options.background,
    burnIn: options.burnIn,
    text: material.text,
    loop: options.loop,
    quality: options.quality,
    dither: options.dither,
    fonts,
  };
}

export interface RunCallbacks {
  onProgress(fraction: number, phase: 'palette' | 'frames' | 'finishing'): void;
}

export interface ExportHandle {
  result: Promise<{ bytes: Uint8Array; mime: string; frames: number } | undefined>;
  cancel(): void;
}

/**
 * Runs a job in the worker. Resolves with the encoded bytes, or `undefined` when cancelled.
 * External (generic) sources are rendered here, one frame at a time, as the worker asks for them.
 */
export function runJob(job: ExportJob, material: ExportMaterial, callbacks: RunCallbacks): ExportHandle {
  let worker: Worker | undefined;
  let terminated = false;
  const queue: [WorkerRequest, Transferable[]][] = [];
  let cancelled = false;
  let settle: (value: { bytes: Uint8Array; mime: string; frames: number } | undefined) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const result = new Promise<{ bytes: Uint8Array; mime: string; frames: number } | undefined>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  // The worker starts once its embedded source has loaded; messages sent before then are queued.
  const send = (message: WorkerRequest, transfer: Transferable[] = []) => {
    if (worker) worker.postMessage(message, transfer);
    else queue.push([message, transfer]);
  };
  const finish = () => {
    terminated = true;
    worker?.terminate();
  };
  const onMessage = async (event: MessageEvent<WorkerResponse>) => {
    const m = event.data;
    switch (m.type) {
      case 'progress': {
        // Palette sampling counts for 10% of a GIF export.
        const fraction = m.phase === 'palette' ? (m.done / m.total) * 0.1 : m.phase === 'finishing' ? 1 : (job.format === 'gif' && job.source.kind !== 'external' ? 0.1 : 0) + (m.done / m.total) * (job.format === 'gif' && job.source.kind !== 'external' ? 0.9 : 1);
        callbacks.onProgress(Math.min(1, fraction), m.phase);
        break;
      }
      case 'next': {
        if (cancelled) return;
        const bitmap = await material.externalFrame!(frameTime(job.range, job.plan, m.index), job.width, job.height, cameraAt(job.camera, frameTime(job.range, job.plan, m.index)));
        send({ type: 'frame', index: m.index, bitmap }, [bitmap]);
        break;
      }
      case 'done':
        finish();
        settle(cancelled ? undefined : { bytes: new Uint8Array(m.bytes), mime: m.mime, frames: m.frames });
        break;
      case 'cancelled':
        finish();
        settle(undefined);
        break;
      case 'error':
        finish();
        if (cancelled) settle(undefined);
        else fail(new Error(m.message));
        break;
    }
  };
  void exportWorkerUrl()
    .then((url) => {
      if (terminated) return;
      worker = new Worker(url);
      worker.onmessage = onMessage;
      worker.onerror = (event) => {
        finish();
        fail(new Error(event.message || 'The export worker failed to start.'));
      };
      for (const [message, transfer] of queue.splice(0)) worker.postMessage(message, transfer);
    })
    .catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));
  send({ type: 'start', job }, job.fonts.map((f) => f.data));
  return {
    result,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      send({ type: 'cancel' });
      // Stop within a second even if the worker is busy encoding.
      setTimeout(() => {
        finish();
        settle(undefined);
      }, 800);
    },
  };
}
