import { describe, expect, it } from 'vitest';
import { WEBVIEW_STRINGS, type ThemeMode } from '@mermaid-animator/protocol';
import { THEME_MENU, themeMenuMessage } from '../src/themeMenu';

describe('toolbar theme menu', () => {
  it('lists the five modes in order with their labels', () => {
    expect(THEME_MENU.map((i) => [i.mode, WEBVIEW_STRINGS[i.label as keyof typeof WEBVIEW_STRINGS]])).toEqual([
      ['auto', 'Follow editor theme'],
      ['ivory', 'Ivory'],
      ['graphite', 'Graphite'],
      ['highContrast', 'High contrast'],
      ['monochrome', 'Monochrome'],
    ]);
  });

  // Theme menu choice matrix (spec visual-theme), webview side: what the choice sends.
  it('sends nothing when the checked item is chosen', () => {
    for (const { mode } of THEME_MENU) expect(themeMenuMessage(mode, mode)).toBeUndefined();
  });

  it.each([
    ['Follow editor theme', 'graphite', 'auto'],
    ['Ivory', 'auto', 'ivory'],
    ['Graphite', 'auto', 'graphite'],
    ['High contrast', 'auto', 'highContrast'],
    ['Monochrome', 'auto', 'monochrome'],
  ] as [string, ThemeMode, ThemeMode][])('choosing %s over another item sends theme/set', (_item, checked, chosen) => {
    expect(themeMenuMessage(checked, chosen)).toEqual({ v: 1, type: 'theme/set', payload: { mode: chosen } });
  });
});
