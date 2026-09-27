/**
 * Deterministic sequence-diagram layout (spec §13.8.1). Text is measured by an injected function
 * (canvas `measureText` in the webview, an approximation in tests), so `core` stays DOM-free.
 */
import type { ArrowKind, Fragment, ParticipantKind, SequenceModel, SequenceNode } from './sequence/model';
import type { CompiledSequence } from './steps';
import { runsOf, type LabelMark, type TextRun } from './markup';

export type FontRole = 'label' | 'participant' | 'note' | 'micro' | 'badge';
/** Inline style of a text run (spec label-formatting). */
export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
}
export type Measure = (text: string, role: FontRole, style?: TextStyle) => number;

/** Wrapped label: plain lines, plus styled runs per line when the label has formatting. */
export interface WrappedText {
  lines: string[];
  runs?: TextRun[][];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface LaidParticipant {
  id: string;
  kind: ParticipantKind;
  lines: string[];
  /** Styled runs per line when the label has bold / italic text. */
  runs?: TextRun[][];
  x: number;
  header: Rect;
  footer?: Rect;
  /** `full` is where the lifeline ends when the participant is never (or not yet) destroyed. */
  lifeline: { y1: number; y2: number; full: number };
  /** Set for participants introduced with `create`: the header sits at this row. */
  created?: boolean;
  /** y where a destroyed lifeline ends with ✕. */
  destroyedAt?: number;
}

export interface LaidMessage {
  id: string;
  from: string;
  to: string;
  arrow: ArrowKind;
  dotted: boolean;
  self: boolean;
  /** Polyline the arrow is drawn along (from sender to receiver). */
  points: Point[];
  length: number;
  label: { lines: string[]; runs?: TextRun[][]; x: number; y: number; anchor: 'middle' | 'start'; width: number };
  badge?: { x: number; y: number; n: number };
  central?: 'source' | 'target' | 'both';
  bounds: Rect;
}

export interface LaidNote {
  id: string;
  /** Participants the note is attached to. */
  participants: string[];
  lines: string[];
  runs?: TextRun[][];
  rect: Rect;
}

export interface LaidActivation {
  participant: string;
  depth: number;
  x: number;
  y1: number;
  y2: number;
  /** Step that opens / closes the bar (-1 = open from the start; undefined = never closes). */
  startStep: number;
  endStep?: number;
}

export interface LaidFragment {
  id: string;
  kind: Fragment['kind'];
  label: string;
  labelRuns?: TextRun[];
  rect: Rect;
  tabWidth: number;
  /** Width of the small-caps keyword (LOOP, ALT…) inside the tab. */
  keywordWidth: number;
  separators: { y: number; label: string; runs?: TextRun[] }[];
  color?: string;
}

export interface LaidBox {
  id: string;
  label?: string;
  labelRuns?: TextRun[];
  color: string;
  rect: Rect;
}

export interface SequenceLayout {
  width: number;
  height: number;
  participants: LaidParticipant[];
  messages: LaidMessage[];
  notes: LaidNote[];
  activations: LaidActivation[];
  fragments: LaidFragment[];
  boxes: LaidBox[];
  /** Bounds of each step's elements, for the camera. */
  stepBounds: Rect[];
  /** Vertical anchor of each step (its primary row), for activation growth. */
  stepRows: number[];
}

export interface LayoutOptions {
  measure: Measure;
  /** Horizontal safety factor for exported SVGs (spec §14.4): 1.08. */
  widthFactor?: number;
  mirrorActors?: boolean;
}

export const LAYOUT = {
  margin: 32,
  headerHeight: 40,
  actorHeight: 58,
  minHeaderWidth: 112,
  headerPaddingX: 16,
  lineHeight: 18,
  minGap: 48,
  labelPadding: 28,
  messageRow: 40,
  selfWidth: 34,
  selfHeight: 22,
  noteRow: 12,
  notePaddingX: 12,
  notePaddingY: 8,
  fragmentTop: 34,
  fragmentSeparator: 30,
  fragmentBottom: 14,
  fragmentPad: 14,
  fragmentNest: 8,
  activationWidth: 10,
  activationStack: 5,
  maxLabelWidth: 280,
  maxLabelLines: 3,
} as const;

/** Word-wraps text to `maxWidth`, keeping explicit line breaks; at most `maxLines` lines (ellipsis). */
export function wrapText(text: string, measure: Measure, role: FontRole, maxWidth: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, role) > maxWidth) {
        out.push(line);
        line = word;
      } else line = candidate;
    }
    out.push(line);
  }
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return out;
}

