/**
 * The Ink & Ivory palettes and Monochrome (spec §9.2, spec visual-theme). Kept apart from
 * `theme.ts` so that `scripts/mermaid-themes.mjs` can read Ivory and Graphite without importing the
 * Mermaid table it generates.
 */
import type { ColorToken } from './theme';

export type InkIvoryPaletteName = 'ivory' | 'graphite' | 'ivory-hc' | 'graphite-hc' | 'monochrome';

export const INK_IVORY_PALETTES: Record<InkIvoryPaletteName, Record<ColorToken, string>> = {
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
