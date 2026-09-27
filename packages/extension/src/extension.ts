import * as vscode from 'vscode';
import type { CommandAction } from '@mermaid-animator/protocol';
import { AnimatorPanel, PANEL_VIEW_TYPE, PanelManager, type PanelState } from './panel';
import { basename, diagramLabel, diagramNear, diagramsIn } from './diagrams';
import { DiagramCodeLensProvider, DiagramDiagnostics, forwardCursor, StepDecorations, updateContextKeys } from './editorIntegration';
import { config } from './environment';
import { PresentationLayout } from './presentation';
import { LayoutStore } from './layouts';
import { SidecarService } from './sidecar';
import { registerDiagramsView, type DiagramIndex, type DiagramsTreeProvider } from './diagramsView';
import { annotateSample, openSample } from './walkthrough';
import { copyStepLink, StepLinkHandler } from './deepLinks';
import { AnnotationCodeActionProvider, AnnotationCompletionProvider, AnnotationHighlighter, AnnotationHoverProvider, insertAnnotation } from './annotationEditing';

/** Test hook: exposed from `activate` so integration tests can inspect panels. */
export interface MermaidAnimatorApi {
  readonly panels: PanelManager;
  readonly decorations: StepDecorations;
  readonly diagnostics: DiagramDiagnostics;
  readonly presentation: PresentationLayout;
  readonly highlighter: AnnotationHighlighter;
  /** The deep-link handler (tests call it directly; VS Code routes vscode:// links to it). */
  readonly links: StepLinkHandler;
  /** Sidecar files (tests inspect their diagnostics). */
  readonly sidecars: SidecarService;
  /** The Mermaid Diagrams view (tests inspect the index and tree). */
  readonly diagrams: { index: DiagramIndex; tree: DiagramsTreeProvider };
  /** The restore path used by the panel serializer after a window reload. */
  restore(panel: vscode.WebviewPanel, state: unknown): Promise<void>;
  /** Test hook: replaces the export save dialog (undefined restores it). */
  setSaveTarget(pick: ((suggested: vscode.Uri) => vscode.Uri | undefined) | undefined): void;
  /** Test hook: answers export completion notifications (undefined restores them). */
  setNotificationAnswer(answer: ((choices: string[]) => string | undefined) | undefined): void;
}

const PLAYBACK_COMMANDS: [string, CommandAction][] = [
  ['mermaidAnimator.togglePlay', 'togglePlay'],
  ['mermaidAnimator.play', 'play'],
  ['mermaidAnimator.pause', 'pause'],
  ['mermaidAnimator.nextStep', 'next'],
  ['mermaidAnimator.previousStep', 'previous'],
  ['mermaidAnimator.firstStep', 'first'],
  ['mermaidAnimator.lastStep', 'last'],
  ['mermaidAnimator.goToStep', 'goToStep'],
  ['mermaidAnimator.revealSource', 'revealSource'],
  ['mermaidAnimator.export.svg', 'exportSvg'],
  ['mermaidAnimator.export.png', 'exportPng'],
  ['mermaidAnimator.copyImage', 'copyImage'],
  ['mermaidAnimator.nextChapter', 'nextChapter'],
  ['mermaidAnimator.previousChapter', 'previousChapter'],
  ['mermaidAnimator.showTranscript', 'toggleTranscript'],
  ['mermaidAnimator.toggleInspector', 'toggleInspector'],
  ['mermaidAnimator.search', 'search'],
  ['mermaidAnimator.startPresentation', 'startPresentation'],
  ['mermaidAnimator.stopPresentation', 'stopPresentation'],
  ['mermaidAnimator.toggleView', 'toggleView'],
];

/** Format commands open the export sheet with that format selected (spec §15.1). */
const EXPORT_FORMAT_COMMANDS: [string, string][] = [
  ['mermaidAnimator.export.gif', 'gif'],
  ['mermaidAnimator.export.video', 'mp4'],
  ['mermaidAnimator.export.animatedSvg', 'animated-svg'],
  ['mermaidAnimator.export.html', 'html'],
];

