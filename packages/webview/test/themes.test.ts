import { describe, expect, it } from 'vitest';
import { MERMAID_THEMES, resolveDiagramTheme, resolveUiTheme } from '@mermaid-animator/protocol';
import { resolvePalette, uiPalette, type ThemeKind } from '@mermaid-animator/renderer';

const ALL: ThemeKind[] = ['light', 'dark', 'highContrast', 'highContrastLight'];

describe('diagram theme matrix', () => {
  // theme.diagram (undefined = not set), deprecated theme.mode, editor theme kinds → drawing palette.
  it.each([
    ['treats an unknown diagram theme as auto', 'sepia', 'monochrome', ['light'], 'ivory'],
    ['follows a light editor theme with Ivory', undefined, undefined, ['light'], 'ivory'],
    ['follows a dark editor theme with Graphite', undefined, undefined, ['dark'], 'graphite'],
    ['follows a high-contrast-light editor theme', undefined, undefined, ['highContrastLight'], 'ivory-hc'],
    ['follows a high-contrast editor theme', undefined, undefined, ['highContrast'], 'graphite-hc'],
    ['uses the deprecated theme.mode when theme.diagram is unset', undefined, 'monochrome', ALL, 'monochrome'],
    ['uses a fixed deprecated theme.mode in a light editor', undefined, 'graphite', ['light'], 'graphite'],
    ['prefers theme.diagram over theme.mode', 'forest', 'monochrome', ALL, 'mermaid-forest'],
    ['fixes Ivory in a dark editor', 'ivory', undefined, ['dark'], 'ivory'],
    ['fixes Graphite in a light editor', 'graphite', undefined, ['light'], 'graphite'],
    ['picks Ivory high contrast for light editors', 'highContrast', undefined, ['light', 'highContrastLight'], 'ivory-hc'],
    ['picks Graphite high contrast for dark editors', 'highContrast', undefined, ['dark', 'highContrast'], 'graphite-hc'],
    ['fixes Monochrome for every editor theme', 'monochrome', undefined, ALL, 'monochrome'],
  ] as [string, unknown, unknown, ThemeKind[], string][])('%s', (_name, diagram, mode, kinds, palette) => {
    for (const kind of kinds) expect(resolvePalette(resolveDiagramTheme(diagram, mode), kind)).toBe(palette);
  });

  it.each(MERMAID_THEMES)('selects the Mermaid %s theme for every editor theme', (theme) => {
    for (const kind of ALL) expect(resolvePalette(resolveDiagramTheme(theme, undefined), kind)).toBe(`mermaid-${theme}`);
  });
});

describe('UI theme matrix', () => {
  it.each([
    ['treats an unknown UI theme as vscode', 'neon', ALL, 'vscode'],
    ['uses the editor colours by default', undefined, ALL, 'vscode'],
    ['fixes Ivory', 'ivory', ALL, 'ivory'],
    ['fixes Graphite', 'graphite', ALL, 'graphite'],
    ['picks Ivory high contrast for light editors', 'highContrast', ['light', 'highContrastLight'], 'ivory-hc'],
    ['picks Graphite high contrast for dark editors', 'highContrast', ['dark', 'highContrast'], 'graphite-hc'],
  ] as [string, unknown, ThemeKind[], string][])('%s', (_name, value, kinds, palette) => {
    for (const kind of kinds) expect(uiPalette(resolveUiTheme(value), kind)).toBe(palette);
  });
});
