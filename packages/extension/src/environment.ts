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

/** Settings forwarded to the webview (keys without the `mermaidAnimator.` prefix). */
export const WEBVIEW_SETTING_KEYS = [
  'playback.autoplay',
  'playback.speed',
  'playback.dwell',
  'playback.dwellMs',
  'playback.onEnd',
  'playback.reverse',
  'playback.pauseOnHover',
  'playback.startAt',
  'playback.notes',
  'scrubber.snap',
  'display.futureSteps',
  'display.pastSteps',
  'display.trailLength',
  'motion.profile',
  'motion.respectReducedMotion',
  'motion.travelIndicator',
  'camera.mode',
  'playback.loopIterations',
  'playback.compressRepeats',
  'playback.altBranches',
  'playback.parallel',
  'display.showCaptions',
  'display.showInspector',
  'presentation.chapterCards',
  'view.default',
  'topology.layout',
  'topology.direction',
  'topology.edgeStyle',
  'topology.returnMessages',
  'topology.edgeWeight',
  'display.showMinimap',
  'export.defaultFormat',
  'export.fps',
  'export.scale',
  'export.background',
  'export.includeCaptions',
  'export.svgAdaptiveTheme',
] as const;

export function currentSettings(): WebviewSettings {
  const config = vscode.workspace.getConfiguration('mermaidAnimator');
  const settings: WebviewSettings = { themeMode: config.get<ThemeMode>('theme.mode', 'auto') };
  for (const key of WEBVIEW_SETTING_KEYS) {
    const value = config.get(key);
    if (value !== undefined) settings[key] = value;
  }
  // `export.fps` applies to video; GIF uses 15 fps unless the user chose a rate (spec §15.2).
  const fps = config.inspect('export.fps');
  if (fps && [fps.globalValue, fps.workspaceValue, fps.workspaceFolderValue].every((v) => v === undefined)) delete settings['export.fps'];
  return settings;
}

/** Configuration sections whose change must be pushed to open panels. */
export function affectsWebview(event: vscode.ConfigurationChangeEvent): boolean {
  return event.affectsConfiguration('mermaidAnimator') || event.affectsConfiguration('workbench.reduceMotion');
}

export function config<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('mermaidAnimator').get<T>(key, fallback);
}
