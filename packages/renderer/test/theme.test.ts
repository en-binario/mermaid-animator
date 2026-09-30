import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, MONOCHROME_RAMP, PALETTES, resolvePalette, TEXT_TOKENS, type PaletteName, type ThemeKind, type ThemeMode } from '../src/theme';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

describe('colour tokens', () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    it.each(TEXT_TOKENS)(`${name}: %s reaches 4.5:1 on canvas`, (token) => {
      expect(contrastRatio(palette[token], palette.canvas)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: ink-1 stays legible on note and surface fills`, () => {
      expect(contrastRatio(palette['ink-1'], palette['note-fill'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette['ink-1'], palette.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.accent, palette['accent-muted'])).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: tokens.css matches the TypeScript table`, () => {
      const block = new RegExp(`\\[data-palette='${name}'\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1];
      expect(block, `missing CSS block for ${name}`).toBeDefined();
      for (const [token, hex] of Object.entries(palette)) {
        const match = new RegExp(`--ma-${token}:\\s*(#[0-9A-Fa-f]{6});`).exec(block as string);
        expect(match?.[1]?.toUpperCase(), `${name} ${token}`).toBe(hex.toUpperCase());
      }
    });
  }

  it('reproduces the ratios published in the specification', () => {
    expect(contrastRatio('#1B1E23', '#FAF8F3')).toBeCloseTo(15.75, 1);
    expect(contrastRatio('#6B7078', '#FAF8F3')).toBeCloseTo(4.7, 1);
    expect(contrastRatio('#9DBCE3', '#121417')).toBeCloseTo(9.43, 1);
  });
});

describe('Monochrome palette', () => {
  it.each(['#FFFFFF', '#EDEDED', '#CCCCCC', '#A6A6A6'])('black text reaches 4.5:1 on %s', (fill) => {
    expect(contrastRatio('#000000', fill)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses only black, white and the header grey', () => {
    expect(new Set(Object.values(PALETTES.monochrome))).toEqual(new Set(['#000000', '#FFFFFF', '#EDEDED']));
    expect(MONOCHROME_RAMP).toEqual(['#FFFFFF', '#EDEDED', '#CCCCCC', '#A6A6A6']);
  });
});

describe('resolvePalette', () => {
  const cases: [ThemeMode, ThemeKind, PaletteName][] = [
    ['auto', 'light', 'ivory'],
    ['auto', 'dark', 'graphite'],
    ['auto', 'highContrast', 'graphite-hc'],
    ['auto', 'highContrastLight', 'ivory-hc'],
    ['ivory', 'dark', 'ivory'],
    ['ivory', 'highContrast', 'ivory'],
    ['graphite', 'light', 'graphite'],
    ['graphite', 'highContrastLight', 'graphite'],
    ['highContrast', 'light', 'ivory-hc'],
    ['highContrast', 'highContrastLight', 'ivory-hc'],
    ['highContrast', 'dark', 'graphite-hc'],
    ['highContrast', 'highContrast', 'graphite-hc'],
  ];
  it.each(cases)('mode %s with %s theme → %s', (mode, kind, expected) => {
    expect(resolvePalette(mode, kind)).toBe(expected);
  });

  it('never selects the export-only Monochrome palette for the panel', () => {
    const modes: ThemeMode[] = ['auto', 'ivory', 'graphite', 'highContrast'];
    const kinds: ThemeKind[] = ['light', 'dark', 'highContrast', 'highContrastLight'];
    for (const m of modes) for (const k of kinds) expect(resolvePalette(m, k)).not.toBe('monochrome');
  });
});
