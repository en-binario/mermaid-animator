import type { Rect, Timeline } from '@mermaid-animator/core';
import type { DisplayOptions, PaletteName } from '@mermaid-animator/renderer';
import type { View, Viewport } from '../camera';
import type { ExportText, SceneSource } from './job';

/**
 * What the controller hands to exports (animated, animated SVG, HTML player) for one view: the drawing,
 * its timeline and bounds, narrative text and the panel's current state.
 */
export interface ExportMaterial {
  kind: 'sequence' | 'generic';
  timeline: Timeline;
  content: Rect;
  display: DisplayOptions;
  palette: PaletteName;
  text: ExportText;
  rest: number;
  chapters: { title: string; firstStep: number }[];
  ab?: { from?: number; to?: number };
  /** The panel camera and viewport of the exported view (camera = current). */
  view?: View;
  viewport?: Viewport;
  stepBounds?(step: number): Rect | undefined;
  cinematicTarget?(step: number, bounds: Rect): Rect;
  source(): SceneSource;
  /** Main-thread frames for generic diagrams. */
  externalFrame?(t: number, width: number, height: number, view: View): Promise<ImageBitmap>;
}
