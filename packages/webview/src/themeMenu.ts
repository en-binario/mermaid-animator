import { THEME_MODES, webviewMessage, type ThemeMode, type WebviewMessage } from '@mermaid-animator/protocol';

/** Toolbar theme menu items, in order, with their label keys (spec visual-theme: toolbar theme menu). */
export const THEME_MENU: readonly { mode: ThemeMode; label: string }[] = THEME_MODES.map((mode) => ({ mode, label: `theme.${mode}` }));

/**
 * The message a theme menu choice sends: `theme/set` for an unchecked item, nothing for the checked
 * one. The palette changes only when the host's `settings/changed` arrives.
 */
export function themeMenuMessage(checked: ThemeMode, chosen: ThemeMode): WebviewMessage | undefined {
  return chosen === checked ? undefined : webviewMessage('theme/set', { mode: chosen });
}
