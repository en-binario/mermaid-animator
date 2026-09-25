/**
 * Timeline (spec §13.7): each step owns a transition window followed by a dwell. Time 0 is the
 * initial state (nothing played). The visual state is a pure function of the position at `t`.
 */
import type { Step } from './steps';

export interface Timeline {
  /** Start of each step's transition, in ms. */
  starts: number[];
  transitions: number[];
  dwells: number[];
  /** Steps whose dwell waits for the user during autoplay (`@pause` with no duration). */
  holds: boolean[];
  duration: number;
}

export interface Position {
  /** Step whose transition has started; -1 before the first step. */
  index: number;
  phase: 'initial' | 'transition' | 'dwell';
  /** 0–1 progress through the transition (1 during the dwell). */
  progress: number;
  /** Milliseconds elapsed since the transition started. */
  elapsed: number;
}

export function buildTimeline(steps: readonly Step[]): Timeline {
  const starts: number[] = [];
  const transitions: number[] = [];
  const dwells: number[] = [];
  const holds: boolean[] = [];
  let t = 0;
  for (const step of steps) {
    starts.push(t);
    transitions.push(step.timing.transitionMs);
    dwells.push(step.timing.hold ? 0 : step.timing.dwellMs);
    holds.push(step.timing.hold);
    t += step.timing.transitionMs + (step.timing.hold ? 0 : step.timing.dwellMs);
  }
  return { starts, transitions, dwells, holds, duration: t };
}

/** End of a step's transition — where playback rests when paused "at" that step. */
export function stepEnd(timeline: Timeline, index: number): number {
  if (index < 0) return 0;
  const i = Math.min(index, timeline.starts.length - 1);
  return (timeline.starts[i] ?? 0) + (timeline.transitions[i] ?? 0);
}

export function positionAt(timeline: Timeline, t: number): Position {
  const { starts, transitions } = timeline;
  if (starts.length === 0 || t <= 0) return { index: -1, phase: 'initial', progress: 0, elapsed: 0 };
  // Largest k with starts[k] < t (binary search).
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] as number) < t) lo = mid;
    else hi = mid - 1;
  }
  const elapsed = t - (starts[lo] as number);
  const T = transitions[lo] as number;
  const progress = T <= 0 ? 1 : Math.min(1, elapsed / T);
  return { index: lo, phase: progress < 1 ? 'transition' : 'dwell', progress, elapsed };
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
