/**
 * The HTML player's data document (spec html-player, M3 D5): everything needed to replay a
 * diagram without Mermaid or ELK — precomputed layouts, steps, timeline, topology geometry, or a
 * generic diagram's pre-rendered SVG with its reveal groups. Maps and Sets survive JSON through a
 * tagged encoding.
 */
import type { CompiledSequence, SequenceLayout, Timeline, Topology, TopologyGeometry } from '@mermaid-animator/core';
import type { DisplayOptions } from '@mermaid-animator/renderer';

export interface PlayerChapter {
  title: string;
  firstStep: number;
  slug: string;
}

export interface PlayerData {
  version: 1;
  title: string;
  /** `light` = Ivory, `dark` = Graphite, `auto` follows the viewer's colour scheme. */
  theme: 'light' | 'dark' | 'auto';
  display: DisplayOptions;
  timeline: Timeline;
  /** One line per step (labels for the scrubber and announcements). */
  steps: { label: string; caption?: string }[];
  chapters: PlayerChapter[];
  view: 'sequence' | 'topology' | 'split';
  sequence?: { layout: SequenceLayout; compiled: CompiledSequence };
  topology?: { topology: Topology; geometry: TopologyGeometry; labels: { nodes: Map<string, string[]>; messages: Map<string, string> }; weight: 'count' | 'uniform' };
  /** Generic diagrams: Mermaid's SVG with `ma-g<i>` / `ma-p<i>-<j>` classes on the reveal groups. */
  generic?: { svg: string; groups: { kind: string; paths: { length: number }[] }[]; bounds: { x: number; y: number; w: number; h: number } };
}

export function slug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function encodePlayerData(data: PlayerData): string {
  return JSON.stringify(data, (_key, value: unknown) => {
    if (value instanceof Map) return { __map: [...value.entries()] };
    if (value instanceof Set) return { __set: [...value.values()] };
    return value;
  });
}

export function decodePlayerData(text: string): PlayerData {
  return JSON.parse(text, (_key, value: unknown) => {
    if (value && typeof value === 'object' && '__map' in value) return new Map((value as { __map: [unknown, unknown][] }).__map);
    if (value && typeof value === 'object' && '__set' in value) return new Set((value as { __set: unknown[] }).__set);
    return value;
  }) as PlayerData;
}

/** Initial step from the URL fragment: `#step=<n>` (1-based) or `#chapter=<slug>`; undefined if absent. */
export function stepFromHash(hash: string, chapters: readonly PlayerChapter[], stepCount: number): number | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const step = params.get('step');
  if (step !== null && /^\d+$/.test(step)) return Math.min(Math.max(Number(step), 0), stepCount);
  const chapter = params.get('chapter');
  if (chapter) {
    const found = chapters.find((c) => c.slug === chapter.toLowerCase());
    if (found) return found.firstStep + 1;
  }
  return undefined;
}
