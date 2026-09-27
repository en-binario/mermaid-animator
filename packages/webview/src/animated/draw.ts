/**
 * Draws one export frame (M3 D1/D2): background, camera, the scene at time `t` through the
 * Canvas 2D backend, and the burn-ins (captions, title card, step counter, transport, participant names). Runs in the
 * export worker on an OffscreenCanvas and on the main thread for verification.
 */
import { positionAt } from '@mermaid-animator/core';
import {
  canvasPalette, drawSequence, drawTopology, prepareScene, prepareTopologyScene, runFont, sceneAt, topologySceneAt,
  type CanvasPalette, type Ctx2D, type SceneModel, type TopologySceneModel,
} from '@mermaid-animator/renderer';
import { cameraAt } from './frames';
import { RAIL, railEntries, railFont, stepParticipants } from '../orientation/model';
import type { ExportJob } from './job';

export interface PreparedJob {
  job: ExportJob;
  palette: CanvasPalette;
  sequence?: SceneModel;
  topology?: TopologySceneModel;
}

export function prepareJob(job: ExportJob): PreparedJob {
  const palette = canvasPalette(job.palette);
  const s = job.source;
  if (s.kind === 'sequence') return { job, palette, sequence: prepareScene(s.layout, s.compiled, s.timeline) };
  if (s.kind === 'topology') return { job, palette, topology: prepareTopologyScene(s.topology, s.compiled, s.timeline) };
  return { job, palette };
}

/** Fills the background (nothing for a transparent export). */
export function drawBackground(ctx: Ctx2D, prepared: PreparedJob): void {
  const { job, palette } = prepared;
  ctx.clearRect(0, 0, job.width, job.height);
  if (job.background === 'transparent') return;
  ctx.fillStyle = job.background === 'theme' ? palette.c.canvas : job.background;
  ctx.fillRect(0, 0, job.width, job.height);
}

/** Draws the diagram at `t` (sequence or topology), leaving the transform reset. */
export function drawScene(ctx: Ctx2D, prepared: PreparedJob, t: number): void {
  const { job, palette } = prepared;
  const view = cameraAt(job.camera, t);
  ctx.save();
  ctx.setTransform(view.k, 0, 0, view.k, view.x, view.y);
  const comet = job.display.indicator === 'comet';
  if (prepared.sequence && job.source.kind === 'sequence') drawSequence(ctx, job.source.layout, sceneAt(prepared.sequence, t, job.display), palette, { comet });
  else if (prepared.topology && job.source.kind === 'topology') drawTopology(ctx, job.source.topology, job.source.geometry, job.source.labels, topologySceneAt(prepared.topology, t, job.display), palette, { comet, weight: job.source.weight });
  ctx.restore();
}

