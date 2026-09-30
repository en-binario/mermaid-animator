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

describe('Theme menu (theme/set)', () => {
  const section = () => vscode.workspace.getConfiguration('mermaidAnimator');
  const themeMode = () => section().inspect<string>('theme.mode');
  const themeOf = (m: HostMessage) => (m.payload as { settings: { themeMode: string } }).settings.themeMode;

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
    await section().update('theme.mode', undefined, vscode.ConfigurationTarget.Global);
    await section().update('theme.mode', undefined, vscode.ConfigurationTarget.Workspace);
  }

  afterEach(async () => {
    await reset();
    await closeAll();
  });

  // Theme menu choice matrix (spec visual-theme), host side: where the chosen value is written.
  for (const [item, before, mode] of [
    ['Follow editor theme', 'graphite', 'auto'],
    ['Ivory', 'graphite', 'ivory'],
    ['Graphite', 'ivory', 'graphite'],
    ['High contrast', 'graphite', 'highContrast'],
    ['Monochrome', 'graphite', 'monochrome'],
  ] as const) {
    it(`writes ${mode} to the user settings when ${item} is chosen`, async () => {
      await section().update('theme.mode', before, vscode.ConfigurationTarget.Global);
      const panel = await openPanel('flow.mmd');
      const changed = nextPost(panel, (m) => m.type === 'settings/changed' && themeOf(m) === mode);
      await panel.receiveForTest({ v: 1, type: 'theme/set', payload: { mode } });
      await changed;
      assert.equal(themeMode()?.globalValue, mode);
      assert.equal(themeMode()?.workspaceValue, undefined);
    });
  }

  it('writes to the workspace settings when the workspace defines the theme mode', async () => {
    await section().update('theme.mode', 'ivory', vscode.ConfigurationTarget.Workspace);
    const panel = await openPanel('flow.mmd');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed' && themeOf(m) === 'monochrome');
    await panel.receiveForTest({ v: 1, type: 'theme/set', payload: { mode: 'monochrome' } });
    await changed;
    assert.equal(themeMode()?.workspaceValue, 'monochrome');
    assert.equal(themeMode()?.globalValue, undefined);
  });

  it('switches every open panel', async () => {
    const first = await openPanel('flow.mmd');
    const second = await openPanel('completions.mmd');
    const both = [first, second].map((p) => nextPost(p, (m) => m.type === 'settings/changed' && themeOf(m) === 'monochrome'));
    await second.receiveForTest({ v: 1, type: 'theme/set', payload: { mode: 'monochrome' } });
    await Promise.all(both);
  });

  // Theme change message matrix (spec host-webview-protocol).
  for (const [label, payload] of [
    ['an unknown mode', { mode: 'neon' }],
    ['no mode', {}],
  ] as const) {
    it(`ignores and logs theme/set with ${label}`, async () => {
      const panel = await openPanel('flow.mmd');
      const output = (panel as unknown as { output: vscode.LogOutputChannel }).output;
      const warnings: string[] = [];
      const warn = output.warn;
      output.warn = (message: string) => void warnings.push(message);
      try {
        const quiet = silent(panel, (m) => m.type === 'settings/changed');
        panel.receiveRawForTest({ v: 1, type: 'theme/set', payload });
        assert.ok(await quiet, 'no settings/changed');
        assert.deepEqual(warnings, ['Ignored invalid webview message: theme/set payload.mode: expected one of auto, ivory, graphite, highContrast, monochrome']);
        assert.equal(themeMode()?.globalValue, undefined);
      } finally {
        output.warn = warn;
      }
    });
  }

  it('writes monochrome and sends it to the panel', async () => {
    const panel = await openPanel('flow.mmd');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed');
    await panel.receiveForTest({ v: 1, type: 'theme/set', payload: { mode: 'monochrome' } });
    assert.equal(themeOf(await changed), 'monochrome');
    assert.equal(themeMode()?.globalValue, 'monochrome');
  });

  it('ignores other payload fields and writes no other setting', async () => {
    const colorTheme = vscode.workspace.getConfiguration('workbench').inspect('colorTheme');
    const panel = await openPanel('flow.mmd');
    const changed = nextPost(panel, (m) => m.type === 'settings/changed');
    await panel.receiveForTest({ v: 1, type: 'theme/set', payload: { mode: 'ivory', key: 'workbench.colorTheme' } } as never);
    assert.equal(themeOf(await changed), 'ivory');
    assert.equal(themeMode()?.globalValue, 'ivory');
    assert.deepEqual(vscode.workspace.getConfiguration('workbench').inspect('colorTheme'), colorTheme);
  });

  it('reports a failed write and keeps the palette', async () => {
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
      await panel.receiveForTest({ v: 1, type: 'theme/set', payload: { mode: 'monochrome' } });
      assert.deepEqual(errors, ['Could not change the Mermaid Animator theme: Unable to write into user settings because the file has unsaved changes.']);
      assert.ok(await quiet, 'no settings/changed');
    } finally {
      workspace.getConfiguration = getConfiguration;
      window.showErrorMessage = showErrorMessage;
    }
    assert.equal(themeMode()?.globalValue, undefined);
  });
});
