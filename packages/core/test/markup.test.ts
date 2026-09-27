import { describe, expect, it } from 'vitest';
import { hasLabelMarkup, markupRuns, parseLabelMarkup, runsOf, sliceMarks, stripLabelMarkup } from '../src';

describe('label markup', () => {
  it('parses bold and italic runs', () => {
    expect(markupRuns('<b>reserve</b> DR number')).toEqual([{ text: 'reserve', bold: true }, { text: ' DR number' }]);
    expect(markupRuns('SseHub <i>Sinks.Many</i> (optional)')).toEqual([{ text: 'SseHub ' }, { text: 'Sinks.Many', italic: true }, { text: ' (optional)' }]);
    expect(markupRuns('<strong>a</strong><em>b</em>')).toEqual([{ text: 'a', bold: true }, { text: 'b', italic: true }]);
  });

  it('combines nested tags and matches case-insensitively with space before >', () => {
    expect(markupRuns('<B >x <i>y</I></b>')).toEqual([{ text: 'x ', bold: true }, { text: 'y', bold: true, italic: true }]);
  });

  it('continues formatting across line breaks', () => {
    const { plain, marks } = parseLabelMarkup('<b>one<br/>two</b> three', (t) => t.replace(/<br\s*\/?>/gi, '\n'));
    expect(plain).toBe('one\ntwo three');
    expect(marks).toEqual([{ start: 0, end: 7, bold: true }]);
  });

  it('formats to the end for an unclosed tag and ignores a stray closer', () => {
    expect(parseLabelMarkup('<b>lock DR')).toEqual({ plain: 'lock DR', marks: [{ start: 0, end: 7, bold: true }] });
    expect(parseLabelMarkup('plain</b> text')).toEqual({ plain: 'plain text' });
  });

  it('leaves other HTML-like text alone', () => {
    expect(parseLabelMarkup('a < b > c <u>u</u> <code>x</code>')).toEqual({ plain: 'a < b > c <u>u</u> <code>x</code>' });
    expect(hasLabelMarkup('a < b > c')).toBe(false);
    expect(hasLabelMarkup('a <b>c</b>')).toBe(true);
  });

  it('strips tags for plain text', () => {
    expect(stripLabelMarkup('<b>atomic DR lock</b>')).toBe('atomic DR lock');
  });

  it('applies the transform per run so marks index the final text', () => {
    const { plain, marks } = parseLabelMarkup('A&amp;B <b>C&amp;D</b>', (t) => t.replace(/&amp;/g, '&'));
    expect(plain).toBe('A&B C&D');
    expect(plain.slice(marks![0]!.start, marks![0]!.end)).toBe('C&D');
  });

  it('rebuilds runs for a substring', () => {
    const { plain, marks } = parseLabelMarkup('ab <b>cd</b> ef');
    expect(runsOf(plain, marks, 1, 5)).toEqual([{ text: 'b ' }, { text: 'cd', bold: true }]);
    expect(sliceMarks(marks, 4, 8)).toEqual([{ start: 0, end: 1, bold: true }]);
    expect(sliceMarks(marks, 6, 8)).toBeUndefined();
  });
});
