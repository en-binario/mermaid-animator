/**
 * The *Mermaid Diagrams* view (spec diagrams-view, M3 D9): an index of the workspace's diagrams built
 * with `findFiles` in batches of 50 (yielding between batches), capped at `diagramsView.maxFiles`,
 * kept current by a file watcher, and shown as files with their diagrams.
 */
import * as vscode from 'vscode';
import { locateDiagrams, type DiagramInfo, type DiagramType } from '@mermaid-animator/core';
import { basename, diagramLabel } from './diagrams';
import { config } from './environment';
import { enabledPatterns, excludedBy } from './globMatch';

export const DIAGRAMS_VIEW_ID = 'mermaidAnimator.diagrams';
const BATCH = 50;
const DEFAULT_INCLUDE = '**/*.{md,mdx,mmd,mermaid}';

export interface IndexedDiagram {
  index: number;
  type: DiagramType;
  label: string;
  line: number;
}

export interface IndexedFile {
  uri: vscode.Uri;
  diagrams: IndexedDiagram[];
}

/** Scans one file's text with the fence locator (no Mermaid parse). */
export function scanText(uri: vscode.Uri, text: string): IndexedDiagram[] {
  const language = /\.(mmd|mermaid)$/i.test(uri.path) ? 'mermaid' : 'markdown';
  // Only files that mention a Mermaid fence are located in full.
  if (language === 'markdown' && !/^ {0,3}(`{3,}|~{3,})\s*mermaid/im.test(text)) return [];
  return locateDiagrams(text, language).map((d: DiagramInfo) => ({ index: d.index, type: d.type, label: diagramLabel(d), line: d.contentStartLine }));
}

/** Icon group for a diagram type (16 px SVGs in `media/types/`). */
export function typeIcon(type: DiagramType): string {
  switch (type) {
    case 'sequence':
    case 'flowchart':
    case 'state':
    case 'class':
    case 'er':
    case 'gantt':
    case 'pie':
    case 'gitGraph':
    case 'mindmap':
    case 'timeline':
      return type;
    case 'xychart':
    case 'quadrant':
    case 'radar':
    case 'sankey':
    case 'treemap':
      return 'chart';
    default:
      return 'generic';
  }
}

export class DiagramIndex implements vscode.Disposable {
  private readonly files = new Map<string, IndexedFile>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [this.changed];
  private watcher: vscode.FileSystemWatcher | undefined;
  private generation = 0;
  /** Files scanned so far in the current pass, and whether the cap stopped it. */
  scanning = false;
  scanned = 0;
  capped = false;
  private scanPromise: Promise<void> = Promise.resolve();

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('mermaidAnimator.files.include') || e.affectsConfiguration('mermaidAnimator.diagramsView.maxFiles') || e.affectsConfiguration('files.exclude') || e.affectsConfiguration('search.exclude')) void this.rescan();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.rescan()),
    );
  }

  private include(): string {
    return config('files.include', DEFAULT_INCLUDE) || DEFAULT_INCLUDE;
  }

  private excludes(): string[] {
    return [...new Set([...enabledPatterns(vscode.workspace.getConfiguration('files').get('exclude')), ...enabledPatterns(vscode.workspace.getConfiguration('search').get('exclude'))])];
  }

  private isExcluded(uri: vscode.Uri): boolean {
    return excludedBy(vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/'), this.excludes());
  }

  /** Files with diagrams, sorted by path. */
  list(): IndexedFile[] {
    return [...this.files.values()].sort((a, b) => a.uri.path.localeCompare(b.uri.path));
  }

  /** Resolves when the current scan finishes (used by tests). */
  whenScanned(): Promise<void> {
    return this.scanPromise;
  }

  /** Full scan: batches of 50 files with a yield between batches, stopping at the cap. */
  rescan(): Promise<void> {
    const generation = ++this.generation;
    this.watch();
    this.scanPromise = Promise.resolve(vscode.window.withProgress({ location: { viewId: DIAGRAMS_VIEW_ID } }, () => this.scan(generation)));
    return this.scanPromise;
  }

  private async scan(generation: number): Promise<void> {
    const max = Math.max(1, config('diagramsView.maxFiles', 10_000));
    const exclude = this.excludes();
    const uris = await vscode.workspace.findFiles(this.include(), exclude.length ? `{${exclude.join(',')}}` : null, max + 1);
    if (generation !== this.generation) return;
    this.capped = uris.length > max;
    this.files.clear();
    this.scanning = true;
    this.scanned = 0;
    this.changed.fire();
    const todo = uris.slice(0, max).sort((a, b) => a.path.localeCompare(b.path));
    for (let i = 0; i < todo.length; i += BATCH) {
      await Promise.all(todo.slice(i, i + BATCH).map((uri) => this.read(uri)));
      if (generation !== this.generation) return;
      this.scanned = Math.min(todo.length, i + BATCH);
      this.changed.fire();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    this.scanning = false;
    this.changed.fire();
  }

  private async read(uri: vscode.Uri): Promise<void> {
    try {
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      const text = open ? open.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      const diagrams = scanText(uri, text);
      if (diagrams.length) this.files.set(uri.toString(), { uri, diagrams });
      else this.files.delete(uri.toString());
    } catch {
      this.files.delete(uri.toString());
    }
  }

  /** Updates one file without a rescan (watcher events). */
  async update(uri: vscode.Uri): Promise<void> {
    if (this.isExcluded(uri)) return;
    if (!this.files.has(uri.toString()) && this.files.size >= config('diagramsView.maxFiles', 10_000)) return;
    await this.read(uri);
    this.changed.fire();
  }

  remove(uri: vscode.Uri): void {
    if (this.files.delete(uri.toString())) this.changed.fire();
  }

  private watch(): void {
    this.watcher?.dispose();
    const watcher = vscode.workspace.createFileSystemWatcher(this.include());
    watcher.onDidCreate((uri) => void this.update(uri));
    watcher.onDidChange((uri) => void this.update(uri));
    watcher.onDidDelete((uri) => this.remove(uri));
    this.watcher = watcher;
  }

  dispose(): void {
    this.generation++;
    this.watcher?.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

type Node = { kind: 'file'; file: IndexedFile } | { kind: 'diagram'; file: IndexedFile; diagram: IndexedDiagram };

/** Tree over the index; files expand to their diagrams, filtered by type. */
export class DiagramsTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  /** Diagram types shown (undefined = all). */
  filter: Set<DiagramType> | undefined;

  constructor(
    private readonly index: DiagramIndex,
    private readonly extensionUri: vscode.Uri,
  ) {
    index.onDidChange(() => this.changed.fire(undefined));
  }

  refresh(): void {
    this.changed.fire(undefined);
  }

  private visible(file: IndexedFile): IndexedDiagram[] {
    return this.filter ? file.diagrams.filter((d) => this.filter!.has(d.type)) : file.diagrams;
  }

  getChildren(node?: Node): Node[] {
    if (!node) return this.index.list().filter((f) => this.visible(f).length).map((file) => ({ kind: 'file', file }));
    if (node.kind === 'file') return this.visible(node.file).map((diagram) => ({ kind: 'diagram', file: node.file, diagram }));
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'file') {
      const item = new vscode.TreeItem(basename(node.file.uri), vscode.TreeItemCollapsibleState.Expanded);
      item.resourceUri = node.file.uri;
      item.description = vscode.workspace.asRelativePath(vscode.Uri.joinPath(node.file.uri, '..'), false);
      item.contextValue = 'mermaidAnimator.file';
      item.iconPath = vscode.ThemeIcon.File;
      item.id = node.file.uri.toString();
      return item;
    }
    const { diagram, file } = node;
    const item = new vscode.TreeItem(diagram.label, vscode.TreeItemCollapsibleState.None);
    item.id = `${file.uri.toString()}#${diagram.index}`;
    item.description = diagram.type;
    item.tooltip = `${diagram.label} · ${diagram.type} · ${basename(file.uri)}:${diagram.line + 1}`;
    item.contextValue = 'mermaidAnimator.diagram';
    const icon = typeIcon(diagram.type);
    item.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, 'media', 'types', `${icon}.svg`),
      dark: vscode.Uri.joinPath(this.extensionUri, 'media', 'types', `${icon}-dark.svg`),
    };
    // Click animates (spec diagrams-view: *Animate* is the default action).
    item.command = { command: 'mermaidAnimator.openDiagram', title: vscode.l10n.t('Animate'), arguments: [file.uri, diagram.index, false] };
    return item;
  }

  /** Test hook: the rendered labels, files first then their diagrams. */
  snapshot(): { file: string; diagrams: string[] }[] {
    return this.getChildren().map((n) => ({ file: basename(n.file.uri), diagrams: this.getChildren(n).map((d) => (d.kind === 'diagram' ? d.diagram.label : '')) }));
  }
}

