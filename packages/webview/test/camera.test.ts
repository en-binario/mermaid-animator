import { describe, expect, it } from 'vitest';
import { autoFits, fitView, followView, limitZoomChange } from '../src/camera';

const viewport = { width: 1000, height: 600 };

describe('fitView', () => {
  it('centres and scales content to fit, never enlarging past 1.25×', () => {
    const v = fitView({ x: 0, y: 0, w: 1904, h: 552 }, viewport); // (1000 − 2·24) / 1904 = 0.5
    expect(v.k).toBeCloseTo(0.5, 5);
    expect(v.x + 952 * v.k).toBeCloseTo(500);
    expect(fitView({ x: 0, y: 0, w: 100, h: 50 }, viewport).k).toBe(1.25);
  });

  it('decides Auto mode from the 0.75× threshold', () => {
    expect(autoFits({ x: 0, y: 0, w: 1200, h: 700 }, viewport)).toBe(true);
    expect(autoFits({ x: 0, y: 0, w: 1400, h: 3000 }, viewport)).toBe(false);
  });
});

describe('followView', () => {
  const view = { x: 0, y: 0, k: 1 };

  it('does not move while the step is inside the central 80%', () => {
    expect(followView(view, { x: 300, y: 200, w: 200, h: 40 }, viewport)).toBeUndefined();
  });

  it('pans the minimum distance to bring a step below the viewport back with padding', () => {
    const next = followView(view, { x: 300, y: 700, w: 200, h: 40 }, viewport)!;
    expect(next.k).toBe(1);
    expect(next.x).toBe(0);
    const bottom = 740 + next.y;
    expect(bottom + 24).toBeCloseTo(600 * 0.9);
  });

  it('zooms out by at most 1.6× when the step is larger than the viewport', () => {
    const next = followView(view, { x: 0, y: 0, w: 3000, h: 40 }, viewport)!;
    expect(next.k).toBeCloseTo(1 / 1.6);
  });

  it('caps zoom changes', () => {
    expect(limitZoomChange(1, 4)).toBeCloseTo(1.6);
    expect(limitZoomChange(1, 0.1)).toBeCloseTo(0.625);
    expect(limitZoomChange(1, 1.2)).toBe(1.2);
  });
});
