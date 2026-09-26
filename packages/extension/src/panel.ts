import * as vscode from 'vscode';
import { rebind, type DiagramBinding, type DiagramInfo } from '@mermaid-animator/core';
import {
  hostMessage,
  PROTOCOL_VERSION,
  validateWebviewMessage,
  type CommandAction,
  type DocumentRange,
  type ExportDataPayload,
  type HostMessage,
  type StatePayload,
  type WebviewMessage,
} from '@mermaid-animator/protocol';
import { buildHtml, createNonce } from './html';
import { affectsWebview, config, currentReduceMotion, currentSettings, currentThemeKind } from './environment';
import { basename, diagramLabel, diagramsIn } from './diagrams';
import { webviewStrings } from './strings';
import type { LayoutStore } from './layouts';

export const PANEL_VIEW_TYPE = 'mermaidAnimator.panel';

/** Persisted by the webview through `vscode.setState`; returned to the serializer on reload. */
export interface PanelState {
  uri: string;
  diagramIndex?: number;
}

export interface PanelEvents {
  /** The current step's document ranges changed (for editor decorations). */
  onStep(panel: AnimatorPanel, ranges: DocumentRange[]): void;
  /** The bound diagram or its text changed (for diagnostics). */
  onDiagram(panel: AnimatorPanel): void;
  onDispose(panel: AnimatorPanel): void;
  onActive(panel: AnimatorPanel, active: boolean): void;
  /** The webview asked to enter or leave the presentation layout. */
  onPresentation(panel: AnimatorPanel, on: boolean): Promise<void>;
  /** Manual topology layouts (M2b). */
  layouts: LayoutStore;
}

const toRange = (r: DocumentRange) => new vscode.Range(r.startLine, r.startCol, r.endLine, r.endCol);

