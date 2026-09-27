import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { api, closeAll, EXTENSION_ID, nextPost, openEditor, workspaceFile } from './helpers';

/** Records `workbench.action.openSettings` calls instead of opening the Settings editor. */
function stubOpenSettings(): { calls: unknown[][]; restore: () => void } {
  const calls: unknown[][] = [];
  const original = vscode.commands.executeCommand;
  (vscode.commands as { executeCommand: typeof original }).executeCommand = (async (command: string, ...args: unknown[]) => {
    if (command === 'workbench.action.openSettings') {
      calls.push(args);
      return undefined;
    }
    return original(command, ...args);
  }) as typeof original;
  return { calls, restore: () => ((vscode.commands as { executeCommand: typeof original }).executeCommand = original) };
}

describe('Settings access', () => {
  afterEach(closeAll);

  it('contributes Open Settings, which opens settings filtered to the extension', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('mermaidAnimator.openSettings'));
    const stub = stubOpenSettings();
    try {
      await vscode.commands.executeCommand('mermaidAnimator.openSettings');
      assert.deepEqual(stub.calls, [[`@ext:${EXTENSION_ID}`]]);
    } finally {
      stub.restore();
    }
  });

  it('contributes the play and presentation zoom settings and sends them to the panel', async () => {
    const config = vscode.workspace.getConfiguration('mermaidAnimator');
    assert.equal(config.inspect('camera.playZoom')?.defaultValue, 100);
    assert.equal(config.inspect('camera.presentationZoom')?.defaultValue, 150);
    const { panels } = await api();
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'))!;
    await nextPost(panel, (m) => m.type === 'document/load');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed');
    await config.update('camera.playZoom', 80, vscode.ConfigurationTarget.Global);
    try {
      const settings = ((await changed).payload as { settings: Record<string, unknown> }).settings;
      assert.equal(settings['camera.playZoom'], 80);
      assert.equal(settings['camera.presentationZoom'], 150);
    } finally {
      await config.update('camera.playZoom', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  it('opens the same settings when the panel asks, ignoring any payload', async () => {
    const { panels } = await api();
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'))!;
    await nextPost(panel, (m) => m.type === 'document/load');
    const stub = stubOpenSettings();
    try {
      await panel.receiveForTest({ v: 1, type: 'settings/open', payload: { query: '@ext:other.extension' } });
      assert.deepEqual(stub.calls, [[`@ext:${EXTENSION_ID}`]]);
    } finally {
      stub.restore();
    }
  });
});
