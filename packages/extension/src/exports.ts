/**
 * Writing exports in the host (spec static-export, animated-export, animated-svg-export,
 * html-player): progress notifications with Cancel, save dialogs, light/dark pairs written side by
 * side, HTML player assembly, and *Insert below diagram* for Markdown documents.
 */
import * as vscode from 'vscode';
import type { DiagramInfo } from '@mermaid-animator/core';
import type { ExportFormat, PlayerExportPayload } from '@mermaid-animator/protocol';
import { assemblePlayerHtml } from './playerHtml';
import { config } from './environment';

const FILTERS: Record<ExportFormat, Record<string, string[]>> = {
  svg: { SVG: ['svg'] },
  png: { PNG: ['png'] },
  gif: { GIF: ['gif'] },
  webm: { WebM: ['webm'] },
  mp4: { MP4: ['mp4'] },
  html: { HTML: ['html'] },
};

/**
 * The folder the save dialog starts in (`export.outputDirectory`): `${fileDirname}` (default),
 * `${workspaceFolder}`, a path relative to the workspace folder, or an absolute path.
 */
export function outputDirectory(source: vscode.Uri, setting = config('export.outputDirectory', '${fileDirname}')): vscode.Uri {
  const fileDir = vscode.Uri.joinPath(source, '..');
  const folder = vscode.workspace.getWorkspaceFolder(source)?.uri ?? fileDir;
  const value = (setting || '${fileDirname}').trim();
  const parts = (rest: string) => rest.split(/[\\/]/).filter(Boolean);
  if (value.startsWith('${fileDirname}')) return vscode.Uri.joinPath(fileDir, ...parts(value.slice('${fileDirname}'.length)));
  if (value.startsWith('${workspaceFolder}')) return vscode.Uri.joinPath(folder, ...parts(value.slice('${workspaceFolder}'.length)));
  if (/^([a-zA-Z]:[\\/]|\/)/.test(value)) return vscode.Uri.file(value);
  return vscode.Uri.joinPath(folder, ...parts(value));
}

/** Formats that are images and can be referenced from Markdown. */
const IMAGE_FORMATS: ReadonlySet<ExportFormat> = new Set(['svg', 'png', 'gif']);

export function isMarkdown(document: vscode.TextDocument): boolean {
  return document.languageId === 'markdown' || document.languageId === 'mdx' || /\.mdx?$/i.test(document.uri.path);
}

/** A path from the document's folder to the file, as Markdown likes it (`./x.svg`, `../img/x.gif`). */
export function relativeReference(document: vscode.Uri, file: vscode.Uri): string {
  const from = document.path.split('/').slice(0, -1);
  const to = file.path.split('/');
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  const up = from.length - i;
  const rest = to.slice(i).join('/');
  return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
}

/** The dark file of a pair for the chosen light name: `x.light.anim.svg` → `x.dark.anim.svg`, `x.svg` → `x.dark.svg`. */
export function darkPartner(lightName: string): string {
  if (/\.light\.anim\.svg$/i.test(lightName)) return lightName.replace(/\.light\.anim\.svg$/i, '.dark.anim.svg');
  if (/\.light\.svg$/i.test(lightName)) return lightName.replace(/\.light\.svg$/i, '.dark.svg');
  return lightName.replace(/(\.anim)?\.svg$/i, (_m, anim: string | undefined) => `.dark${anim ?? ''}.svg`);
}

/** The Markdown to insert: an image, or a `<picture>` for a light/dark pair. */
export function referenceMarkup(alt: string, files: { light: string; dark?: string }): string {
  const safe = alt.replace(/[[\]]/g, '');
  if (!files.dark) return `![${safe}](${files.light})`;
  const attr = alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return ['<picture>', `  <source media="(prefers-color-scheme: dark)" srcset="${files.dark}">`, `  <img alt="${attr}" src="${files.light}">`, '</picture>'].join('\n');
}

/** Inserts `markup` on the line after the diagram's closing fence. */
export async function insertBelowDiagram(document: vscode.TextDocument, diagram: DiagramInfo, markup: string): Promise<boolean> {
  const fence = diagram.contentEndLine;
  const edit = new vscode.WorkspaceEdit();
  if (fence + 1 < document.lineCount) edit.insert(document.uri, new vscode.Position(fence + 1, 0), `${markup}\n`);
  else edit.insert(document.uri, document.lineAt(Math.min(fence, document.lineCount - 1)).range.end, `\n${markup}`);
  return vscode.workspace.applyEdit(edit);
}

export interface ExportContext {
  uri: vscode.Uri;
  diagram: DiagramInfo | undefined;
  extensionUri: vscode.Uri;
  /** Test hook replacing the save dialog. */
  pick?: (suggested: vscode.Uri) => vscode.Uri | undefined;
  /** Test hook answering the completion notification. */
  answer?: (choices: string[]) => string | undefined;
  onWritten(path: string): void;
}

export class ExportWriter {
  private progress: { report: (value: { increment?: number; message?: string }) => void; resolve: () => void; last: number } | undefined;
  private pending = new Map<'light' | 'dark', { name: string; bytes: Uint8Array }>();
  /** Set from *Cancel* until the webview confirms: anything that still arrives is not written. */
  private cancelled = false;

