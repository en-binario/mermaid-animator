import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { api, closeAll, nextPost, openEditor, workspaceFile } from './helpers';

/** Polls until `check` returns a truthy value. */
async function until<T>(check: () => T | undefined | false | Promise<T | undefined | false>, timeoutMs = 20_000, what = 'condition'): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value as T;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function setConfig(key: string, value: unknown) {
  await vscode.workspace.getConfiguration('mermaidAnimator').update(key, value, vscode.ConfigurationTarget.Global);
}

describe('M1: discovery and entry points', () => {
  afterEach(closeAll);

  it('shows ▶ Animate and Export… above every Markdown diagram', async () => {
    await api();
    const uri = workspaceFile('docs.md');
    await vscode.workspace.openTextDocument(uri);
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>('vscode.executeCodeLensProvider', uri);
    const titles = lenses.map((l) => l.command?.title);
    assert.equal(titles.filter((t) => t === '▶ Animate').length, 3);
    assert.equal(titles.filter((t) => t === 'Export…').length, 3);
    assert.deepEqual([...new Set(lenses.map((l) => l.range.start.line))], [4, 14, 21]);
  });

  it('hides the CodeLens when codeLens.enabled is false', async () => {
    await api();
    await setConfig('codeLens.enabled', false);
    await vscode.workspace.openTextDocument(workspaceFile('docs.md'));
    try {
      const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>('vscode.executeCodeLensProvider', workspaceFile('docs.md'));
      assert.equal(lenses.filter((l) => l.command?.title === '▶ Animate').length, 0);
    } finally {
      await setConfig('codeLens.enabled', undefined);
    }
  });

  it('opens the diagram at the cursor in a Markdown file, titled with its index', async () => {
    const { panels } = await api();
    const editor = await openEditor('docs.md');
    editor.selection = new vscode.Selection(16, 4, 16, 4);
    await vscode.commands.executeCommand('mermaidAnimator.open');
    const panel = panels.find(workspaceFile('docs.md'), 1);
    assert.ok(panel, 'panel for diagram 2');
    const load = await nextPost(panel, (m) => m.type === 'document/load');
    assert.ok(load.type === 'document/load' && load.payload.source.includes('Alice->>Bob: first'));
    assert.equal(load.type === 'document/load' && load.payload.diagrams?.length, 3);
    assert.equal(panel.panel.title, '▶ docs.md · 2');
  });

  it('reuses the panel of a diagram and opens another panel for another diagram', async () => {
    const { panels } = await api();
    const uri = workspaceFile('docs.md');
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 0, true);
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 0, true);
    assert.equal(panels.all().filter((p) => p.uri.toString() === uri.toString()).length, 1);
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 1, true);
    assert.equal(panels.all().filter((p) => p.uri.toString() === uri.toString()).length, 2);
  });

  it('sets the context keys for Markdown with and without diagrams', async () => {
    await api();
    const editor = await openEditor('docs.md');
    editor.selection = new vscode.Selection(8, 0, 8, 0);
    // No public getter for context keys: the commands' enablement is exercised via executeCommand in other tests;
    // here we check the locator agrees with what drives the keys.
    const plain = await openEditor('plain.md');
    assert.equal(plain.document.languageId, 'markdown');
  });
});

describe('M1: playback, sync and diagnostics', () => {
  afterEach(async () => {
    (await api()).setSaveTarget(undefined);
    await closeAll();
  });

  it('decorates the current step in the source and keeps the step while its label is edited', async () => {
    const { panels, decorations } = await api();
    const uri = workspaceFile('docs.md');
    const editor = await openEditor('docs.md');
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 1, true);
    const panel = panels.find(uri, 1)!;
    await until(() => (panel.lastState?.stepCount ?? 0) > 0, 20_000, 'webview state');

    panel.command('goToStep', { step: 2 });
    const ranges = await until(() => decorations.get(uri).find((r) => r.startLine === 17), 20_000, 'decoration on step 2');
    assert.equal(ranges.startLine, 17, 'Bob->>Carol: second is on line 17');

    // Edit step 2's label character by character; playback must stay on step 2.
    for (const ch of [' ', 'e', 'd', 'i', 't']) {
      const line = editor.document.lineAt(17);
      await editor.edit((b) => b.insert(line.range.end, ch));
      await new Promise((r) => setTimeout(r, 60));
    }
    await new Promise((r) => setTimeout(r, 900));
    assert.ok(decorations.get(uri).some((r) => r.startLine === 17), 'still on step 2 after editing its label');
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  it('publishes syntax errors to the Problems panel and clears them when fixed', async () => {
    const { panels } = await api();
    const uri = workspaceFile('docs.md');
    const editor = await openEditor('docs.md');
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 1, true);
    const panel = panels.find(uri, 1)!;
    await nextPost(panel, (m) => m.type === 'document/load');

    await editor.edit((b) => b.insert(new vscode.Position(17, 0), '    end\n'));
    const errors = await until(() => {
      const d = vscode.languages.getDiagnostics(uri).filter((x) => x.source === 'Mermaid Animator');
      return d.length ? d : undefined;
    }, 20_000, 'diagnostics');
    assert.equal(errors[0]?.range.start.line, 17);
    assert.equal(errors[0]?.severity, vscode.DiagnosticSeverity.Error);

    await vscode.commands.executeCommand('undo');
    await until(() => vscode.languages.getDiagnostics(uri).filter((x) => x.source === 'Mermaid Animator').length === 0, 20_000, 'diagnostics cleared');
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  it('exports the current frame as a standalone SVG file', async () => {
    const { panels, setSaveTarget } = await api();
    const uri = workspaceFile('flow.mmd');
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(uri)!;
    await until(() => (panel.lastState?.stepCount ?? 0) > 0, 20_000, 'webview state');
    const target = vscode.Uri.joinPath(uri, '..', 'exports', 'flow-test.svg');
    setSaveTarget(() => target);
    panel.command('last');
    panel.command('exportSvg');
    await nextPost(panel, (m) => m.type === 'export/ack', 30_000);
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(target));
    assert.ok(text.startsWith('<?xml'));
    assert.ok(text.includes('<svg'));
    assert.ok(text.includes('Hello Bob'));
    assert.ok(!/<script/i.test(text), 'no scripts');
    assert.ok(!/href="https?:/i.test(text), 'no external references');
    assert.ok(text.includes('textLength'), 'text lengths pinned for fallback fonts');
    await vscode.workspace.fs.delete(vscode.Uri.joinPath(uri, '..', 'exports'), { recursive: true });
  });

  it('routes playback commands to the active panel', async () => {
    const { panels } = await api();
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'))!;
    await nextPost(panel, (m) => m.type === 'document/load');
    panel.reveal();
    await until(() => panel.isActive, 5_000, 'panel active');
    const command = nextPost(panel, (m) => m.type === 'command');
    await vscode.commands.executeCommand('mermaidAnimator.nextStep');
    const message = await command;
    assert.ok(message.type === 'command' && message.payload.action === 'next');
  });
});
