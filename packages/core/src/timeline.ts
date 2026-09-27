/**
 * Timeline (spec §13.7): each step owns a transition window followed by a dwell. Time 0 is the
 * initial state (nothing played). The visual state is a pure function of the position at `t`.
 */
import type { Step } from './steps';

export interface Timeline {
  /** Start of each step's transition, in ms. */
  starts: number[];
  transitions: number[];
  /** Part of each dwell in which the step's choreography settles (arrowhead, activation, glow). */
  settles: number[];
  dwells: number[];
  /** Steps whose dwell waits for the user during autoplay (`@pause` with no duration). */
  holds: boolean[];
  duration: number;
  /**
   * Initial overview (spec initial-overview): the part of step 0's transition, at its start, in
   * which the complete diagram clears before the step draws. Absent without an overview.
   */
  clear?: number;
}

export interface TimelineOptions {
  /** Show the complete diagram before the first step; step 0's transition begins with a clear. */
  overview?: boolean;
  /** How long playback rests on the overview when it plays through it (the overview's dwell). */
  leadInMs?: number;
}

/** Fade-out of the overview at the start of step 0 (DURATION.base). */
export const CLEAR_MS = 240;

export interface Position {
  /** Step whose transition has started; -1 before the first step. */
  index: number;
  phase: 'initial' | 'transition' | 'dwell';
  /** 0–1 progress through the transition (1 during the dwell). */
  progress: number;
  /** Milliseconds elapsed since the transition started (after the overview clear; negative during it). */
  elapsed: number;
  /** Overview clear progress: 0 while the complete diagram shows, 1 once it has cleared. */
  cleared: number;
}

/** Choreography that follows the travel (arrowhead, activation growth, receiver glow): spec §9.8.3. */
export const SETTLE_MS = 240;

export function buildTimeline(steps: readonly Step[], options: TimelineOptions = {}): Timeline {
  const starts: number[] = [];
  const transitions: number[] = [];
  const settles: number[] = [];
  const dwells: number[] = [];
  const holds: boolean[] = [];
  const overview = !!options.overview && steps.length > 0;
  let t = overview ? Math.max(0, options.leadInMs ?? 0) : 0;
  for (const [i, step] of steps.entries()) {
    // A hold still needs its settle time before playback rests.
    const dwell = step.timing.hold ? SETTLE_MS : step.timing.dwellMs;
    starts.push(t);
    transitions.push(step.timing.transitionMs + (overview && i === 0 ? CLEAR_MS : 0));
    settles.push(Math.min(SETTLE_MS, dwell));
    dwells.push(dwell);
    holds.push(step.timing.hold);
    t += (transitions[i] as number) + dwell;
  }
  const timeline: Timeline = { starts, transitions, settles, dwells, holds, duration: t };
  if (overview) timeline.clear = CLEAR_MS;
  return timeline;
}

/** Step `k`'s own transition, excluding the overview clear that precedes step 0. */
export function transitionOf(timeline: Timeline, k: number): number {
  const T = timeline.transitions[k] ?? 0;
  return k === 0 && timeline.clear ? Math.max(0, T - timeline.clear) : T;
}

/** Where playback rests when paused "at" a step: after its transition and settle. */
export function stepEnd(timeline: Timeline, index: number): number {
  if (index < 0) return 0;
  const i = Math.min(index, timeline.starts.length - 1);
  return (timeline.starts[i] ?? 0) + (timeline.transitions[i] ?? 0) + (timeline.settles[i] ?? 0);
}

export function positionAt(timeline: Timeline, t: number): Position {
  const { starts } = timeline;
  // Before the first step starts (t ≤ 0, or within the overview's lead-in).
  if (starts.length === 0 || t <= 0 || t <= (starts[0] as number)) return { index: -1, phase: 'initial', progress: 0, elapsed: 0, cleared: 0 };
  // Largest k with starts[k] < t (binary search).
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] as number) < t) lo = mid;
    else hi = mid - 1;
  }
  const clear = lo === 0 ? (timeline.clear ?? 0) : 0;
  const sinceStart = t - (starts[lo] as number);
  const cleared = clear > 0 ? Math.min(1, sinceStart / clear) : 1;
  const elapsed = sinceStart - clear;
  const T = transitionOf(timeline, lo);
  const progress = elapsed < 0 ? 0 : T <= 0 ? 1 : Math.min(1, elapsed / T);
  return { index: lo, phase: progress < 1 ? 'transition' : 'dwell', progress, elapsed, cleared };
}

/** Nearest step boundary (end of a transition, or 0) to `t` — used when the scrubber is released. */
export function snapTime(timeline: Timeline, t: number): number {
  let best = 0;
  let bestDistance = Math.abs(t);
  for (let i = 0; i < timeline.starts.length; i++) {
    const end = stepEnd(timeline, i);
    const d = Math.abs(t - end);
    if (d < bestDistance) {
      best = end;
      bestDistance = d;
    }
  }
  return best;
}

export interface StepIdentity {
  id: string;
  structuralId: string;
}

/**
 * Finds where playback should rest after the step list changed (spec §8.12.2): by id
 * (which is the `@step-id` when present), then structuralId, then a step at the editor cursor,
 * then the nearest preceding step that survived. Returns -1 for the initial state.
 */
export function resolvePosition(
  previous: readonly StepIdentity[],
  previousIndex: number,
  next: readonly (StepIdentity & { sources: { startLine: number; endLine: number }[] })[],
  cursorLine?: number,
): number {
  if (previousIndex < 0 || next.length === 0) return -1;
  const current = previous[previousIndex];
  if (current) {
    const byId = next.findIndex((s) => s.id === current.id);
    if (byId >= 0) return byId;
    const byStructure = next.findIndex((s) => s.structuralId === current.structuralId);
    if (byStructure >= 0) return byStructure;
  }
  if (cursorLine !== undefined) {
    const atCursor = next.findIndex((s) => s.sources.some((r) => cursorLine >= r.startLine && cursorLine <= r.endLine));
    if (atCursor >= 0) return atCursor;
  }
  for (let i = Math.min(previousIndex, previous.length - 1) - 1; i >= 0; i--) {
    const old = previous[i] as StepIdentity;
    const found = next.findIndex((s) => s.id === old.id || s.structuralId === old.structuralId);
    if (found >= 0) return found;
  }
  return Math.min(previousIndex, next.length - 1);
}
