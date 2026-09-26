/**
 * Harness verification for M3 (tasks 1.1–1.3, 2.1): renders one instant with the SVG renderer
 * (serialised and rasterised like static export) and with the Canvas 2D backend, and compares the
 * pixels. Loaded lazily and reachable only through the harness hook.
 */
import { sceneAt, SequenceSvgRenderer, SVG_NS, TopologySvgRenderer, prepareScene, prepareTopologyScene, topologySceneAt } from '@mermaid-animator/renderer';
import type { DiagramController } from '../controller';
import { rasterize, serializeSvg } from '../export';
import { drawBackground, drawScene, prepareJob } from './draw';
import { buildJob, type AnimatedOptions } from './exporter';

const BASE: AnimatedOptions = {
  format: 'gif', range: 'all', view: 'sequence', camera: 'fit', size: 'fit', scale: 1, fps: 30, speed: 1, theme: 'current', background: 'theme',
  burnIn: { captions: false, title: false, counter: false, transport: false }, loop: 0, hold: 0, quality: 'high', dither: false,
};

async function bitmapOf(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

export interface Comparison {
  width: number;
  height: number;
  /** Mean absolute channel difference, 0–1. */
  mean: number;
  /** Share of pixels whose largest channel difference exceeds 64/255. */
  differing: number;
}

function compare(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): Comparison {
  let sum = 0;
  let differing = 0;
  for (let i = 0; i < a.length; i += 4) {
    let max = 0;
    for (let ch = 0; ch < 3; ch++) {
      const d = Math.abs((a[i + ch] as number) - (b[i + ch] as number));
      sum += d;
      if (d > max) max = d;
    }
    if (max > 64) differing++;
  }
  return { width, height, mean: sum / (a.length * 0.75) / 255, differing: differing / (a.length / 4) };
}

/** Canvas backend vs SVG renderer at time `t` for the sequence or topology view. */
export async function compareBackends(controller: DiagramController, view: 'sequence' | 'topology', t: number): Promise<Comparison> {
  const material = controller.exportMaterial(view)!;
  const job = buildJob(material, { ...BASE, view }, []);
  const { width, height } = job;
  const prepared = prepareJob(job);
  const canvasA = new OffscreenCanvas(width, height);
  const a = canvasA.getContext('2d')!;
  drawBackground(a, prepared);
  drawScene(a, prepared, t);

  // SVG path: a detached renderer, serialised with resolved colours, rasterised with the same camera.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ma-svg');
  const g = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(g);
  const source = job.source;
  const bounds = material.content;
  if (source.kind === 'sequence') {
    const r = new SequenceSvgRenderer(g);
    r.mount(source.layout);
    r.render(sceneAt(prepareScene(source.layout, source.compiled, source.timeline), t, job.display), { comet: false });
  } else if (source.kind === 'topology') {
    const r = new TopologySvgRenderer(g);
    r.mount(source.topology, source.geometry, source.labels);
    r.render(topologySceneAt(prepareTopologyScene(source.topology, source.compiled, source.timeline), t, job.display), source.geometry, { comet: false, weight: source.weight });
    g.setAttribute('transform', `translate(${-bounds.x} ${-bounds.y})`);
  }
  const text = serializeSvg({ svg, width: bounds.w, height: bounds.h }, { background: 'transparent' });
  const png = await rasterize(text, bounds.w + 32, bounds.h + 32, 1);
  const image = await bitmapOf(png);
  const canvasB = new OffscreenCanvas(width, height);
  const b = canvasB.getContext('2d')!;
  drawBackground(b, prepared);
  const view0 = job.camera.kind === 'fixed' ? job.camera.view : job.camera.initial;
  b.setTransform(view0.k, 0, 0, view0.k, view0.x, view0.y);
  b.drawImage(image, bounds.x - 16, bounds.y - 16, bounds.w + 32, bounds.h + 32);
  return compare(a.getImageData(0, 0, width, height).data, b.getImageData(0, 0, width, height).data, width, height);
}

/** Text advance measured on the main thread and in a worker with the embedded fonts (task 1.3). */
export async function measureInWorker(samples: string[], font: string): Promise<{ main: number[]; worker: number[] }> {
  // As the controller does before layout: load the subsets the text needs.
  await document.fonts.load(font, samples.join(''));
  const ctx = new OffscreenCanvas(10, 10).getContext('2d')!;
  ctx.font = font;
  const main = samples.map((s) => ctx.measureText(s).width);
  const { EMBEDDED_FONTS, dataUrlBytes } = await import('../export');
  const fonts = EMBEDDED_FONTS.map((f) => ({ family: f.family, data: dataUrlBytes(f.url), unicodeRange: f.unicodeRange }));
  const source = `
    self.onmessage = async (e) => {
      for (const f of e.data.fonts) { const face = new FontFace(f.family, f.data, { weight: '100 900', unicodeRange: f.unicodeRange }); await face.load(); self.fonts.add(face); }
      const ctx = new OffscreenCanvas(10, 10).getContext('2d'); ctx.font = e.data.font;
      self.postMessage(e.data.samples.map((s) => ctx.measureText(s).width));
    };`;
  const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  const widths = await new Promise<number[]>((resolve) => {
    worker.onmessage = (e: MessageEvent<number[]>) => resolve(e.data);
    worker.postMessage({ fonts, font, samples }, fonts.map((f) => f.data));
  });
  worker.terminate();
  return { main, worker: widths };
}

/** Frame `n` of a worker export against the Canvas backend at the frame's time on the main thread (task 2.1). */
export async function workerFrameMatches(controller: DiagramController, n: number, fps: number): Promise<{ t: number; identical: boolean; differing: number }> {
  const material = controller.exportMaterial('sequence')!;
  const { EMBEDDED_FONTS, dataUrlBytes } = await import('../export');
  const fonts = EMBEDDED_FONTS.map((f) => ({ family: f.family, data: dataUrlBytes(f.url), unicodeRange: f.unicodeRange }));
  const job = buildJob(material, { ...BASE, fps }, fonts);
  const t = job.range.start + (n * 1000 * job.plan.speed) / fps;
  // Main thread
  const canvas = new OffscreenCanvas(job.width, job.height);
  const ctx = canvas.getContext('2d')!;
  const prepared = prepareJob(job);
  drawBackground(ctx, prepared);
  drawScene(ctx, prepared, t);
  const mine = ctx.getImageData(0, 0, job.width, job.height).data;
  // Worker: the real export worker draws frame n of the same job.
  const { exportWorkerUrl } = await import('../workers/embedded');
  const worker = new Worker(await exportWorkerUrl());
  const theirs = await new Promise<Uint8ClampedArray>((resolve) => {
    worker.onmessage = (e: MessageEvent<{ type: string; pixels?: ArrayBuffer }>) => {
      if (e.data.type === 'probe') resolve(new Uint8ClampedArray(e.data.pixels!));
    };
    worker.postMessage({ type: 'probe', job, index: n }, fonts.map((f) => f.data));
  });
  worker.terminate();
  let exact = true;
  for (let i = 0; i < mine.length; i++) if (mine[i] !== theirs[i]) exact = false;
  const result = compare(mine, theirs, job.width, job.height);
  return { t, identical: exact, differing: result.differing };
}
