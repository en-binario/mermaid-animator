/**
 * Playback over a timeline (spec §8.5): autoplay, stepping (forward and reverse), seeking,
 * scrubbing with snapping, speed, looping and automatic pausing. Time advances only through
 * `tick(realMs)`, so tests drive it with a fake clock and the UI drives it with rAF.
 */
import { positionAt, snapTime, stepEnd, type Timeline } from '@mermaid-animator/core';

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export interface PlayerOptions {
  speed: number;
  loop: boolean;
  onEnd: 'stop' | 'loop' | 'rewind';
  reverse: 'animate' | 'cut';
  snap: boolean;
}

export interface PlayerSnapshot {
  t: number;
  playing: boolean;
  /** Steps whose transition has started (0 = initial state). */
  displayStep: number;
  stepCount: number;
  speed: number;
  loop: boolean;
  scrubbing: boolean;
  /** An animation toward a step is in progress (stepping, not autoplay). */
  animating: boolean;
  /** A–B loop range as rest indices (-1 = initial state), when set. */
  range?: { from?: number; to?: number };
}

type Listener = (snapshot: PlayerSnapshot) => void;

export class Player {
  private t = 0;
  private playing = false;
  private scrubbing = false;
  private target: number | undefined;
  /** Step being animated toward by a forward step (for the counter). */
  private targetIndex: number | undefined;
  /** Direction of a stepping animation: +1 forward, -1 reverse. */
  private direction = 1;
  /** Reverse steps jump to the target once they rewind past this time (the dwell before is static). */
  private reverseFloor = 0;
  private readonly listeners = new Set<Listener>();
  private pausedBy = new Set<string>();
  /** A–B range bounds as rest indices. */
  private range: { from?: number; to?: number } = {};
  /** Steps skipped by focused playback (spec exploration). */
  private skip: ReadonlySet<number> | undefined;
  private gate: ((index: number) => boolean) | undefined;

  constructor(
    private timeline: Timeline,
    private options: PlayerOptions,
  ) {}

  get time(): number {
    return this.t;
  }

