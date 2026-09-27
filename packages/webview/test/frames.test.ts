import { describe, expect, it } from 'vitest';
import { compileDiagram, stepEnd } from '@mermaid-animator/core';
import { cameraAt, exportRange, exportSeconds, fitFrame, framePlan, frameTime } from '../src/animated/frames';

describe('frame-exact timing', () => {
  it('yields 345 frames for 10 s at 30 fps with a 1.5 s hold', () => {
    const plan = framePlan({ start: 0, end: 10_000 }, 30, 1, 1.5);
    expect(plan).toMatchObject({ moving: 300, hold: 45, total: 345 });
    expect(exportSeconds(plan)).toBe(11.5);
  });

  it('samples frame n at start + n / fps × speed and holds the last instant', () => {
    const range = { start: 2000, end: 12_000 };
    const plan = framePlan(range, 30, 1, 1.5);
    expect(frameTime(range, plan, 0)).toBe(2000);
    expect(frameTime(range, plan, 90)).toBe(5000);
    expect(frameTime(range, plan, 299)).toBeCloseTo(11_966.67, 1);
    expect(frameTime(range, plan, 300)).toBe(12_000);
    expect(frameTime(range, plan, 344)).toBe(12_000);
  });

  it('frame 90 of a 30 fps export from the beginning is the scene at 3.0 s', () => {
    const range = { start: 0, end: 10_000 };
    expect(frameTime(range, framePlan(range, 30, 1, 0), 90)).toBe(3000);
  });

  it('accounts for speed in both the count and the sampling', () => {
    const range = { start: 0, end: 10_000 };
    const plan = framePlan(range, 30, 2, 0);
    expect(plan.total).toBe(150);
    expect(frameTime(range, plan, 30)).toBe(2000);
  });

  it('rounds partial frames up', () => {
    expect(framePlan({ start: 0, end: 1010 }, 30, 1, 0).moving).toBe(31);
  });
});

describe('export ranges', () => {
  const { timeline } = compileDiagram('sequenceDiagram\nA->>B: 1\nB->>A: 2\nA->>B: 3\nB->>A: 4\nA->>B: 5').sequence!;
  const chapters = [{ firstStep: 0 }, { firstStep: 3 }];

  it('covers everything, a chapter, an A–B range or one step', () => {
    expect(exportRange('all', timeline, { rest: 1, chapters })).toEqual({ start: 0, end: timeline.duration });
    expect(exportRange('chapter', timeline, { rest: 3, chapters })).toEqual({ start: stepEnd(timeline, 2), end: stepEnd(timeline, 4) });
    expect(exportRange('chapter', timeline, { rest: 1, chapters })).toEqual({ start: 0, end: stepEnd(timeline, 2) });
    expect(exportRange('ab', timeline, { rest: 0, chapters, ab: { from: 1, to: 3 } })).toEqual({ start: stepEnd(timeline, 1), end: stepEnd(timeline, 3) });
    expect(exportRange('step', timeline, { rest: 2, chapters })).toEqual({ start: stepEnd(timeline, 1), end: stepEnd(timeline, 2) });
  });
});

describe('export camera', () => {
  it('fits content into the frame with padding', () => {
    expect(fitFrame({ x: 0, y: 0, w: 200, h: 100 }, 440, 240, 20)).toEqual({ k: 2, x: 20, y: 20 });
  });

  it('glides between step framings', () => {
    const camera = { kind: 'steps' as const, initial: { x: 0, y: 0, k: 1 }, views: [{ x: 100, y: 0, k: 2 }], starts: [1000], glide: [400] };
    expect(cameraAt(camera, 500)).toEqual({ x: 0, y: 0, k: 1 });
    expect(cameraAt(camera, 1200)).toEqual({ x: 50, y: 0, k: 1.5 });
    expect(cameraAt(camera, 2000)).toEqual({ x: 100, y: 0, k: 2 });
  });
});

describe('animated SVG file names', () => {
  it('names single files and light/dark pairs', async () => {
    const { animatedSvgNames } = await import('../src/animated/svgExport');
    expect(animatedSvgNames('checkout', false)).toEqual(['checkout.anim.svg']);
    expect(animatedSvgNames('checkout', true)).toEqual(['checkout.light.anim.svg', 'checkout.dark.anim.svg']);
  });
});

describe('export ranges with the initial overview', () => {
  const timeline = compileDiagram('sequenceDiagram\nA->>B: one\nB->>A: two', { overview: true, dwellMs: 900 }).sequence!.timeline;

  it('starts full exports on the overview and includes its dwell and clear', () => {
    const range = exportRange('all', timeline, { rest: -1, chapters: [] });
    expect(range).toEqual({ start: 0, end: timeline.duration });
    expect(timeline.starts[0]).toBe(900);
    expect(timeline.clear).toBeGreaterThan(0);
  });

  it('includes the overview when exporting the first step', () => {
    expect(exportRange('step', timeline, { rest: 0, chapters: [] }).start).toBe(0);
  });
});