/** Style of a run, for measuring. */
export const runStyle = (r: TextRun): TextStyle | undefined => (r.bold || r.italic ? { bold: r.bold, italic: r.italic } : undefined);

/** Width of a line of styled runs. */
export function measureRuns(runs: readonly TextRun[], measure: Measure, role: FontRole): number {
  return runs.reduce((w, r) => w + measure(r.text, role, runStyle(r)), 0);
}

/** Widest line of a wrapped label. */
export function wrappedWidth(wrapped: WrappedText, measure: Measure, role: FontRole): number {
  return Math.max(0, ...wrapped.lines.map((l, i) => (wrapped.runs?.[i] ? measureRuns(wrapped.runs[i]!, measure, role) : measure(l, role))));
}

/** Runs for a whole single-line label, when it has formatting. */
export function labelRuns(text: string, marks: readonly LabelMark[] | undefined): TextRun[] | undefined {
  return marks?.length ? runsOf(text, marks) : undefined;
}

/**
 * `wrapText` for a label with bold / italic ranges: the same word boundaries, each line measured
 * as the sum of its styled runs. Without marks it is exactly `wrapText`.
 */
export function wrapMarkedText(text: string, marks: readonly LabelMark[] | undefined, measure: Measure, role: FontRole, maxWidth: number, maxLines: number): WrappedText {
  if (!marks?.length) return { lines: wrapText(text, measure, role, maxWidth, maxLines) };
  // A line is a list of word spans [start, end) over `text`, joined by one space each.
  const lineRuns = (words: [number, number][]): TextRun[] => {
    const runs: TextRun[] = [];
    const add = (piece: TextRun[]) => {
      for (const r of piece) {
        const prev = runs[runs.length - 1];
        if (prev && !!prev.bold === !!r.bold && !!prev.italic === !!r.italic) prev.text += r.text;
        else runs.push({ ...r });
      }
    };
    words.forEach(([s, e], i) => {
      // The joining space takes the style of the whitespace it replaces.
      if (i > 0) add(runsOf(text, marks, words[i - 1]![1], words[i - 1]![1] + 1).map((r) => ({ ...r, text: ' ' })));
      add(runsOf(text, marks, s, e));
    });
    return runs;
  };
  const lines: [number, number][][] = [];
  let offset = 0;
  for (const paragraph of text.split('\n')) {
    let line: [number, number][] = [];
    for (const m of paragraph.matchAll(/\S+/g)) {
      const word: [number, number] = [offset + (m.index as number), offset + (m.index as number) + m[0].length];
      if (line.length && measureRuns(lineRuns([...line, word]), measure, role) > maxWidth) {
        lines.push(line);
        line = [word];
      } else line.push(word);
    }
    lines.push(line);
    offset += paragraph.length + 1;
  }
  const kept = lines.slice(0, maxLines);
  const runs = kept.map(lineRuns);
  const plain = kept.map((l) => l.map(([s, e]) => text.slice(s, e)).join(' '));
  if (lines.length > maxLines) {
    const last = maxLines - 1;
    plain[last] = `${plain[last]}…`;
    const tail = runs[last]![runs[last]!.length - 1];
    if (tail) tail.text += '…';
    else runs[last]!.push({ text: '…' });
  }
  return { lines: plain, runs };
}