  constructor(private readonly onCancel: () => void) {}

  /** `export/progress`: the first message opens a cancellable notification. */
  progressed(fraction: number, title: string): void {
    if (!this.progress) {
      this.cancelled = false;
      void vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, (report, token) => {
        token.onCancellationRequested(() => this.cancel());
        return new Promise<void>((resolve) => {
          this.progress = { report: (v) => report.report(v), resolve, last: 0 };
          this.progressed(fraction, title);
        });
      });
      return;
    }
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    if (pct > this.progress.last) {
      this.progress.report({ increment: pct - this.progress.last, message: `${pct}%` });
      this.progress.last = pct;
    }
  }

  /** The user cancelled: tell the webview to stop and drop whatever it still sends. */
  cancel(): void {
    this.cancelled = true;
    this.pending.clear();
    this.onCancel();
    this.settled();
  }

  /** Closes the notification (finished, or cancelled and confirmed by the webview). */
  settled(confirmedCancel = false): void {
    this.progress?.resolve();
    this.progress = undefined;
    if (confirmedCancel) this.cancelled = false;
  }

  /** Whether data arriving now belongs to a cancelled export. */
  get discarding(): boolean {
    return this.cancelled;
  }

  get inProgress(): boolean {
    return !!this.progress;
  }

  private async target(ctx: ExportContext, name: string, format: ExportFormat): Promise<vscode.Uri | undefined> {
    const suggested = vscode.Uri.joinPath(outputDirectory(ctx.uri), name);
    return ctx.pick
      ? ctx.pick(suggested)
      : vscode.window.showSaveDialog({ defaultUri: suggested, filters: FILTERS[format], saveLabel: vscode.l10n.t('Export') });
  }

  /** Writes one complete file (or half of a pair) and offers the follow-up actions. */
  async write(ctx: ExportContext, format: ExportFormat, name: string, bytes: Uint8Array, pair?: 'light' | 'dark'): Promise<void> {
    this.settled();
    if (pair) {
      this.pending.set(pair, { name, bytes });
      const light = this.pending.get('light');
      const dark = this.pending.get('dark');
      if (!light || !dark) return;
      this.pending.clear();
      const lightTarget = await this.target(ctx, light.name, format);
      if (!lightTarget) return;
      // The dark file goes beside the light one, named to match.
      const darkTarget = vscode.Uri.joinPath(lightTarget, '..', darkPartner(lightTarget.path.split('/').pop()!));
      await vscode.workspace.fs.writeFile(lightTarget, light.bytes);
      await vscode.workspace.fs.writeFile(darkTarget, dark.bytes);
      ctx.onWritten(lightTarget.fsPath || lightTarget.path);
      await this.completed(ctx, format, lightTarget, darkTarget);
      return;
    }
    const target = await this.target(ctx, name, format);
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, bytes);
    ctx.onWritten(target.fsPath || target.path);
    await this.completed(ctx, format, target);
  }

  /** `export/player`: inline the player bundle around the data and write the HTML file. */
  async writePlayer(ctx: ExportContext, payload: PlayerExportPayload): Promise<void> {
    const dist = vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'player');
    const read = async (file: string) => new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dist, file)));
    const [js, css] = await Promise.all([read('player.js'), read('player.css')]);
    const html = await assemblePlayerHtml({ js, css, data: payload.data, title: payload.title, lang: vscode.env.language, theme: payload.theme });
    await this.write(ctx, 'html', payload.suggestedName, new TextEncoder().encode(html));
  }

  private async completed(ctx: ExportContext, format: ExportFormat, target: vscode.Uri, dark?: vscode.Uri): Promise<void> {
    const open = vscode.l10n.t('Open');
    const reveal = vscode.l10n.t('Reveal');
    const insert = vscode.l10n.t('Insert below diagram');
    const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === ctx.uri.toString()) ?? (await vscode.workspace.openTextDocument(ctx.uri));
    const canInsert = IMAGE_FORMATS.has(format) && isMarkdown(document) && !!ctx.diagram;
    const choices = canInsert ? [open, reveal, insert] : [open, reveal];
    const message = vscode.l10n.t('Exported {0}', target.path.split('/').pop() ?? '');
    const choice = ctx.answer ? ctx.answer(choices) : await vscode.window.showInformationMessage(message, ...choices);
    if (choice === open) await vscode.commands.executeCommand('vscode.open', target);
    else if (choice === reveal) await vscode.commands.executeCommand(vscode.env.uiKind === vscode.UIKind.Desktop ? 'revealFileInOS' : 'revealInExplorer', target);
    else if (choice === insert && ctx.diagram) {
      const alt = ctx.diagram.title ?? target.path.split('/').pop() ?? '';
      const markup = referenceMarkup(alt, { light: relativeReference(ctx.uri, target), dark: dark ? relativeReference(ctx.uri, dark) : undefined });
      await insertBelowDiagram(document, ctx.diagram, markup);
    }
  }
}
