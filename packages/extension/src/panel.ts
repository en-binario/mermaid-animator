import * as vscode from 'vscode';
import {
  hostMessage,
  PROTOCOL_VERSION,
  validateWebviewMessage,
  type HostMessage,
  type WebviewMessage,
} from '@mermaid-animator/protocol';
import { buildHtml, createNonce } from './html';
import { affectsWebview, currentReduceMotion, currentSettings, currentThemeKind } from './environment';
import { webviewStrings } from './strings';

export const PANEL_VIEW_TYPE = 'mermaidAnimator.panel';

/** Persisted by the webview through `vscode.setState`; returned to the serializer on reload. */
export interface PanelState {
  uri: string;
}

function basename(uri: vscode.Uri): string {
  const parts = uri.path.split('/');
  return parts[parts.length - 1] || uri.path;
}

/** One animator panel bound to one document (spec §8.1). */
export class AnimatorPanel implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private updateTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.disposeEmitter.event;
  private readonly postEmitter = new vscode.EventEmitter<HostMessage>();
  /** Fires for every message delivered to the webview (used by integration tests). */
  readonly onDidPost = this.postEmitter.event;

  constructor(
    readonly panel: vscode.WebviewPanel,
    readonly uri: vscode.Uri,
    private readonly extensionUri: vscode.Uri,
    private readonly output: vscode.LogOutputChannel,
  ) {
    panel.title = `▶ ${basename(uri)}`;
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.png');
    panel.webview.options = AnimatorPanel.webviewOptions(extensionUri);
    panel.webview.html = this.html();

    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((raw: unknown) => this.receive(raw)),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === uri.toString()) this.scheduleUpdate(event.document);
      }),
      vscode.window.onDidChangeActiveColorTheme(() => this.pushSettings()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (affectsWebview(event)) this.pushSettings();
      }),
    );
  }

  static webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist'), vscode.Uri.joinPath(extensionUri, 'media')],
    };
  }

  reveal(viewColumn?: vscode.ViewColumn): void {
    this.panel.reveal(viewColumn);
  }

  private html(): string {
    const webview = this.panel.webview;
    const asset = (...segments: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', ...segments)).toString();
    return buildHtml({
      cspSource: webview.cspSource,
      nonce: createNonce(),
      lang: vscode.env.language,
      scriptUri: asset('main.js'),
      styleUris: [asset('fonts.css'), asset('codicons', 'codicon.css'), asset('main.css')],
    });
  }

  private post(message: HostMessage): void {
    if (!this.ready) return;
    void this.panel.webview.postMessage(message);
    this.postEmitter.fire(message);
  }

  private receive(raw: unknown): void {
    const result = validateWebviewMessage(raw);
    if (!result.ok) {
      this.output.warn(`Ignored invalid webview message: ${result.error}`);
      return;
    }
    this.handle(result.message);
  }

  private handle(message: WebviewMessage): void {
    switch (message.type) {
      case 'ready':
        if (message.payload.protocol !== PROTOCOL_VERSION) {
          this.output.error(`Webview protocol ${message.payload.protocol} does not match host protocol ${PROTOCOL_VERSION}.`);
          return;
        }
        this.ready = true;
        this.post(
          hostMessage('init', {
            settings: currentSettings(),
            themeKind: currentThemeKind(),
            reduceMotion: currentReduceMotion(),
            locale: vscode.env.language,
            strings: webviewStrings(),
          }),
        );
        void this.load();
        break;
      case 'log':
        this.output[message.payload.level](`[webview] ${message.payload.message}`);
        break;
      case 'state/changed':
        break;
    }
  }

  private async load(): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(this.uri);
      this.post(
        hostMessage('document/load', {
          uri: this.uri.toString(),
          fileName: basename(this.uri),
          source: document.getText(),
          version: document.version,
          origin: { line: 0, character: 0 },
        }),
      );
    } catch (error) {
      this.output.error(`Could not open ${this.uri.toString()}: ${String(error)}`);
    }
  }

  private scheduleUpdate(document: vscode.TextDocument): void {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      this.post(hostMessage('document/update', { source: document.getText(), version: document.version, origin: { line: 0, character: 0 } }));
    }, 100);
  }

  private pushSettings(): void {
    this.post(hostMessage('settings/changed', { settings: currentSettings(), themeKind: currentThemeKind(), reduceMotion: currentReduceMotion() }));
  }

  dispose(): void {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.disposeEmitter.fire();
    this.disposeEmitter.dispose();
    this.postEmitter.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
    this.panel.dispose();
  }
}

/** Creates, reuses and restores animator panels (one per document in M0). */
export class PanelManager implements vscode.Disposable {
  private readonly panels = new Map<string, AnimatorPanel>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  get count(): number {
    return this.panels.size;
  }

  find(uri: vscode.Uri): AnimatorPanel | undefined {
    return this.panels.get(uri.toString());
  }

  open(uri: vscode.Uri, toSide: boolean): AnimatorPanel {
    const column = toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
    const existing = this.find(uri);
    if (existing) {
      existing.reveal(column);
      return existing;
    }
    const panel = vscode.window.createWebviewPanel(PANEL_VIEW_TYPE, basename(uri), { viewColumn: column, preserveFocus: toSide }, AnimatorPanel.webviewOptions(this.extensionUri));
    return this.adopt(panel, uri);
  }

  /** Wraps a panel created by VS Code (restoration) or by `open`. */
  adopt(panel: vscode.WebviewPanel, uri: vscode.Uri): AnimatorPanel {
    const animator = new AnimatorPanel(panel, uri, this.extensionUri, this.output);
    const key = uri.toString();
    this.panels.set(key, animator);
    animator.onDidDispose(() => {
      if (this.panels.get(key) === animator) this.panels.delete(key);
    });
    return animator;
  }

  dispose(): void {
    for (const panel of [...this.panels.values()]) panel.dispose();
    this.panels.clear();
  }
}