const pathLength = (points: Point[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);

export function unionRects(rects: Rect[]): Rect | undefined {
  if (!rects.length) return undefined;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Participants (with ids) touched by a list of nodes, recursively. */
function participantsIn(nodes: SequenceNode[], into = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.type === 'message') into.add(n.message.from).add(n.message.to);
    else if (n.type === 'note') n.note.participants.forEach((p) => into.add(p));
    else if (n.type === 'activation' || n.type === 'create' || n.type === 'destroy') into.add(n.participant);
    else for (const b of n.fragment.branches) participantsIn(b.children, into);
  }
  return into;
}

function nestingDepth(nodes: SequenceNode[]): number {
  let depth = 0;
  for (const n of nodes) if (n.type === 'fragment') depth = Math.max(depth, 1 + Math.max(0, ...n.fragment.branches.map((b) => nestingDepth(b.children))));
  return depth;
}

export function layoutSequence(model: SequenceModel, compiled: CompiledSequence, options: LayoutOptions): SequenceLayout {
  const { measure } = options;
  const factor = options.widthFactor ?? 1;
  const L = LAYOUT;
  const kinds = compiled.participantKinds;
  const ids = model.participants.map((p) => p.id);
  const col = new Map(ids.map((id, i) => [id, i]));


  // -- 1. participant widths ------------------------------------------------------------------------
  const headerWrapped = model.participants.map((p) => wrapMarkedText(p.label, p.labelMarks, measure, 'participant', 200, 3));
  const headerLines = headerWrapped.map((w) => w.lines);
  const headerWidths = headerWrapped.map((w) => Math.max(L.minHeaderWidth, wrappedWidth(w, measure, 'participant') * factor + 2 * L.headerPaddingX));
  const headerHeights = model.participants.map((p, i) => (kinds[p.id] === 'actor' ? L.actorHeight : L.headerHeight) + ((headerLines[i]?.length ?? 1) - 1) * L.lineHeight);
  const headerHeight = Math.max(L.headerHeight, ...headerHeights);

  // -- 2. column gaps from labels -------------------------------------------------------------------
  const gaps = ids.slice(1).map((_, i) => Math.max(L.minGap + ((headerWidths[i] ?? 0) + (headerWidths[i + 1] ?? 0)) / 2, 0));
  const rightExtra = new Array<number>(ids.length).fill(0);
  const leftExtra = new Array<number>(ids.length).fill(0);
  const require = (a: number, b: number, width: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    if (lo === hi) return;
    let current = 0;
    for (let i = lo; i < hi; i++) current += gaps[i] ?? 0;
    if (current < width) gaps[hi - 1] = (gaps[hi - 1] ?? 0) + (width - current);
  };
  const messageLabels = new Map<string, WrappedText>();
  const noteLines = new Map<string, WrappedText>();
  const visitWidths = (nodes: SequenceNode[]) => {
    for (const n of nodes) {
      if (n.type === 'message') {
        const m = n.message;
        const wrapped = wrapMarkedText(m.label, m.labelMarks, measure, 'label', L.maxLabelWidth, L.maxLabelLines);
        messageLabels.set(m.id, wrapped);
        const w = wrappedWidth(wrapped, measure, 'label') * factor;
        const a = col.get(m.from) ?? 0;
        const b = col.get(m.to) ?? 0;
        if (a === b) rightExtra[a] = Math.max(rightExtra[a] ?? 0, L.selfWidth + 12 + w + 16);
        else require(a, b, w + 2 * L.labelPadding + (m.sequenceNumber !== undefined ? 24 : 0));
      } else if (n.type === 'note') {
        if (compiled.hiddenNotes) continue;
        const wrapped = wrapMarkedText(n.note.text, n.note.textMarks, measure, 'note', 220, 6);
        noteLines.set(n.note.id, wrapped);
        const w = Math.max(80, wrappedWidth(wrapped, measure, 'note') * factor) + 2 * L.notePaddingX;
        const a = col.get(n.note.participants[0]) ?? 0;
        if (n.note.placement === 'over' && n.note.participants[1] !== undefined) require(a, col.get(n.note.participants[1]) ?? a, w - 40);
        else if (n.note.placement === 'rightOf') rightExtra[a] = Math.max(rightExtra[a] ?? 0, w + 12);
        else if (n.note.placement === 'leftOf') leftExtra[a] = Math.max(leftExtra[a] ?? 0, w + 12);
        else {
          rightExtra[a] = Math.max(rightExtra[a] ?? 0, w / 2);
          leftExtra[a] = Math.max(leftExtra[a] ?? 0, w / 2);
        }
      } else if (n.type === 'fragment') {
        for (const b of n.fragment.branches) visitWidths(b.children);
      }
    }
  };
  visitWidths(model.body);
  for (let i = 0; i < ids.length - 1; i++) gaps[i] = Math.max(gaps[i] ?? 0, (rightExtra[i] ?? 0) + (leftExtra[i + 1] ?? 0) + 8);

  const depth = nestingDepth(model.body);
  const sidePad = L.fragmentPad + L.fragmentNest * depth + 8;
  const firstHalf = (headerWidths[0] ?? L.minHeaderWidth) / 2;
  const xs: number[] = [];
  let x = L.margin + Math.max(firstHalf, (leftExtra[0] ?? 0) + 8, sidePad);
  ids.forEach((_, i) => {
    xs.push(x);
    x += gaps[i] ?? 0;
  });
  const lastIndex = ids.length - 1;
  const width = ids.length
    ? (xs[lastIndex] as number) + Math.max((headerWidths[lastIndex] ?? 0) / 2, (rightExtra[lastIndex] ?? 0) + 8, sidePad) + L.margin
    : 2 * L.margin + 200;

  // -- 3. rows -------------------------------------------------------------------------------------------
  const top = L.margin;
  let y = top + headerHeight + 28;
  const messageY = new Map<string, number>();
  const createdHeaderY = new Map<string, number>();
  const destroyY = new Map<string, number>();
  const notes: LaidNote[] = [];
  const fragments: LaidFragment[] = [];
  const statementY = new Map<string, number>();
  const pendingCreates: string[] = [];

  const place = (nodes: SequenceNode[], level: number) => {
    for (const n of nodes) {
      switch (n.type) {
        case 'message': {
          const lines = messageLabels.get(n.message.id)?.lines ?? [''];
          const extraLines = (lines.length - 1) * L.lineHeight;
          const creating = pendingCreates.splice(0);
          // A created participant's header is centred on its creating message's line.
          if (creating.length) y += headerHeight / 2 + 4;
          const lineY = y + extraLines + 18;
          messageY.set(n.message.id, lineY);
          for (const c of creating) createdHeaderY.set(c, lineY - headerHeight / 2);
          y = lineY + (n.message.from === n.message.to ? L.selfHeight + 16 : 22) + (creating.length ? headerHeight / 2 : 0);
          break;
        }
        case 'note': {
          if (compiled.hiddenNotes) break;
          const wrapped = noteLines.get(n.note.id) ?? { lines: [''] };
          const lines = wrapped.lines;
          const h = lines.length * L.lineHeight + 2 * L.notePaddingY;
          const w = Math.max(80, wrappedWidth(wrapped, measure, 'note') * factor) + 2 * L.notePaddingX;
          const a = xs[col.get(n.note.participants[0]) ?? 0] ?? 0;
          let rx: number;
          let rw = w;
          if (n.note.placement === 'rightOf') rx = a + 12;
          else if (n.note.placement === 'leftOf') rx = a - 12 - w;
          else if (n.note.participants[1] !== undefined) {
            const b = xs[col.get(n.note.participants[1]) ?? 0] ?? a;
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            rw = Math.max(w, hi - lo + 40);
            rx = (lo + hi) / 2 - rw / 2;
          } else rx = a - w / 2;
          notes.push({ id: n.note.id, participants: [...n.note.participants], lines, ...(wrapped.runs ? { runs: wrapped.runs } : {}), rect: { x: rx, y: y + 4, w: rw, h } });
          statementY.set(n.note.id, y + 4 + h / 2);
          y += h + L.noteRow + 8;
          break;
        }
        case 'create':
          pendingCreates.push(n.participant);
          break;
        case 'destroy':
          statementY.set(n.id, y);
          break;
        case 'activation':
          statementY.set(n.id, y);
          break;
        case 'fragment': {
          const f = n.fragment;
          const startY = y + 4;
          y = startY + L.fragmentTop;
          const separators: LaidFragment['separators'] = [];
          f.branches.forEach((branch, b) => {
            if (b > 0) {
              const runs = labelRuns(branch.label, branch.labelMarks);
              separators.push({ y: y + 4, label: branch.label, ...(runs ? { runs } : {}) });
              y += L.fragmentSeparator;
            }
            place(branch.children, level + 1);
          });
          y += L.fragmentBottom;
          const involved = f.over ? new Set(ids) : participantsIn(f.branches.flatMap((b) => b.children));
          const columns = [...involved].map((p) => col.get(p)).filter((c): c is number => c !== undefined);
          const inner = nestingDepth(f.branches.flatMap((b) => b.children));
          const pad = L.fragmentPad + L.fragmentNest * inner;
          const lo = columns.length ? Math.min(...columns) : 0;
          const hi = columns.length ? Math.max(...columns) : Math.max(0, lastIndex);
          const selfExtra = columns.includes(hi) ? Math.min(rightExtra[hi] ?? 0, 180) : 0;
          const x1 = (xs[lo] ?? L.margin) - Math.max(pad + 40, (leftExtra[lo] ?? 0) + pad);
          const x2 = (xs[hi] ?? width - L.margin) + Math.max(pad + 40, selfExtra + pad);
          const label = f.kind === 'rect' ? '' : f.label;
          const keyword = f.kind === 'par' && f.over ? 'PAR' : f.kind.toUpperCase();
          const keywordWidth = measure(keyword, 'micro');
          const tabWidth = keywordWidth + 22;
          const runs = f.kind === 'rect' ? undefined : labelRuns(f.label, f.labelMarks);
          fragments.push({ id: f.id, kind: f.kind, label, ...(runs ? { labelRuns: runs } : {}), rect: { x: x1, y: startY, w: x2 - x1, h: y - startY }, tabWidth, keywordWidth, separators, color: f.color });
          y += 8;
          break;
        }
      }
    }
  };
  place(model.body, 0);
  // Drop dangling creates (never followed by a message) at the end.
  for (const c of pendingCreates.splice(0)) {
    createdHeaderY.set(c, y);
    y += headerHeight + 12;
  }
  const lifelineEnd = y + 16;

  // -- 4. participants -----------------------------------------------------------------------------------
  const mirror = options.mirrorActors ?? true;
  const participants: LaidParticipant[] = model.participants.map((p, i) => {
    const w = headerWidths[i] as number;
    const h = headerHeights[i] as number;
    const px = xs[i] as number;
    const hy = createdHeaderY.get(p.id) ?? top + (headerHeight - h);
    return {
      id: p.id,
      kind: kinds[p.id] ?? p.kind,
      lines: headerLines[i] as string[],
      ...(headerWrapped[i]?.runs ? { runs: headerWrapped[i]!.runs } : {}),
      x: px,
      header: { x: px - w / 2, y: hy, w, h },
      footer: mirror ? { x: px - w / 2, y: lifelineEnd + 8, w, h } : undefined,
      lifeline: { y1: hy + h, y2: lifelineEnd, full: lifelineEnd },
      created: createdHeaderY.has(p.id) || undefined,
    };
  });
  const byId = new Map(participants.map((p) => [p.id, p]));

  // -- 5. activations and destruction, in step order ---------------------------------------------------------
  const steps = compiled.steps;
  const stepRows = steps.map((s) => {
    const m = s.messages[0];
    if (m && messageY.has(m)) return messageY.get(m) as number;
    const n = s.notes[0];
    if (n && statementY.has(n)) return statementY.get(n) as number;
    return undefined;
  });
  // Fill rows of steps without their own element from neighbours.
  for (let i = 0; i < stepRows.length; i++) if (stepRows[i] === undefined) stepRows[i] = i > 0 ? (stepRows[i - 1] as number) + 12 : top + headerHeight + 28;
  const rows = stepRows as number[];

  const activations: LaidActivation[] = [];
  const open = new Map<string, LaidActivation[]>();
  const apply = (effects: { participant: string; on: boolean }[], stepIndex: number, rowY: number) => {
    for (const e of effects) {
      const stack = open.get(e.participant) ?? [];
      if (e.on) {
        const p = byId.get(e.participant);
        if (!p) continue;
        const bar: LaidActivation = { participant: e.participant, depth: stack.length, x: p.x - L.activationWidth / 2 + stack.length * L.activationStack, y1: rowY, y2: lifelineEnd, startStep: stepIndex };
        stack.push(bar);
        activations.push(bar);
      } else {
        const bar = stack.pop();
        if (bar) {
          bar.y2 = Math.max(bar.y1 + 12, rowY);
          bar.endStep = stepIndex;
        }
      }
      open.set(e.participant, stack);
    }
  };
  apply(compiled.initial.activations, -1, top + headerHeight + 20);
  steps.forEach((s, i) => {
    apply(s.activations, i, rows[i] as number);
    for (const d of s.destroys) destroyY.set(d, (rows[i] as number) + 4);
  });
  for (const d of compiled.initial.destroys) if (!destroyY.has(d)) destroyY.set(d, lifelineEnd);
  for (const p of participants) {
    const d = destroyY.get(p.id);
    if (d !== undefined) {
      p.destroyedAt = d;
      p.lifeline.y2 = d;
      p.footer = undefined;
    }
  }

  // -- 6. messages ---------------------------------------------------------------------------------------------
  const depthAt = (participant: string, rowY: number) => activations.filter((a) => a.participant === participant && a.y1 <= rowY + 0.5 && a.y2 >= rowY - 0.5).length;
  const messages: LaidMessage[] = [];
  const visitMessages = (nodes: SequenceNode[]) => {
    for (const n of nodes) {
      if (n.type === 'fragment') n.fragment.branches.forEach((b) => visitMessages(b.children));
      if (n.type !== 'message') continue;
      const m = n.message;
      const my = messageY.get(m.id) as number;
      const from = byId.get(m.from);
      const to = byId.get(m.to);
      if (!from || !to) continue;
      const wrapped = messageLabels.get(m.id) ?? { lines: [''] };
      const lines = wrapped.lines;
      const runs = wrapped.runs;
      const labelWidth = wrappedWidth(wrapped, measure, 'label');
      let points: Point[];
      let label: LaidMessage['label'];
      if (from.id === to.id) {
        const d = depthAt(from.id, my);
        const x0 = from.x + (d ? L.activationWidth / 2 + (d - 1) * L.activationStack : 0);
        const xr = x0 + L.selfWidth;
        points = [{ x: x0, y: my }, { x: xr, y: my }, { x: xr, y: my + L.selfHeight }, { x: x0 + 2, y: my + L.selfHeight }];
        label = { lines, ...(runs ? { runs } : {}), x: xr + 10, y: my - 6 - (lines.length - 1) * L.lineHeight, anchor: 'start', width: labelWidth };
      } else {
        const rightwards = to.x > from.x;
        const dFrom = depthAt(from.id, my);
        const dTo = depthAt(to.id, my);
        const half = L.activationWidth / 2;
        const x1 = rightwards ? from.x + (dFrom ? half + (dFrom - 1) * L.activationStack : 0) : from.x - (dFrom ? half : 0);
        let x2 = rightwards ? to.x - (dTo ? half : 0) : to.x + (dTo ? half + (dTo - 1) * L.activationStack : 0);
        // A creating message ends at the edge of the new participant's header.
        if (to.created && Math.abs(to.header.y + to.header.h / 2 - my) < 1) x2 = rightwards ? to.header.x : to.header.x + to.header.w;
        points = [{ x: x1, y: my }, { x: x2, y: my }];
        label = { lines, ...(runs ? { runs } : {}), x: (from.x + to.x) / 2, y: my - 8 - (lines.length - 1) * L.lineHeight, anchor: 'middle', width: labelWidth };
      }
      const badge = m.sequenceNumber !== undefined ? { x: points[0]!.x, y: my, n: m.sequenceNumber } : undefined;
      const xsAll = points.map((p) => p.x).concat(label.anchor === 'middle' ? [label.x - labelWidth / 2, label.x + labelWidth / 2] : [label.x, label.x + labelWidth]);
      const ysAll = points.map((p) => p.y).concat([label.y - 14]);
      const bx = Math.min(...xsAll);
      const by = Math.min(...ysAll);
      messages.push({
        id: m.id, from: m.from, to: m.to, arrow: m.arrow, dotted: m.dotted, self: from.id === to.id, points, length: pathLength(points), label, badge, central: m.central,
        bounds: { x: bx, y: by, w: Math.max(...xsAll) - bx, h: Math.max(...ysAll) + 6 - by },
      });
    }
  };
  visitMessages(model.body);

  // -- 7. boxes ---------------------------------------------------------------------------------------------------
  const boxes: LaidBox[] = model.boxes
    .filter((b) => b.members.length)
    .map((b) => {
      const members = b.members.map((m) => byId.get(m)).filter((p): p is LaidParticipant => !!p);
      const x1 = Math.min(...members.map((p) => p.header.x)) - 12;
      const x2 = Math.max(...members.map((p) => p.header.x + p.header.w)) + 12;
      const bottom = Math.max(...members.map((p) => (p.footer ? p.footer.y + p.footer.h : p.lifeline.y2))) + 10;
      return { id: b.id, label: b.label, ...(b.label && b.labelMarks ? { labelRuns: labelRuns(b.label, b.labelMarks) } : {}), color: b.color, rect: { x: x1, y: top - (b.label ? 26 : 12), w: x2 - x1, h: bottom - (top - (b.label ? 26 : 12)) } };
    });

  // -- 8. step bounds -------------------------------------------------------------------------------------------
  const messageById = new Map(messages.map((m) => [m.id, m]));
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const stepBounds = steps.map((s, i) => {
    const rects: Rect[] = [];
    for (const id of s.messages) {
      const m = messageById.get(id);
      if (m) rects.push(m.bounds);
    }
    for (const id of s.notes) {
      const n = noteById.get(id);
      if (n) rects.push(n.rect);
    }
    for (const c of s.creates) {
      const p = byId.get(c);
      if (p) rects.push(p.header);
    }
    const row = rows[i] as number;
    for (const a of s.activations) {
      const p = byId.get(a.participant);
      if (p) rects.push({ x: p.x - 8, y: row - 8, w: 16, h: 16 });
    }
    return unionRects(rects) ?? { x: xs[0] ?? 0, y: row - 10, w: 20, h: 20 };
  });

  const footerBottom = Math.max(lifelineEnd, ...participants.map((p) => (p.footer ? p.footer.y + p.footer.h : p.lifeline.y2)));
  const boxBottom = Math.max(0, ...boxes.map((b) => b.rect.y + b.rect.h));
  return {
    width: Math.max(width, ...fragments.map((f) => f.rect.x + f.rect.w + L.margin), ...notes.map((n) => n.rect.x + n.rect.w + L.margin), ...messages.map((m) => m.bounds.x + m.bounds.w + L.margin)),
    height: Math.max(footerBottom, boxBottom) + L.margin,
    participants,
    messages,
    notes,
    activations,
    fragments,
    boxes,
    stepBounds,
    stepRows: rows,
  };
}

/** Rough text measurement for tests and non-DOM contexts (Inter at 13px ≈ 7 px per character). */
export const approximateMeasure: Measure = (text, role, style) => {
  const perChar = role === 'participant' ? 7.6 : role === 'micro' ? 6.6 : role === 'badge' ? 6.2 : 7.1;
  // Bold text runs about 6 % wider.
  return text.length * perChar * (style?.bold ? 1.06 : 1);
};
