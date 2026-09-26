/**
 * Frame-exact timing for animated exports (spec animated-export): frame `n` shows the scene at
 * `start + n / fps × speed` of the range; the range yields `ceil(d × fps)` frames (d = range
 * length ÷ speed, in seconds) followed by the end hold, which repeats the range's last instant.
 * Pure and shared by the main thread and the export worker.
 */
import { stepEnd, type Rect, type Timeline } from '@mermaid-animator/core';
import type { View } from '../camera';

export interface FrameRange {
  /** Timeline times in ms. */
  start: number;
  end: number;
}

export interface FramePlan {
  fps: number;
  speed: number;
  /** Frames sampling the range (without the hold). */
  moving: number;
  /** Frames repeating the last instant. */
  hold: number;
  total: number;
}

export function framePlan(range: FrameRange, fps: number, speed: number, holdSeconds: number): FramePlan {
  const seconds = Math.max(0, range.end - range.start) / 1000 / speed;
  const moving = Math.ceil(seconds * fps - 1e-9);
  const hold = Math.ceil(holdSeconds * fps - 1e-9);
  return { fps, speed, moving, hold, total: moving + hold };
}

/** Timeline time (ms) of frame `n`. */
export function frameTime(range: FrameRange, plan: FramePlan, n: number): number {
  if (n >= plan.moving) return range.end;
  return Math.min(range.end, range.start + (n * 1000 * plan.speed) / plan.fps);
}

/** Export duration in seconds (moving frames plus hold). */
export function exportSeconds(plan: FramePlan): number {
  return plan.total / plan.fps;
}

export type RangeKind = 'all' | 'chapter' | 'ab' | 'step';

/** The rest time before step `k` (0 before the first step). */
const restBefore = (timeline: Timeline, k: number) => (k <= 0 ? 0 : stepEnd(timeline, k - 1));

/**
 * The timeline range of an export: all steps, the chapter containing the resting step, the A–B
 * loop range, or the current step (from its preceding rest to its own rest).
 */
export function exportRange(kind: RangeKind, timeline: Timeline, context: { rest: number; chapters: { firstStep: number }[]; ab?: { from?: number; to?: number } }): FrameRange {
  const count = timeline.starts.length;
  if (!count) return { start: 0, end: 0 };
  const last = count - 1;
  switch (kind) {
    case 'chapter': {
      const at = Math.max(0, context.rest);
      const chapters = [...context.chapters].sort((a, b) => a.firstStep - b.firstStep);
      const index = chapters.reduce((found, c, i) => (c.firstStep <= at ? i : found), -1);
      if (index < 0) return { start: 0, end: stepEnd(timeline, Math.max(0, (chapters[0]?.firstStep ?? count) - 1)) };
      const first = chapters[index]!.firstStep;
      const next = chapters[index + 1]?.firstStep ?? count;
      return { start: restBefore(timeline, first), end: stepEnd(timeline, next - 1) };
    }
    case 'ab': {
      const from = context.ab?.from ?? -1;
      const to = context.ab?.to ?? last;
      return { start: from < 0 ? 0 : stepEnd(timeline, Math.min(from, last)), end: stepEnd(timeline, Math.min(Math.max(to, 0), last)) };
    }
    case 'step': {
      const k = Math.min(Math.max(context.rest, 0), last);
      return { start: restBefore(timeline, k), end: stepEnd(timeline, k) };
    }
    default:
      return { start: 0, end: timeline.duration };
  }
}

// -- camera ---------------------------------------------------------------------------------------------------------

export type ExportCamera = { kind: 'fixed'; view: View } | { kind: 'steps'; initial: View; views: View[]; starts: number[]; glide: number[] };

/** Fits content (plus padding) into a frame, centred, at any scale. */
export function fitFrame(content: Rect, width: number, height: number, padding: number): View {
  const k = Math.min((width - 2 * padding) / Math.max(1, content.w), (height - 2 * padding) / Math.max(1, content.h));
  return { k, x: width / 2 - (content.x + content.w / 2) * k, y: height / 2 - (content.y + content.h / 2) * k };
}

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** The camera view at time `t`: fixed, or gliding from the previous step's framing to the current step's. */
export function cameraAt(camera: ExportCamera, t: number): View {
  if (camera.kind === 'fixed') return camera.view;
  let k = -1;
  for (let i = 0; i < camera.starts.length; i++) if ((camera.starts[i] as number) <= t) k = i;
  if (k < 0) return camera.initial;
  const from = k === 0 ? camera.initial : (camera.views[k - 1] as View);
  const to = camera.views[k] as View;
  const p = Math.min(1, Math.max(0, (t - (camera.starts[k] as number)) / Math.max(1, camera.glide[k] as number)));
  const e = ease(p);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
}
