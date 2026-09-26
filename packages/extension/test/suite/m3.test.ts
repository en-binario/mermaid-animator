import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AnimatorPanel } from '../../src/panel';
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

const exists = async (uri: vscode.Uri) => {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
};

const remove = async (uri: vscode.Uri) => {
  if (await exists(uri)) await vscode.workspace.fs.delete(uri, { recursive: true });
};

const write = (uri: vscode.Uri, text: string) => vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
const read = async (uri: vscode.Uri) => new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));

/** Opens diagram `index` of a workspace file and waits until the webview shows it. */
async function animate(name: string, index = 0): Promise<AnimatorPanel> {
  const { panels } = await api();
  const uri = workspaceFile(name);
  await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, index, true);
  const panel = panels.find(uri, index)!;
  await until(() => (panel.lastState?.stepCount ?? 0) > 0, 30_000, 'webview state');
  return panel;
}

/** Goes to step `step` (0-based index; `goToStep` counts completed steps). */
async function goTo(panel: AnimatorPanel, step: number): Promise<void> {
  panel.command('goToStep', { step: step + 1 });
  await until(() => panel.lastState?.stepIndex === step, 20_000, `step ${step + 1}`);
}

const manifest = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

describe('M3: share', function () {
  this.timeout(60_000);
  const exportsDir = () => workspaceFile('exports');

  afterEach(async () => {
    (await api()).setSaveTarget(undefined);
    (await api()).setNotificationAnswer(undefined);
    await closeAll();
    // `KEEP_EXPORTS=<folder>` keeps the files for manual checks (release checklist).
    if (process.env.KEEP_EXPORTS && (await exists(exportsDir()))) await vscode.workspace.fs.copy(exportsDir(), vscode.Uri.joinPath(vscode.Uri.file(process.env.KEEP_EXPORTS), `${Date.now()}`), { overwrite: true });
    await remove(exportsDir());
  });

  it('contributes the M3 commands, views, walkthrough and schema', async () => {
    await api();
    const all = await vscode.commands.getCommands(true);
    for (const id of [
      'mermaidAnimator.copyStepLink', 'mermaidAnimator.saveLayout', 'mermaidAnimator.saveDefaults',
      'mermaidAnimator.export.gif', 'mermaidAnimator.export.video', 'mermaidAnimator.export.animatedSvg', 'mermaidAnimator.export.html',
      'mermaidAnimator.diagramsView.refresh', 'mermaidAnimator.diagramsView.filter', 'mermaidAnimator.walkthrough.openSample',
    ]) assert.ok(all.includes(id), `${id} is registered`);
    const declared = new Set<string>(manifest.contributes.commands.map((c: { command: string }) => c.command));
    for (const id of all.filter((c) => c.startsWith('mermaidAnimator.') && !c.startsWith('mermaidAnimator.diagrams.'))) assert.ok(declared.has(id), `${id} is declared in the manifest`);
    assert.equal(manifest.contributes.walkthroughs[0].steps.length, 5);
    assert.deepEqual(manifest.contributes.jsonValidation, [{ fileMatch: '*.animator.json', url: './schemas/animator.schema.json' }]);
  });

  it('opens the export sheet from the palette command', async () => {
    const panel = await animate('flow.mmd');
    panel.reveal();
    await until(() => panel.isActive, 5_000, 'panel active');
    const opened = nextPost(panel, (m) => m.type === 'command' && m.payload.action === 'export');
    await vscode.commands.executeCommand('mermaidAnimator.export.gif');
    const message = await opened;
    assert.ok(message.type === 'command' && message.payload.args?.format === 'gif');
  });

  it('writes a self-contained HTML player with no external URLs', async () => {
    const { setSaveTarget } = await api();
    const panel = await animate('flow.mmd');
    const target = vscode.Uri.joinPath(exportsDir(), 'sign-in.html');
    setSaveTarget(() => target);
    (await api()).setNotificationAnswer(() => undefined);
    const data = readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'player-data.json'), 'utf8');
    await panel.receiveForTest({ v: 1, type: 'export/player', payload: { suggestedName: 'sign-in.html', title: 'Sign-in', data, theme: 'auto' } });
    const html = await read(target);
    assert.ok(/^<!doctype html>/i.test(html), 'an HTML document');
    assert.ok(/<meta http-equiv="Content-Security-Policy"[^>]+default-src 'none'/.test(html), 'a strict CSP');
    assert.ok(!/(?:src|href)\s*=\s*["']?https?:/i.test(html), 'no external src/href');
    assert.ok(!/url\(\s*["']?https?:/i.test(html), 'no external CSS URLs');
    assert.ok(!/@import/i.test(html), 'no imports');
    assert.ok(!/<script[^>]+src=/i.test(html), 'scripts are inline');
    assert.ok(html.includes('Sign-in'));
  });

  /** Runs a format command with `{ start: true }` and returns the written file. */
  async function exportWith(command: string, name: string, diagram = 'flow.mmd', args: Record<string, unknown> = {}): Promise<{ uri: vscode.Uri; bytes: Uint8Array }> {
    const { setSaveTarget, setNotificationAnswer } = await api();
    const panel = await animate(diagram);
    let target: vscode.Uri | undefined;
    setSaveTarget((suggested) => (target = vscode.Uri.joinPath(exportsDir(), path.posix.basename(suggested.path))));
    setNotificationAnswer(() => undefined);
    panel.reveal();
    await until(() => panel.isActive, 5_000, 'panel active');
    const ack = nextPost(panel, (m) => m.type === 'export/ack', 90_000);
    await vscode.commands.executeCommand(command, { ...args, start: true });
    await ack;
    assert.ok(target, `${name} was offered a file name`);
    return { uri: target, bytes: await vscode.workspace.fs.readFile(target) };
  }

  it('encodes a GIF in the webview worker (end to end)', async function () {
    this.timeout(120_000);
    const { uri, bytes } = await exportWith('mermaidAnimator.export.gif', 'GIF');
    assert.match(uri.path, /\.gif$/);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), 'GIF89a');
    assert.ok(new TextDecoder('latin1').decode(bytes).includes('NETSCAPE2.0'), 'loops forever by default');
    assert.ok(bytes.length > 2_000);
  });

  it('encodes a video in the webview worker (end to end)', async function () {
    this.timeout(120_000);
    const { uri, bytes } = await exportWith('mermaidAnimator.export.video', 'video');
    if (uri.path.endsWith('.mp4')) assert.equal(new TextDecoder().decode(bytes.slice(4, 8)), 'ftyp');
    else {
      assert.match(uri.path, /\.webm$/);
      assert.deepEqual([...bytes.slice(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'an EBML (WebM) header');
    }
    assert.ok(bytes.length > 2_000);
  });

  it('encodes WebM in the webview worker (end to end)', async function () {
    this.timeout(120_000);
    const { uri, bytes } = await exportWith('mermaidAnimator.export', 'WebM', 'flow.mmd', { format: 'webm' });
    assert.match(uri.path, /\.webm$/);
    assert.deepEqual([...bytes.slice(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'an EBML (WebM) header');
  });

  it('compiles an animated SVG (end to end)', async function () {
    this.timeout(120_000);
    const { uri, bytes } = await exportWith('mermaidAnimator.export.animatedSvg', 'animated SVG');
    const text = new TextDecoder().decode(bytes);
    assert.match(uri.path, /\.svg$/);
    assert.ok(text.includes('<svg') && text.includes('@keyframes'), 'an animated SVG');
    assert.ok(!/<script/i.test(text) && !/href="https?:/i.test(text), 'no scripts or external references');
  });

  it('writes the HTML player from the webview (end to end)', async function () {
    this.timeout(120_000);
    const { uri, bytes } = await exportWith('mermaidAnimator.export.html', 'HTML player', 'docs.md');
    const html = new TextDecoder().decode(bytes);
    assert.match(uri.path, /\.html$/);
    assert.ok(!/(?:src|href)\s*=\s*["']?https?:/i.test(html) && !/url\(\s*["']?https?:/i.test(html), 'no external URLs');
    assert.ok(html.includes('"version":1'), 'the diagram data is embedded');
  });

  it('stops a running export when it is cancelled (end to end)', async function () {
    this.timeout(120_000);
    const { setSaveTarget } = await api();
    const long = workspaceFile('long.mmd');
    const lines = ['sequenceDiagram'];
    for (let i = 0; i < 60; i++) lines.push(`    A${i % 5}->>A${(i + 1) % 5}: message number ${i + 1}`);
    await write(long, `${lines.join('\n')}\n`);
    try {
      const panel = await animate('long.mmd');
      let target: vscode.Uri | undefined;
      setSaveTarget((suggested) => (target = vscode.Uri.joinPath(exportsDir(), path.posix.basename(suggested.path))));
      panel.reveal();
      await until(() => panel.isActive, 5_000, 'panel active');
      await vscode.commands.executeCommand('mermaidAnimator.export.video', { start: true });
      await until(() => panel.exporting, 60_000, 'export progress');
      panel.cancelExportForTest();
      await new Promise((r) => setTimeout(r, 3_000));
      assert.equal(target, undefined, 'no save dialog was shown');
      assert.equal(await exists(exportsDir()), false, 'nothing was written');
    } finally {
      await closeAll();
      await remove(long);
    }
  });

  it('writes nothing when an animated export is cancelled', async () => {
    const { setSaveTarget } = await api();
    const panel = await animate('flow.mmd');
    const target = vscode.Uri.joinPath(exportsDir(), 'cancelled.gif');
    setSaveTarget(() => target);
    await panel.receiveForTest({ v: 1, type: 'export/progress', payload: { fraction: 0.3, phase: 'encoding' } });
    await until(() => panel.exporting, 5_000, 'progress notification');
    const cancel = nextPost(panel, (m) => m.type === 'export/cancel');
    panel.cancelExportForTest();
    await cancel;
    assert.equal(panel.exporting, false, 'the notification closes');
    // Data that was already on its way is dropped.
    await panel.receiveForTest({ v: 1, type: 'export/data', payload: { format: 'gif', suggestedName: 'cancelled.gif', data: new Uint8Array([71, 73, 70]), index: 0, total: 1 } });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await exists(target), false, 'no file was written');
    // Once the webview confirms, later exports are written again.
    await panel.receiveForTest({ v: 1, type: 'export/cancelled', payload: {} });
    (await api()).setNotificationAnswer(() => undefined);
    await panel.receiveForTest({ v: 1, type: 'export/data', payload: { format: 'gif', suggestedName: 'cancelled.gif', data: new Uint8Array([71, 73, 70]), index: 0, total: 1 } });
    assert.equal(await exists(target), true, 'the next export is written');
  });

  it('inserts a reference below the diagram after its closing fence', async () => {
    const { setSaveTarget } = await api();
    const uri = workspaceFile('docs.md');
    const editor = await openEditor('docs.md');
    const panel = await animate('docs.md', 1);
    const target = vscode.Uri.joinPath(exportsDir(), 'docs-2.svg');
    setSaveTarget(() => target);
    (await api()).setNotificationAnswer((choices) => choices.find((c) => c === 'Insert below diagram'));
    panel.command('last');
    panel.command('exportSvg');
    await nextPost(panel, (m) => m.type === 'export/ack', 30_000);
    const document = editor.document;
    await until(() => document.lineCount > 20 && document.lineAt(20).text.startsWith('!['), 10_000, `inserted reference in:
${document.getText()}`);
    assert.equal(document.lineAt(19).text, '```', 'the closing fence stays in place');
    assert.match(document.lineAt(20).text, /^!\[[^\]]*\]\((\.\/)?exports\/docs-2\.svg\)$/, 'a relative image reference');
    assert.equal(uri.toString(), document.uri.toString());
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  it('starts the save dialog in export.outputDirectory', async () => {
    const { setSaveTarget } = await api();
    const config = vscode.workspace.getConfiguration('mermaidAnimator');
    await config.update('export.outputDirectory', '${workspaceFolder}/exports/out', vscode.ConfigurationTarget.Workspace);
    try {
      const panel = await animate('flow.mmd');
      let suggested: vscode.Uri | undefined;
      setSaveTarget((s) => {
        suggested = s;
        return undefined;
      });
      panel.command('exportSvg');
      await until(() => suggested, 20_000, 'save dialog');
      assert.equal(path.posix.dirname(suggested!.path), vscode.Uri.joinPath(workspaceFile('exports'), 'out').path);
    } finally {
      await config.update('export.outputDirectory', undefined, vscode.ConfigurationTarget.Workspace);
    }
  });

  it('copies a link to the current step and opens it again', async () => {
    const { links, panels } = await api();
    const panel = await animate('docs.md', 1);
    await goTo(panel, 2);
    panel.reveal();
    await until(() => panel.isActive, 5_000, 'panel active');
    await vscode.commands.executeCommand('mermaidAnimator.copyStepLink');
    const link = await until(async () => {
      const text = await vscode.env.clipboard.readText();
      return text.includes('/open?') ? text : undefined;
    }, 5_000, 'clipboard');
    assert.match(link, /^vscode(-insiders)?:\/\/enbinario\.mermaid-animator\/open\?/);
    const query = new URLSearchParams(link.split('?')[1]);
    assert.equal(query.get('path'), 'docs.md');
    assert.equal(query.get('diagram'), '2');
    assert.equal(query.get('n'), '3');
    assert.ok(query.get('step'), 'the step id is included');

    await closeAll();
    await until(() => panels.count === 0, 5_000, 'panels closed');
    const opened = await links.open(vscode.Uri.parse(link));
    assert.ok(opened, 'the link opens a panel');
    assert.equal(opened.uri.toString(), workspaceFile('docs.md').toString());
    assert.equal(opened.diagramIndex, 1);
    await until(() => opened.lastState?.stepIndex === 2, 30_000, 'the linked step');
  });

  it('diagnoses an invalid value in a sidecar through the JSON schema', async () => {
    const sidecar = workspaceFile('flow.mmd.animator.json');
    await write(sidecar, '{\n  "version": 1,\n  "diagrams": {\n    "#1": { "settings": { "playback.speed": "fast" } }\n  }\n}\n');
    try {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(sidecar));
      const problems = await until(() => {
        const d = vscode.languages.getDiagnostics(sidecar);
        return d.length ? d : undefined;
      }, 30_000, 'schema diagnostics');
      assert.ok(problems.some((d) => d.range.start.line === 3), 'on the "fast" value');
    } finally {
      await closeAll();
      await remove(sidecar);
    }
  });

  it('applies sidecar captions, reports dangling keys and updates live', async () => {
    const { sidecars } = await api();
    const source = workspaceFile('docs.md');
    const sidecar = workspaceFile('docs.md.animator.json');
    await write(sidecar, JSON.stringify({ version: 1, diagrams: { '#2': { captions: { '#3': 'Carol answers Alice.', 'gone-step': 'Orphan' }, settings: { 'playback.speed': 1.5 } } } }, null, 2));
    try {
      const panel = await animate('docs.md', 1);
      await goTo(panel, 2);
      assert.equal(panel.lastState?.caption, 'Carol answers Alice.');
      const warnings = await until(() => (sidecars.diagnosticsFor(source).length ? sidecars.diagnosticsFor(source) : undefined), 10_000, 'dangling-key warning');
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0]!.severity, vscode.DiagnosticSeverity.Warning);
      const text = await read(sidecar);
      assert.equal(warnings[0]!.range.start.line, text.split('\n').findIndex((l) => l.includes('gone-step')));

      // Editing the sidecar applies to the open panel without reopening it.
      await write(sidecar, JSON.stringify({ version: 1, diagrams: { '#2': { captions: { '#3': 'Edited caption.' } } } }, null, 2));
      await until(() => sidecars.diagnosticsFor(source).length === 0, 10_000, 'warning cleared');
      await goTo(panel, 1);
      await goTo(panel, 2);
      assert.equal(panel.lastState?.caption, 'Edited caption.');
    } finally {
      await closeAll();
      await remove(sidecar);
    }
  });

  it('saves the topology layout and the diagram defaults into the sidecar', async () => {
    assert.equal(vscode.workspace.isTrusted, true, 'the test workspace is trusted');
    const { panels } = await api();
    const uri = workspaceFile('docs.md');
    const sidecar = workspaceFile('docs.md.animator.json');
    await write(sidecar, '{\n  // Team narration\n  "version": 1,\n  "diagrams": {\n    "#2": { "captions": { "#1": "Alice starts." } }\n  }\n}\n');
    try {
      let panel = await animate('docs.md', 1);
      // Positions from dragging live in workspace state until saved.
      await panel.receiveForTest({ v: 1, type: 'layout/save', payload: { key: '', positions: { Alice: { x: 10, y: 20 } } } });
      panel.reveal();
      await until(() => panel.isActive, 5_000, 'panel active');
      await vscode.commands.executeCommand('mermaidAnimator.saveLayout');
      const saved = await until(async () => {
        const text = await read(sidecar);
        return text.includes('"positions"') ? text : undefined;
      }, 30_000, 'positions in the sidecar');
      assert.ok(saved.includes('// Team narration'), 'comments are preserved');
      assert.ok(saved.includes('"Alice starts."'), 'unrelated content is preserved');
      assert.ok(/"layout": "manual"/.test(saved));
      for (const id of ['Alice', 'Bob', 'Carol']) assert.ok(saved.includes(`"${id}"`), `${id} has a position`);

      panel.reveal();
      await until(() => panel.isActive, 5_000, 'panel active');
      await vscode.commands.executeCommand('mermaidAnimator.saveDefaults');
      const defaults = await until(async () => {
        const text = await read(sidecar);
        return text.includes('"playback.speed"') ? text : undefined;
      }, 30_000, 'defaults in the sidecar');
      assert.ok(defaults.includes('"view.default"'));

      // The workspace-state copy moved into the sidecar.
      panel.dispose();
      await vscode.commands.executeCommand('mermaidAnimator.openDiagram', uri, 1, true);
      panel = panels.find(uri, 1)!;
      const load = await nextPost(panel, (m) => m.type === 'document/load');
      assert.ok(load.type === 'document/load');
      assert.equal(load.payload.layout, undefined, 'workspace-state positions were removed');
      assert.ok(load.payload.sidecar?.layout?.Alice, 'the sidecar positions are loaded');
    } finally {
      await closeAll();
      await remove(sidecar);
    }
  });

  it('hides the save commands in untrusted workspaces', () => {
    const palette: { command: string; when: string }[] = manifest.contributes.menus.commandPalette;
    for (const id of ['mermaidAnimator.saveLayout', 'mermaidAnimator.saveDefaults']) assert.match(palette.find((p) => p.command === id)!.when, /isWorkspaceTrusted/);
    assert.equal(manifest.capabilities.untrustedWorkspaces.supported, 'limited');
  });

  it('lists workspace diagrams and picks up a newly saved file', async () => {
    const { diagrams } = await api();
    await vscode.commands.executeCommand('mermaidAnimator.diagramsView.refresh');
    await diagrams.index.whenScanned();
    const docs = diagrams.tree.snapshot().find((f) => f.file === 'docs.md');
    assert.ok(docs, 'docs.md is listed');
    assert.equal(docs.diagrams.length, 3);
    assert.ok(!diagrams.tree.snapshot().some((f) => f.file === 'plain.md'), 'files without diagrams are not listed');

    const created = workspaceFile('new-diagrams.md');
    await write(created, '# New\n\n```mermaid\nsequenceDiagram\n    title Fresh flow\n    A->>B: hi\n```\n');
    try {
      const entry = await until(() => diagrams.tree.snapshot().find((f) => f.file === 'new-diagrams.md'), 20_000, 'the new file in the view');
      assert.deepEqual(entry.diagrams, ['Fresh flow']);
      await remove(created);
      await until(() => !diagrams.tree.snapshot().some((f) => f.file === 'new-diagrams.md'), 20_000, 'the deleted file leaves the view');
    } finally {
      await remove(created);
    }
  });

  it('opens the walkthrough sample in an untitled editor with its animation beside it', async () => {
    const { panels } = await api();
    await vscode.commands.executeCommand('mermaidAnimator.walkthrough.openSample');
    const panel = await until(() => panels.all().find((p) => p.uri.scheme === 'untitled'), 20_000, 'sample panel');
    await until(() => (panel.lastState?.stepCount ?? 0) > 0, 30_000, 'sample animated');
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === panel.uri.toString());
    assert.ok(editor, 'the sample is open in an editor');
    assert.equal(editor.document.languageId, 'mermaid');
    assert.ok(editor.document.getText().startsWith('sequenceDiagram'));
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });
});
