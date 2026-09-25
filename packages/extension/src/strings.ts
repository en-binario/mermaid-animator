import * as vscode from 'vscode';
import { WEBVIEW_STRINGS } from '@mermaid-animator/protocol';

/**
 * Webview strings localised on the host (spec §19): the English catalogue lives in the protocol
 * package and every entry is translated with `vscode.l10n.t`, keyed by its English text.
 */
export function webviewStrings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, english] of Object.entries(WEBVIEW_STRINGS)) {
    const translated = vscode.l10n.t(english);
    if (translated !== english) out[key] = translated;
  }
  return out;
}
