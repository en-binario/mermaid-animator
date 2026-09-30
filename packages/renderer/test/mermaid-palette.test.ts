import { describe, expect, it } from 'vitest';
import { mermaidPalette, toHex, type MermaidThemeVariables } from '../src/mermaidPalette';
import { MERMAID_PALETTES } from '../src/mermaidPalettes.generated';
import { INK_IVORY_PALETTES } from '../src/palettes';

const { ivory, graphite } = INK_IVORY_PALETTES;

describe('toHex', () => {
  it.each([
    ['white', '#FFFFFF'],
    ['lightgrey', '#D3D3D3'],
    ['#333', '#333333'],
    ['#ECECFF', '#ECECFF'],
    ['#9370db', '#9370DB'],
    ['rgb(31, 59, 97)', '#1F3B61'],
    ['hsl(240, 60%, 86.2745098039%)', '#C7C7F1'],
    ['hsl(-79.4117647059, 100%, 93.3333333333%)', '#F4DDFF'],
    ['hsl(0, 0%, 83.3333333333%)', '#D4D4D4'],
  ])('%s → %s', (value, hex) => {
    expect(toHex(value)).toBe(hex);
  });

  it('refuses colours it cannot read', () => {
    expect(() => toHex('var(--x)')).toThrow('Unsupported Mermaid colour: var(--x)');
  });
});

describe('mermaidPalette mapping', () => {
  const vars: MermaidThemeVariables = {
    background: 'white', actorBkg: '#ECECFF', actorBorder: '#9370DB', actorTextColor: 'black', signalColor: '#333',
    labelBoxBkgColor: '#ECECFF', activationBkgColor: '#f4f4f4', noteBkgColor: '#fff5ad', noteBorderColor: '#aaaa33', primaryBorderColor: '#ccc',
  };

  it('uses the first border colour that reaches 3:1 as the highlight', () => {
    expect(mermaidPalette(vars, ivory, graphite).accent).toBe('#9370DB');
    expect(mermaidPalette({ ...vars, actorBorder: '#D4D4D4', primaryBorderColor: '#EEEEEE' }, ivory, graphite).accent).toBe('#333333');
  });

  it('falls back to the text colour when no border colour reaches 3:1', () => {
    expect(mermaidPalette({ ...vars, actorBorder: '#EEE', primaryBorderColor: '#EEE', signalColor: '#DDD' }, ivory, graphite).accent).toBe('#000000');
  });

  it('keeps a legible note fill and replaces an illegible one with the participant fill', () => {
    expect(mermaidPalette(vars, ivory, graphite)['note-fill']).toBe('#FFF5AD');
    expect(mermaidPalette({ ...vars, actorTextColor: '#333', noteBkgColor: '#666' }, ivory, graphite)['note-fill']).toBe('#ECECFF');
  });

  it('borrows emphasis colours from Ivory on a light canvas and from Graphite on a dark one', () => {
    expect(mermaidPalette(vars, ivory, graphite).brass).toBe(ivory.brass);
    expect(mermaidPalette({ ...vars, background: '#333' }, ivory, graphite).crimson).toBe(graphite.crimson);
  });
});

describe('Mermaid theme palette matrix', () => {
  // Canvas, participant fill, border, text, message line, current-step highlight, note fill.
  it.each([
    ['default', '#FFFFFF', '#ECECFF', '#9370DB', '#000000', '#333333', '#9370DB', '#FFF5AD'],
    ['neutral', '#FFFFFF', '#EEEEEE', '#D4D4D4', '#333333', '#333333', '#333333', '#EEEEEE'],
    ['dark', '#333333', '#1F2020', '#CCCCCC', '#D3D3D3', '#D3D3D3', '#CCCCCC', '#474949'],
    ['forest', '#FFFFFF', '#CDE498', '#A6CF47', '#000000', '#333333', '#333333', '#FFF5AD'],
  ] as const)('%s', (theme, canvas, fill, border, text, line, highlight, note) => {
    const p = MERMAID_PALETTES[`mermaid-${theme}`];
    expect([p.canvas, p.surface, p.rule, p['ink-1'], p['ink-2'], p.accent, p['note-fill']]).toEqual([canvas, fill, border, text, line, highlight, note]);
  });
});
