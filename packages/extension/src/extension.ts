import * as vscode from 'vscode';
import { AnimatorPanel, PANEL_VIEW_TYPE, PanelManager, type PanelState } from './panel';

/** Test hook: exposed from `activate` so integration tests can inspect panels. */
export interface MermaidAnimatorApi {
  readonly panels: PanelManager;
  /** The restore path used by the panel serializer after a window reload. */
  restore(panel: vscode.WebviewPanel, state: unknown): Promise<void>;
}

function targetUri(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) return arg;
  return vscode.window.activeTextEditor?.document.uri;
}

export function activate(context: vscode.ExtensionContext): MermaidAnimatorApi {
  const output = vscode.window.createOutputChannel('Mermaid Animator', { log: true });
  const panels = new PanelManager(context.extensionUri, output);

  const open = (toSide: boolean) => (arg?: unknown) => {
    const uri = targetUri(arg);
    if (!uri) {
      void vscode.window.showInformationMessage(vscode.l10n.t('Open a Mermaid file to animate it.'));
      return;
    }
    panels.open(uri, toSide);
  };

  const restore = async (panel: vscode.WebviewPanel, state: unknown): Promise<void> => {
    const uri = (state as Partial<PanelState> | undefined)?.uri;
    if (typeof uri !== 'string') {
      panel.dispose();
      return;
    }
    panel.webview.options = AnimatorPanel.webviewOptions(context.extensionUri);
    panels.adopt(panel, vscode.Uri.parse(uri));
  };

  context.subscriptions.push(
    output,
    panels,
    vscode.commands.registerCommand('mermaidAnimator.open', open(false)),
    vscode.commands.registerCommand('mermaidAnimator.openToSide', open(true)),
    vscode.window.registerWebviewPanelSerializer(PANEL_VIEW_TYPE, { deserializeWebviewPanel: restore }),
  );

  return { panels, restore };
}

export function deactivate(): void {
  // Disposables registered on the context are released by VS Code.
}
