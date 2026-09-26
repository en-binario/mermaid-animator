/**
 * Sidecar files (spec sidecar-files, M3 D8): `<source file>.animator.json` beside the source keeps a
 * diagram's settings, captions, chapters and topology positions. The host reads it (JSONC), hands
 * the diagram's entry to the webview (which resolves step keys), publishes diagnostics for keys the
 * webview could not resolve, and writes it only on explicit commands, preserving formatting.
 */
import * as vscode from 'vscode';
import type { SidecarEntry } from '@mermaid-animator/protocol';
import { applyPatch, entryFor, locateEntry, parseSidecar, rawEntryKey, SIDECAR_SUFFIX, sidecarKey, type SidecarPatch, type UnresolvedEntry } from './sidecarFormat';

export { SIDECAR_SUFFIX } from './sidecarFormat';

export function sidecarUri(source: vscode.Uri): vscode.Uri {
  return source.with({ path: source.path + SIDECAR_SUFFIX });
}

export function sourceOfSidecar(sidecar: vscode.Uri): vscode.Uri | undefined {
  return sidecar.path.endsWith(SIDECAR_SUFFIX) ? sidecar.with({ path: sidecar.path.slice(0, -SIDECAR_SUFFIX.length) }) : undefined;
}

/** Reads sidecars (open editor text first, so unsaved edits apply live), watches them and owns their diagnostics. */
export class SidecarService implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('mermaidAnimator.sidecar');
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  /** Fires with the *source* file whose sidecar changed. */
  readonly onDidChange = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [this.diagnostics, this.changed];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Unresolved keys per sidecar and diagram key, merged into one diagnostic set per file. */
  private readonly unresolved = new Map<string, Map<string, UnresolvedEntry[]>>();

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/*${SIDECAR_SUFFIX}`);
    const fire = (uri: vscode.Uri) => {
      const source = sourceOfSidecar(uri);
      if (!source) return;
      const key = uri.toString();
      clearTimeout(this.timers.get(key));
      this.timers.set(key, setTimeout(() => this.changed.fire(source), 150));
    };
    this.disposables.push(
      watcher,
      watcher.onDidChange(fire),
      watcher.onDidCreate(fire),
      watcher.onDidDelete(fire),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.path.endsWith(SIDECAR_SUFFIX) && e.contentChanges.length) fire(e.document.uri);
      }),
    );
  }

  async text(source: vscode.Uri): Promise<string | undefined> {
    const uri = sidecarUri(source);
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (open) return open.getText();
    try {
      return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      return undefined;
    }
  }

  async entry(source: vscode.Uri, diagram: { id?: string; index: number }): Promise<SidecarEntry | undefined> {
    const text = await this.text(source);
    return text === undefined ? undefined : entryFor(parseSidecar(text), diagram);
  }

  /** Publishes warnings for step keys the webview could not resolve (an empty list clears them). */
  async report(source: vscode.Uri, diagram: { id?: string; index: number }, entries: UnresolvedEntry[]): Promise<void> {
    const uri = sidecarUri(source);
    const text = await this.text(source);
    const file = text === undefined ? undefined : parseSidecar(text);
    const key = rawEntryKey(file, diagram);
    const perFile = this.unresolved.get(uri.toString()) ?? new Map<string, UnresolvedEntry[]>();
    if (key && entries.length) perFile.set(key, entries);
    else if (key) perFile.delete(key);
    this.unresolved.set(uri.toString(), perFile);
    if (text === undefined) {
      this.diagnostics.delete(uri);
      return;
    }
    const lines = text.split(/\r?\n/);
    const position = (offset: number) => {
      let rest = offset;
      for (let line = 0; line < lines.length; line++) {
        const length = lines[line]!.length + (text.includes('\r\n') ? 2 : 1);
        if (rest < length) return new vscode.Position(line, rest);
        rest -= length;
      }
      return new vscode.Position(lines.length - 1, 0);
    };
    const list: vscode.Diagnostic[] = [];
    for (const [diagramKey, items] of perFile) {
      for (const item of items) {
        const at = locateEntry(text, diagramKey, item);
        const range = at ? new vscode.Range(position(at.offset), position(at.offset + at.length)) : new vscode.Range(0, 0, 0, 0);
        const d = new vscode.Diagnostic(range, vscode.l10n.t('No step matches "{0}" in diagram {1}; this entry is not applied.', item.key, diagramKey), vscode.DiagnosticSeverity.Warning);
        d.source = 'Mermaid Animator';
        d.code = 'sidecar/unresolved';
        list.push(d);
      }
    }
    this.diagnostics.set(uri, list);
  }

  /** Diagnostics currently published for a sidecar (used by integration tests). */
  diagnosticsFor(source: vscode.Uri): readonly vscode.Diagnostic[] {
    return this.diagnostics.get(sidecarUri(source)) ?? [];
  }

  /** Writes a patch into the sidecar through a workspace edit (keeps undo history and formatting). */
  async write(source: vscode.Uri, diagram: { id?: string; index: number }, patch: SidecarPatch): Promise<vscode.Uri> {
    if (!vscode.workspace.isTrusted) throw new Error('Sidecar files are not written in untrusted workspaces.');
    const uri = sidecarUri(source);
    const text = (await this.text(source)) ?? '';
    const key = rawEntryKey(parseSidecar(text), diagram) ?? sidecarKey(diagram);
    const next = applyPatch(text, key, patch);
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (open) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(0, 0, open.lineCount, 0), next);
      await vscode.workspace.applyEdit(edit);
      await open.save();
    } else {
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(next));
    }
    this.changed.fire(source);
    return uri;
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