  get currentTimeline(): Timeline {
    return this.timeline;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** True while time must keep advancing (autoplay or a stepping animation). */
  /** Reasons that freeze the playhead mid-step, not just autoplay (camera moves, presentation cards). */
  private frozen(): boolean {
    return this.pausedBy.has('camera') || this.pausedBy.has('card') || this.pausedBy.has('morph');
  }

  get isActive(): boolean {
    if (this.frozen()) return false;
    return (this.playing && this.pausedBy.size === 0) || this.target !== undefined;
  }

  /** True when the playhead waits only for the camera. */
  get waitingForCamera(): boolean {
    return this.pausedBy.has('camera');
  }

  snapshot(): PlayerSnapshot {
    const pos = positionAt(this.timeline, this.t);
    return {
      t: this.t,
      playing: this.playing,
      displayStep: this.target !== undefined && this.direction > 0 && this.targetIndex !== undefined ? this.targetIndex + 1 : pos.index + 1,
      stepCount: this.timeline.starts.length,
      speed: this.options.speed,
      loop: this.options.loop,
      scrubbing: this.scrubbing,
      animating: this.target !== undefined,
      range: this.range.from !== undefined || this.range.to !== undefined ? { ...this.range } : undefined,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }

  /** Replaces the timeline (live reload) and rests at `restIndex` (-1 = initial). */
  setTimeline(timeline: Timeline, restIndex: number): void {
    this.timeline = timeline;
    this.target = undefined;
    this.t = restIndex < 0 ? 0 : stepEnd(timeline, restIndex);
    this.emit();
  }

  /** Sets the A–B loop start (`I`) or end (`O`) at the current rest point. */
  markRange(bound: 'from' | 'to'): void {
    this.range = { ...this.range, [bound]: this.restingIndex() };
    if (this.range.from !== undefined && this.range.to !== undefined && this.range.from > this.range.to) this.range = { from: this.range.to, to: this.range.from };
    this.emit();
  }

  clearRange(): void {
    this.range = {};
    this.emit();
  }

  /** Steps to skip in stepping and autoplay (focused playback); undefined plays every step. */
  setSkip(skip: ReadonlySet<number> | undefined): void {
    this.skip = skip && skip.size ? skip : undefined;
    this.emit();
  }

  /** A gate blocks starting the given step (a pending `ask` branch choice); `play`/`next` wait at rest. */
  setGate(gate: ((index: number) => boolean) | undefined): void {
    this.gate = gate;
  }

  private gated(): boolean {
    if (!this.gate || this.t !== this.restTime(this.restingIndex())) return false;
    const k = this.nextPlayable(this.restingIndex() + 1);
    if (k === undefined || !this.gate(k)) return false;
    this.playing = false;
    this.emit();
    return true;
  }

  private skipped(index: number): boolean {
    return !!this.skip?.has(index);
  }

  /** The next step at or after `from` that is not skipped (or undefined). */
  private nextPlayable(from: number): number | undefined {
    for (let k = from; k < this.timeline.starts.length; k++) if (!this.skipped(k)) return k;
    return undefined;
  }

  private restTime(index: number): number {
    return index < 0 ? 0 : stepEnd(this.timeline, index);
  }

  setOptions(options: Partial<PlayerOptions>): void {
    this.options = { ...this.options, ...options };
    this.emit();
  }

  /** Index of the last step whose transition is complete (-1 = none). */
  restingIndex(): number {
    const pos = positionAt(this.timeline, this.t);
    if (pos.index < 0) return -1;
    return pos.phase === 'transition' ? pos.index - 1 : pos.index;
  }

  play(): void {
    if (this.timeline.starts.length === 0) return;
    if (this.t >= this.timeline.duration) this.t = 0;
    if (this.gated()) return;
    this.target = undefined;
    this.playing = true;
    this.emit();
  }

  pause(): void {
    this.playing = false;
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Temporarily pauses for a reason (hidden panel, pointer hover); resumes when all reasons clear. */
  hold(reason: string, on: boolean): void {
    if (on) this.pausedBy.add(reason);
    else this.pausedBy.delete(reason);
    this.emit();
  }

  next(): void {
    const count = this.timeline.starts.length;
    const rest = this.restingIndex();
    if (rest >= count - 1) {
      this.seek(this.timeline.duration);
      return;
    }
    this.playing = false;
    if (this.gated()) return;
    const k = this.nextPlayable(rest + 1);
    if (k === undefined) {
      this.seek(this.timeline.duration);
      return;
    }
    const start = this.timeline.starts[k] as number;
    if (this.t < start) this.t = start; // skip the remaining dwell
    this.target = stepEnd(this.timeline, k);
    this.targetIndex = k;
    this.direction = 1;
    this.emit();
  }

  previous(): void {
    const rest = this.restingIndex();
    this.playing = false;
    if (rest < 0) {
      this.seek(0);
      return;
    }
    let previousIndex = rest - 1;
    while (previousIndex >= 0 && this.skipped(previousIndex)) previousIndex--;
    const targetT = this.restTime(previousIndex);
    if (this.options.reverse === 'cut') {
      this.target = undefined;
      this.t = targetT;
      this.emit();
      return;
    }
    // Rewind step `rest` through its transition, then land on the previous step's rest point.
    this.t = Math.min(this.t, stepEnd(this.timeline, rest));
    this.target = targetT;
    this.reverseFloor = this.timeline.starts[rest] as number;
    this.direction = -1;
    this.emit();
  }

  first(): void {
    this.playing = false;
    this.seek(0);
  }

  last(): void {
    this.playing = false;
    this.seek(this.timeline.duration);
  }

  /** Jumps to the rest point of a 1-based step number (0 = initial). */
  goTo(step: number): void {
    this.playing = false;
    const clamped = Math.max(0, Math.min(step, this.timeline.starts.length));
    this.seek(clamped === 0 ? 0 : stepEnd(this.timeline, clamped - 1));
  }

  seek(t: number): void {
    this.target = undefined;
    this.t = Math.max(0, Math.min(t, this.timeline.duration));
    this.emit();
  }

  beginScrub(): void {
    this.scrubbing = true;
    this.hold('scrub', true);
  }

  scrub(t: number): void {
    this.seek(t);
  }

  endScrub(): void {
    this.scrubbing = false;
    if (this.options.snap) this.t = snapTime(this.timeline, this.t);
    this.hold('scrub', false);
  }

  setSpeed(speed: number): void {
    this.setOptions({ speed });
  }

  /** Advances time by `realMs` of wall-clock time. Returns true if anything changed. */
  tick(realMs: number): boolean {
    // The camera hold (spec §8.6.2: the step must be in view before its arrow draws) also pauses stepping.
    if (this.frozen()) return false;
    if (this.target !== undefined) {
      const rate = this.direction > 0 ? this.options.speed : 2 * this.options.speed;
      const next = this.t + this.direction * realMs * rate;
      const done = this.direction > 0 ? next >= this.target : next <= this.reverseFloor;
      if (done) {
        this.t = this.target;
        this.target = undefined;
      } else this.t = next;
      this.emit();
      return true;
    }
    if (!this.playing || this.pausedBy.size > 0) return false;
    const pos = positionAt(this.timeline, this.t);
    let next = this.t + realMs * this.options.speed;
    // Hold steps stop autoplay at their rest point.
    if (pos.index >= 0 && this.timeline.holds[pos.index]) {
      const end = stepEnd(this.timeline, pos.index);
      if (this.t < end && next >= end) {
        this.t = end;
        this.playing = false;
        this.emit();
        return true;
      }
    }
    // Focused playback: jump over skipped steps.
    const landing = positionAt(this.timeline, next);
    if (landing.index >= 0 && this.skipped(landing.index)) {
      const k = this.nextPlayable(landing.index + 1);
      next = k === undefined ? this.timeline.duration : (this.timeline.starts[k] as number) + 0.001;
    }
    // A–B loop: wrap from the end of the range back to its start.
    if (this.range.to !== undefined) {
      const b = this.restTime(this.range.to);
      if (this.t < b && next >= b) next = this.restTime(this.range.from ?? -1);
    }
    if (next >= this.timeline.duration) {
      const mode = this.options.loop ? 'loop' : this.options.onEnd;
      if (mode === 'loop') next = 0;
      else {
        next = mode === 'rewind' ? 0 : this.timeline.duration;
        this.playing = false;
      }
    }
    this.t = next;
    this.emit();
    return true;
  }
}
