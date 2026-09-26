import { describe, expect, it } from 'vitest';
import { applyPatch, entryFor, locateEntry, parseSidecar, rawEntryKey } from '../src/sidecarFormat';

const text = `{
  // Shared narration for docs/auth.md
  "version": 1,
  "diagrams": {
    "sign-in": {
      "settings": { "view.default": "split", "playback.speed": 1.25 },
      "captions": {
        "lookup-user": "Auth looks the user up by e-mail address.",
        "#4": "The database returns the hashed password.",
      },
      "chapters": [
        { "title": "Credentials", "firstStep": "#1" },
        { "title": "Session", "firstStep": "#7" }
      ],
      "topology": { "layout": "manual", "positions": { "U": [40, 160], "G": [260, 160] } }
    },
    "#2": { "settings": { "flowchart.order": "token" } }
  }
}
`;

describe('sidecar format', () => {
  it('parses JSONC and finds diagrams by @id, then by #index', () => {
    const file = parseSidecar(text);
    expect(rawEntryKey(file, { id: 'sign-in', index: 0 })).toBe('sign-in');
    expect(rawEntryKey(file, { index: 1 })).toBe('#2');
    expect(rawEntryKey(file, { id: 'other', index: 4 })).toBeUndefined();
  });

  it('converts the file entry into the protocol entry', () => {
    expect(entryFor(parseSidecar(text), { id: 'sign-in', index: 0 })).toEqual({
      settings: { 'view.default': 'split', 'playback.speed': 1.25, 'topology.layout': 'manual' },
      captions: { 'lookup-user': 'Auth looks the user up by e-mail address.', '#4': 'The database returns the hashed password.' },
      chapters: { '#1': 'Credentials', '#7': 'Session' },
      layout: { U: { x: 40, y: 160 }, G: { x: 260, y: 160 } },
    });
  });

  it('locates dangling caption and chapter keys for diagnostics', () => {
    const caption = locateEntry(text, 'sign-in', { section: 'captions', key: 'lookup-user' })!;
    expect(text.slice(caption.offset, caption.offset + caption.length)).toBe('"lookup-user"');
    const chapter = locateEntry(text, 'sign-in', { section: 'chapters', key: '#7' })!;
    expect(text.slice(chapter.offset, chapter.offset + chapter.length)).toBe('"#7"');
  });

  it('patches positions and settings keeping comments and unrelated content', () => {
    const next = applyPatch(text, 'sign-in', { positions: { U: { x: 10.4, y: 20.6 } }, settings: { 'camera.mode': 'cinematic' } });
    expect(next).toContain('// Shared narration for docs/auth.md');
    expect(next).toContain('"flowchart.order": "token"');
    const entry = entryFor(parseSidecar(next), { id: 'sign-in', index: 0 })!;
    expect(entry.layout).toEqual({ U: { x: 10, y: 21 } });
    expect(entry.settings).toMatchObject({ 'camera.mode': 'cinematic', 'playback.speed': 1.25 });
    expect(entry.captions?.['#4']).toBe('The database returns the hashed password.');
  });

  it('creates a new sidecar with a version', () => {
    const created = applyPatch('', '#1', { settings: { 'playback.speed': 2 } });
    expect(JSON.parse(created)).toEqual({ version: 1, diagrams: { '#1': { settings: { 'playback.speed': 2 } } } });
  });
});