function wrap(ctx: Ctx2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** Burn-ins drawn in frame pixels, scaled to the frame width (1280 px reference). */
export function drawBurnIns(ctx: Ctx2D, prepared: PreparedJob, t: number, elapsed: number): void {
  const { job, palette } = prepared;
  const c = palette.c;
  const s = Math.max(0.6, Math.min(job.width, job.height * 1.78) / 1280);
  const timeline = job.source.timeline;
  const k = positionAt(timeline, t).index;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const inter = (size: number, weight = 500) => `${weight} ${Math.round(size * s)}px "Inter Variable", system-ui, sans-serif`;

  const railHeight = job.burnIn.names ? drawRail(ctx, prepared, t, k, s) : 0;

  if (job.burnIn.counter && job.text.stepCount) {
    const label = `${String(Math.max(0, k + 1)).padStart(2, '0')} / ${String(job.text.stepCount).padStart(2, '0')}`;
    ctx.font = inter(15, 600);
    const w = ctx.measureText(label).width + 20 * s;
    const x = job.width - w - 16 * s;
    // Below the participant rail when it is shown.
    const y = railHeight + 16 * s;
    ctx.fillStyle = c.surface;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 28 * s, 6 * s);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = c['ink-2'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + 14 * s);
  }

  const caption = job.burnIn.captions && k >= 0 ? job.text.captions[k] : undefined;
  const transportHeight = job.burnIn.transport ? 6 * s : 0;
  if (caption) {
    ctx.font = inter(20, 450);
    const lines = wrap(ctx, caption, Math.min(job.width - 64 * s, 68 * 11 * s), 2);
    const lineHeight = 28 * s;
    const band = lines.length * lineHeight + 24 * s;
    const top = job.height - transportHeight - band;
    ctx.fillStyle = c.canvas;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, top, job.width, band);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c['ink-1'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, i) => ctx.fillText(line, job.width / 2, top + 12 * s + (i + 0.78) * lineHeight));
  }

  if (job.burnIn.transport) {
    const f = job.range.end > job.range.start ? Math.min(1, Math.max(0, (t - job.range.start) / (job.range.end - job.range.start))) : 1;
    ctx.fillStyle = c.hairline;
    ctx.fillRect(0, job.height - transportHeight, job.width, transportHeight);
    ctx.fillStyle = c.accent;
    ctx.fillRect(0, job.height - transportHeight, job.width * f, transportHeight);
  }

  // Title card: the first 1.6 s, fading out over the last 400 ms.
  if (job.burnIn.title && elapsed < 1600) {
    const alpha = elapsed < 1200 ? 1 : 1 - (elapsed - 1200) / 400;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = job.background === 'transparent' ? c.canvas : job.background === 'theme' ? c.canvas : job.background;
    ctx.fillRect(0, 0, job.width, job.height);
    ctx.fillStyle = c['ink-1'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = inter(40, 560);
    ctx.fillText(job.text.title, job.width / 2, job.height / 2);
    ctx.fillStyle = c.brass;
    ctx.fillRect(job.width / 2 - 60 * s, job.height / 2 + 18 * s, 120 * s, 1.5 * s);
    ctx.fillStyle = c['ink-3'];
    ctx.font = inter(16, 450);
    ctx.fillText(job.text.subtitle, job.width / 2, job.height / 2 + 48 * s);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * The participant rail (spec participant-orientation) in frame pixels, from the frame's camera and the
 * same rules as the panel. Returns the band's height (0 when no participant qualifies).
 */
function drawRail(ctx: Ctx2D, prepared: PreparedJob, t: number, step: number, s: number): number {
  const { job, palette } = prepared;
  if (job.source.kind !== 'sequence') return 0;
  const { layout, compiled } = job.source;
  const current = step >= 0 ? compiled.steps[step] : undefined;
  const involved = new Set(current ? stepParticipants(current, layout) : []);
  const font = railFont(s);
  const measure = (text: string, f: string) => {
    ctx.font = f;
    return ctx.measureText(text).width;
  };
  const entries = railEntries(layout, cameraAt(job.camera, t), { width: job.width, height: job.height }, { measure, involved, scale: s });
  if (!entries.length) return 0;
  const c = palette.c;
  const height = RAIL.height * s;
  ctx.globalAlpha = 0.86;
  ctx.fillStyle = c.surface;
  ctx.fillRect(0, 0, job.width, height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.hairline;
  ctx.fillRect(0, height - Math.max(1, s), job.width, Math.max(1, s));
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of entries) {
    ctx.fillStyle = e.state === 'current' ? c.accent : c['ink-1'];
    if (e.tick) ctx.fillRect(e.lifelineX - s, 7 * s, 2 * s, 10 * s);
    else if (e.runs) {
      // Formatted name (spec label-formatting): runs left to right, centred as a whole.
      const fonts = e.runs.map((r) => runFont(font, r, 'participant'));
      const widths = e.runs.map((r, i) => {
        ctx.font = fonts[i]!;
        return ctx.measureText(r.text).width;
      });
      let x = e.x - widths.reduce((a, w) => a + w, 0) / 2;
      ctx.textAlign = 'left';
      e.runs.forEach((r, i) => {
        ctx.font = fonts[i]!;
        ctx.fillText(r.text, x, height / 2);
        x += widths[i]!;
      });
      ctx.font = font;
      ctx.textAlign = 'center';
    } else ctx.fillText(e.label, e.x, height / 2);
  }
  return height;
}

/** One complete frame for a scene source. */
export function drawFrame(ctx: Ctx2D, prepared: PreparedJob, t: number, elapsed: number): void {
  drawBackground(ctx, prepared);
  drawScene(ctx, prepared, t);
  drawBurnIns(ctx, prepared, t, elapsed);
}
