/**
 * Export themes (spec export-theme): the theme chosen in the sheet or by `export.theme`, and the
 * palette each format draws with. Pure, so the export palette matrix is unit-tested.
 */
import type { AnimatedSvgTheme, PaletteName } from '@mermaid-animator/renderer';

export type ExportTheme = 'current' | 'ivory' | 'graphite' | 'monochrome';

export const EXPORT_THEMES: readonly ExportTheme[] = ['current', 'ivory', 'graphite', 'monochrome'];

/** `export.theme` values outside the list read as `current`. */
export function parseExportTheme(value: unknown): ExportTheme {
  return EXPORT_THEMES.includes(value as ExportTheme) ? (value as ExportTheme) : 'current';
}

/** Palette of a still, GIF or video export: `current` keeps the panel's active palette. */
export function exportPalette(theme: ExportTheme, active: PaletteName): PaletteName {
  return theme === 'current' ? active : theme;
}

/** Animated SVG: `current` is the GitHub-safe file (or the light/dark pair); any other theme is one file. */
export function animatedSvgTheme(theme: ExportTheme): AnimatedSvgTheme {
  return theme === 'current' ? 'github' : theme;
}

/** The HTML player's theme: `auto` follows the viewer's colour scheme. */
export type PlayerTheme = 'light' | 'dark' | 'auto' | 'monochrome';

export function playerTheme(theme: ExportTheme): PlayerTheme {
  return theme === 'ivory' ? 'light' : theme === 'graphite' ? 'dark' : theme === 'monochrome' ? 'monochrome' : 'auto';
}

/** The palette the player applies for its theme and the viewer's colour scheme. */
export function playerPalette(theme: PlayerTheme, viewerDark: boolean): PaletteName {
  if (theme === 'monochrome') return 'monochrome';
  return theme === 'dark' || (theme === 'auto' && viewerDark) ? 'graphite' : 'ivory';
}
