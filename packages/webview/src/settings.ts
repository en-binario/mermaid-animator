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
  /** Zoom a following camera frames steps at (spec camera: play zoom settings), as a factor. */
  playZoom: number;
  presentationZoom: number;
  loopIterations: number;
  compressRepeats: boolean;
  altBranches: 'first' | 'all' | 'ask';
  parallel: 'concurrent' | 'sequential';
  showCaptions: boolean;
  showInspector: boolean;
  chapterCards: boolean;
  view: 'sequence' | 'topology' | 'split';
  topologyLayout: 'layered' | 'force' | 'manual';
  direction: 'LR' | 'TB';
  edgeStyle: 'curved' | 'orthogonal' | 'straight';
  returnMessages: 'merge' | 'separate' | 'hide';
  edgeWeight: 'count' | 'uniform';
  showMinimap: 'auto' | 'always' | 'never';
  /** Participant rail and off-screen markers (spec participant-orientation). */
  participantNames: 'auto' | 'off';
  /** Sender/receiver tags on the current step's arrows. */
  arrowEndNames: 'off' | 'auto' | 'always';
  exportDefaults: {
    format: 'svg' | 'png' | 'gif' | 'webm' | 'mp4' | 'animated-svg' | 'html';
    /** Undefined when not set: GIF then uses 15 fps and video 30 fps. */
    fps?: number;
    scale: number;
    background: 'theme' | 'transparent' | string;
    captions: boolean;
    svgAdaptiveTheme: boolean;
  };
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
  display: { futureSteps: 'hidden', pastSteps: 'full', trailLength: 3, motion: 'formal', indicator: 'pulse', overview: true },
  respectReducedMotion: true,
  camera: 'auto',
  playZoom: 1,
  presentationZoom: 1.5,
  loopIterations: 1,
  compressRepeats: true,
  altBranches: 'first',
  parallel: 'concurrent',
  showCaptions: true,
  showInspector: true,
  chapterCards: true,
  view: 'sequence',
  topologyLayout: 'layered',
  direction: 'LR',
  edgeStyle: 'curved',
  returnMessages: 'merge',
  edgeWeight: 'count',
  showMinimap: 'auto',
  participantNames: 'auto',
  arrowEndNames: 'auto',
  exportDefaults: { format: 'animated-svg', scale: 2, background: 'theme', captions: true, svgAdaptiveTheme: false },
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
      overview: bool(get('overview', 'playback.initialOverview'), d.display.overview ?? true),
    },
    respectReducedMotion: bool(host['motion.respectReducedMotion'], d.respectReducedMotion),
    camera: pick(get('camera', 'camera.mode'), ['auto', 'fit', 'follow', 'cinematic', 'manual'], d.camera),
    // Percent in settings; no `@animator` short name.
    playZoom: num(host['camera.playZoom'], d.playZoom * 100, 10, 800) / 100,
    presentationZoom: num(host['camera.presentationZoom'], d.presentationZoom * 100, 10, 800) / 100,
    loopIterations: Math.round(num(get('iterations', 'playback.loopIterations'), d.loopIterations, 1, 50)),
    compressRepeats: bool(host['playback.compressRepeats'], d.compressRepeats),
    altBranches: pick(get('branches', 'playback.altBranches'), ['first', 'all', 'ask'], d.altBranches),
    parallel: pick(get('parallel', 'playback.parallel'), ['concurrent', 'sequential'], d.parallel),
    showCaptions: bool(host['display.showCaptions'], d.showCaptions),
    showInspector: bool(host['display.showInspector'], d.showInspector),
    chapterCards: bool(host['presentation.chapterCards'], d.chapterCards),
    view: pick(get('view', 'view.default'), ['sequence', 'topology', 'split'], d.view),
    topologyLayout: pick(get('layout', 'topology.layout'), ['layered', 'force', 'manual'], d.topologyLayout),
    direction: pick(get('direction', 'topology.direction'), ['LR', 'TB'], d.direction),
    edgeStyle: pick(host['topology.edgeStyle'], ['curved', 'orthogonal', 'straight'], d.edgeStyle),
    returnMessages: pick(get('returns', 'topology.returnMessages'), ['merge', 'separate', 'hide'], d.returnMessages),
    edgeWeight: pick(host['topology.edgeWeight'], ['count', 'uniform'], d.edgeWeight),
    showMinimap: pick(host['display.showMinimap'], ['auto', 'always', 'never'], d.showMinimap),
    participantNames: pick(host['display.participantNames'], ['auto', 'off'], d.participantNames),
    arrowEndNames: pick(host['display.arrowEndNames'], ['off', 'auto', 'always'], d.arrowEndNames),
    exportDefaults: {
      // The manifest spells it `animatedSvg`.
      format: pick(host['export.defaultFormat'] === 'animatedSvg' ? 'animated-svg' : host['export.defaultFormat'], ['svg', 'png', 'gif', 'webm', 'mp4', 'animated-svg', 'html'], d.exportDefaults.format),
      fps: [12, 15, 24, 30, 60].includes(Number(host['export.fps'])) ? Number(host['export.fps']) : undefined,
      scale: [1, 2, 3].includes(Number(host['export.scale'])) ? Number(host['export.scale']) : d.exportDefaults.scale,
      background: typeof host['export.background'] === 'string' && (/^(theme|transparent)$/.test(host['export.background'] as string) || /^#[0-9a-f]{6}$/i.test(host['export.background'] as string)) ? (host['export.background'] as string) : d.exportDefaults.background,
      captions: bool(host['export.includeCaptions'], d.exportDefaults.captions),
      svgAdaptiveTheme: bool(host['export.svgAdaptiveTheme'], d.exportDefaults.svgAdaptiveTheme),
    },
  };
}
