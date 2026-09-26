import { describe, expect, it } from 'vitest';
import { compileDiagram } from '@mermaid-animator/core';
import { resolveGenericSidecar, resolveSidecar, withSidecarSettings } from '../src/sidecar';
import { resolveSettings } from '../src/settings';

const source = 'sequenceDiagram\nU->>G: login\n%% @step-id lookup-user\nG->>A: verify\nA->>D: query\nD-->>A: hash';
const steps = compileDiagram(source).sequence!.compiled.steps;

describe('sidecar entries', () => {
  it('resolves captions and chapters by #n, step id and structural id', () => {
    const resolved = resolveSidecar(steps, {
      captions: { '#3': 'Auth looks the user up.', 'lookup-user': 'Pinned', [steps[3]!.structuralId]: 'By structure' },
      chapters: { '#1': 'Credentials' },
    });
    expect(resolved.stepCaptions).toEqual({ 2: 'Auth looks the user up.', 1: 'Pinned', 3: 'By structure' });
    expect(resolved.stepChapters).toEqual({ 0: 'Credentials' });
    expect(resolved.unresolved).toEqual([]);
  });

  it('reports keys that no longer resolve instead of dropping them silently', () => {
    const resolved = resolveSidecar(steps, { captions: { 'gone-step': 'x', '#40': 'y' }, chapters: { removed: 'Session' } });
    expect(resolved.unresolved).toEqual([
      { section: 'captions', key: 'gone-step' },
      { section: 'captions', key: '#40' },
      { section: 'chapters', key: 'removed' },
    ]);
  });

  it('keeps a caption when the label is edited (content id → structural id)', () => {
    const key = steps[2]!.structuralId;
    const edited = compileDiagram(source.replace('query', 'select user')).sequence!.compiled.steps;
    expect(resolveSidecar(edited, { captions: { [key]: 'Still here' } }).stepCaptions).toEqual({ 2: 'Still here' });
  });

  it('resolves only step numbers for generic diagrams', () => {
    const resolved = resolveGenericSidecar(3, { captions: { '#2': 'Second', 'node-a': 'x' } });
    expect(resolved.stepCaptions).toEqual({ 1: 'Second' });
    expect(resolved.unresolved).toEqual([{ section: 'captions', key: 'node-a' }]);
  });

  it('applies sidecar settings above host settings and below annotations', () => {
    const host = { themeMode: 'auto' as const, 'playback.speed': 1, 'view.default': 'sequence' };
    const merged = withSidecarSettings(host, { settings: { 'playback.speed': 1.25, 'view.default': 'split' } });
    const annotations = compileDiagram('sequenceDiagram\n%% @animator view=topology\nA->>B: x').settings;
    const effective = resolveSettings(merged, annotations);
    expect(effective.speed).toBe(1.25);
    expect(effective.view).toBe('topology');
  });
});
