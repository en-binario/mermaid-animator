/**
 * The sidecar file format (spec sidecar-files, Appendix B of the product specification): parsing,
 * diagram lookup, conversion to the protocol entry, diagnostics locations and formatting-preserving
 * patches. Free of `vscode` so it is unit-tested.
 */
import { applyEdits, findNodeAtLocation, modify, parse, parseTree, type JSONPath, type Node, type ParseError } from 'jsonc-parser';
import type { SidecarEntry } from '@mermaid-animator/protocol';

export const SIDECAR_SUFFIX = '.animator.json';

type Point = { x: number; y: number };

/** The on-disk shape (Appendix B of the product specification). */
export interface SidecarFile {
  version?: number;
  diagrams?: Record<string, RawEntry>;
}

interface RawEntry {
  settings?: Record<string, unknown>;
  captions?: Record<string, string>;
  chapters?: { title?: string; firstStep?: string }[];
  topology?: { layout?: string; positions?: Record<string, [number, number]> };
  [other: string]: unknown;
}

export interface UnresolvedEntry {
  section: 'captions' | 'chapters';
  key: string;
}

export function parseSidecar(text: string): SidecarFile | undefined {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as SidecarFile) : undefined;
}

/** The key a diagram has in the sidecar: its `@id`, else `#<1-based index>`. */
export function sidecarKey(diagram: { id?: string; index: number }): string {
  return diagram.id ?? `#${diagram.index + 1}`;
}

/** Finds a diagram's raw entry: by `@id` (with or without the `@`), then by `#<index>`. */
export function rawEntryKey(file: SidecarFile | undefined, diagram: { id?: string; index: number }): string | undefined {
  const diagrams = file?.diagrams;
  if (!diagrams || typeof diagrams !== 'object') return undefined;
  const candidates = [...(diagram.id ? [diagram.id, `@${diagram.id}`] : []), `#${diagram.index + 1}`];
  return candidates.find((k) => diagrams[k] && typeof diagrams[k] === 'object');
}

const isPoint = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Converts the on-disk entry into the protocol's entry (chapters by first step, positions as points). */
export function normaliseEntry(raw: RawEntry): SidecarEntry {
  const entry: SidecarEntry = {};
  const settings: Record<string, unknown> = raw.settings && typeof raw.settings === 'object' ? { ...raw.settings } : {};
  if (typeof raw.topology?.layout === 'string' && settings['topology.layout'] === undefined) settings['topology.layout'] = raw.topology.layout;
  if (Object.keys(settings).length) entry.settings = settings;
  if (raw.captions && typeof raw.captions === 'object') {
    const captions = Object.fromEntries(Object.entries(raw.captions).filter(([, v]) => typeof v === 'string'));
    if (Object.keys(captions).length) entry.captions = captions;
  }
  if (Array.isArray(raw.chapters)) {
    const chapters: Record<string, string> = {};
    for (const c of raw.chapters) if (c && typeof c.title === 'string' && typeof c.firstStep === 'string') chapters[c.firstStep] = c.title;
    if (Object.keys(chapters).length) entry.chapters = chapters;
  }
  const positions = raw.topology?.positions;
  if (positions && typeof positions === 'object') {
    const layout: Record<string, Point> = {};
    for (const [id, p] of Object.entries(positions)) if (isPoint(p)) layout[id] = { x: p[0], y: p[1] };
    if (Object.keys(layout).length) entry.layout = layout;
  }
  return entry;
}

export function entryFor(file: SidecarFile | undefined, diagram: { id?: string; index: number }): SidecarEntry | undefined {
  const key = rawEntryKey(file, diagram);
  return key ? normaliseEntry(file!.diagrams![key]!) : undefined;
}

/** Location of an unresolved step key inside the sidecar text, for its diagnostic. */
export function locateEntry(text: string, diagramKey: string, entry: UnresolvedEntry): { offset: number; length: number } | undefined {
  const root = parseTree(text, [], { allowTrailingComma: true, disallowComments: false });
  if (!root) return undefined;
  let node: Node | undefined;
  if (entry.section === 'captions') {
    const value = findNodeAtLocation(root, ['diagrams', diagramKey, 'captions', entry.key]);
    // Point at the property name, where the dangling reference is.
    node = value?.parent?.children?.[0] ?? value;
  } else {
    const chapters = findNodeAtLocation(root, ['diagrams', diagramKey, 'chapters']);
    const index = (chapters?.children ?? []).findIndex((c) => findNodeAtLocation(c, ['firstStep'])?.value === entry.key);
    node = index >= 0 ? findNodeAtLocation(chapters!.children![index]!, ['firstStep']) : undefined;
  }
  return node ? { offset: node.offset, length: node.length } : undefined;
}

/** What a *Save…* command writes for one diagram. */
export interface SidecarPatch {
  settings?: Record<string, unknown>;
  positions?: Record<string, Point>;
}

/** Applies a patch with formatting-preserving edits; returns the new text. */
export function applyPatch(text: string, diagramKey: string, patch: SidecarPatch, insertSpaces = true, tabSize = 2): string {
  const formattingOptions = { insertSpaces, tabSize, eol: text.includes('\r\n') ? '\r\n' : '\n' };
  let out = text.trim() ? text : '{\n  "version": 1,\n  "diagrams": {}\n}\n';
  const set = (path: JSONPath, value: unknown) => {
    out = applyEdits(out, modify(out, path, value, { formattingOptions }));
  };
  if (parse(out)?.version === undefined) set(['version'], 1);
  const base: JSONPath = ['diagrams', diagramKey];
  for (const [key, value] of Object.entries(patch.settings ?? {})) set([...base, 'settings', key], value);
  if (patch.positions) {
    set([...base, 'topology', 'layout'], 'manual');
    const rounded = Object.fromEntries(Object.entries(patch.positions).map(([id, p]) => [id, [Math.round(p.x), Math.round(p.y)]]));
    set([...base, 'topology', 'positions'], rounded);
  }
  return out;
}
