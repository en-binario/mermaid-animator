import { describe, expect, it } from 'vitest';
import { DIAGRAM_THEMES, WEBVIEW_STRINGS, type DiagramTheme } from '@mermaid-animator/protocol';
import { DIAGRAM_THEME_MENU, themeMenuMessage } from '../src/themeMenu';

const label = (key: string) => WEBVIEW_STRINGS[key as keyof typeof WEBVIEW_STRINGS];

describe('toolbar diagram theme menu', () => {
  it('lists the 16 diagram themes in three groups, in the setting order', () => {
    expect(DIAGRAM_THEME_MENU.map((g) => [label(g.heading), g.items.map((i) => label(i.label))])).toEqual([
      ['Ink & Ivory', ['Follow editor theme', 'Ivory', 'Graphite', 'High contrast']],
      ['Mermaid', ['Default', 'Neutral', 'Dark', 'Forest', 'Base', 'Neo', 'Neo dark', 'Redux', 'Redux dark', 'Redux color', 'Redux dark color']],
      ['Custom', ['Monochrome']],
    ]);
    expect(DIAGRAM_THEME_MENU.flatMap((g) => g.items.map((i) => i.theme))).toEqual([...DIAGRAM_THEMES]);
  });

  // Diagram theme menu choice matrix (spec visual-theme), webview side: what the choice sends.
  it('sends nothing when the checked item is chosen', () => {
    for (const theme of DIAGRAM_THEMES) expect(themeMenuMessage(theme, theme)).toBeUndefined();
  });

  it.each([
    ['Forest', 'auto', 'forest'],
    ['Monochrome', 'dark', 'monochrome'],
    ['Follow editor theme', 'forest', 'auto'],
  ] as [string, DiagramTheme, DiagramTheme][])('choosing %s over another item sends theme/set', (_item, checked, chosen) => {
    expect(themeMenuMessage(checked, chosen)).toEqual({ v: 1, type: 'theme/set', payload: { theme: chosen } });
  });
});
