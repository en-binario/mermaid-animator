/**
 * Narrative helpers (spec narrative, inspector, transcript-view): the caption inline parser,
 * chapter derivation and navigation, and the text forms of a step and its fragment context.
 * Pure functions; the components render their output as Preact nodes, never as HTML strings.
 */
import type { FragmentFrame, Step } from '@mermaid-animator/core';

export type Translate = (key: string, ...args: (string | number)[]) => string;

export interface InlineNode {
  kind: 'text' | 'bold' | 'italic' | 'code';
  text: string;
}

/**
 * Parses the caption whitelist: `**bold**`, `*italic*` and `` `code` ``. Everything else —
 * HTML included — stays literal text. Unclosed markers are literal too.
 */
export function parseInline(source: string): InlineNode[] {
  const out: InlineNode[] = [];
  const push = (kind: InlineNode['kind'], text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (kind === 'text' && last?.kind === 'text') last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const code = /^`([^`]+)`/.exec(rest);
    const bold = /^\*\*(?=\S)([\s\S]*?\S)\*\*/.exec(rest);
    const italic = /^\*(?=[^\s*])([^*]*?[^\s*])\*/.exec(rest) ?? /^\*([^\s*])\*/.exec(rest);
    if (code) {
      push('code', code[1] as string);
      i += code[0].length;
    } else if (bold) {
      push('bold', bold[1] as string);
      i += bold[0].length;
    } else if (italic) {
      push('italic', italic[1] as string);
      i += italic[0].length;
    } else {
      push('text', source[i] as string);
      i++;
    }
  }
  return out;
}

export interface Chapter {
  title: string;
  /** 0-based index of the chapter's first step. */
  firstStep: number;
}

export function deriveChapters(steps: readonly Step[]): Chapter[] {
  return steps.filter((s) => s.chapter).map((s) => ({ title: s.chapter as string, firstStep: s.index }));
}

/** Index of the chapter containing `step` (0-based), or -1 before the first chapter. */
export function chapterIndexAt(chapters: readonly Chapter[], step: number): number {
  let found = -1;
  chapters.forEach((c, i) => {
    if (c.firstStep <= step) found = i;
  });
  return found;
}

/**
 * The step to seek to for `Shift+→` / `Shift+←` from the resting step `step` (0-based, -1 before
 * the first): the next chapter's first step, or the previous chapter's — going back from inside a
 * chapter first returns to that chapter's own start. Undefined when there is nowhere to go.
 */
export function chapterTarget(chapters: readonly Chapter[], step: number, direction: 1 | -1): number | undefined {
  if (direction === 1) return chapters.find((c) => c.firstStep > step)?.firstStep;
  const current = chapterIndexAt(chapters, step);
  if (current < 0) return undefined;
  const own = chapters[current] as Chapter;
  if (own.firstStep < step) return own.firstStep;
  return chapters[current - 1]?.firstStep;
}

const english: Translate = (key, ...args) =>
  ({ 'step.activate': '{0} activates', 'step.deactivate': '{0} deactivates', 'step.create': '{0} is created', 'step.destroy': '{0} is destroyed' })[key]?.replace(/\{(\d+)\}/g, (_m, i: string) => String(args[Number(i)] ?? '')) ?? key;

/**
 * The step as one line of text: `A → B: label` for messages, the label for notes, and a short
 * sentence for steps that only activate, create or destroy participants.
 */
export function stepText(step: Step, t: Translate = english): string {
  if (step.kind === 'message' && step.from !== undefined) return `${step.from} → ${step.to}: ${step.label}`.replace(/\n/g, ' ');
  if (step.label.trim()) return step.label.replace(/\n/g, ' ');
  const parts = [
    ...step.creates.map((id) => t('step.create', id)),
    ...step.destroys.map((id) => t('step.destroy', id)),
    ...step.activations.map((a) => t(a.on ? 'step.activate' : 'step.deactivate', a.participant)),
  ];
  return parts.join(' · ');
}

const frameName = (f: FragmentFrame) => (f.kind === 'loop' || f.kind === 'par' || !f.branchLabel ? f.label : f.branchLabel);

/** Inspector context, e.g. `LOOP retry › ALT valid · iteration 2 of 3`. */
export function contextText(path: readonly FragmentFrame[], t: Translate): string {
  if (!path.length) return '';
  const trail = path.map((f) => `${f.kind.toUpperCase()} ${frameName(f)}`.trim()).join(' › ');
  const loop = [...path].reverse().find((f) => f.iteration !== undefined && (f.of ?? 1) > 1);
  return loop ? `${trail} · ${t('inspector.iteration', loop.iteration as number, loop.of as number)}` : trail;
}

/** Transcript context, e.g. `in loop "retry", iteration 2 of 3`. */
export function transcriptContext(path: readonly FragmentFrame[], t: Translate): string {
  return path
    .map((f) => (f.iteration !== undefined && (f.of ?? 1) > 1 ? t('transcript.loopFrame', f.kind, frameName(f), f.iteration, f.of as number) : t('transcript.frame', f.kind, frameName(f))))
    .join(', ');
}

export interface TranscriptEntry {
  index: number;
  line: string;
  caption?: string;
}

export interface TranscriptGroup {
  chapter?: string;
  entries: TranscriptEntry[];
}

/** Steps as transcript lines (`07. Gateway → Auth: verify(token) — in loop "retry", iteration 2 of 3`), grouped by chapter. */
export function transcript(steps: readonly Step[], t: Translate): TranscriptGroup[] {
  const width = Math.max(2, String(steps.length).length);
  const groups: TranscriptGroup[] = [];
  for (const step of steps) {
    if (step.chapter || !groups.length) groups.push({ chapter: step.chapter, entries: [] });
    const context = transcriptContext(step.fragmentPath, t);
    const line = `${String(step.index + 1).padStart(width, '0')}. ${stepText(step, t)}${context ? ` — ${context}` : ''}`;
    (groups[groups.length - 1] as TranscriptGroup).entries.push({ index: step.index, line, caption: step.caption });
  }
  return groups;
}

/**
 * Participants a step involves (for focused playback): message endpoints, note participants,
 * activation, creation and destruction targets.
 */
export function stepInvolves(step: Step, messageEnds: ReadonlyMap<string, readonly [string, string]>, noteParticipants: ReadonlyMap<string, readonly string[]>): string[][] {
  const groups: string[][] = [];
  for (const id of step.messages) {
    const ends = messageEnds.get(id);
    if (ends) groups.push([...ends]);
  }
  for (const id of step.notes) groups.push([...(noteParticipants.get(id) ?? [])]);
  for (const a of step.activations) groups.push([a.participant]);
  for (const id of [...step.creates, ...step.destroys]) groups.push([id]);
  if (!groups.length && step.from !== undefined) groups.push([step.from, step.to ?? step.from]);
  return groups;
}

/**
 * Steps to skip for *Play only focused steps*: one focused participant keeps steps touching it;
 * several keep interactions among them (the same rule as focus dimming).
 */
export function focusSkipSet(steps: readonly Step[], focus: ReadonlySet<string>, involves: (step: Step) => string[][]): Set<number> {
  const skip = new Set<number>();
  if (!focus.size) return skip;
  const keeps = (group: string[]) => group.length > 0 && (focus.size === 1 ? group.some((p) => focus.has(p)) : group.every((p) => focus.has(p)));
  for (const step of steps) if (!involves(step).some(keeps)) skip.add(step.index);
  return skip;
}
