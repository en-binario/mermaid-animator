// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BOLD_MARK, FALLBACK_BOLD_WEIGHT, ITALIC_MARK, markFormatting, stripMarkers, styleMarkers } from '../src/fallbackMarkup';

const B = BOLD_MARK;
const I = ITALIC_MARK;

describe('markFormatting', () => {
  it('replaces tags with a marker before every formatted word, keeping line breaks', () => {
    expect(markFormatting('FSVC["<b>FirmaDigitalService</b><br/>iniciarFirma()"]')).toBe(`FSVC["${B}FirmaDigitalService<br/>iniciarFirma()"]`);
    expect(markFormatting('A["2 <b>atomic DR lock</b><br/>3 reserve"]')).toBe(`A["2 ${B}atomic ${B}DR ${B}lock<br/>3 reserve"]`);
    expect(markFormatting('A["<b>one<br/>two</b>"]')).toBe(`A["${B}one<br/>${B}two"]`);
  });

  it('marks italic and nested words', () => {
    expect(markFormatting('SSE["SseHub<br/><i>Sinks.Many</i> (optional)"]')).toBe(`SSE["SseHub<br/>${I}Sinks.Many (optional)"]`);
    expect(markFormatting('A["<b>x <i>y</i></b>"]')).toBe(`A["${B}x ${B}${I}y"]`);
  });

  it('keeps an unclosed tag inside its own quoted label', () => {
    expect(markFormatting('A["<b>open"] --> B["plain"]')).toBe(`A["${B}open"] --> B["plain"]`);
  });

  it('leaves sources without formatting tags untouched', () => {
    const source = 'flowchart TB\n  A["a < b > c"] --> B["<u>u</u>"]';
    expect(markFormatting(source)).toBe(source);
  });

  it('handles unquoted labels line by line', () => {
    expect(markFormatting('A[<b>bold</b> text] --> B')).toBe(`A[${B}bold text] --> B`);
  });
});

describe('styleMarkers', () => {
  const NS = 'http://www.w3.org/2000/svg';

  function svgWith(words: string[]) {
    const svg = document.createElementNS(NS, 'svg');
    const text = document.createElementNS(NS, 'text');
    for (const w of words) {
      const span = document.createElementNS(NS, 'tspan');
      span.textContent = w;
      text.appendChild(span);
    }
    svg.appendChild(text);
    return svg;
  }

  it('turns marked words into bold and italic tspans and removes every marker', () => {
    const svg = svgWith([`${B}FirmaDigitalService`, ' plain', ` ${I}Sinks.Many`, ` ${B}${I}both`]);
    expect(styleMarkers(svg)).toBe(3);
    expect(svg.textContent).toBe('FirmaDigitalService plain Sinks.Many both');
    const styled = [...svg.querySelectorAll('tspan > tspan')];
    expect(styled.map((t) => [t.textContent, t.getAttribute('font-weight'), t.getAttribute('font-style')])).toEqual([
      ['FirmaDigitalService', String(FALLBACK_BOLD_WEIGHT), null],
      ['Sinks.Many', null, 'italic'],
      ['both', String(FALLBACK_BOLD_WEIGHT), 'italic'],
    ]);
  });

  it('styles several marked words inside one text node', () => {
    const svg = svgWith([`2 ${B}atomic ${B}DR ${B}lock`]);
    styleMarkers(svg);
    expect(svg.textContent).toBe('2 atomic DR lock');
    expect([...svg.querySelectorAll('[font-weight]')].map((t) => t.textContent)).toEqual(['atomic', 'DR', 'lock']);
  });

  it('strips markers from labels read back as text', () => {
    expect(stripMarkers(`${B}Firma ${I}x`)).toBe('Firma x');
  });
});
