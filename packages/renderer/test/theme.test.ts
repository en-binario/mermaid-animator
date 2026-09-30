import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, PALETTES, resolvePalette, TEXT_TOKENS, type PaletteName, type ThemeKind, type ThemeMode } from '../src/theme';

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
  const inks = ['hairline', 'rule', 'ink-1', 'ink-2', 'ink-3', 'accent', 'brass', 'sage', 'note-rule', 'crimson', 'viridian'] as const;
  const fills = ['canvas', 'surface', 'surface-sunken', 'accent-muted', 'note-fill'] as const;
  const pairs = inks.flatMap((ink) => fills.map((fill) => [ink, fill] as const));
  // Monochrome text contrast (spec visual-theme): every ink on every fill is black on white.
  it.each(pairs)('%s on %s is 21:1', (ink, fill) => {
    expect(contrastRatio(PALETTES.monochrome[ink], PALETTES.monochrome[fill])).toBeCloseTo(21, 5);
  });

  it('uses only black and white', () => {
    expect(new Set(Object.values(PALETTES.monochrome))).toEqual(new Set(['#000000', '#FFFFFF']));
  });
});

describe('resolvePalette', () => {
  const ALL: ThemeKind[] = ['light', 'dark', 'highContrast', 'highContrastLight'];
  // Theme mode matrix (spec visual-theme): mode × editor theme kinds → panel palette.
  const rows: [string, ThemeMode, ThemeKind[], PaletteName][] = [
    ['follows a light editor theme with Ivory', 'auto', ['light'], 'ivory'],
    ['follows a dark editor theme with Graphite', 'auto', ['dark'], 'graphite'],
    ['follows a high-contrast-light editor theme with Ivory high contrast', 'auto', ['highContrastLight'], 'ivory-hc'],
    ['follows a high-contrast editor theme with Graphite high contrast', 'auto', ['highContrast'], 'graphite-hc'],
    ['fixes Ivory for every editor theme', 'ivory', ALL, 'ivory'],
    ['fixes Graphite for every editor theme', 'graphite', ALL, 'graphite'],
    ['picks Ivory high contrast for light editor themes', 'highContrast', ['light', 'highContrastLight'], 'ivory-hc'],
    ['picks Graphite high contrast for dark editor themes', 'highContrast', ['dark', 'highContrast'], 'graphite-hc'],
    ['fixes Monochrome for every editor theme', 'monochrome', ALL, 'monochrome'],
  ];
  it.each(rows)('%s', (_name, mode, kinds, expected) => {
    for (const kind of kinds) expect(resolvePalette(mode, kind)).toBe(expected);
  });

  it('selects Monochrome only for the monochrome mode', () => {
    const modes: ThemeMode[] = ['auto', 'ivory', 'graphite', 'highContrast'];
    for (const m of modes) for (const k of ALL) expect(resolvePalette(m, k)).not.toBe('monochrome');
  });
});
