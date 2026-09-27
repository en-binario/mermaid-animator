import { describe, expect, it } from 'vitest';
import { autoFits, cinematicView, fitView, focusTarget, followStartView, followView, limitZoomChange, overviewExitView, ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS, zoomAbout } from '../src/camera';

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

describe('cinematicView', () => {
  const viewport = { width: 800, height: 600 };

  it('frames a message tightly with 48 px padding, centred', () => {
    const target = { x: 100, y: 200, w: 160, h: 40 };
    const v = cinematicView(target, viewport, { x: 0, y: 0, k: 2 });
    // 800 / (160 + 96) = 3.125, capped at 2.5 and within 1.6× of 2.
    expect(v.k).toBeCloseTo(2.5);
    expect(v.x + (target.x + target.w / 2) * v.k).toBeCloseTo(400);
    expect(v.y + (target.y + target.h / 2) * v.k).toBeCloseTo(300);
  });

  it('changes zoom by at most 1.6x in one move', () => {
    const wide = { x: 0, y: 0, w: 4000, h: 100 };
    expect(cinematicView(wide, viewport, { x: 0, y: 0, k: 1 }).k).toBeCloseTo(1 / 1.6);
    const tiny = { x: 0, y: 0, w: 10, h: 10 };
    expect(cinematicView(tiny, viewport, { x: 0, y: 0, k: 1 }).k).toBeCloseTo(1.6);
  });
});

describe('focusTarget', () => {
  const participants = [
    { id: 'A', header: { x: 0, y: 0, w: 100, h: 40 } },
    { id: 'B', header: { x: 200, y: 0, w: 100, h: 40 } },
    { id: 'C', header: { x: 400, y: 0, w: 120, h: 40 } },
  ];
  const step = { x: 50, y: 300, w: 200, h: 40 };

  it('spans the focused columns over the step rows', () => {
    expect(focusTarget(step, participants, ['A', 'C'])).toEqual({ x: 0, y: 300, w: 520, h: 40 });
  });

  it('falls back to the step bounds without known participants', () => {
    expect(focusTarget(step, participants, undefined)).toBe(step);
    expect(focusTarget(step, participants, ['Z'])).toBe(step);
  });
});

describe('overviewExitView', () => {
  const viewport = { width: 800, height: 600 };
  const content = { x: 0, y: 0, w: 1200, h: 4000 };

  it('zooms back in from the fitted overview to the follow starting zoom', () => {
    const overview = fitView(content, viewport);
    const view = overviewExitView(content, { x: 100, y: 80, w: 300, h: 40 }, viewport);
    expect(view.k).toBeCloseTo(followStartView(content, viewport).k);
    expect(view.k).toBeGreaterThan(overview.k);
    expect(view.k).toBeLessThanOrEqual(1);
  });

  it('brings a step further down into the safe area', () => {
    const step = { x: 100, y: 2500, w: 300, h: 40 };
    const view = overviewExitView(content, step, viewport);
    const top = step.y * view.k + view.y;
    expect(top).toBeGreaterThanOrEqual(viewport.height * 0.1);
    expect(top + step.h * view.k).toBeLessThanOrEqual(viewport.height * 0.9);
  });

  it('never enlarges a narrow diagram past 100 %', () => {
    expect(followStartView({ x: 0, y: 0, w: 200, h: 3000 }, viewport).k).toBe(1);
  });
});

describe('following from a user view', () => {
  const viewport = { width: 800, height: 600 };

  it('keeps the user zoom and pans the minimum to bring the step back', () => {
    const user = { k: 2, x: -1500, y: -900 };
    const step = { x: 100, y: 100, w: 120, h: 30 };
    const next = followView(user, step, viewport)!;
    expect(next.k).toBe(2);
    const sx = step.x * next.k + next.x;
    const sy = step.y * next.k + next.y;
    expect(sx).toBeGreaterThanOrEqual(viewport.width * 0.1);
    expect(sy).toBeGreaterThanOrEqual(viewport.height * 0.1);
    expect(sx + step.w * next.k).toBeLessThanOrEqual(viewport.width * 0.9);
  });
});

describe('zoomAbout', () => {
  it('keeps the chosen screen point fixed', () => {
    const view = { k: 1, x: -200, y: -100 };
    const centre = { x: 400, y: 300 };
    const next = zoomAbout(view, 0.5, centre);
    expect(next.k).toBe(0.5);
    // The drawing point under the centre stays under the centre.
    const before = { x: (centre.x - view.x) / view.k, y: (centre.y - view.y) / view.k };
    expect(before.x * next.k + next.x).toBeCloseTo(centre.x);
    expect(before.y * next.k + next.y).toBeCloseTo(centre.y);
  });

  it('clamps to the zoom range', () => {
    expect(zoomAbout({ k: 1, x: 0, y: 0 }, 20, { x: 0, y: 0 }).k).toBe(ZOOM_MAX);
    expect(zoomAbout({ k: 1, x: 0, y: 0 }, 0.01, { x: 0, y: 0 }).k).toBe(ZOOM_MIN);
  });

  it('offers the presets from 25 % to 400 %', () => {
    expect(ZOOM_PRESETS.map((k) => Math.round(k * 100))).toEqual([25, 50, 75, 100, 150, 200, 400]);
  });
});