/** One animator panel bound to one diagram of one document (spec §8.1). */
export class AnimatorPanel implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private updateTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly postEmitter = new vscode.EventEmitter<HostMessage>();
  /** Fires for every message delivered to the webview (used by integration tests). */
  readonly onDidPost = this.postEmitter.event;
  private readonly stateEmitter = new vscode.EventEmitter<StatePayload>();
  /** Fires for every state report from the webview (used by integration tests). */
  readonly onDidReceiveState = this.stateEmitter.event;
  /** Last state reported by the webview. */
  lastState: StatePayload | undefined;
  private exportChunks: Uint8Array[] = [];
  private binding: DiagramBinding;
  private diagram: DiagramInfo | undefined;
  lastRanges: DocumentRange[] = [];
  /** Whether this panel is presenting (confirmed to the webview with `presentation/state`). */
  presenting = false;
  private disposed = false;

  constructor(
    readonly panel: vscode.WebviewPanel,
    readonly uri: vscode.Uri,
    diagramIndex: number,
    private readonly extensionUri: vscode.Uri,
    private readonly output: vscode.LogOutputChannel,
    private readonly events: PanelEvents,
  ) {
    this.binding = { index: diagramIndex, source: '' };
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.png');
    panel.webview.options = AnimatorPanel.webviewOptions(extensionUri);
    panel.webview.html = this.html();
    this.title(basename(uri));

    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.onDidChangeViewState((e) => this.events.onActive(this, e.webviewPanel.active)),
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

  get diagramIndex(): number {
    return this.binding.index;
  }

  get current(): DiagramInfo | undefined {
    return this.diagram;
  }

  get isActive(): boolean {
    return this.panel.active;
  }

  reveal(viewColumn?: vscode.ViewColumn): void {
    this.panel.reveal(viewColumn);
  }

  private title(fallback: string, diagram?: DiagramInfo, count = 1): void {
    const name = diagram?.title ?? fallback;
    this.panel.title = `▶ ${name}${count > 1 && diagram ? ` · ${diagram.index + 1}` : ''}`;
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

  post(message: HostMessage): void {
    if (!this.ready || this.disposed) return;
    void this.panel.webview.postMessage(message);
    this.postEmitter.fire(message);
  }

  /** Tells the webview its presentation ended (another panel started presenting). */
  endPresentation(): void {
    this.presenting = false;
    this.post(hostMessage('presentation/state', { on: false }));
  }

  command(action: CommandAction, args?: Record<string, unknown>): void {
    this.post(hostMessage('command', { action, args }));
  }

  private receive(raw: unknown): void {
    const result = validateWebviewMessage(raw);
    if (!result.ok) {
      this.output.warn(`Ignored invalid webview message: ${result.error}`);
      return;
    }
    this.handle(result.message).catch((error: unknown) => this.output.error(`Handling '${result.message.type}' failed: ${String((error as Error)?.stack ?? error)}`));
  }

  private async handle(message: WebviewMessage): Promise<void> {
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
        await this.load();
        break;
      case 'log':
        this.output[message.payload.level](`[webview] ${message.payload.message}`);
        break;
      case 'state/changed':
        this.lastState = message.payload;
        this.lastRanges = message.payload.sourceRanges ?? [];
        this.events.onStep(this, this.lastRanges);
        this.stateEmitter.fire(message.payload);
        break;
      case 'diagram/select':
        this.binding = { index: message.payload.index, source: '' };
        await this.load();
        break;
      case 'source/reveal':
        await this.revealRange(message.payload.range);
        break;
      case 'export/data':
        await this.receiveExport(message.payload);
        break;
      case 'clipboard/fallback': {
        this.output.warn(`Copy image failed: ${message.payload.reason}`);
        const save = vscode.l10n.t('Save as PNG…');
        const choice = await vscode.window.showWarningMessage(vscode.l10n.t('The image could not be copied to the clipboard.'), save);
        if (choice === save) this.command('exportPng', { scale: 2 });
        break;
      }
      case 'presentation/toggle':
        await this.events.onPresentation(this, message.payload.on);
        this.presenting = message.payload.on;
        this.post(hostMessage('presentation/state', { on: message.payload.on }));
        break;
      case 'layout/save':
        if (this.diagram) await this.events.layouts.set(this.uri, this.diagram, message.payload.positions);
        break;
    }
  }

  /** Test hook: handles a message as if the webview had sent it. */
  receiveForTest(raw: unknown): Promise<void> {
    const result = validateWebviewMessage(raw);
    if (!result.ok) return Promise.reject(new Error(result.error));
    return this.handle(result.message);
  }

  /** Clears this diagram's manual topology layout (Reset Topology Layout). */
  async resetLayout(): Promise<void> {
    if (this.diagram) await this.events.layouts.clear(this.uri, this.diagram);
    this.command('resetLayout');
  }

  /** Sends the bound diagram (re-finding it by id, similarity or index). */
  async load(): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(this.uri);
      const diagrams = diagramsIn(document);
      const diagram = this.binding.source ? rebind(this.binding, diagrams) : diagrams.find((d) => d.index === this.binding.index) ?? diagrams[0];
      if (!diagram) {
        this.output.warn(`No Mermaid diagram found in ${this.uri.toString()}.`);
        return;
      }
      this.bind(diagram, diagrams.length);
      this.post(
        hostMessage('document/load', {
          uri: this.uri.toString(),
          fileName: basename(this.uri),
          source: diagram.source,
          version: document.version,
          origin: { line: diagram.contentStartLine, character: 0 },
          diagramIndex: diagram.index,
          diagrams: diagrams.map((d) => ({ index: d.index, type: d.type, title: d.title, summary: diagramLabel(d) })),
          layout: this.events.layouts.get(this.uri, diagram),
        }),
      );
    } catch (error) {
      this.output.error(`Could not open ${this.uri.toString()}: ${String(error)}`);
    }
  }

  private bind(diagram: DiagramInfo, count: number): void {
    this.diagram = diagram;
    this.binding = { id: diagram.id, index: diagram.index, source: diagram.source };
    this.title(basename(this.uri), diagram, count);
    this.events.onDiagram(this);
  }

  private scheduleUpdate(document: vscode.TextDocument): void {
    if (!config('liveReload.enabled', true)) return;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => this.update(document), config('liveReload.debounceMs', 250));
  }

  private update(document: vscode.TextDocument): void {
    const diagrams = diagramsIn(document);
    const diagram = rebind(this.binding, diagrams);
    if (!diagram) {
      this.post(hostMessage('document/update', { source: this.binding.source, version: document.version, origin: { line: 0, character: 0 }, unbound: true }));
      return;
    }
    this.bind(diagram, diagrams.length);
    this.post(hostMessage('document/update', { source: diagram.source, version: document.version, origin: { line: diagram.contentStartLine, character: 0 } }));
  }

  private async revealRange(range: DocumentRange): Promise<void> {
    const document = await vscode.workspace.openTextDocument(this.uri);
    const visible = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === this.uri.toString());
    const editor = await vscode.window.showTextDocument(document, { viewColumn: visible?.viewColumn ?? vscode.ViewColumn.One, preserveFocus: false });
    const r = toRange(range);
    editor.selection = new vscode.Selection(r.start, r.end);
    editor.revealRange(r, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private async receiveExport(payload: ExportDataPayload): Promise<void> {
    this.exportChunks[payload.index] = payload.data;
    if (this.exportChunks.filter(Boolean).length < payload.total) return;
    const parts = this.exportChunks;
    this.exportChunks = [];
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.length;
    }
    const suggested = vscode.Uri.joinPath(this.uri, '..', payload.suggestedName);
    const target = AnimatorPanel.saveDialogOverride
      ? AnimatorPanel.saveDialogOverride(suggested)
      : await vscode.window.showSaveDialog({
          defaultUri: suggested,
          filters: payload.format === 'svg' ? { SVG: ['svg'] } : { PNG: ['png'] },
          saveLabel: vscode.l10n.t('Export'),
        });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, bytes);
    this.post(hostMessage('export/ack', { path: target.fsPath || target.path }));
    const open = vscode.l10n.t('Open');
    const reveal = vscode.l10n.t('Reveal');
    const choice = await vscode.window.showInformationMessage(vscode.l10n.t('Exported {0}', basename(target)), open, reveal);
    if (choice === open) await vscode.commands.executeCommand('vscode.open', target);
    else if (choice === reveal) await vscode.commands.executeCommand(vscode.env.uiKind === vscode.UIKind.Desktop ? 'revealFileInOS' : 'revealInExplorer', target);
  }

  /** Test hook: waits for an export to be written, bypassing the save dialog. */
  static saveDialogOverride: ((suggested: vscode.Uri) => vscode.Uri | undefined) | undefined;

  private pushSettings(): void {
    this.post(hostMessage('settings/changed', { settings: currentSettings(), themeKind: currentThemeKind(), reduceMotion: currentReduceMotion() }));
  }

  /** Forwards a cursor position inside the bound diagram (editor → step sync). */
  cursor(line: number, character: number): void {
    const d = this.diagram;
    if (!d || line < d.contentStartLine || line >= d.contentEndLine) return;
    this.post(hostMessage('editor/cursor', { line, character }));
  }

  /** Seeks playback to the step containing a document line inside the bound diagram. */
  seekToLine(line: number): void {
    const d = this.diagram;
    if (!d || line < d.contentStartLine || line >= d.contentEndLine) return;
    this.command('seekToLine', { line });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.events.onDispose(this);
    this.postEmitter.dispose();
    this.stateEmitter.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
    this.panel.dispose();
  }
}

