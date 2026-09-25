import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { HostMessage } from '@mermaid-animator/protocol';
import type { MermaidAnimatorApi } from '../../src/extension';
import type { AnimatorPanel } from '../../src/panel';

export const EXTENSION_ID = 'enbinario.mermaid-animator';

export async function api(): Promise<MermaidAnimatorApi> {
  const extension = vscode.extensions.getExtension<MermaidAnimatorApi>(EXTENSION_ID);
  assert.ok(extension, 'extension is installed');
  return extension.activate();
}

export function workspaceFile(name: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'test workspace is open');
  return vscode.Uri.joinPath(folder.uri, name);
}

export async function openEditor(name: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument(workspaceFile(name));
  return vscode.window.showTextDocument(document, vscode.ViewColumn.One);
}

/** Resolves with the first message posted to the panel's webview that matches `predicate`. */
export function nextPost(panel: AnimatorPanel, predicate: (m: HostMessage) => boolean, timeoutMs = 20_000): Promise<HostMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error('Timed out waiting for a webview message.'));
    }, timeoutMs);
    const subscription = panel.onDidPost((message) => {
      if (!predicate(message)) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(message);
    });
  });
}

export async function closeAll(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
