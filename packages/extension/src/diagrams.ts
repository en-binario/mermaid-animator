import * as vscode from 'vscode';
import { diagramAtLine, locateDiagrams, type DiagramInfo } from '@mermaid-animator/core';

/** Language ids scanned for diagrams (`mermaidAnimator.files.languages`). */
export function scannedLanguages(): string[] {
  return vscode.workspace.getConfiguration('mermaidAnimator').get<string[]>('files.languages', ['markdown', 'mdx', 'mermaid']);
}

function locatorLanguage(document: vscode.TextDocument): string | undefined {
  const id = document.languageId;
  if (!scannedLanguages().includes(id)) {
    // Files named *.mmd / *.mermaid are Mermaid even if another extension claims the language.
    return /\.(mmd|mermaid)$/i.test(document.uri.path) ? 'mermaid' : undefined;
  }
  if (id === 'mermaid') return 'mermaid';
  return 'markdown';
}

/** All diagrams in a document (empty for unsupported languages). */
export function diagramsIn(document: vscode.TextDocument): DiagramInfo[] {
  const language = locatorLanguage(document);
  return language ? locateDiagrams(document.getText(), language) : [];
}

/** The diagram containing `line`, else the first. */
export function diagramNear(document: vscode.TextDocument, line: number): DiagramInfo | undefined {
  const all = diagramsIn(document);
  return diagramAtLine(all, line) ?? all[0];
}

/** Human label for pickers and panel titles. */
export function diagramLabel(d: DiagramInfo): string {
  return d.title ?? d.id ?? d.summary ?? `${d.type}`;
}

export function basename(uri: vscode.Uri): string {
  const parts = uri.path.split('/');
  return parts[parts.length - 1] || uri.path;
}
