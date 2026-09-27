/**
 * The contract between the export sheet (main thread) and the render-and-encode worker (M3 D2).
 * Everything here is structured-cloneable: layouts, compiled steps, timelines, topologies and
 * geometries go across as they are (Maps and Sets included).
 */
import type { CompiledSequence, SequenceLayout, Timeline, Topology, TopologyGeometry } from '@mermaid-animator/core';
import type { DisplayOptions, PaletteName } from '@mermaid-animator/renderer';
import type { ExportCamera, FramePlan, FrameRange } from './frames';

export type AnimatedFormat = 'gif' | 'webm' | 'mp4';

export interface BurnIn {
  captions: boolean;
  title: boolean;
  counter: boolean;
  transport: boolean;
  /** Participant rail where the camera hides the headers (sequence view; spec participant-orientation). */
  names: boolean;
}

export interface ExportText {
  title: string;
  subtitle: string;
  /** Caption per step index (plain text; inline markup already stripped). */
  captions: (string | undefined)[];
  stepCount: number;
}

export type SceneSource =
  | { kind: 'sequence'; layout: SequenceLayout; compiled: CompiledSequence; timeline: Timeline }
  | { kind: 'topology'; topology: Topology; geometry: TopologyGeometry; labels: { nodes: Map<string, string[]>; messages: Map<string, string> }; compiled: CompiledSequence; timeline: Timeline; weight: 'count' | 'uniform' }
  /** Frames drawn on the main thread (generic diagrams) and streamed as ImageBitmaps. */
  | { kind: 'external'; timeline: Timeline };

export interface ExportJob {
  format: AnimatedFormat;
  width: number;
  height: number;
  range: FrameRange;
  plan: FramePlan;
  source: SceneSource;
  camera: ExportCamera;
  display: DisplayOptions;
  palette: PaletteName;
  /** Background: palette canvas, transparent (GIF only), or a `#rrggbb` colour. */
  background: 'theme' | 'transparent' | string;
  burnIn: BurnIn;
  text: ExportText;
  /** GIF loop count: 0 forever, 1 once, n times. */
  loop: number;
  quality: 'low' | 'medium' | 'high';
  dither: boolean;
  /** Embedded font files (woff2) registered in the worker before drawing. */
  fonts: { family: string; data: ArrayBuffer; unicodeRange: string }[];
}

export type WorkerRequest =
  | { type: 'start'; job: ExportJob }
  | { type: 'frame'; index: number; bitmap: ImageBitmap }
  | { type: 'cancel' }
  /** Verification: draw frame `index` and return its raw RGBA pixels. */
  | { type: 'probe'; job: ExportJob; index: number };

export type WorkerResponse =
  | { type: 'progress'; done: number; total: number; phase: 'palette' | 'frames' | 'finishing' }
  /** The worker is ready for the next streamed frame (external sources). */
  | { type: 'next'; index: number }
  | { type: 'done'; bytes: ArrayBuffer; mime: string; frames: number }
  | { type: 'cancelled' }
  | { type: 'probe'; pixels: ArrayBuffer; width: number; height: number }
  | { type: 'error'; message: string };
