/**
 * Inline label formatting (spec label-formatting): `<b>`/`<strong>` bold and `<i>`/`<em>` italic,
 * kept as character ranges over the plain text so every consumer that reads a label's text gets
 * it without tags, and only drawing code looks at the marks.
 */

/** A styled character range `[start, end)` over a label's plain text. */
export interface LabelMark {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
}

/** A piece of text with one style. */
export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface MarkedText {
  plain: string;
  /** Present only when some text is formatted. */
  marks?: LabelMark[];
}

const TAG = /<(\/?)(b|strong|i|em)\s*>/gi;

/**
 * Splits `source` into runs at formatting tags. Tags nest (bold inside italic is both); an
 * unmatched opening tag formats to the end, an unmatched closing tag is dropped.
 */
export function markupRuns(source: string): TextRun[] {
  const runs: TextRun[] = [];
  let bold = 0;
  let italic = 0;
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const style = { bold: bold > 0 || undefined, italic: italic > 0 || undefined };
    const prev = runs[runs.length - 1];
    if (prev && !!prev.bold === !!style.bold && !!prev.italic === !!style.italic) prev.text += text;
    else runs.push({ text, ...(style.bold ? { bold: true } : {}), ...(style.italic ? { italic: true } : {}) });
  };
  for (const m of source.matchAll(TAG)) {
    push(source.slice(last, m.index));
    last = (m.index as number) + m[0].length;
    const closing = m[1] === '/';
    const isBold = /^(b|strong)$/i.test(m[2] as string);
    if (isBold) bold = closing ? Math.max(0, bold - 1) : bold + 1;
    else italic = closing ? Math.max(0, italic - 1) : italic + 1;
  }
  push(source.slice(last));
  return runs;
}

/** Plain text and marks for a list of runs (each run's text already final). */
export function marksFromRuns(runs: readonly TextRun[]): MarkedText {
  let plain = '';
  const marks: LabelMark[] = [];
  for (const r of runs) {
    const start = plain.length;
    plain += r.text;
    if ((r.bold || r.italic) && r.text) marks.push({ start, end: plain.length, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}) });
  }
  return marks.length ? { plain, marks } : { plain };
}

/** Parses formatting tags; `transform` post-processes each run's text (entity decoding, `<br>`). */
export function parseLabelMarkup(source: string, transform: (text: string) => string = (t) => t): MarkedText {
  return marksFromRuns(markupRuns(source).map((r) => ({ ...r, text: transform(r.text) })));
}

/** The label text without formatting tags. */
export function stripLabelMarkup(source: string): string {
  return source.replace(TAG, '');
}

export const hasLabelMarkup = (source: string): boolean => new RegExp(TAG.source, 'i').test(source);

/** Style of the character at `i`. */
export function styleAt(marks: readonly LabelMark[] | undefined, i: number): { bold?: boolean; italic?: boolean } {
  let bold = false;
  let italic = false;
  for (const m of marks ?? []) {
    if (i < m.start || i >= m.end) continue;
    if (m.bold) bold = true;
    if (m.italic) italic = true;
  }
  return { ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) };
}

/** Runs covering `plain.slice(start, end)`. */
export function runsOf(plain: string, marks: readonly LabelMark[] | undefined, start = 0, end = plain.length): TextRun[] {
  const runs: TextRun[] = [];
  for (let i = start; i < end; i++) {
    const s = styleAt(marks, i);
    const prev = runs[runs.length - 1];
    if (prev && !!prev.bold === !!s.bold && !!prev.italic === !!s.italic) prev.text += plain[i];
    else runs.push({ text: plain[i] as string, ...s });
  }
  return runs;
}

/** Marks shifted to a new origin and clipped to `[0, length)` (for a substring of the plain text). */
export function sliceMarks(marks: readonly LabelMark[] | undefined, start: number, end: number): LabelMark[] | undefined {
  const out = (marks ?? [])
    .map((m) => ({ ...m, start: Math.max(m.start, start) - start, end: Math.min(m.end, end) - start }))
    .filter((m) => m.end > m.start);
  return out.length ? out : undefined;
}
