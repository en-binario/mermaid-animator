import * as vscode from 'vscode';
import { compileDiagram, diagramAtLine, offsetRange } from '@mermaid-animator/core';
import type { DocumentRange } from '@mermaid-animator/protocol';
import { config, } from './environment';
import { diagramsIn } from './diagrams';
import type { AnimatorPanel, PanelManager } from './panel';

/** CodeLens *▶ Animate · Export…* above every Markdown Mermaid fence (FR-DISC-02). */
export class DiagramCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  refresh(): void {
    this.changed.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!config('codeLens.enabled', true) || document.languageId === 'mermaid') return [];
    return diagramsIn(document).flatMap((d) => {
      const range = new vscode.Range(d.fenceLine, 0, d.fenceLine, 0);
      return [
        new vscode.CodeLens(range, { title: `▶ ${vscode.l10n.t('Animate')}`, command: 'mermaidAnimator.openDiagram', arguments: [document.uri, d.index, true] }),
        new vscode.CodeLens(range, { title: vscode.l10n.t('Export…'), command: 'mermaidAnimator.exportDiagram', arguments: [document.uri, d.index] }),
      ];
    });
  }
}

/** Keeps `mermaidAnimator.editorHasDiagram` / `cursorInDiagram` in sync with the active editor. */
export function updateContextKeys(editor: vscode.TextEditor | undefined): void {
  const diagrams = editor ? diagramsIn(editor.document) : [];
  const line = editor?.selection.active.line ?? -1;
  void vscode.commands.executeCommand('setContext', 'mermaidAnimator.editorHasDiagram', diagrams.length > 0);
  void vscode.commands.executeCommand('setContext', 'mermaidAnimator.cursorInDiagram', !!diagramAtLine(diagrams, line));
}

const stepDecoration = vscode.window.createTextEditorDecorationType({
  isWholeLine: true,
  backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
  overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.rangeHighlightForeground'),
  overviewRulerLane: vscode.OverviewRulerLane.Left,
  borderWidth: '0 0 0 2px',
  borderStyle: 'solid',
  borderColor: new vscode.ThemeColor('focusBorder'),
});

/** Decorates the current step's statements in every visible editor of the document (FR-SYNC-03). */
export class StepDecorations implements vscode.Disposable {
  private readonly ranges = new Map<string, DocumentRange[]>();

  set(uri: vscode.Uri, ranges: DocumentRange[]): void {
    this.ranges.set(uri.toString(), config('sync.stepToEditor', true) ? ranges : []);
    this.apply();
  }

  clear(uri: vscode.Uri): void {
    this.ranges.delete(uri.toString());
    this.apply();
  }

  apply(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const ranges = this.ranges.get(editor.document.uri.toString()) ?? [];
      editor.setDecorations(stepDecoration, ranges.map((r) => new vscode.Range(r.startLine, r.startCol, r.endLine, r.endCol)));
    }
  }

  /** Current decoration ranges for a document (used by integration tests). */
  get(uri: vscode.Uri): DocumentRange[] {
    return this.ranges.get(uri.toString()) ?? [];
  }

  dispose(): void {
    stepDecoration.dispose();
  }
}

/** Publishes parse and annotation diagnostics of diagrams with open panels (FR-SYNC-02). */
export class DiagramDiagnostics implements vscode.Disposable {
  readonly collection = vscode.languages.createDiagnosticCollection('mermaidAnimator');

  constructor(private readonly panels: PanelManager) {}

  refresh(uri: vscode.Uri): void {
    const bound = this.panels.all().filter((p) => p.uri.toString() === uri.toString() && p.current);
    if (!bound.length) {
      this.collection.delete(uri);
      return;
    }
    const seen = new Set<number>();
    const diagnostics: vscode.Diagnostic[] = [];
    for (const panel of bound) {
      const d = panel.current!;
      if (seen.has(d.index)) continue;
      seen.add(d.index);
      for (const item of compileDiagram(d.source).diagnostics) {
        const r = offsetRange(item.range, { line: d.contentStartLine, character: 0 });
        const range = new vscode.Range(r.startLine, r.startCol, r.endLine, Math.max(r.endCol, r.startCol + (r.endLine === r.startLine ? 1 : 0)));
        const severity = item.severity === 'error' ? vscode.DiagnosticSeverity.Error : item.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
        const diagnostic = new vscode.Diagnostic(range, item.message, severity);
        diagnostic.source = 'Mermaid Animator';
        diagnostic.code = item.code;
        diagnostics.push(diagnostic);
      }
    }
    this.collection.set(uri, diagnostics);
  }

  dispose(): void {
    this.collection.dispose();
  }
}

/** Forwards cursor moves in a bound document to its panels (`sync.cursorToStep`). */
let followTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Editor → step (spec source-sync): with `click`, a mouse click on a statement line seeks its
 * panels to that step; with `follow`, every cursor move does so after 120 ms; `off` never moves playback.
 */
export function forwardCursor(event: vscode.TextEditorSelectionChangeEvent, panels: PanelManager): void {
  const mode = config<'off' | 'click' | 'follow'>('sync.cursorToStep', 'click');
  if (mode === 'off') return;
  if (mode === 'click' && event.kind !== vscode.TextEditorSelectionChangeKind.Mouse) return;
  const position = event.selections[0]?.active;
  if (!position) return;
  const targets = panels.all().filter((panel) => panel.uri.toString() === event.textEditor.document.uri.toString());
  const seek = () => {
    for (const panel of targets) {
      panel.cursor(position.line, position.character);
      panel.seekToLine(position.line);
    }
  };
  if (followTimer) clearTimeout(followTimer);
  followTimer = undefined;
  if (mode === 'follow') followTimer = setTimeout(seek, 120);
  else seek();
}

export type { AnimatorPanel };
