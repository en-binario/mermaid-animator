import * as vscode from 'vscode';

/**
 * Strings shown inside the webview, localised on the host with `vscode.l10n`
 * and delivered in the `init` message (spec §19).
 */
export function webviewStrings(): Record<string, string> {
  return {
    'app.loading': vscode.l10n.t('Loading diagram…'),
    'app.lines': vscode.l10n.t('{0} lines'),
    'app.canvasPlaceholder': vscode.l10n.t('The animation appears here.'),
    'transport.label': vscode.l10n.t('Playback controls'),
    'transport.first': vscode.l10n.t('First step'),
    'transport.previous': vscode.l10n.t('Previous step'),
    'transport.play': vscode.l10n.t('Play'),
    'transport.pause': vscode.l10n.t('Pause'),
    'transport.next': vscode.l10n.t('Next step'),
    'transport.last': vscode.l10n.t('Last step'),
    'toolbar.label': vscode.l10n.t('Diagram toolbar'),
  };
}
