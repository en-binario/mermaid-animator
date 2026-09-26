import { valueText, type AnnotationValue } from '@mermaid-animator/core';
import type { WebviewSettings } from '@mermaid-animator/protocol';
import type { DisplayOptions } from '@mermaid-animator/renderer';
import type { CameraMode } from './camera';

/** Effective animator settings for one diagram (spec §11.8: settings < `@animator`). */
export interface AnimatorSettings {
  autoplay: boolean;
  speed: number;
  dwell: 'adaptive' | 'fixed';
  dwellMs: number;
  onEnd: 'stop' | 'loop' | 'rewind';
  reverse: 'animate' | 'cut';
  pauseOnHover: boolean;
  startAt: 'beginning' | 'end' | 'lastPosition';
  notes: 'step' | 'attach' | 'hidden';
  snap: boolean;
  display: DisplayOptions;
  respectReducedMotion: boolean;
  camera: CameraMode;
  loopIterations: number;
  compressRepeats: boolean;
  altBranches: 'first' | 'all' | 'ask';
  parallel: 'concurrent' | 'sequential';
  showCaptions: boolean;
  showInspector: boolean;
  chapterCards: boolean;
}

export const DEFAULT_SETTINGS: AnimatorSettings = {
  autoplay: false,
  speed: 1,
  dwell: 'adaptive',
  dwellMs: 900,
  onEnd: 'stop',
  reverse: 'animate',
  pauseOnHover: true,
  startAt: 'beginning',
  notes: 'step',
  snap: true,
  display: { futureSteps: 'hidden', pastSteps: 'full', trailLength: 3, motion: 'formal', indicator: 'pulse' },
  respectReducedMotion: true,
  camera: 'auto',
  loopIterations: 1,
  compressRepeats: true,
  altBranches: 'first',
  parallel: 'concurrent',
  showCaptions: true,
  showInspector: true,
  chapterCards: true,
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);
const num = (value: unknown, fallback: number, min = -Infinity, max = Infinity): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

function annotationRaw(value: AnnotationValue): unknown {
  if (value.kind === 'number') return value.value;
  if (value.kind === 'duration') return value.ms;
  const text = valueText(value);
  return text === 'true' ? true : text === 'false' ? false : text;
}

export function resolveSettings(host: WebviewSettings, annotations: Record<string, AnnotationValue> = {}): AnimatorSettings {
  const a = Object.fromEntries(Object.entries(annotations).map(([k, v]) => [k, annotationRaw(v)]));
  const d = DEFAULT_SETTINGS;
  const get = (short: string, key: string) => (short in a ? a[short] : host[key]);
  return {
    autoplay: bool(get('autoplay', 'playback.autoplay'), d.autoplay),
    speed: num(get('speed', 'playback.speed'), d.speed, 0.25, 4),
    dwell: pick(get('dwell', 'playback.dwell'), ['adaptive', 'fixed'], d.dwell),
    dwellMs: num(get('dwellMs', 'playback.dwellMs'), d.dwellMs, 0, 60_000),
    onEnd: pick(get('onEnd', 'playback.onEnd'), ['stop', 'loop', 'rewind'], d.onEnd),
    reverse: pick(get('reverse', 'playback.reverse'), ['animate', 'cut'], d.reverse),
    pauseOnHover: bool(host['playback.pauseOnHover'], d.pauseOnHover),
    startAt: pick(get('startAt', 'playback.startAt'), ['beginning', 'end', 'lastPosition'], d.startAt),
    notes: pick(get('notes', 'playback.notes'), ['step', 'attach', 'hidden'], d.notes),
    snap: bool(host['scrubber.snap'], d.snap),
    display: {
      futureSteps: pick(get('future', 'display.futureSteps'), ['hidden', 'ghosted', 'visible'], d.display.futureSteps),
      pastSteps: pick(get('past', 'display.pastSteps'), ['full', 'muted', 'trail'], d.display.pastSteps),
      trailLength: num(get('trail', 'display.trailLength'), d.display.trailLength, 1, 20),
      motion: pick(get('motion', 'motion.profile'), ['formal', 'expressive', 'minimal', 'none'], d.display.motion),
      indicator: pick(get('indicator', 'motion.travelIndicator'), ['pulse', 'comet', 'none'], d.display.indicator),
    },
    respectReducedMotion: bool(host['motion.respectReducedMotion'], d.respectReducedMotion),
    camera: pick(get('camera', 'camera.mode'), ['auto', 'fit', 'follow', 'cinematic', 'manual'], d.camera),
    loopIterations: Math.round(num(get('iterations', 'playback.loopIterations'), d.loopIterations, 1, 50)),
    compressRepeats: bool(host['playback.compressRepeats'], d.compressRepeats),
    altBranches: pick(get('branches', 'playback.altBranches'), ['first', 'all', 'ask'], d.altBranches),
    parallel: pick(get('parallel', 'playback.parallel'), ['concurrent', 'sequential'], d.parallel),
    showCaptions: bool(host['display.showCaptions'], d.showCaptions),
    showInspector: bool(host['display.showInspector'], d.showInspector),
    chapterCards: bool(host['presentation.chapterCards'], d.chapterCards),
  };
}
