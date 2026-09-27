/**
 * Inline formatting for Mermaid-rendered diagrams (spec label-formatting, design D4). Mermaid's SVG
 * labels (`htmlLabels: false`) would draw `<b>` as text, so before rendering each formatted word is
 * prefixed with a zero-width marker instead of the tags — Mermaid then measures and wraps the
 * untagged text — and after rendering the markers become bold / italic tspans.
 */
import { markupRuns } from '@mermaid-animator/core';

/** U+2063 INVISIBLE SEPARATOR marks a bold word, U+2062 INVISIBLE TIMES an italic one. */
export const BOLD_MARK = '\u2063';
export const ITALIC_MARK = '\u2062';
const MARKS = /[\u2062\u2063]/g;
const HAS_MARK = /[\u2062\u2063]/;

/** Bold weight in Mermaid labels (Mermaid measured the words at regular weight; 650 stays close). */
export const FALLBACK_BOLD_WEIGHT = 650;

const BR = /(<br\s*\/?>)/i;

/** Prefixes every word of `text` with `prefix`, treating `<br>` as a word boundary. */
function markWords(text: string, prefix: string): string {
  return text
    .split(BR)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/(^|\s+)(?=\S)/g, `$1${prefix}`)))
    .join('');
}

/** Rewrites formatting tags in one label (or line) into word markers. */
function markSegment(segment: string): string {
  if (!/<\/?(b|strong|i|em)\s*>/i.test(segment)) return segment;
  return markupRuns(segment)
    .map((run) => {
      const prefix = `${run.bold ? BOLD_MARK : ''}${run.italic ? ITALIC_MARK : ''}`;
      return prefix ? markWords(run.text, prefix) : run.text;
    })
    .join('');
}

/**
 * The source with formatting tags replaced by word markers. Quoted labels are rewritten one by one
 * (an unclosed tag formats to the end of its label); text outside quotes is rewritten per line.
 */
export function markFormatting(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      if (!line.includes('"')) return markSegment(line);
      return line
        .split(/("[^"]*")/)
        .map((part) => (part.startsWith('"') && part.endsWith('"') && part.length >= 2 ? `"${markSegment(part.slice(1, -1))}"` : markSegment(part)))
        .join('');
    })
    .join('\n');
}

/** Removes markers from a string (labels read from the rendered SVG). */
export const stripMarkers = (text: string): string => text.replace(MARKS, '');

/**
 * Turns marked words in the rendered SVG into bold / italic tspans and removes every marker.
 * Returns the number of styled words.
 */
export function styleMarkers(root: Element): number {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (HAS_MARK.test((n as Text).data)) nodes.push(n as Text);
  let styled = 0;
  for (const node of nodes) {
    const parent = node.parentNode;
    if (!parent) continue;
    // Split into marked words and plain text; a marked word runs to the next whitespace.
    const pieces = node.data.split(/([\u2062\u2063]+[^\s\u2062\u2063]*)/).filter((p) => p !== '');
    const replacement = pieces.map((piece) => {
      const marks = piece.match(/^[\u2062\u2063]+/)?.[0];
      if (!marks) return doc.createTextNode(piece);
      const word = piece.slice(marks.length);
      if (!word) return doc.createTextNode('');
      const span = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      if (marks.includes(BOLD_MARK)) span.setAttribute('font-weight', String(FALLBACK_BOLD_WEIGHT));
      if (marks.includes(ITALIC_MARK)) span.setAttribute('font-style', 'italic');
      span.textContent = word;
      styled++;
      return span;
    });
    for (const r of replacement) parent.insertBefore(r, node);
    parent.removeChild(node);
  }
  // Markers Mermaid moved into attributes (titles, aria labels) are dropped too.
  for (const el of root.querySelectorAll('[aria-label], title, desc')) {
    const label = el.getAttribute('aria-label');
    if (label && HAS_MARK.test(label)) el.setAttribute('aria-label', stripMarkers(label));
    if (el.tagName !== 'text' && el.textContent && HAS_MARK.test(el.textContent)) el.textContent = stripMarkers(el.textContent);
  }
  return styled;
}