/** Creates, reuses and restores animator panels — one per diagram (spec §8.1). */
export class PanelManager implements vscode.Disposable {
  private readonly panels = new Set<AnimatorPanel>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly output: vscode.LogOutputChannel,
    private readonly events: PanelEvents,
  ) {}

  get count(): number {
    return this.panels.size;
  }

  all(): AnimatorPanel[] {
    return [...this.panels];
  }

  find(uri: vscode.Uri, diagramIndex?: number): AnimatorPanel | undefined {
    return this.all().find((p) => p.uri.toString() === uri.toString() && (diagramIndex === undefined || p.diagramIndex === diagramIndex));
  }

  active(): AnimatorPanel | undefined {
    return this.all().find((p) => p.isActive);
  }

  open(uri: vscode.Uri, diagramIndex: number, toSide: boolean): AnimatorPanel {
    const column = toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
    const existing = this.find(uri, diagramIndex);
    if (existing) {
      existing.reveal(column);
      return existing;
    }
    const panel = vscode.window.createWebviewPanel(PANEL_VIEW_TYPE, basename(uri), { viewColumn: column, preserveFocus: toSide }, AnimatorPanel.webviewOptions(this.extensionUri));
    return this.adopt(panel, uri, diagramIndex);
  }

  /** Wraps a panel created by VS Code (restoration) or by `open`. */
  adopt(panel: vscode.WebviewPanel, uri: vscode.Uri, diagramIndex = 0): AnimatorPanel {
    const animator = new AnimatorPanel(panel, uri, diagramIndex, this.extensionUri, this.output, {
      ...this.events,
      onDispose: (p) => {
        this.panels.delete(p);
        this.events.onDispose(p);
      },
    });
    this.panels.add(animator);
    return animator;
  }

  dispose(): void {
    for (const panel of this.all()) panel.dispose();
    this.panels.clear();
  }
}
