import { MERMAID_THEMES, webviewMessage, type DiagramTheme, type WebviewMessage } from '@mermaid-animator/protocol';

export interface ThemeMenuGroup {
  /** Label key of the group heading. */
  heading: string;
  items: readonly { theme: DiagramTheme; label: string }[];
}

const item = (theme: DiagramTheme) => ({ theme, label: `theme.${theme}` });

/** Toolbar diagram theme menu: Ink & Ivory, the Mermaid themes, Custom (spec visual-theme). */
export const DIAGRAM_THEME_MENU: readonly ThemeMenuGroup[] = [
  { heading: 'theme.group.inkIvory', items: (['auto', 'ivory', 'graphite', 'highContrast'] as const).map(item) },
  { heading: 'theme.group.mermaid', items: MERMAID_THEMES.map(item) },
  { heading: 'theme.group.custom', items: [item('monochrome')] },
];

/**
 * The message a menu choice sends: `theme/set` for an unchecked item, nothing for the checked one.
 * The drawing changes only when the host's `settings/changed` arrives; the controls never do.
 */
export function themeMenuMessage(checked: DiagramTheme, chosen: DiagramTheme): WebviewMessage | undefined {
  return chosen === checked ? undefined : webviewMessage('theme/set', { theme: chosen });
}
