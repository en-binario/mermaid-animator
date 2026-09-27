import { describe, expect, it } from 'vitest';
import type { Rect } from '@mermaid-animator/core';
import { autoFits, cinematicView, clampToContent, fitView, focusTarget, framingFor, isZoomChange, limitZoomChange, nextSessionZoom, playStartView, playView, type SessionZoom, type SessionZoomEvent, type View, type Viewport, ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS, zoomAbout } from '../src/camera';

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

describe('limitZoomChange', () => {
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

/** Screen-space box of `r` under `v`. */
const onScreen = (r: Rect, v: View) => ({ x0: r.x * v.k + v.x, x1: (r.x + r.w) * v.k + v.x, y0: r.y * v.k + v.y, y1: (r.y + r.h) * v.k + v.y });

/** The step is fully inside the view with at least `margin` px on every side. */
function expectVisible(step: Rect, v: View, vp: Viewport, margin = 24): void {
  const s = onScreen(step, v);
  expect(s.x0).toBeGreaterThanOrEqual(margin - 1e-6);
  expect(s.y0).toBeGreaterThanOrEqual(margin - 1e-6);
  expect(s.x1).toBeLessThanOrEqual(vp.width - margin + 1e-6);
  expect(s.y1).toBeLessThanOrEqual(vp.height - margin + 1e-6);
}

describe('playView', () => {
  const vp = { width: 1000, height: 600 };
  const big = { x: 0, y: 0, w: 3000, h: 3000 };

  it('does not move while the step is inside the central 80%', () => {
    expect(playView({ k: 1, x: -100, y: -100 }, { x: 400, y: 300, w: 200, h: 40 }, big, vp, 1)).toBeUndefined();
  });

  it('pans the minimum distance to bring a step below the view back with padding', () => {
    const next = playView({ k: 1, x: -100, y: -100 }, { x: 400, y: 800, w: 200, h: 40 }, big, vp, 1)!;
    expect(next.k).toBe(1);
    expect(next.x).toBe(-100);
    expect(840 + next.y + 24).toBeCloseTo(600 * 0.9);
  });

  it('zooms from any view straight to the session zoom, past the 1.6x limit', () => {
    const next = playView({ k: 0.2, x: 0, y: 0 }, { x: 1400, y: 1400, w: 200, h: 40 }, big, vp, 1.5)!;
    expect(next.k).toBe(1.5);
    const presentation = playView({ k: 1.5, x: 0, y: 0 }, { x: 0, y: 1400, w: 3000, h: 40 }, big, vp, 1.5)!;
    expect(presentation.k).toBe(0.75);
  });

  it('starts at the top of the drawing at the session zoom, centred across', () => {
    const v = playStartView({ x: 0, y: 0, w: 3000, h: 3000 }, vp, 1);
    expect(v).toEqual({ k: 1, x: -1000, y: 24 }); // centred across, top edge 24 px down
    const narrow = playStartView({ x: 0, y: 0, w: 400, h: 3000 }, vp, 1);
    expect(narrow.x).toBe(300);
  });
});

describe('Framing axis matrix', () => {
  const vp = { width: 1000, height: 600 };
  // Rows vary the x axis; the y axis sits well inside a tall drawing.
  const rows: [string, Rect, View, Rect, (v: View) => void][] = [
    ['centres a drawing that fits the view on that axis', { x: 0, y: 0, w: 800, h: 3000 }, { k: 1, x: -500, y: -1000 }, { x: 100, y: 1200, w: 100, h: 40 }, (v) => expect(v.x).toBe(100)],
    ['puts the drawing start 24 px inside the view for a step near it', { x: 0, y: 0, w: 3000, h: 3000 }, { k: 1, x: -2000, y: -1000 }, { x: 10, y: 1200, w: 100, h: 40 }, (v) => expect(v.x).toBe(24)],
    ['puts the drawing end 24 px inside the view for a step near it', { x: 0, y: 0, w: 3000, h: 3000 }, { k: 1, x: 0, y: -1000 }, { x: 2890, y: 1200, w: 100, h: 40 }, (v) => expect(v.x + 3000).toBe(976)],
    ['leaves a step inside the central 80% where it is', { x: 0, y: 0, w: 3000, h: 3000 }, { k: 1, x: -1000, y: -1000 }, { x: 1400, y: 1200, w: 100, h: 40 }, (v) => expect(v.x).toBe(-1000)],
    ['pans the minimum into the central 80% away from the edges', { x: 0, y: 0, w: 3000, h: 3000 }, { k: 1, x: -1300, y: -1000 }, { x: 1400, y: 1200, w: 100, h: 40 }, (v) => expect(v.x).toBe(-1276)],
  ];

  it.each(rows)('%s', (_name, content, current, step, check) => {
    const next = playView(current, step, content, vp, 1) ?? current;
    check(next);
    expectVisible(step, next, vp);
  });

  it('keeps a user view untouched by the clamp only when asked to frame', () => {
    const v = clampToContent({ k: 1, x: 500, y: 0 }, { x: 0, y: 0, w: 3000, h: 3000 }, vp);
    expect(v.x).toBe(24);
  });
});

describe('Wide-step zoom matrix', () => {
  const vp = { width: 1000, height: 600 };
  const content = { x: -2000, y: -2000, w: 9000, h: 9000 };
  const current = { k: 1, x: 0, y: 0 };
  const rows: [string, number, Rect, number, boolean][] = [
    ['uses the session zoom when the step fits', 1, { x: 100, y: 100, w: 300, h: 40 }, 1, false],
    ['keeps a session zoom of 75 % or less for a wide step', 0.5, { x: 0, y: 100, w: 3000, h: 40 }, 0.5, true],
    ['zooms out only as far as the step needs, above 75 %', 1, { x: 0, y: 100, w: 1100, h: 40 }, 952 / 1100, false],
    ['stops at 75 % and centres a step that still does not fit', 1.5, { x: 0, y: 100, w: 3000, h: 40 }, 0.75, true],
  ];

  it.each(rows)('%s', (_name, zoom, step, expected, centred) => {
    const next = playView(current, step, content, vp, zoom)!;
    expect(next.k).toBeCloseTo(expected, 6);
    if (centred) expect(onScreen(step, next).x0 + (step.w * next.k) / 2).toBeCloseTo(500);
    else expectVisible(step, next, vp);
  });

  it('restores the session zoom after a wide edge', () => {
    const wide = { x: 0, y: 100, w: 1100, h: 100 };
    const narrow = { x: 200, y: 400, w: 300, h: 100 };
    const first = playView(current, wide, content, vp, 1)!;
    expect(first.k).toBeCloseTo(0.8655, 4);
    expect(Math.round(first.k * 100)).toBe(87);
    expect(playView(first, narrow, content, vp, 1)!.k).toBe(1);
  });

  it('frames a wide edge at a user zoom below 75 % without zooming', () => {
    const step = { x: 0, y: 100, w: 3000, h: 40 };
    const next = playView({ k: 0.5, x: 0, y: 0 }, step, content, vp, 0.5)!;
    expect(next.k).toBe(0.5);
    expect(onScreen(step, next).x0 + 750).toBeCloseTo(500);
  });

  it('keeps the last step of a large flowchart on the drawing', () => {
    const view = { width: 1700, height: 1250 };
    const flow = { x: 0, y: 0, w: 3000, h: 2400 };
    const last = { x: 2600, y: 2100, w: 300, h: 200 };
    const next = playView({ k: 1, x: -1000, y: -800 }, last, flow, view, 1)!;
    expect(next.k).toBe(1);
    expect(next.x + 3000).toBe(1700 - 24);
    expect(next.y + 2400).toBe(1250 - 24);
    expectVisible(last, next, view);
  });
});

describe('Session zoom lifetime matrix', () => {
  const start: SessionZoom = { normal: 0.6, presenting: 2 };
  const rows: [string, SessionZoomEvent, SessionZoom][] = [
    ['resets both zooms when the panel opens a diagram', { kind: 'load', playZoom: 1, presentationZoom: 1.5 }, { normal: 1, presenting: 1.5 }],
    ['resets both zooms when another diagram is chosen', { kind: 'load', playZoom: 1, presentationZoom: 1.5 }, { normal: 1, presenting: 1.5 }],
    ['keeps both zooms on a live reload', { kind: 'other' }, start],
    ['takes a changed play zoom setting', { kind: 'setting', mode: 'normal', zoom: 0.8 }, { normal: 0.8, presenting: 2 }],
    ['takes a changed presentation zoom setting', { kind: 'setting', mode: 'presenting', zoom: 2 }, { normal: 0.6, presenting: 2 }],
    ['takes a user zoom while not presenting', { kind: 'userZoom', presenting: false, k: 1.3 }, { normal: 1.3, presenting: 2 }],
    ['takes a user zoom while presenting', { kind: 'userZoom', presenting: true, k: 1.3 }, { normal: 0.6, presenting: 1.3 }],
    ['ignores fit and frame step', { kind: 'other' }, start],
    ['ignores pans, scrolls and minimap moves', { kind: 'other' }, start],
    ['ignores automatic camera moves', { kind: 'other' }, start],
    ['ignores entering or leaving presentation mode', { kind: 'other' }, start],
  ];

  it.each(rows)('%s', (_name, event, expected) => {
    expect(nextSessionZoom(start, event)).toEqual(expected);
  });

  it('tells a zoom from a pan', () => {
    expect(isZoomChange({ k: 1, x: 0, y: 0 }, { k: 1, x: 40, y: -20 })).toBe(false);
    expect(isZoomChange({ k: 1, x: 0, y: 0 }, { k: 1.2, x: 0, y: 0 })).toBe(true);
  });
});

describe('Framing zoom matrix', () => {
  const load: SessionZoomEvent = { kind: 'load', playZoom: 1, presentationZoom: 1.5 };
  const fresh = nextSessionZoom({ normal: 0, presenting: 0 }, load);
  const zoomed = (presenting: boolean, k: number) => nextSessionZoom(fresh, { kind: 'userZoom', presenting, k });
  const rows: [string, boolean, 'fit' | 'follow' | 'cinematic' | 'manual', SessionZoom, ReturnType<typeof framingFor>][] = [
    ['does not frame with following off', false, 'manual', fresh, { kind: 'none' }],
    ['fits the whole diagram in fit mode', false, 'fit', fresh, { kind: 'fit' }],
    ['keeps Cinematic framing outside presentations', false, 'cinematic', fresh, { kind: 'cinematic' }],
    ['follows at the play zoom by default', false, 'follow', fresh, { kind: 'play', zoom: 1 }],
    ['follows at the user zoom', false, 'follow', zoomed(false, 0.6), { kind: 'play', zoom: 0.6 }],
    ['ignores a zoom made while presenting', false, 'follow', zoomed(true, 2), { kind: 'play', zoom: 1 }],
    ['presents at the presentation zoom by default', true, 'follow', fresh, { kind: 'play', zoom: 1.5 }],
    ['presents at the zoom chosen while presenting', true, 'follow', zoomed(true, 2), { kind: 'play', zoom: 2 }],
    ['ignores a normal zoom while presenting', true, 'follow', zoomed(false, 0.6), { kind: 'play', zoom: 1.5 }],
  ];

  it.each(rows)('%s', (_name, presenting, mode, session, expected) => {
    expect(framingFor(presenting, mode, session)).toEqual(expected);
  });
});

describe('Overview exit zoom matrix', () => {
  const vp = { width: 800, height: 600 };
  const content = { x: 0, y: 0, w: 1200, h: 4000 };
  const step = { x: 100, y: 80, w: 300, h: 40 };
  const overview = fitView(content, vp);
  const rows: [string, boolean, SessionZoom, number][] = [
    ['frames step 1 at 100 % by default', false, { normal: 1, presenting: 1.5 }, 1],
    ['frames step 1 at the zoom set at step 0', false, { normal: 1.5, presenting: 1.5 }, 1.5],
    ['presents step 1 at 150 % by default', true, { normal: 1, presenting: 1.5 }, 1.5],
    ['presents step 1 at the zoom set while presenting', true, { normal: 1, presenting: 2 }, 2],
  ];

  it.each(rows)('%s', (_name, presenting, session, expected) => {
    const framing = framingFor(presenting, 'follow', session);
    if (framing.kind !== 'play') throw new Error('expected play framing');
    const next = playView(overview, step, content, vp, framing.zoom)!;
    expect(next.k).toBe(expected);
    expectVisible(step, next, vp);
  });
});

describe('focus framing', () => {
  it('frames the focused participants when they fit', () => {
    const participants = [
      { id: 'A', header: { x: 0, y: 0, w: 100, h: 40 } },
      { id: 'C', header: { x: 400, y: 0, w: 120, h: 40 } },
    ];
    const target = focusTarget({ x: 50, y: 300, w: 200, h: 40 }, participants, ['A', 'C']);
    const next = playView({ k: 1, x: -2000, y: -2000 }, target, { x: 0, y: 0, w: 3000, h: 3000 }, { width: 1000, height: 600 }, 1)!;
    expectVisible(target, next, { width: 1000, height: 600 });
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