/** View commands (spec view-switching), routed as `setView` with a `view` argument. */
const VIEW_COMMANDS: [string, 'sequence' | 'topology' | 'split'][] = [
  ['mermaidAnimator.setView.sequence', 'sequence'],
  ['mermaidAnimator.setView.topology', 'topology'],
  ['mermaidAnimator.setView.split', 'split'],
];

export function activate(context: vscode.ExtensionContext): MermaidAnimatorApi {
  const output = vscode.window.createOutputChannel('Mermaid Animator', { log: true });
  const decorations = new StepDecorations();
  const codeLens = new DiagramCodeLensProvider();
  // eslint-disable-next-line prefer-const
  let diagnostics: DiagramDiagnostics;
  const presentation = new PresentationLayout();
  const layouts = new LayoutStore(context.workspaceState);
  const sidecars = new SidecarService();
  context.subscriptions.push(sidecars);
  const setPresenting = () => void vscode.commands.executeCommand('setContext', 'mermaidAnimator.presenting', presentation.presenting);
  const panels = new PanelManager(context.extensionUri, output, {
    onStep: (panel, ranges) => decorations.set(panel.uri, ranges),
    onDiagram: (panel) => diagnostics?.refresh(panel.uri),
    onDispose: (panel) => {
      // A presenting panel that closes restores the editor layout.
      void presentation.exit(panel).then(setPresenting);
      if (!panels.find(panel.uri)) decorations.clear(panel.uri);
      diagnostics?.refresh(panel.uri);
      void vscode.commands.executeCommand('setContext', 'mermaidAnimator.panelActive', !!panels.active());
    },
    onActive: () => void vscode.commands.executeCommand('setContext', 'mermaidAnimator.panelActive', !!panels.active()),
    onPresentation: async (panel, on) => {
      if (on) {
        // Only one panel presents at a time: tell the previous one it has ended.
        for (const other of panels.all()) if (other !== panel && other.presenting) other.endPresentation();
        panel.reveal();
        await presentation.enter(panel);
      } else await presentation.exit(panel);
      setPresenting();
    },
    layouts,
    sidecars,
  });
  diagnostics = new DiagramDiagnostics(panels);
  const linkHandler = new StepLinkHandler(panels);

  const openDiagram = (uri: vscode.Uri, index: number, toSide: boolean) => panels.open(uri, index, toSide);

  /** Opens the diagram at the cursor (or the first) of a document. */
  const openFor = async (arg: unknown, toSide: boolean) => {
    const uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      void vscode.window.showInformationMessage(vscode.l10n.t('Open a Mermaid file to animate it.'));
      return undefined;
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = vscode.window.activeTextEditor?.document.uri.toString() === uri.toString() ? vscode.window.activeTextEditor : undefined;
    const diagram = diagramNear(document, editor?.selection.active.line ?? 0);
    if (!diagram) {
      void vscode.window.showInformationMessage(vscode.l10n.t('No Mermaid diagram was found in {0}.', basename(uri)));
      return undefined;
    }
    return openDiagram(uri, diagram.index, toSide);
  };

  /** Explorer entry: pick a diagram when the file has several. */
  const openFromExplorer = async (arg: unknown) => {
    const uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
    if (!uri) return;
    const document = await vscode.workspace.openTextDocument(uri);
    const diagrams = diagramsIn(document);
    if (diagrams.length === 0) {
      void vscode.window.showInformationMessage(vscode.l10n.t('No Mermaid diagram was found in {0}.', basename(uri)));
      return;
    }
    let index = 0;
    if (diagrams.length > 1) {
      const pick = await vscode.window.showQuickPick(
        diagrams.map((d) => ({ label: diagramLabel(d), description: `${d.type} · ${vscode.l10n.t('line {0}', d.fenceLine + 1)}`, index: d.index })),
        { placeHolder: vscode.l10n.t('Choose a diagram to animate') },
      );
      if (!pick) return;
      index = pick.index;
    }
    openDiagram(uri, index, false);
  };

  /** Routes a playback/export command to the active panel (or the only one). */
  const route = (action: CommandAction) => (args?: Record<string, unknown>) => {
    const target = panels.active() ?? (panels.count === 1 ? panels.all()[0] : undefined);
    target?.command(action, args && typeof args === 'object' && !(args instanceof vscode.Uri) ? args : undefined);
  };

  /** The save commands ask the panel for its layout or settings; it answers with `sidecar/write`. */
  const saveToSidecar = (action: 'saveLayout' | 'saveDefaults') => {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showInformationMessage(vscode.l10n.t('Sidecar files are not written in untrusted workspaces.'));
      return;
    }
    const panel = panels.active() ?? (panels.count === 1 ? panels.all()[0] : undefined);
    if (!panel) void vscode.window.showInformationMessage(vscode.l10n.t('Open an animated diagram first.'));
    else panel.command(action);
  };

  /**
   * *Export…* opens the export sheet in the panel (spec animated-export); from an editor without a
   * panel it first animates the diagram at the cursor. `format` preselects a format.
   */
  const openExportSheet = async (format?: string, start = false) => {
    let panel = panels.active() ?? (panels.count === 1 ? panels.all()[0] : undefined);
    if (!panel) panel = await openFor(undefined, true);
    if (!panel) return;
    panel.reveal();
    panel.commandWhenShown('export', format ? { format, ...(start ? { start } : {}) } : undefined);
  };

  const restore = async (panel: vscode.WebviewPanel, state: unknown): Promise<void> => {
    const saved = state as Partial<PanelState> | undefined;
    if (typeof saved?.uri !== 'string') {
      panel.dispose();
      return;
    }
    panel.webview.options = AnimatorPanel.webviewOptions(context.extensionUri);
    panels.adopt(panel, vscode.Uri.parse(saved.uri), typeof saved.diagramIndex === 'number' ? saved.diagramIndex : 0);
  };

  const markdownSelector: vscode.DocumentSelector = [
    { language: 'markdown' },
    { language: 'mdx' },
    { pattern: '**/*.mdx' },
  ];
  /** Every document that can hold a diagram: Markdown/MDX fences and Mermaid files. */
  const mermaidSelector: vscode.DocumentSelector = [...(markdownSelector as vscode.DocumentFilter[]), { language: 'mermaid' }, { pattern: '**/*.{mmd,mermaid}' }];
  const highlighter = new AnnotationHighlighter();

  context.subscriptions.push(
    output,
    panels,
    decorations,
    diagnostics,
    vscode.commands.registerCommand('mermaidAnimator.open', (arg?: unknown) => openFor(arg, false)),
    vscode.commands.registerCommand('mermaidAnimator.openToSide', (arg?: unknown) => openFor(arg, true)),
    vscode.commands.registerCommand('mermaidAnimator.openAtCursor', () => openFor(undefined, true)),
    vscode.commands.registerCommand('mermaidAnimator.openDiagram', (uri: vscode.Uri, index: number, toSide = true) => openDiagram(uri, index, toSide)),
    vscode.commands.registerCommand('mermaidAnimator.animateAll', async (arg?: unknown) => {
      const uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
      if (!uri) return;
      const document = await vscode.workspace.openTextDocument(uri);
      for (const d of diagramsIn(document)) openDiagram(uri, d.index, true);
    }),
    vscode.commands.registerCommand('mermaidAnimator.openFromExplorer', openFromExplorer),
    vscode.commands.registerCommand('mermaidAnimator.export', (args?: { format?: string; start?: boolean }) => openExportSheet(typeof args?.format === 'string' ? args.format : undefined, args?.start === true)),
    // `{ "start": true }` (e.g. from a keybinding) exports right away with the sheet's initial choices.
    ...EXPORT_FORMAT_COMMANDS.map(([id, format]) => vscode.commands.registerCommand(id, (args?: { start?: boolean }) => openExportSheet(format, args?.start === true))),
    vscode.commands.registerCommand('mermaidAnimator.exportDiagram', (uri: vscode.Uri, index: number) => openDiagram(uri, index, true).commandWhenShown('export')),
    ...PLAYBACK_COMMANDS.map(([id, action]) => vscode.commands.registerCommand(id, route(action))),
    ...VIEW_COMMANDS.map(([id, view]) => vscode.commands.registerCommand(id, () => route('setView')({ view }))),
    vscode.commands.registerCommand('mermaidAnimator.copyStepLink', () => copyStepLink(panels.active() ?? (panels.count === 1 ? panels.all()[0] : undefined))),
    vscode.window.registerUriHandler(linkHandler),
    vscode.commands.registerCommand('mermaidAnimator.walkthrough.openSample', () => openSample(openDiagram)),
    vscode.commands.registerCommand('mermaidAnimator.walkthrough.annotate', annotateSample),
    vscode.commands.registerCommand('mermaidAnimator.saveLayout', () => saveToSidecar('saveLayout')),
    vscode.commands.registerCommand('mermaidAnimator.saveDefaults', () => saveToSidecar('saveDefaults')),
    vscode.commands.registerCommand('mermaidAnimator.resetLayout', () => (panels.active() ?? (panels.count === 1 ? panels.all()[0] : undefined))?.resetLayout()),
    vscode.languages.registerCodeLensProvider(markdownSelector, codeLens),
    highlighter,
    vscode.languages.registerCompletionItemProvider(mermaidSelector, new AnnotationCompletionProvider(), '@', '=', ' ', ','),
    vscode.languages.registerHoverProvider(mermaidSelector, new AnnotationHoverProvider()),
    vscode.languages.registerCodeActionsProvider(mermaidSelector, new AnnotationCodeActionProvider(), { providedCodeActionKinds: AnnotationCodeActionProvider.kinds }),
    vscode.commands.registerCommand('mermaidAnimator.insertAnnotation', insertAnnotation),
    // Settings UI filtered to this extension (spec animator-panel: settings access).
    vscode.commands.registerCommand('mermaidAnimator.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${context.extension.id}`)),
    vscode.window.onDidChangeVisibleTextEditors(() => highlighter.refresh()),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (vscode.window.visibleTextEditors.some((e) => e.document === event.document)) highlighter.refresh();
    }),
    vscode.window.registerWebviewPanelSerializer(PANEL_VIEW_TYPE, { deserializeWebviewPanel: restore }),
    vscode.window.onDidChangeActiveTextEditor((editor) => updateContextKeys(editor)),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) updateContextKeys(event.textEditor);
      forwardCursor(event, panels);
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => decorations.apply()),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === vscode.window.activeTextEditor?.document) updateContextKeys(vscode.window.activeTextEditor);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('mermaidAnimator.annotations.highlight')) highlighter.refresh();
      if (event.affectsConfiguration('mermaidAnimator.codeLens.enabled') || event.affectsConfiguration('mermaidAnimator.files.languages')) codeLens.refresh();
      if (event.affectsConfiguration('mermaidAnimator.sync.stepToEditor')) for (const p of panels.all()) decorations.set(p.uri, config('sync.stepToEditor', true) ? p.lastRanges : []);
    }),
  );
  updateContextKeys(vscode.window.activeTextEditor);
  highlighter.refresh();
  const diagramsView = registerDiagramsView(context);

  return {
    panels,
    presentation,
    highlighter,
    links: linkHandler,
    sidecars,
    diagrams: diagramsView,
    decorations,
    diagnostics,
    restore,
    setSaveTarget: (pick) => {
      AnimatorPanel.saveDialogOverride = pick;
    },
    setNotificationAnswer: (answer) => {
      AnimatorPanel.notificationOverride = answer;
    },
  };
}

export function deactivate(): void {
  // Disposables registered on the context are released by VS Code.
}
