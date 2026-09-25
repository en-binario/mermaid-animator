import * as vscode from 'vscode';
import type { ThemeKind, ThemeMode, WebviewSettings } from '@mermaid-animator/protocol';

export function currentThemeKind(): ThemeKind {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Light:
      return 'light';
    case vscode.ColorThemeKind.HighContrast:
      return 'highContrast';
    case vscode.ColorThemeKind.HighContrastLight:
      return 'highContrastLight';
    case vscode.ColorThemeKind.Dark:
    default:
      return 'dark';
  }
}

/** `workbench.reduceMotion`: on → true, off → false, auto → null (the webview asks the OS). */
export function currentReduceMotion(): boolean | null {
  const value = vscode.workspace.getConfiguration('workbench').get<string>('reduceMotion', 'auto');
  if (value === 'on') return true;
  if (value === 'off') return false;
  return null;
}

export function currentSettings(): WebviewSettings {
  const config = vscode.workspace.getConfiguration('mermaidAnimator');
  return {
    themeMode: config.get<ThemeMode>('theme.mode', 'auto'),
  };
}

/** Configuration sections whose change must be pushed to open panels. */
export function affectsWebview(event: vscode.ConfigurationChangeEvent): boolean {
  return event.affectsConfiguration('mermaidAnimator') || event.affectsConfiguration('workbench.reduceMotion');
}
