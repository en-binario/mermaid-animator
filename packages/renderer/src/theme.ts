/**
 * Ink & Ivory colour tokens (spec §9.2) and palette resolution (spec §9.3).
 * The CSS in `tokens.css` must match this table; a unit test enforces it.
 */

export type PaletteName = 'ivory' | 'graphite' | 'ivory-hc' | 'graphite-hc' | 'monochrome';
export type ThemeKind = 'light' | 'dark' | 'highContrast' | 'highContrastLight';
export type ThemeMode = 'auto' | 'ivory' | 'graphite' | 'highContrast' | 'monochrome';

export type ColorToken =
  | 'canvas' | 'surface' | 'surface-sunken' | 'hairline' | 'rule'
  | 'ink-1' | 'ink-2' | 'ink-3' | 'accent' | 'accent-muted' | 'brass' | 'sage'
  | 'note-fill' | 'note-rule' | 'crimson' | 'viridian';

/** Tokens used for text; each must reach 4.5:1 against the palette canvas. */
export const TEXT_TOKENS: readonly ColorToken[] = ['ink-1', 'ink-2', 'ink-3', 'accent', 'brass', 'crimson', 'viridian'];

export const PALETTES: Record<PaletteName, Record<ColorToken, string>> = {
  ivory: {
    canvas: '#FAF8F3', surface: '#FFFFFF', 'surface-sunken': '#F2EFE8', hairline: '#E2DDD2', rule: '#C9C2B4',
    'ink-1': '#1B1E23', 'ink-2': '#4F555E', 'ink-3': '#6B7078', accent: '#1F3B61', 'accent-muted': '#DCE4EE',
    brass: '#8C6A3A', sage: '#4E6E60', 'note-fill': '#F5EEDC', 'note-rule': '#CDB98C', crimson: '#9E2B2B', viridian: '#2E6B4F',
  },
  graphite: {
    canvas: '#121417', surface: '#1A1D21', 'surface-sunken': '#0E1013', hairline: '#2A2E34', rule: '#3A3F47',
    'ink-1': '#ECE9E3', 'ink-2': '#B3B6BC', 'ink-3': '#868B93', accent: '#9DBCE3', 'accent-muted': '#1F2D42',
    brass: '#D4B27C', sage: '#94B8A6', 'note-fill': '#26231C', 'note-rule': '#5E5238', crimson: '#E38080', viridian: '#7FC4A2',
  },
  'ivory-hc': {
    canvas: '#FFFFFF', surface: '#FFFFFF', 'surface-sunken': '#F5F5F5', hairline: '#0F4A85', rule: '#0F4A85',
    'ink-1': '#000000', 'ink-2': '#1F1F1F', 'ink-3': '#3B3B3B', accent: '#0F4A85', 'accent-muted': '#DCE9F7',
    brass: '#7A5A00', sage: '#2D5B45', 'note-fill': '#FFFBE6', 'note-rule': '#0F4A85', crimson: '#B5200D', viridian: '#1E6B3A',
  },
  'graphite-hc': {
    canvas: '#000000', surface: '#000000', 'surface-sunken': '#0A0A0A', hairline: '#6FC3DF', rule: '#6FC3DF',
    'ink-1': '#FFFFFF', 'ink-2': '#E6E6E6', 'ink-3': '#C8C8C8', accent: '#F38518', 'accent-muted': '#2B1A05',
    brass: '#FFD166', sage: '#9CDCA0', 'note-fill': '#0F0F0F', 'note-rule': '#6FC3DF', crimson: '#F48771', viridian: '#89D185',
  },
  // Black ink on white only (spec visual-theme): every fill is white, groupings are told apart by their borders.
  monochrome: {
    canvas: '#FFFFFF', surface: '#FFFFFF', 'surface-sunken': '#FFFFFF', hairline: '#000000', rule: '#000000',
    'ink-1': '#000000', 'ink-2': '#000000', 'ink-3': '#000000', accent: '#000000', 'accent-muted': '#FFFFFF',
    brass: '#000000', sage: '#000000', 'note-fill': '#FFFFFF', 'note-rule': '#000000', crimson: '#000000', viridian: '#000000',
  },
};

export function isHighContrast(palette: PaletteName): boolean {
  return palette === 'ivory-hc' || palette === 'graphite-hc';
}

/** Chooses the effective palette from the configured mode and the editor theme kind. */
export function resolvePalette(mode: ThemeMode, themeKind: ThemeKind): PaletteName {
  const light = themeKind === 'light' || themeKind === 'highContrastLight';
  switch (mode) {
    case 'ivory':
      return 'ivory';
    case 'graphite':
      return 'graphite';
    case 'monochrome':
      return 'monochrome';
    case 'highContrast':
      return light ? 'ivory-hc' : 'graphite-hc';
    case 'auto':
    default:
      if (themeKind === 'highContrast') return 'graphite-hc';
      if (themeKind === 'highContrastLight') return 'ivory-hc';
      return light ? 'ivory' : 'graphite';
  }
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => channel(parseInt(h as string, 16))) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two `#RRGGBB` colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
