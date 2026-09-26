/**
 * Render-and-encode worker (M3 D2, ADR-010). Draws every frame of an export on an
 * OffscreenCanvas with the Canvas 2D backend at its frame-exact time and encodes GIF (gifenc) or
 * WebM/MP4 (WebCodecs through Mediabunny). Frames of generic diagrams are drawn on the main thread
 * and streamed in as ImageBitmaps; burn-ins are added here either way.
 * Embedded as text by the build and started from a blob (see workers/embedded.ts).
 */
import { BufferTarget, CanvasSource, canEncodeVideo, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, WebMOutputFormat, type VideoCodec } from 'mediabunny';
import { drawBackground, drawBurnIns, drawFrame, prepareJob, type PreparedJob } from '../animated/draw';
import { frameTime } from '../animated/frames';
import { buildPalette, GifWriter, samplePixels } from '../animated/gif';
import type { ExportJob, WorkerRequest, WorkerResponse } from '../animated/job';

/** The dedicated-worker global, typed minimally (the webview tsconfig carries DOM types only). */
declare const self: {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  fonts?: FontFaceSet;
};

let cancelled = false;
let pendingFrame: ((bitmap: ImageBitmap) => void) | undefined;

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer);

async function registerFonts(job: ExportJob): Promise<void> {
  if (!self.fonts || typeof FontFace === 'undefined') return;
  for (const f of job.fonts) {
    const face = new FontFace(f.family, f.data, { weight: '100 900', unicodeRange: f.unicodeRange });
    await face.load();
    self.fonts.add(face);
  }
}

/** The next frame's pixels: drawn here for scene sources, awaited from the main thread otherwise. */
async function render(ctx: OffscreenCanvasRenderingContext2D, prepared: PreparedJob, n: number): Promise<void> {
  const { job } = prepared;
  const t = frameTime(job.range, job.plan, n);
  const elapsed = (n * 1000) / job.plan.fps;
  if (job.source.kind !== 'external') {
    drawFrame(ctx, prepared, t, elapsed);
    return;
  }
  const bitmap = await new Promise<ImageBitmap>((resolve) => {
    pendingFrame = resolve;
    post({ type: 'next', index: n });
  });
  drawBackground(ctx, prepared);
  ctx.drawImage(bitmap, 0, 0, job.width, job.height);
  bitmap.close();
  drawBurnIns(ctx, prepared, t, elapsed);
}

async function encodeGif(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, prepared: PreparedJob): Promise<ArrayBuffer> {
  const { job } = prepared;
  const total = job.plan.total;
  const transparent = job.background === 'transparent';
  // Palette from up to 12 evenly spaced frames (scene sources; streamed sources use their first frame).
  const samples: Uint8ClampedArray[] = [];
  if (job.source.kind !== 'external') {
    const count = Math.min(12, total);
    for (let i = 0; i < count; i++) {
      const n = count === 1 ? 0 : Math.round((i * (total - 1)) / (count - 1));
      drawFrame(ctx, prepared, frameTime(job.range, job.plan, n), (n * 1000) / job.plan.fps);
      samples.push(ctx.getImageData(0, 0, job.width, job.height).data);
      post({ type: 'progress', done: i + 1, total: count, phase: 'palette' });
      if (cancelled) throw new Error('cancelled');
    }
  }
  let writer: GifWriter | undefined;
  const make = (sample: Uint8ClampedArray[]) => {
    const { palette, transparentIndex } = buildPalette(samplePixels(sample), transparent);
    return new GifWriter(job.width, job.height, palette, { fps: job.plan.fps, loop: job.loop, transparentIndex, dither: job.dither, transparent });
  };
  if (samples.length) writer = make(samples);
  for (let n = 0; n < total; n++) {
    if (cancelled) throw new Error('cancelled');
    await render(ctx, prepared, n);
    const rgba = ctx.getImageData(0, 0, job.width, job.height).data;
    writer ??= make([rgba]);
    writer.write(rgba);
    if (n % 10 === 0 || n === total - 1) post({ type: 'progress', done: n + 1, total, phase: 'frames' });
  }
  post({ type: 'progress', done: total, total, phase: 'finishing' });
  void canvas;
  const bytes = writer!.finish();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function encodeVideo(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, prepared: PreparedJob): Promise<ArrayBuffer> {
  const { job } = prepared;
  const mp4 = job.format === 'mp4';
  let codec: VideoCodec = mp4 ? 'avc' : 'vp9';
  if (!(await canEncodeVideo(codec, { width: job.width, height: job.height }))) {
    if (mp4) throw new Error('H.264 encoding is not available here; export as WebM instead.');
    codec = 'vp8';
  }
  const output = new Output({ format: mp4 ? new Mp4OutputFormat() : new WebMOutputFormat(), target: new BufferTarget() });
  const bitrate = job.quality === 'high' ? QUALITY_HIGH : job.quality === 'low' ? QUALITY_LOW : QUALITY_MEDIUM;
  const source = new CanvasSource(canvas, { codec, bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: job.plan.fps });
  await output.start();
  const total = job.plan.total;
  const duration = 1 / job.plan.fps;
  try {
    for (let n = 0; n < total; n++) {
      if (cancelled) throw new Error('cancelled');
      await render(ctx, prepared, n);
      await source.add(n * duration, duration);
      if (n % 10 === 0 || n === total - 1) post({ type: 'progress', done: n + 1, total, phase: 'frames' });
    }
    post({ type: 'progress', done: total, total, phase: 'finishing' });
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }
  return (output.target as BufferTarget).buffer as ArrayBuffer;
}

async function run(job: ExportJob): Promise<void> {
  try {
    await registerFonts(job);
    const canvas = new OffscreenCanvas(job.width, job.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: job.format === 'gif' });
    if (!ctx) throw new Error('OffscreenCanvas 2D is unavailable.');
    const prepared = prepareJob(job);
    const bytes = job.format === 'gif' ? await encodeGif(canvas, ctx, prepared) : await encodeVideo(canvas, ctx, prepared);
    post({ type: 'done', bytes, mime: job.format === 'gif' ? 'image/gif' : job.format === 'mp4' ? 'video/mp4' : 'video/webm', frames: job.plan.total }, [bytes]);
  } catch (error) {
    if (cancelled) post({ type: 'cancelled' });
    else post({ type: 'error', message: String((error as Error)?.message ?? error) });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'start') {
    cancelled = false;
    void run(message.job);
  } else if (message.type === 'frame') {
    const resolve = pendingFrame;
    pendingFrame = undefined;
    resolve?.(message.bitmap);
  } else if (message.type === 'probe') {
    void (async () => {
      await registerFonts(message.job);
      const canvas = new OffscreenCanvas(message.job.width, message.job.height);
      const ctx = canvas.getContext('2d')!;
      const prepared = prepareJob(message.job);
      await render(ctx, prepared, message.index);
      const pixels = ctx.getImageData(0, 0, message.job.width, message.job.height).data.buffer as ArrayBuffer;
      post({ type: 'probe', pixels, width: message.job.width, height: message.job.height }, [pixels]);
    })();
  } else if (message.type === 'cancel') {
    cancelled = true;
    // Unblock a streamed source waiting for its next frame.
    pendingFrame?.(new OffscreenCanvas(1, 1).transferToImageBitmap());
  }
};
