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

async function setConfig(key: string, value: unknown) {
  await vscode.workspace.getConfiguration('mermaidAnimator').update(key, value, vscode.ConfigurationTarget.Global);
}

describe('M2a: editor cursor seeks to the step', () => {
  afterEach(async () => {
    await setConfig('sync.cursorToStep', undefined);
    await closeAll();
  });

  it('moves the step decoration to the statement under the cursor (follow)', async () => {
    const { panels, decorations } = await api();
    const uri = workspaceFile('docs.md');
    await setConfig('sync.cursorToStep', 'follow');
    const editor = await openEditor('docs.md');
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 1, true);
    const panel = panels.find(uri, 1)!;
    await until(() => (panel.lastState?.stepCount ?? 0) > 0, 20_000, 'webview state');

    const seek = nextPost(panel, (m) => m.type === 'command' && m.payload.action === 'seekToLine');
    editor.selection = new vscode.Selection(17, 6, 17, 6);
    const message = await seek;
    assert.ok(message.type === 'command' && message.payload.args?.line === 17);
    await until(() => decorations.get(uri).some((r) => r.startLine === 17), 20_000, 'decoration on Bob->>Carol: second');

    editor.selection = new vscode.Selection(18, 0, 18, 0);
    await until(() => decorations.get(uri).some((r) => r.startLine === 18), 20_000, 'decoration on Carol-->>Alice: third');
  });

  it('ignores keyboard and programmatic cursor moves in click mode', async () => {
    const { panels } = await api();
    const uri = workspaceFile('docs.md');
    await setConfig('sync.cursorToStep', 'click');
    const editor = await openEditor('docs.md');
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 1, true);
    const panel = panels.find(uri, 1)!;
    await until(() => (panel.lastState?.stepCount ?? 0) > 0, 20_000, 'webview state');
    let seeks = 0;
    const subscription = panel.onDidPost((m) => {
      if (m.type === 'command' && m.payload.action === 'seekToLine') seeks++;
    });
    editor.selection = new vscode.Selection(17, 6, 17, 6);
    await new Promise((r) => setTimeout(r, 400));
    subscription.dispose();
    assert.equal(seeks, 0);
  });
});

describe('M2a: presentation layout', () => {
  afterEach(closeAll);

  it('contributes the M2a commands and finds the layout commands it relies on', async () => {
    await api();
    const all = await vscode.commands.getCommands(true);
    for (const id of [
      'mermaidAnimator.startPresentation',
      'mermaidAnimator.stopPresentation',
      'mermaidAnimator.nextChapter',
      'mermaidAnimator.previousChapter',
      'mermaidAnimator.showTranscript',
      'mermaidAnimator.toggleInspector',
      'mermaidAnimator.search',
      'mermaidAnimator.insertAnnotation',
      'workbench.action.maximizeEditorHideSidebar',
      'workbench.action.toggleMaximizeEditorGroup',
      'workbench.action.toggleZenMode',
      'workbench.action.exitZenMode',
    ]) {
      assert.ok(all.includes(id), `${id} is registered`);
    }
  });

  it('round-trips start and stop between the command, the webview and the host', async () => {
    const { panels, presentation } = await api();
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'))!;
    await until(() => (panel.lastState?.stepCount ?? 0) > 0, 20_000, 'webview state');
    panel.reveal();
    await until(() => panel.isActive, 5_000, 'panel active');

    const started = nextPost(panel, (m) => m.type === 'presentation/state');
    await vscode.commands.executeCommand('mermaidAnimator.startPresentation');
    const on = await started;
    assert.ok(on.type === 'presentation/state' && on.payload.on === true);
    assert.equal(presentation.presenting, true);
    assert.equal(panel.presenting, true);

    const stopped = nextPost(panel, (m) => m.type === 'presentation/state');
    await vscode.commands.executeCommand('mermaidAnimator.stopPresentation');
    const off = await stopped;
    assert.ok(off.type === 'presentation/state' && off.payload.on === false);
    assert.equal(presentation.presenting, false);
  });

  it('restores the layout when a presenting panel closes', async () => {
    const { panels, presentation } = await api();
    await openEditor('flow.mmd');
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile('flow.mmd'))!;
    await until(() => (panel.lastState?.stepCount ?? 0) > 0, 20_000, 'webview state');
    panel.command('startPresentation');
    await until(() => presentation.presenting, 20_000, 'presenting');
    panel.dispose();
    await until(() => !presentation.presenting, 5_000, 'layout restored');
  });
});

