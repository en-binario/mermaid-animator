import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { api, closeAll, nextPost, openEditor, workspaceFile } from './helpers';

async function until<T>(check: () => T | undefined | false | Promise<T | undefined | false>, timeoutMs = 20_000, what = 'condition'): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value as T;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('M2b: views and topology layouts', () => {
  afterEach(closeAll);

  it('contributes the view commands', async () => {
    await api();
    const all = await vscode.commands.getCommands(true);
    for (const id of ['mermaidAnimator.setView.sequence', 'mermaidAnimator.setView.topology', 'mermaidAnimator.setView.split', 'mermaidAnimator.toggleView', 'mermaidAnimator.resetLayout']) {
      assert.ok(all.includes(id), `${id} is registered`);
    }
  });

  it('routes Show Split View to the active panel as setView', async () => {
    const { panels } = await api();
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'))!;
    await until(() => (panel.lastState?.stepCount ?? 0) > 0, 20_000, 'webview state');
    panel.reveal();
    await until(() => panel.isActive, 5_000, 'panel active');
    const command = nextPost(panel, (m) => m.type === 'command' && m.payload.action === 'setView');
    await vscode.commands.executeCommand('mermaidAnimator.setView.split');
    const message = await command;
    assert.ok(message.type === 'command' && message.payload.args?.view === 'split');
  });

  it('stores manual positions per diagram and sends them with document/load', async () => {
    const { panels } = await api();
    const uri = workspaceFile('docs.md');
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 1, true);
    let panel = panels.find(uri, 1)!;
    await until(() => panel.current, 20_000, 'bound diagram');
    await panel.receiveForTest({ v: 1, type: 'layout/save', payload: { key: '', positions: { Alice: { x: 10, y: 20 }, Bob: { x: 300, y: 40 } } } });
    panel.dispose();

    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 1, true);
    panel = panels.find(uri, 1)!;
    const load = await nextPost(panel, (m) => m.type === 'document/load');
    assert.ok(load.type === 'document/load');
    assert.deepEqual(load.payload.layout, { Alice: { x: 10, y: 20 }, Bob: { x: 300, y: 40 } });

    // Another diagram of the same document has its own (empty) layout.
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 0, true);
    const other = panels.find(uri, 0)!;
    const otherLoad = await nextPost(other, (m) => m.type === 'document/load');
    assert.ok(otherLoad.type === 'document/load' && otherLoad.payload.layout === undefined);

    // Reset Topology Layout clears the stored positions and tells the webview.
    const reset = nextPost(panel, (m) => m.type === 'command' && m.payload.action === 'resetLayout');
    await panel.resetLayout();
    await reset;
    panel.dispose();
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 1, true);
    const again = await nextPost(panels.find(uri, 1)!, (m) => m.type === 'document/load');
    assert.ok(again.type === 'document/load' && again.payload.layout === undefined);
  });
});
