import { describe, expect, it } from 'vitest';
import { hostMessage } from '@mermaid-animator/protocol';
import { format, initialHostState, reduce, resolveReduceMotion } from '../src/state';

const origin = { line: 0, character: 0 };

describe('reduce', () => {
  it('applies init', () => {
    const next = reduce(initialHostState, hostMessage('init', { settings: { themeMode: 'ivory' }, themeKind: 'light', reduceMotion: true, locale: 'es', strings: { a: 'b' } }));
    expect(next).toMatchObject({ initialized: true, settings: { themeMode: 'ivory' }, themeKind: 'light', reduceMotionPreference: true, locale: 'es', strings: { a: 'b' } });
  });

  it('loads and updates a document, ignoring stale versions', () => {
    const loaded = reduce(initialHostState, hostMessage('document/load', { uri: 'u', fileName: 'a.mmd', source: 'v1', version: 2, origin }));
    const updated = reduce(loaded, hostMessage('document/update', { source: 'v3', version: 3, origin }));
    expect(updated.document?.source).toBe('v3');
    const stale = reduce(updated, hostMessage('document/update', { source: 'old', version: 1, origin }));
    expect(stale.document?.source).toBe('v3');
  });

  it('ignores updates before any document is loaded', () => {
    expect(reduce(initialHostState, hostMessage('document/update', { source: 'x', version: 1, origin }))).toBe(initialHostState);
  });

  it('applies settings changes without dropping the document', () => {
    const loaded = reduce(initialHostState, hostMessage('document/load', { uri: 'u', fileName: 'a.mmd', source: 's', version: 1, origin }));
    const next = reduce(loaded, hostMessage('settings/changed', { settings: { themeMode: 'graphite' }, themeKind: 'light', reduceMotion: false }));
    expect(next.settings.themeMode).toBe('graphite');
    expect(next.document?.source).toBe('s');
  });
});

describe('resolveReduceMotion', () => {
  it('prefers the editor setting and falls back to the OS', () => {
    expect(resolveReduceMotion(true, false)).toBe(true);
    expect(resolveReduceMotion(false, true)).toBe(false);
    expect(resolveReduceMotion(null, true)).toBe(true);
    expect(resolveReduceMotion(null, false)).toBe(false);
  });
});

describe('format', () => {
  it('substitutes placeholders and falls back to the key', () => {
    expect(format({ lines: '{0} lines' }, 'lines', 12)).toBe('12 lines');
    expect(format({}, 'missing')).toBe('missing');
  });
});
