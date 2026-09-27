import { describe, expect, it } from 'vitest';
import { compileDiagram } from '@mermaid-animator/core';
import { WEBVIEW_STRINGS } from '@mermaid-animator/protocol';
import { announcement } from '../src/announce';
import { DEFAULT_SETTINGS, resolveSettings } from '../src/settings';
import { format } from '../src/state';

describe('resolveSettings', () => {
  it('uses defaults for missing or invalid values', () => {
    expect(resolveSettings({ themeMode: 'auto', 'playback.speed': 'fast', 'camera.mode': 'orbit' })).toEqual(DEFAULT_SETTINGS);
  });

  it.each([
    ['uses 100 % for normal playback when unset', {}, 'playZoom', 1],
    ['uses 150 % for presentations when unset', {}, 'presentationZoom', 1.5],
    ['reads a percentage', { 'camera.playZoom': 80, 'camera.presentationZoom': 80 }, 'playZoom', 0.8],
    ['clamps a zoom below the range to 10 %', { 'camera.playZoom': 5, 'camera.presentationZoom': 5 }, 'presentationZoom', 0.1],
    ['clamps a zoom above the range to 800 %', { 'camera.playZoom': 1000, 'camera.presentationZoom': 1000 }, 'playZoom', 8],
    ['replaces a non-number play zoom with 100 %', { 'camera.playZoom': 'large' }, 'playZoom', 1],
    ['replaces a non-number presentation zoom with 150 %', { 'camera.presentationZoom': 'large' }, 'presentationZoom', 1.5],
  ] as const)('%s', (_name, host, key, expected) => {
    expect(resolveSettings({ themeMode: 'auto', ...host })[key]).toBeCloseTo(expected);
  });

  it('reads VS Code settings and lets @animator annotations override them', () => {
    const d = compileDiagram('%% @animator speed=1.5 future=ghosted camera=follow autoplay=true\nsequenceDiagram\nA->>B: x');
    const s = resolveSettings({ themeMode: 'auto', 'playback.speed': 0.5, 'display.futureSteps': 'visible', 'display.pastSteps': 'muted' }, d.settings);
    expect(s.speed).toBe(1.5);
    expect(s.autoplay).toBe(true);
    expect(s.display.futureSteps).toBe('ghosted');
    expect(s.display.pastSteps).toBe('muted');
    expect(s.camera).toBe('follow');
  });

  it('resolves the M2a settings with annotation overrides', () => {
    const d = compileDiagram('%% @animator branches=ask parallel=sequential camera=cinematic iterations=3\nsequenceDiagram\nA->>B: x');
    const s = resolveSettings({ themeMode: 'auto', 'playback.altBranches': 'all', 'playback.compressRepeats': false, 'display.showCaptions': false }, d.settings);
    expect(s).toMatchObject({ altBranches: 'ask', parallel: 'sequential', camera: 'cinematic', loopIterations: 3, compressRepeats: false, showCaptions: false, showInspector: true });
    expect(resolveSettings({ themeMode: 'auto' }).parallel).toBe('concurrent');
  });

  it('resolves the M2b view and topology settings with annotation overrides', () => {
    const d = compileDiagram('%% @animator view=topology layout=force direction=TB returns=hide\nsequenceDiagram\nA->>B: x');
    const s = resolveSettings({ themeMode: 'auto', 'view.default': 'split', 'topology.edgeStyle': 'orthogonal', 'topology.edgeWeight': 'uniform', 'display.showMinimap': 'never' }, d.settings);
    expect(s).toMatchObject({ view: 'topology', topologyLayout: 'force', direction: 'TB', returnMessages: 'hide', edgeStyle: 'orthogonal', edgeWeight: 'uniform', showMinimap: 'never' });
    expect(resolveSettings({ themeMode: 'auto' })).toMatchObject({ view: 'sequence', topologyLayout: 'layered', direction: 'LR', edgeStyle: 'curved', returnMessages: 'merge', edgeWeight: 'count', showMinimap: 'auto' });
  });

  it('resolves the participant-orientation settings', () => {
    expect(resolveSettings({ themeMode: 'auto' })).toMatchObject({ participantNames: 'auto', arrowEndNames: 'auto' });
    expect(resolveSettings({ themeMode: 'auto', 'display.participantNames': 'off', 'display.arrowEndNames': 'always' })).toMatchObject({ participantNames: 'off', arrowEndNames: 'always' });
    expect(resolveSettings({ themeMode: 'auto', 'display.participantNames': 'sometimes', 'display.arrowEndNames': 7 })).toMatchObject({ participantNames: 'auto', arrowEndNames: 'auto' });
  });

  it('resolves the initial overview from the setting, with the annotation taking precedence', () => {
    expect(resolveSettings({ themeMode: 'auto' }).display.overview).toBe(true);
    expect(resolveSettings({ themeMode: 'auto', 'playback.initialOverview': false }).display.overview).toBe(false);
    const off = compileDiagram('%% @animator overview=false\nsequenceDiagram\nA->>B: x');
    expect(resolveSettings({ themeMode: 'auto', 'playback.initialOverview': true }, off.settings).display.overview).toBe(false);
    const on = compileDiagram('%% @animator overview=true\nsequenceDiagram\nA->>B: x');
    expect(resolveSettings({ themeMode: 'auto', 'playback.initialOverview': false }, on.settings).display.overview).toBe(true);
  });

  it('clamps speed to 0.25–4', () => {
    expect(resolveSettings({ themeMode: 'auto', 'playback.speed': 10 }).speed).toBe(4);
  });
});

describe('announcement', () => {
  const t = (key: string, ...args: (string | number)[]) => format(WEBVIEW_STRINGS, key, ...args);
  const d = compileDiagram('sequenceDiagram\nparticipant G as Gateway\nparticipant A as Auth\nloop Retry\nG->>A: verify token\nend\nNote over A: done');
  const { steps } = d.sequence!.compiled;
  const participants = d.sequence!.model.participants;

  it('describes a message with its fragment context', () => {
    expect(announcement(steps[0], 0, 2, participants, t)).toBe('Step 1 of 2. Gateway to Auth: verify token. In loop Retry.');
  });

  it('describes notes and the initial state', () => {
    expect(announcement(steps[1], 1, 2, participants, t)).toBe('Step 2 of 2. Note: done.');
    expect(announcement(undefined, -1, 2, participants, t)).toBe('Start. 2 steps.');
    expect(announcement(undefined, -1, 12, participants, t, true)).toBe('Overview of the complete diagram. 12 steps.');
  });
});
