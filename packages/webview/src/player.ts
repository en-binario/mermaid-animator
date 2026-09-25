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
  get isActive(): boolean {
    if (this.pausedBy.has('camera')) return false;
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

  setOptions(options: Partial<PlayerOptions>): void {
    this.options = { ...this.options, ...options };
    this.emit();
  }

  /** Index of the last step whose transition is complete (-1 = none). */
  private restingIndex(): number {
    const pos = positionAt(this.timeline, this.t);
    if (pos.index < 0) return -1;
    return pos.phase === 'transition' ? pos.index - 1 : pos.index;
  }

  play(): void {
    if (this.timeline.starts.length === 0) return;
    if (this.t >= this.timeline.duration) this.t = 0;
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
    const k = rest + 1;
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
    const targetT = rest === 0 ? 0 : stepEnd(this.timeline, rest - 1);
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
    if (this.pausedBy.has('camera')) return false;
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
