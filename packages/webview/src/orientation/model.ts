/**
 * Participant orientation (spec participant-orientation): which participants the top rail names,
 * which off-screen participants get edge markers, and where arrow-end name tags go — computed in
 * screen space from the layout and the camera view. Pure (no DOM), so the panel overlay and the
 * export renderer share the same rules.
 */
import type { LaidParticipant, Rect, SequenceLayout, Step, Timeline } from '@mermaid-animator/core';

export interface ScreenView {
  x: number;
  y: number;
  k: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

/** Measures `text` in pixels at the given CSS font. */
export type Measure = (text: string, font: string) => number;

/** Rail metrics at scale 1; exports multiply them by their pixel scale. */
export const RAIL = { height: 24, fontSize: 12, gap: 8, maxWidth: 240, tick: 3 } as const;

export const railFont = (scale = 1): string => `560 ${RAIL.fontSize * scale}px "Inter Variable", system-ui, sans-serif`;
export const tagFont = (scale = 1): string => `500 ${11 * scale}px "Inter Variable", system-ui, sans-serif`;

export type NameState = 'current' | 'dim' | 'normal';

export interface RailEntry {
  id: string;
  /** Full participant name (tooltips, ticks). */
  name: string;
  /** Text shown: the name, or the name shortened with an ellipsis; empty for a tick. */
  label: string;
  tick: boolean;
  /** Lifeline's screen x, and the label's centre (kept inside the view). */
  lifelineX: number;
  x: number;
  /** Width of the shown label (0 for a tick). */
  width: number;
  state: NameState;
}

export interface RailOptions {
  measure: Measure;
  /** Participants involved in the current step. */
  involved?: ReadonlySet<string>;
  /** Focused participants (empty = no focus). */
  focus?: ReadonlySet<string>;
  /** Pixel scale (exports); 1 in the panel. */
  scale?: number;
}

const nameOf = (p: LaidParticipant): string => p.lines.join(' ').replace(/\s+/g, ' ').trim();
const sx = (view: ScreenView, x: number) => view.x + x * view.k;
const sy = (view: ScreenView, y: number) => view.y + y * view.k;

/** Where the lifeline ends: at the destroy marker, or at the full length. */
const lifelineEnd = (p: LaidParticipant) => p.destroyedAt ?? p.lifeline.full;

function stateOf(id: string, involved?: ReadonlySet<string>, focus?: ReadonlySet<string>): NameState {
  if (involved?.has(id)) return 'current';
  if (focus && focus.size > 0 && !focus.has(id)) return 'dim';
  return 'normal';
}

/** Fits `text` into `max` px: the whole text, or a prefix with an ellipsis; undefined below `minChars`. */
export function fitText(text: string, max: number, font: string, measure: Measure, minChars = RAIL.tick): { text: string; width: number } | undefined {
  const full = measure(text, font);
  if (full <= max) return { text, width: full };
  let lo = 0;
  let hi = text.length - 1;
  let best: { text: string; width: number } | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = `${text.slice(0, mid).trimEnd()}…`;
    const w = measure(candidate, font);
    if (w <= max) {
      best = { text: candidate, width: w };
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best && best.text.length - 1 >= minChars ? best : undefined;
}

/** Whether the participant's header lies entirely above the visible area. */
export function headerAbove(p: LaidParticipant, view: ScreenView): boolean {
  return sy(view, p.header.y + p.header.h) < 0;
}

/** Whether the header or the mirrored footer is at least partly inside the view. */
export function nameVisible(p: LaidParticipant, view: ScreenView, size: ScreenSize): boolean {
  const inView = (r: Rect) => sx(view, r.x + r.w) > 0 && sx(view, r.x) < size.width && sy(view, r.y + r.h) > 0 && sy(view, r.y) < size.height;
  return inView(p.header) || (!!p.footer && inView(p.footer));
}

/** The rail: participants whose header is above the view while their lifeline crosses its top edge. */
export function railEntries(layout: Pick<SequenceLayout, 'participants'>, view: ScreenView, size: ScreenSize, options: RailOptions): RailEntry[] {
  const scale = options.scale ?? 1;
  const font = railFont(scale);
  const gap = RAIL.gap * scale;
  const visible = layout.participants
    .filter((p) => headerAbove(p, view) && sy(view, p.lifeline.y1) < 0 && sy(view, lifelineEnd(p)) > 0)
    .map((p) => ({ p, x: sx(view, p.x) }))
    .filter(({ x }) => x >= 0 && x <= size.width)
    .sort((a, b) => a.x - b.x);
  return visible.map(({ p, x }, i) => {
    const prev = visible[i - 1]?.x;
    const next = visible[i + 1]?.x;
    // A centred label may use up to the full gap to its nearest neighbour, less a margin, so neighbours never overlap.
    const room = Math.min(prev === undefined ? Infinity : x - prev, next === undefined ? Infinity : next - x, RAIL.maxWidth * scale) - gap;
    const name = nameOf(p);
    const fitted = fitText(name, room, font, options.measure);
    const width = fitted?.width ?? 0;
    const half = width / 2 + 4 * scale;
    const centre = width ? Math.min(Math.max(x, half), size.width - half) : x;
    return { id: p.id, name, label: fitted?.text ?? '', tick: !fitted, lifelineX: x, x: centre, width, state: stateOf(p.id, options.involved, options.focus) };
  });
}

export interface EdgeMarker {
  id: string;
  name: string;
  side: 'left' | 'right';
  y: number;
}

/** Markers for participants of the current step whose lifeline lies left or right of the view. */
export function edgeMarkers(layout: Pick<SequenceLayout, 'participants'>, view: ScreenView, size: ScreenSize, involved: readonly string[], stepBounds?: Rect, scale = 1): EdgeMarker[] {
  const top = (RAIL.height + 20) * scale;
  const bottom = size.height - 20 * scale;
  const centre = stepBounds ? sy(view, stepBounds.y + stepBounds.h / 2) : size.height / 2;
  const base = Math.min(Math.max(centre >= 0 && centre <= size.height ? centre : size.height / 2, top), bottom);
  const counts = { left: 0, right: 0 };
  const markers: EdgeMarker[] = [];
  for (const id of involved) {
    const p = layout.participants.find((q) => q.id === id);
    if (!p) continue;
    const x = sx(view, p.x);
    const side = x < 0 ? 'left' : x > size.width ? 'right' : undefined;
    if (!side) continue;
    // Several markers on one side stack downwards from the step's height.
    const y = Math.min(base + counts[side] * 28 * scale, bottom);
    counts[side]++;
    markers.push({ id, name: nameOf(p), side, y });
  }
  return markers;
}

/** The view after the minimal horizontal pan that brings drawing x `px` into view with `padding`. */
export function panToReveal(view: ScreenView, size: ScreenSize, px: number, padding = 24): ScreenView {
  const x = sx(view, px);
  if (x < padding) return { ...view, x: view.x + (padding - x) };
  if (x > size.width - padding) return { ...view, x: view.x - (x - (size.width - padding)) };
  return view;
}

export type ArrowNamesMode = 'off' | 'auto' | 'always';

export interface ArrowTag {
  key: string;
  participant: string;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

/** Name tags at the ends of the current step's messages (screen space). */
export function arrowTags(layout: Pick<SequenceLayout, 'participants' | 'messages'>, messageIds: readonly string[], view: ScreenView, size: ScreenSize, mode: ArrowNamesMode, measure: Measure, scale = 1): ArrowTag[] {
  if (mode === 'off') return [];
  const byId = new Map(layout.participants.map((p) => [p.id, p]));
  const wanted = (id: string) => {
    const p = byId.get(id);
    return !!p && (mode === 'always' || !nameVisible(p, view, size));
  };
  const font = tagFont(scale);
  const offset = 6 * scale;
  const tags: ArrowTag[] = [];
  for (const id of messageIds) {
    const m = layout.messages.find((x) => x.id === id);
    if (!m || m.points.length < 2) continue;
    const start = m.points[0]!;
    const end = m.points[m.points.length - 1]!;
    const s = { x: sx(view, start.x), y: sy(view, start.y) };
    const e = { x: sx(view, end.x), y: sy(view, end.y) };
    const fromName = byId.get(m.from) ? nameOf(byId.get(m.from)!) : m.from;
    const toName = byId.get(m.to) ? nameOf(byId.get(m.to)!) : m.to;
    if (m.self) {
      // One tag, left of the lifeline at the loop's start.
      if (wanted(m.from)) tags.push({ key: `${m.id}:from`, participant: m.from, text: fromName, x: s.x - offset, y: s.y, anchor: 'end' });
      continue;
    }
    // Tags go on the side of the line away from the label (labels sit above arrows).
    const labelAbove = sy(view, m.label.y) <= s.y;
    const dy = (labelAbove ? 14 : -8) * scale;
    const dir = e.x >= s.x ? 1 : -1;
    // The autonumber badge (radius 9 in drawing units) sits on the start point: the sender's tag clears it.
    const badge = m.badge ? 9 * view.k : 0;
    const needed = measure(fromName, font) + measure(toName, font) + 4 * offset + 12 * scale + badge;
    const inside = Math.abs(e.x - s.x) >= needed;
    if (wanted(m.from)) tags.push({ key: `${m.id}:from`, participant: m.from, text: fromName, x: s.x + (inside ? offset + badge : -offset - badge) * dir, y: s.y + dy, anchor: (inside ? dir > 0 : dir < 0) ? 'start' : 'end' });
    // The receiver's tag stops short of the arrowhead (12 px), or sits beyond the lifeline when the arrow is short.
    if (wanted(m.to)) tags.push({ key: `${m.id}:to`, participant: m.to, text: toName, x: e.x - (inside ? 12 * scale + offset : -offset) * dir, y: e.y + dy, anchor: (inside ? dir > 0 : dir < 0) ? 'end' : 'start' });
  }
  return tags;
}

/** Messages drawn by a step, including those of concurrent `par` lanes. */
export function stepMessages(step: Pick<Step, 'messages' | 'lanes'>, layout: Pick<SequenceLayout, 'messages'>): string[] {
  const ids = new Set(step.messages);
  const known = new Set(layout.messages.map((m) => m.id));
  for (const lane of step.lanes ?? []) for (const id of lane.targets) if (known.has(id)) ids.add(id);
  return [...ids];
}

/** Participants a step involves: message endpoints and note participants. */
export function stepParticipants(step: Pick<Step, 'messages' | 'notes' | 'lanes'>, layout: Pick<SequenceLayout, 'messages' | 'notes'>): string[] {
  const out = new Set<string>();
  for (const id of stepMessages(step, layout)) {
    const m = layout.messages.find((x) => x.id === id);
    if (m) out.add(m.from).add(m.to);
  }
  const notes = new Set([...step.notes, ...(step.lanes ?? []).flatMap((l) => l.targets)]);
  for (const n of layout.notes) if (notes.has(n.id)) n.participants.forEach((p) => out.add(p));
  return [...out];
}

/** Tag opacity: fades in while the step's arrow draws (its transition), then stays at 1. */
export function tagOpacity(timeline: Pick<Timeline, 'starts' | 'transitions'>, step: number, time: number): number {
  const start = timeline.starts[step];
  if (start === undefined) return 0;
  const transition = Math.max(1, timeline.transitions[step] ?? 0);
  return Math.min(1, Math.max(0, (time - start) / transition));
}