/** Registers the view, its title progress and the entry actions. */
export function registerDiagramsView(context: vscode.ExtensionContext): { index: DiagramIndex; tree: DiagramsTreeProvider } {
  const index = new DiagramIndex();
  const tree = new DiagramsTreeProvider(index, context.extensionUri);
  const view = vscode.window.createTreeView(DIAGRAMS_VIEW_ID, { treeDataProvider: tree, showCollapseAll: true });
  const describe = () => {
    view.description = index.scanning ? vscode.l10n.t('Scanning… {0} files', index.scanned) : tree.filter ? vscode.l10n.t('Filtered') : undefined;
    view.message = !index.scanning && index.capped ? vscode.l10n.t('Stopped after {0} files (mermaidAnimator.diagramsView.maxFiles).', config('diagramsView.maxFiles', 10_000)) : undefined;
  };
  const argsOf = (node: Node | undefined) => (node?.kind === 'diagram' ? node : undefined);
  let started = false;
  const start = () => {
    if (started || !config('diagramsView.enabled', true)) return;
    started = true;
    void index.rescan();
  };
  context.subscriptions.push(
    index,
    view,
    index.onDidChange(describe),
    // Index lazily: when the view is first shown (or immediately if it already is).
    view.onDidChangeVisibility((e) => e.visible && start()),
    vscode.commands.registerCommand('mermaidAnimator.diagramsView.refresh', () => {
      started = true;
      return index.rescan();
    }),
    vscode.commands.registerCommand('mermaidAnimator.diagramsView.filter', async () => {
      const types = [...new Set(index.list().flatMap((f) => f.diagrams.map((d) => d.type)))].sort();
      const picks = await vscode.window.showQuickPick(
        types.map((t) => ({ label: t, picked: !tree.filter || tree.filter.has(t) })),
        { canPickMany: true, placeHolder: vscode.l10n.t('Diagram types to show') },
      );
      if (!picks) return;
      tree.filter = picks.length === types.length ? undefined : new Set(picks.map((p) => p.label as DiagramType));
      tree.refresh();
      describe();
    }),
    vscode.commands.registerCommand('mermaidAnimator.diagramsView.animate', (node?: Node) => {
      const d = argsOf(node);
      if (d) return vscode.commands.executeCommand('mermaidAnimator.openDiagram', d.file.uri, d.diagram.index, false);
    }),
    vscode.commands.registerCommand('mermaidAnimator.diagramsView.openSource', async (node?: Node) => {
      const d = argsOf(node);
      if (!d) return;
      const editor = await vscode.window.showTextDocument(d.file.uri);
      const at = new vscode.Position(d.diagram.line, 0);
      editor.selection = new vscode.Selection(at, at);
      editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }),
    vscode.commands.registerCommand('mermaidAnimator.diagramsView.export', (node?: Node) => {
      const d = argsOf(node);
      if (d) return vscode.commands.executeCommand('mermaidAnimator.exportDiagram', d.file.uri, d.diagram.index);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('mermaidAnimator.diagramsView.enabled')) start();
    }),
  );
  if (view.visible) start();
  return { index, tree };
}
