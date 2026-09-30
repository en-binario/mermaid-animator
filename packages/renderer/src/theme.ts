/**
 * Colour tokens (spec §9.2) and palette resolution (spec visual-theme): the Ink & Ivory palettes and
 * Monochrome (`palettes.ts`), plus one palette per Mermaid theme (`mermaidPalettes.generated.ts`).
 * The CSS in `tokens.css` must match this table; a unit test enforces it.
 */
import { MERMAID_PALETTES } from './mermaidPalettes.generated';
import { INK_IVORY_PALETTES, type InkIvoryPaletteName } from './palettes';

export type ThemeKind = 'light' | 'dark' | 'highContrast' | 'highContrastLight';
/** The Mermaid 12 themes; mirrors `MermaidTheme` in the protocol package. */
export type MermaidTheme = 'default' | 'neutral' | 'dark' | 'forest' | 'base' | 'neo' | 'neo-dark' | 'redux' | 'redux-dark' | 'redux-color' | 'redux-dark-color';
/** `mermaidAnimator.theme.diagram`; mirrors `DiagramTheme` in the protocol package. */
export type DiagramTheme = 'auto' | 'ivory' | 'graphite' | 'highContrast' | MermaidTheme | 'monochrome';
/** `mermaidAnimator.theme.ui`; mirrors `UiTheme` in the protocol package. */
export type UiTheme = 'vscode' | 'ivory' | 'graphite' | 'highContrast';
export type PaletteName = InkIvoryPaletteName | `mermaid-${MermaidTheme}`;
/** @deprecated Use `DiagramTheme`. */
export type ThemeMode = DiagramTheme;

export type ColorToken =
  | 'canvas' | 'surface' | 'surface-sunken' | 'hairline' | 'rule'
  | 'ink-1' | 'ink-2' | 'ink-3' | 'accent' | 'accent-muted' | 'brass' | 'sage'
  | 'note-fill' | 'note-rule' | 'crimson' | 'viridian';

/** Tokens used for text; each must reach 4.5:1 against the palette canvas (Ink & Ivory and Monochrome). */
export const TEXT_TOKENS: readonly ColorToken[] = ['ink-1', 'ink-2', 'ink-3', 'accent', 'brass', 'crimson', 'viridian'];

export const PALETTES: Record<PaletteName, Record<ColorToken, string>> = { ...INK_IVORY_PALETTES, ...MERMAID_PALETTES };

/** Palettes that keep the 4.5:1 text guarantee; Mermaid palettes keep Mermaid's own colours. */
export const GUARANTEED_PALETTES: readonly PaletteName[] = Object.keys(INK_IVORY_PALETTES) as PaletteName[];

export function isHighContrast(palette: PaletteName): boolean {
  return palette === 'ivory-hc' || palette === 'graphite-hc';
}

/** The drawing's palette from the diagram theme and the editor theme kind (spec visual-theme). */
export function resolvePalette(theme: DiagramTheme, themeKind: ThemeKind): PaletteName {
  const light = themeKind === 'light' || themeKind === 'highContrastLight';
  switch (theme) {
    case 'ivory':
    case 'graphite':
    case 'monochrome':
      return theme;
    case 'highContrast':
      return light ? 'ivory-hc' : 'graphite-hc';
    case 'auto':
      if (themeKind === 'highContrast') return 'graphite-hc';
      if (themeKind === 'highContrastLight') return 'ivory-hc';
      return light ? 'ivory' : 'graphite';
    default:
      return `mermaid-${theme}` in PALETTES ? (`mermaid-${theme}` as PaletteName) : light ? 'ivory' : 'graphite';
  }
}

/** The controls' palette from the UI theme: `vscode` (the editor's colours) or an Ink & Ivory palette. */
export function uiPalette(theme: UiTheme, themeKind: ThemeKind): 'vscode' | InkIvoryPaletteName {
  const light = themeKind === 'light' || themeKind === 'highContrastLight';
  switch (theme) {
    case 'ivory':
    case 'graphite':
      return theme;
    case 'highContrast':
      return light ? 'ivory-hc' : 'graphite-hc';
    default:
      return 'vscode';
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