describe('M2a: annotation editing', () => {
  afterEach(async () => {
    await setConfig('annotations.highlight', undefined);
    await closeAll();
  });

  const labels = (list: vscode.CompletionList) => list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));

  it('completes directive names, animator values, participants and branches', async () => {
    await api();
    const uri = workspaceFile('completions.mmd');
    const document = await vscode.workspace.openTextDocument(uri);
    const end = (line: number) => new vscode.Position(line, document.lineAt(line).text.length);

    const names = labels(await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', uri, end(3), '@'));
    assert.ok(names.includes('caption') && names.includes('chapter'), 'caption and chapter offered');

    const values = labels(await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', uri, end(4), '='));
    for (const v of ['auto', 'fit', 'follow', 'cinematic', 'manual']) assert.ok(values.includes(v), `camera=${v}`);

    const participants = labels(await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', uri, end(5), ' '));
    assert.ok(participants.includes('W') && participants.includes('P'), 'participant ids for @focus');

    const branches = labels(await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', uri, end(6), ' '));
    for (const b of ['"valid"', '"invalid"', 'all', 'ask', 'skip']) assert.ok(branches.includes(b), `@branch ${b}`);
  });

  it('shows the target statement and its step on hover', async () => {
    await api();
    const uri = workspaceFile('story.md');
    await vscode.workspace.openTextDocument(uri);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, new vscode.Position(8, 9));
    const text = hovers.flatMap((h) => h.contents.map((c) => (typeof c === 'string' ? c : c.value))).join('\n');
    assert.ok(text.includes('Applies to `W->>+P: Authorise card` (step 2)'), text);
    assert.ok(text.includes('statement'), 'scope shown');
  });

  it('fixes an unknown directive with the suggested name', async () => {
    const { panels } = await api();
    const uri = workspaceFile('story.md');
    const editor = await openEditor('story.md');
    await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 0, true);
    await until(() => panels.find(uri, 0)?.current, 20_000, 'bound diagram');
    await until(() => vscode.languages.getDiagnostics(uri).some((d) => d.code === 'annotation/unknown'), 20_000, 'unknown-annotation diagnostic');
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', uri, new vscode.Range(10, 8, 10, 8));
    const fix = actions.find((a) => a.title === 'Change to @pause');
    assert.ok(fix?.edit, 'quick fix offered');
    await vscode.workspace.applyEdit(fix.edit);
    assert.equal(editor.document.lineAt(10).text, '    %% @pause 1s');
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  it('inserts an annotation snippet above the statement with its text selected', async () => {
    await api();
    const editor = await openEditor('story.md');
    editor.selection = new vscode.Selection(9, 8, 9, 8);
    const { insertDirective } = await import('../../src/annotationEditing');
    assert.ok(await insertDirective(editor, 'caption', 9));
    assert.equal(editor.document.lineAt(9).text, '    %% @caption "…"');
    assert.equal(editor.document.lineAt(10).text, '    W->>+P: Authorise card');
    assert.equal(editor.document.getText(editor.selection), '…');
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  it('highlights directive names unless annotations.highlight is false', async () => {
    const { highlighter } = await api();
    const editor = await openEditor('story.md');
    const key = editor.document.uri.toString();
    highlighter.apply();
    assert.deepEqual(highlighter.applied.get(key)?.map((r) => r.start.line), [6, 8, 10]);
    assert.equal(highlighter.applied.get(key)?.[0]?.start.character, 7);
    await setConfig('annotations.highlight', false);
    highlighter.apply();
    assert.deepEqual(highlighter.applied.get(key), []);
  });
});
