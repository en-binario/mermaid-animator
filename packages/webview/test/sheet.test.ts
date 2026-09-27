import { describe, expect, it } from 'vitest';
import { compileDiagram } from '@mermaid-animator/core';
import { estimate, fieldsFor, formatBytes, initialSheet } from '../src/animated/sheet';

const { timeline } = compileDiagram('sequenceDiagram\nA->>B: 1\nB->>A: 2\nA->>B: 3').sequence!;
const context = { rest: 0, chapters: [] };
const defaults = { format: 'gif', fps: 15 as number | undefined, scale: 1, background: 'theme', captions: true };

describe('export sheet', () => {
  it('disables frame rate, loop and end hold for SVG', () => {
    const svg = fieldsFor('svg');
    for (const f of ['fps', 'loop', 'hold', 'camera', 'range'] as const) expect(svg.has(f)).toBe(false);
    expect(svg.has('background')).toBe(true);
  });

  it('enables animation options only where they apply', () => {
    expect(fieldsFor('gif').has('loop')).toBe(true);
    expect(fieldsFor('webm').has('loop')).toBe(false);
    expect(fieldsFor('webm').has('quality')).toBe(true);
    expect(fieldsFor('gif').has('transparent')).toBe(true);
    expect(fieldsFor('mp4').has('transparent')).toBe(false);
    expect(fieldsFor('animated-svg').has('pair')).toBe(true);
    expect(fieldsFor('html').has('fps')).toBe(false);
  });

  it('raises the size but not the duration when the frame rate doubles', () => {
    const at15 = estimate(initialSheet(defaults, true), timeline, { w: 400, h: 300 }, context);
    const at30 = estimate({ ...initialSheet(defaults, true), fps: 30 }, timeline, { w: 400, h: 300 }, context);
    expect(at30.bytes!).toBeGreaterThan(at15.bytes!);
    expect(at30.seconds!).toBeCloseTo(at15.seconds!, 1);
  });

  it('starts from the settings and falls back to WebM without H.264', () => {
    expect(initialSheet({ ...defaults, format: 'mp4' }, false).sheetFormat).toBe('webm');
    expect(initialSheet({ ...defaults, format: 'mp4' }, true).sheetFormat).toBe('mp4');
    expect(initialSheet({ ...defaults, fps: 30, scale: 2 }, true)).toMatchObject({ fps: 30, scale: 2, burnIn: { captions: true } });
  });

  it('uses 15 fps for GIF and 30 fps for video unless a rate is set', () => {
    expect(initialSheet({ ...defaults, fps: undefined }, true)).toMatchObject({ fps: 15, fpsAuto: true });
    expect(initialSheet({ ...defaults, format: 'webm', fps: undefined }, true)).toMatchObject({ fps: 30, fpsAuto: true });
    expect(initialSheet({ ...defaults, fps: 24 }, true)).toMatchObject({ fps: 24, fpsAuto: false });
  });

  it('burns in participant names by default, following display.participantNames', () => {
    expect(initialSheet(defaults, true).burnIn.names).toBe(true);
    expect(initialSheet({ ...defaults, names: false }, true).burnIn.names).toBe(false);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
