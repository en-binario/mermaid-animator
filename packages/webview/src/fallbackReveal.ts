/**
 * Reveal state of one generic (Mermaid-rendered) group at a playback position, shared by the panel
 * (GenericDiagram) and the HTML player so both reveal identically (spec generic-diagram-fallback,
 * initial-overview).
 */
import type { Position } from '@mermaid-animator/core';
import { DURATION, EASE, windowed } from '@mermaid-animator/renderer';

export interface GroupReveal {
  opacity: number;
  /** 0–1 fraction of the group's strokes drawn. */
  draw: number;
}

/** Transition used for every generic group (the whole group draws within it). */
export const GENERIC_TRANSITION_MS = 420;

/**
 * `overview`: every group shows before the first step and fades out during the clear that opens
 * step 0 (a cut under reduced motion).
 */
export function groupReveal(i: number, kind: string, pos: Position, reducedMotion: boolean, overview = false): GroupReveal {
  if (overview) {
    if (pos.index < 0) return { opacity: 1, draw: 1 };
    if (pos.index === 0 && pos.cleared < 1 && !reducedMotion) return { opacity: 1 - EASE.standard(pos.cleared), draw: 1 };
  }
  if (i < pos.index) return { opacity: 1, draw: 1 };
  if (i !== pos.index) return { opacity: 0, draw: 1 };
  if (reducedMotion) return { opacity: windowed(pos.elapsed, 0, DURATION.fast, EASE.linear), draw: 1 };
  const draw = windowed(pos.elapsed, 0, GENERIC_TRANSITION_MS, EASE.travel);
  return { opacity: kind === 'edge' ? Math.min(1, draw * 4) : windowed(pos.elapsed, 0, DURATION.base, EASE.enter), draw };
}
