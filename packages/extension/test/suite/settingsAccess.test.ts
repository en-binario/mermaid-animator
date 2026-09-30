import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { HostMessage } from '@mermaid-animator/protocol';
import type { AnimatorPanel } from '../../src/panel';
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

describe('Diagram theme menu (theme/set) and the two themes', () => {
  const section = () => vscode.workspace.getConfiguration('mermaidAnimator');
  const inspect = (key: string) => section().inspect<string>(key);
  const settingsOf = (m: HostMessage) => (m.payload as { settings: { diagramTheme: string; uiTheme: string } }).settings;

  async function openPanel(name: string): Promise<AnimatorPanel> {
    const { panels } = await api();
    await openEditor(name);
    await vscode.commands.executeCommand('mermaidAnimator.openToSide');
    const panel = panels.find(workspaceFile(name))!;
    await nextPost(panel, (m) => m.type === 'document/load');
    return panel;
  }

  /** Resolves true when no matching message is posted within `ms`. */
  function silent(panel: AnimatorPanel, predicate: (m: HostMessage) => boolean, ms = 1500): Promise<boolean> {
    return nextPost(panel, predicate, ms).then(
      () => false,
      () => true,
    );
  }

  async function reset(): Promise<void> {
    for (const key of ['theme.diagram', 'theme.mode', 'theme.ui']) {
      await section().update(key, undefined, vscode.ConfigurationTarget.Global);
      await section().update(key, undefined, vscode.ConfigurationTarget.Workspace);
    }
  }

  beforeEach(reset);
  afterEach(async () => {
    await reset();
    await closeAll();
  });

  it('carries both themes, resolving an unset theme.diagram from theme.mode', async () => {
    await section().update('theme.mode', 'graphite', vscode.ConfigurationTarget.Global);
    const panel = await openPanel('flow.mmd');
    const init = nextPost(panel, (m) => m.type === 'init');
    await panel.receiveForTest({ v: 1, type: 'ready', payload: { protocol: 1 } });
    assert.deepEqual(
      { diagramTheme: settingsOf(await init).diagramTheme, uiTheme: settingsOf(await init).uiTheme },
      { diagramTheme: 'graphite', uiTheme: 'vscode' },
    );
  });

  // Diagram theme menu choice matrix (spec visual-theme), host side: where the chosen value is written.
  for (const [row, workspaceKey, before, theme, target] of [
    ['R2', undefined, 'auto', 'forest', 'user'],
    ['R3', undefined, 'forest', 'monochrome', 'user'],
    ['R4', undefined, 'forest', 'auto', 'user'],
    ['R5', 'theme.diagram', 'ivory', 'dark', 'workspace'],
    ['R6', 'theme.mode', 'ivory', 'neutral', 'workspace'],
  ] as const) {
    it(`writes ${theme} to the ${target} settings${workspaceKey ? ` when the workspace defines ${workspaceKey}` : ''} (${row})`, async () => {
      if (workspaceKey) await section().update(workspaceKey, before, vscode.ConfigurationTarget.Workspace);
      else await section().update('theme.diagram', before, vscode.ConfigurationTarget.Global);
      const panel = await openPanel('flow.mmd');
      const changed = nextPost(panel, (m) => m.type === 'settings/changed' && settingsOf(m).diagramTheme === theme);
      await panel.receiveForTest({ v: 1, type: 'theme/set', payload: { theme } });
      await changed;
      const written = inspect('theme.diagram');
      assert.equal(target === 'workspace' ? written?.workspaceValue : written?.globalValue, theme);
      if (target === 'workspace') assert.equal(written?.globalValue, undefined);
      if (workspaceKey === 'theme.mode') assert.equal(inspect('theme.mode')?.workspaceValue, before, 'theme.mode is never written');
    });
  }

  it('switches every open panel', async () => {
    const first = await openPanel('flow.mmd');
    const second = await openPanel('completions.mmd');
    const both = [first, second].map((p) => nextPost(p, (m) => m.type === 'settings/changed' && settingsOf(m).diagramTheme === 'forest'));
    await second.receiveForTest({ v: 1, type: 'theme/set', payload: { theme: 'forest' } });
    for (const message of await Promise.all(both)) assert.equal(settingsOf(message).uiTheme, 'vscode');
  });

  // Diagram theme change message matrix (spec host-webview-protocol).
  const REJECTED = 'Ignored invalid webview message: theme/set payload.theme: expected one of auto, ivory, graphite, highContrast, default, neutral, dark, forest, base, neo, neo-dark, redux, redux-dark, redux-color, redux-dark-color, monochrome';
  for (const [row, payload] of [
    ['R1', { theme: 'sepia' }],
    ['R2', { mode: 'monochrome' }],
  ] as const) {
    it(`ignores and logs an invalid theme/set (${row})`, async () => {
      const panel = await openPanel('flow.mmd');
      const output = (panel as unknown as { output: vscode.LogOutputChannel }).output;
      const warnings: string[] = [];
      const warn = output.warn;
      output.warn = (message: string) => void warnings.push(message);
      try {
        const quiet = silent(panel, (m) => m.type === 'settings/changed');
        panel.receiveRawForTest({ v: 1, type: 'theme/set', payload });
        assert.ok(await quiet, 'no settings/changed');
        assert.deepEqual(warnings, [REJECTED]);
        assert.equal(inspect('theme.diagram')?.globalValue, undefined);
      } finally {
        output.warn = warn;
      }
    });
  }

  it('writes forest and sends it to the panel (R3)', async () => {
    const panel = await openPanel('flow.mmd');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed');
    await panel.receiveForTest({ v: 1, type: 'theme/set', payload: { theme: 'forest' } });
    assert.equal(settingsOf(await changed).diagramTheme, 'forest');
    assert.equal(inspect('theme.diagram')?.globalValue, 'forest');
  });

  it('ignores other payload fields and never writes theme.ui (R4)', async () => {
    await section().update('theme.diagram', 'auto', vscode.ConfigurationTarget.Global);
    const panel = await openPanel('flow.mmd');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed' && settingsOf(m).diagramTheme === 'monochrome');
    await panel.receiveForTest({ v: 1, type: 'theme/set', payload: { theme: 'monochrome', ui: 'graphite' } } as never);
    assert.equal(settingsOf(await changed).uiTheme, 'vscode');
    assert.equal(inspect('theme.ui')?.globalValue, undefined);
  });

  // Live theme change matrix (spec visual-theme), host rows: the deprecated theme.mode.
  it('follows a theme.mode change while theme.diagram is unset (R5)', async () => {
    const panel = await openPanel('flow.mmd');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed');
    await section().update('theme.mode', 'monochrome', vscode.ConfigurationTarget.Global);
    assert.equal(settingsOf(await changed).diagramTheme, 'monochrome');
  });

  it('ignores a theme.mode change once theme.diagram is set (R6)', async () => {
    await section().update('theme.diagram', 'forest', vscode.ConfigurationTarget.Global);
    const panel = await openPanel('flow.mmd');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed');
    await section().update('theme.mode', 'monochrome', vscode.ConfigurationTarget.Global);
    assert.equal(settingsOf(await changed).diagramTheme, 'forest');
  });

  it('reports a failed write and keeps the drawing', async () => {
    const panel = await openPanel('flow.mmd');
    const errors: string[] = [];
    const workspace = vscode.workspace as { getConfiguration: typeof vscode.workspace.getConfiguration };
    const window = vscode.window as { showErrorMessage: typeof vscode.window.showErrorMessage };
    const getConfiguration = workspace.getConfiguration;
    const showErrorMessage = window.showErrorMessage;
    workspace.getConfiguration = ((name?: string, scope?: vscode.ConfigurationScope | null) => {
      const real = getConfiguration(name, scope);
      if (name !== 'mermaidAnimator') return real;
      // The real object's members are read-only: wrap it instead of patching it.
      return {
        get: real.get.bind(real),
        has: real.has.bind(real),
        inspect: real.inspect.bind(real),
        update: () => Promise.reject(new Error('Unable to write into user settings because the file has unsaved changes.')),
      } as unknown as vscode.WorkspaceConfiguration;
    }) as typeof getConfiguration;
    window.showErrorMessage = (async (message: string) => {
      errors.push(message);
      return undefined;
    }) as typeof showErrorMessage;
    try {
      const quiet = silent(panel, (m) => m.type === 'settings/changed');
      await panel.receiveForTest({ v: 1, type: 'theme/set', payload: { theme: 'forest' } });
      assert.deepEqual(errors, ['Could not change the Mermaid Animator diagram theme: Unable to write into user settings because the file has unsaved changes.']);
      assert.ok(await quiet, 'no settings/changed');
    } finally {
      workspace.getConfiguration = getConfiguration;
      window.showErrorMessage = showErrorMessage;
    }
    assert.equal(inspect('theme.diagram')?.globalValue, undefined);
  });
});
