import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { api, closeAll, nextPost, openEditor, workspaceFile } from './helpers';

describe('Participant orientation settings', () => {
  afterEach(closeAll);

  it('contributes both settings with their defaults', () => {
    const config = vscode.workspace.getConfiguration('mermaidAnimator');
    assert.equal(config.inspect('display.participantNames')?.defaultValue, 'auto');
    assert.equal(config.inspect('display.arrowEndNames')?.defaultValue, 'off');
  });

  it('sends changes to open panels', async () => {
    const { panels } = await api();
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'))!;
    await nextPost(panel, (m) => m.type === 'document/load');
    const config = vscode.workspace.getConfiguration('mermaidAnimator');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed' && m.payload.settings['display.arrowEndNames'] === 'always');
    await config.update('display.arrowEndNames', 'always', vscode.ConfigurationTarget.Workspace);
    try {
      const message = await changed;
      assert.ok(message.type === 'settings/changed');
      assert.equal(message.payload.settings['display.participantNames'], 'auto');
    } finally {
      await config.update('display.arrowEndNames', undefined, vscode.ConfigurationTarget.Workspace);
    }
  });
});
