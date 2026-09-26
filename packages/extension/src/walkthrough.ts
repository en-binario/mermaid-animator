/**
 * The *Get started with Mermaid Animator* walkthrough (spec walkthrough, M3 D10): its step actions
 * open a sample diagram in an untitled editor with the animator beside it, and help with the
 * annotation step. Step texts live in `package.nls*.json`.
 */
import * as vscode from 'vscode';
import type { AnimatorPanel } from './panel';

export const WALKTHROUGH_ID = 'mermaidAnimator.getStarted';

/** The sample: a short sign-in flow with captions and a chapter, localised. */
export function sampleSource(): string {
  return [
    'sequenceDiagram',
    `    title ${vscode.l10n.t('Sign-in')}`,
    '    autonumber',
    `    actor U as ${vscode.l10n.t('User')}`,
    '    participant G as Gateway',
    `    participant A as ${vscode.l10n.t('Auth Service')}`,
    `    participant D as ${vscode.l10n.t('Database')}`,
    `    %% @chapter "${vscode.l10n.t('Credentials')}"`,
    `    %% @caption "${vscode.l10n.t('The user submits the sign-in form.')}"`,
    '    U->>+G: POST /login',
    '    G->>+A: verify(credentials)',
    `    %% @caption "${vscode.l10n.t('Auth looks the user up by e-mail address.')}"`,
    '    A->>D: SELECT user',
    '    D-->>A: row',
    '    A->>A: compare hash',
    `    %% @chapter "${vscode.l10n.t('Session')}"`,
    '    A-->>-G: token',
    `    %% @caption "${vscode.l10n.t('The session cookie is set and the user is in.')}"`,
    '    G-->>-U: 200 OK + cookie',
    '',
  ].join('\n');
}

let sample: vscode.TextDocument | undefined;

/** Opens the sample in an untitled Mermaid editor and animates it beside (walkthrough step 1). */
export async function openSample(open: (uri: vscode.Uri, index: number, toSide: boolean) => AnimatorPanel): Promise<AnimatorPanel> {
  sample = await vscode.workspace.openTextDocument({ language: 'mermaid', content: sampleSource() });
  await vscode.window.showTextDocument(sample, { viewColumn: vscode.ViewColumn.One, preview: false });
  return open(sample.uri, 0, true);
}

/** Puts the cursor on the sample's first message and offers the annotation picker (step 4). */
export async function annotateSample(): Promise<void> {
  const document = sample && !sample.isClosed ? sample : undefined;
  if (document) {
    const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preview: false });
    const line = document.getText().split('\n').findIndex((l) => l.includes('->>'));
    const at = new vscode.Position(Math.max(0, line), 4);
    editor.selection = new vscode.Selection(at, at);
  }
  await vscode.commands.executeCommand('mermaidAnimator.insertAnnotation');
}
