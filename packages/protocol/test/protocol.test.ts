import { describe, expect, it } from 'vitest';
import { hostMessage, PROTOCOL_VERSION, validateHostMessage, validateWebviewMessage, webviewMessage } from '../src/index';

const settings = { themeMode: 'auto' as const };
const origin = { line: 0, character: 0 };

describe('host messages', () => {
  const valid = [
    hostMessage('init', { settings, themeKind: 'dark', reduceMotion: null, locale: 'en', strings: { play: 'Play' } }),
    hostMessage('document/load', { uri: 'file:///a.mmd', fileName: 'a.mmd', source: 'sequenceDiagram', version: 1, origin }),
    hostMessage('document/update', { source: 'x', version: 2, origin }),
    hostMessage('settings/changed', { settings, themeKind: 'light', reduceMotion: true }),
    hostMessage('document/load', {
      uri: 'u', fileName: 'a.md', source: 's', version: 1, origin: { line: 4, character: 0 }, diagramIndex: 1,
      diagrams: [{ index: 0, type: 'sequence', summary: 'A->>B: x' }, { index: 1, type: 'flowchart', title: 'T', summary: 'A-->B' }],
    }),
    hostMessage('command', { action: 'next' }),
    hostMessage('command', { action: 'goToStep', args: { step: 3 } }),
    hostMessage('editor/cursor', { line: 3, character: 2 }),
    hostMessage('export/ack', { path: '/tmp/a.png' }),
    hostMessage('command', { action: 'seekToLine', args: { line: 17 } }),
    hostMessage('command', { action: 'nextChapter' }),
    hostMessage('presentation/state', { on: false }),
    hostMessage('command', { action: 'setView', args: { view: 'split' } }),
    hostMessage('document/load', { uri: 'u', fileName: 'a.md', source: 's', version: 1, origin, layout: { A: { x: 10, y: 20 } } }),
  ];

  it.each(valid)('accepts $type', (message) => {
    expect(validateHostMessage(message)).toEqual({ ok: true, message });
  });

  it('stamps the protocol version', () => {
    expect(valid.every((m) => m.v === PROTOCOL_VERSION)).toBe(true);
  });

  it.each([
    ['non-object', 'hello'],
    ['null', null],
    ['missing version', { type: 'document/load', payload: {} }],
    ['wrong version', { v: 2, type: 'init', payload: {} }],
    ['unknown type', { v: 1, type: 'nope', payload: {} }],
    ['missing payload', { v: 1, type: 'document/load' }],
    ['bad field type', { v: 1, type: 'document/update', payload: { source: 1, version: 2, origin } }],
    ['bad enum', { v: 1, type: 'settings/changed', payload: { settings: { themeMode: 'neon' }, themeKind: 'dark', reduceMotion: null } }],
    ['bad theme kind', { v: 1, type: 'settings/changed', payload: { settings, themeKind: 'sepia', reduceMotion: null } }],
    ['non-string id', { v: 1, id: 3, type: 'document/update', payload: { source: '', version: 1, origin } }],
    ['unknown command', { v: 1, type: 'command', payload: { action: 'explode' } }],
    ['bad diagram list', { v: 1, type: 'document/load', payload: { uri: 'u', fileName: 'f', source: 's', version: 1, origin, diagrams: [{ index: 'x' }] } }],
    ['non-string strings', { v: 1, type: 'init', payload: { settings, themeKind: 'dark', reduceMotion: null, locale: 'en', strings: { a: 1 } } }],
  ])('rejects %s', (_label, value) => {
    const result = validateHostMessage(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('keeps extra settings keys for forward compatibility', () => {
    const message = hostMessage('settings/changed', { settings: { themeMode: 'ivory', future: 1 }, themeKind: 'dark', reduceMotion: false });
    expect(validateHostMessage(message).ok).toBe(true);
  });
});

describe('webview messages', () => {
  it.each([
    webviewMessage('ready', { protocol: 1 }),
    webviewMessage('state/changed', { stepIndex: 2, playing: true }),
    webviewMessage('log', { level: 'warn', message: 'careful' }),
    webviewMessage('state/changed', { stepIndex: 1, sourceRanges: [{ startLine: 1, startCol: 0, endLine: 1, endCol: 5 }] }),
    webviewMessage('diagram/select', { index: 2 }),
    webviewMessage('source/reveal', { range: { startLine: 1, startCol: 0, endLine: 1, endCol: 5 } }),
    webviewMessage('export/data', { format: 'png', suggestedName: 'a.png', data: new Uint8Array([1, 2]), index: 0, total: 1 }),
    webviewMessage('export/player', { suggestedName: 'a.html', title: 'A', data: '{}', theme: 'monochrome' }),
    webviewMessage('clipboard/fallback', { reason: 'denied' }),
    webviewMessage('presentation/toggle', { on: true }),
    webviewMessage('layout/save', { key: 'checkout', positions: { A: { x: 1, y: 2 } } }),
    webviewMessage('settings/open', {}),
  ])('accepts $type', (message) => {
    expect(validateWebviewMessage(message).ok).toBe(true);
  });

  it.each([
    ['ready without protocol', { v: 1, type: 'ready', payload: {} }],
    ['log with bad level', { v: 1, type: 'log', payload: { level: 'debug', message: 'x' } }],
    ['state that is not an object', { v: 1, type: 'state/changed', payload: [] }],
    ['host-only type', { v: 1, type: 'init', payload: {} }],
    ['export without bytes', { v: 1, type: 'export/data', payload: { format: 'png', suggestedName: 'a', data: 'AAA', index: 0, total: 1 } }],
    ['player with an unknown theme', { v: 1, type: 'export/player', payload: { suggestedName: 'a.html', title: 'A', data: '{}', theme: 'sepia' } }],
    ['layout save with a bad position', { v: 1, type: 'layout/save', payload: { key: 'k', positions: { A: { x: 'a', y: 1 } } } }],
    ['presentation toggle without a flag', { v: 1, type: 'presentation/toggle', payload: {} }],
    ['bad source ranges', { v: 1, type: 'state/changed', payload: { sourceRanges: [{ startLine: 'x' }] } }],
  ])('rejects %s', (_label, value) => {
    expect(validateWebviewMessage(value).ok).toBe(false);
  });
});
