/**
 * Export sheet logic (spec animated-export): which options apply to each format, the initial
 * choices from settings, and the duration and size estimates. Pure, so it is unit-tested.
 */
import type { Timeline } from '@mermaid-animator/core';
import { estimateBytes, exportDimensions, type AnimatedOptions } from './exporter';
import { exportRange, framePlan, type RangeKind } from './frames';

export type SheetFormat = 'svg' | 'png' | 'gif' | 'webm' | 'mp4' | 'animated-svg' | 'html' | 'copy';

export type SheetField = 'range' | 'view' | 'camera' | 'size' | 'scale' | 'fps' | 'speed' | 'theme' | 'background' | 'transparent' | 'burnIn' | 'loop' | 'hold' | 'quality' | 'dither' | 'pair';

const ANIMATED: SheetFormat[] = ['gif', 'webm', 'mp4'];

/** Options that apply to a format; everything else is shown disabled. */
export function fieldsFor(format: SheetFormat): ReadonlySet<SheetField> {
  const f = new Set<SheetField>();
  if (ANIMATED.includes(format)) ['range', 'view', 'camera', 'size', 'scale', 'fps', 'speed', 'theme', 'background', 'burnIn', 'hold'].forEach((x) => f.add(x as SheetField));
  if (format === 'gif') ['loop', 'dither', 'transparent'].forEach((x) => f.add(x as SheetField));
  if (format === 'webm' || format === 'mp4') f.add('quality');
  if (format === 'animated-svg') ['range', 'view', 'speed', 'loop', 'hold', 'pair'].forEach((x) => f.add(x as SheetField));
  if (format === 'html') ['view', 'theme'].forEach((x) => f.add(x as SheetField));
  if (format === 'png') ['scale', 'background', 'transparent'].forEach((x) => f.add(x as SheetField));
  if (format === 'svg') ['background', 'transparent'].forEach((x) => f.add(x as SheetField));
  return f;
}

export interface SheetState extends Omit<AnimatedOptions, 'view'> {
  /** Split is offered for the HTML player only; animated exports use one view. */
  view: 'sequence' | 'topology' | 'split';
  sheetFormat: SheetFormat;
  pair: boolean;
  /** The frame rate follows the format (GIF 15, video 30) until the user or a setting picks one. */
  fpsAuto: boolean;
}

/** Default frame rate for a format when `export.fps` is not set. */
export function autoFps(format: SheetFormat): number {
  return format === 'gif' ? 15 : 30;
}

export function initialSheet(defaults: { format: string; fps?: number; scale: number; background: string; captions: boolean }, mp4: boolean): SheetState {
  const wanted = defaults.format as SheetFormat;
  const sheetFormat: SheetFormat = wanted === 'mp4' && !mp4 ? 'webm' : wanted;
  return {
    fpsAuto: defaults.fps === undefined,
    sheetFormat,
    format: sheetFormat === 'webm' || sheetFormat === 'mp4' ? sheetFormat : 'gif',
    range: 'all',
    view: 'sequence',
    camera: 'fit',
    size: 'hd',
    scale: defaults.scale,
    fps: defaults.fps ?? autoFps(sheetFormat),
    speed: 1,
    theme: 'current',
    background: defaults.background,
    burnIn: { captions: defaults.captions, title: false, counter: false, transport: false },
    loop: 0,
    hold: 1.5,
    quality: 'medium',
    dither: false,
    pair: false,
  };
}

export interface Estimate {
  seconds?: number;
  bytes?: number;
  width?: number;
  height?: number;
  frames?: number;
}

/** Duration and size for animated raster/video formats (animated SVG and HTML are measured by compiling). */
export function estimate(state: SheetState, timeline: Timeline, content: { w: number; h: number }, context: { rest: number; chapters: { firstStep: number }[]; ab?: { from?: number; to?: number } }): Estimate {
  const range = exportRange(state.range as RangeKind, timeline, context);
  const plan = framePlan(range, state.fps, state.speed, state.hold);
  if (state.sheetFormat === 'animated-svg') return { seconds: (range.end - range.start) / 1000 / state.speed + state.hold };
  if (!ANIMATED.includes(state.sheetFormat)) return {};
  const { width, height } = exportDimensions(state, content);
  // The nominal duration (range ÷ speed + hold): it does not change with the frame rate.
  const seconds = (range.end - range.start) / 1000 / state.speed + state.hold;
  return { seconds, frames: plan.total, width, height, bytes: estimateBytes(state.format, width, height, plan.total, state.fps, state.quality, state.dither) };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Whether the host's encoder supports H.264 (MP4) at this size; WebM is always offered. */
export async function mp4Supported(width = 1280, height = 720): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    return (await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width, height })).supported === true;
  } catch {
    return false;
  }
}
