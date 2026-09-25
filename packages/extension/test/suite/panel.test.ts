import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { api, closeAll, nextPost, openEditor, workspaceFile } from './helpers';

describe('animator panel (M0)', () => {
  afterEach(closeAll);

  it('registers the mermaid language for .mmd files', async () => {
    const editor = await openEditor('flow.mmd');
    assert.equal(editor.document.languageId, 'mermaid');
  });

  it('opens one panel beside the editor and reveals it on a second run', async () => {
    const { panels } = await api();
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'));
    assert.ok(panel, 'panel exists');
    assert.equal(panel.panel.title, '▶ flow.mmd');
    assert.equal(panels.count, 1);

    await vscode.commands.executeCommand('mermaidAnimator.open', workspaceFile('flow.mmd'));
    assert.equal(panels.count, 1, 'no second panel is created');
  });

  it('completes the ready handshake and sends init then the document', async () => {
    const { panels } = await api();
    await openEditor('flow.mmd');
    const loaded = new Promise<string[]>((resolve) => {
      const types: string[] = [];
      const timer = setInterval(() => {
        const panel = panels.find(workspaceFile('flow.mmd'));
        if (!panel) return;
        clearInterval(timer);
        panel.onDidPost((m) => {
          types.push(m.type);
          if (m.type === 'document/load') resolve(types);
        });
      }, 10);
    });
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const types = await loaded;
    assert.deepEqual(types.slice(0, 2), ['init', 'document/load']);
  });

  it('forwards unsaved edits to the webview within one second', async () => {
    const { panels } = await api();
    const editor = await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'));
    assert.ok(panel);
    await nextPost(panel, (m) => m.type === 'document/load');

    const started = Date.now();
    const update = nextPost(panel, (m) => m.type === 'document/update', 1_000);
    await editor.edit((b) => b.insert(new vscode.Position(3, 0), '    Alice->>Bob: unsaved line\n'));
    const message = await update;
    assert.ok(Date.now() - started < 1_000);
    assert.ok(message.type === 'document/update' && message.payload.source.includes('unsaved line'));
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  it('restores a serialized panel bound to the same file', async () => {
    const { panels, restore } = await api();
    const uri = workspaceFile('flow.mmd');
    const webviewPanel = vscode.window.createWebviewPanel('mermaidAnimator.panel', 'restoring', vscode.ViewColumn.One, {});
    await restore(webviewPanel, { uri: uri.toString() });
    const panel = panels.find(uri);
    assert.ok(panel, 'panel adopted');
    assert.equal(panel.panel.title, '▶ flow.mmd');
    const load = await nextPost(panel, (m) => m.type === 'document/load');
    assert.ok(load.type === 'document/load' && load.payload.source.includes('Hello Bob'));
  });

  it('disposes a serialized panel whose state is unusable', async () => {
    const { panels, restore } = await api();
    const before = panels.count;
    const webviewPanel = vscode.window.createWebviewPanel('mermaidAnimator.panel', 'broken', vscode.ViewColumn.One, {});
    let disposed = false;
    webviewPanel.onDidDispose(() => (disposed = true));
    await restore(webviewPanel, undefined);
    assert.ok(disposed);
    assert.equal(panels.count, before);
  });

  it('pushes theme changes to open panels', async () => {
    const { panels } = await api();
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'));
    assert.ok(panel);
    await nextPost(panel, (m) => m.type === 'document/load');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed');
    await vscode.workspace.getConfiguration('mermaidAnimator').update('theme.mode', 'graphite', vscode.ConfigurationTarget.Global);
    const message = await changed;
    assert.ok(message.type === 'settings/changed' && message.payload.settings.themeMode === 'graphite');
    await vscode.workspace.getConfiguration('mermaidAnimator').update('theme.mode', undefined, vscode.ConfigurationTarget.Global);
  });
});
