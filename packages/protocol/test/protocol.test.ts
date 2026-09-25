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
  ])('accepts $type', (message) => {
    expect(validateWebviewMessage(message).ok).toBe(true);
  });

  it.each([
    ['ready without protocol', { v: 1, type: 'ready', payload: {} }],
    ['log with bad level', { v: 1, type: 'log', payload: { level: 'debug', message: 'x' } }],
    ['state that is not an object', { v: 1, type: 'state/changed', payload: [] }],
    ['host-only type', { v: 1, type: 'init', payload: {} }],
  ])('rejects %s', (_label, value) => {
    expect(validateWebviewMessage(value).ok).toBe(false);
  });
});
