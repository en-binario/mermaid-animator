import { describe, expect, it } from 'vitest';
import { buildTimeline, CLEAR_MS, positionAt, type Step } from '@mermaid-animator/core';
import { GENERIC_TRANSITION_MS, groupReveal } from '../src/fallbackReveal';

const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ timing: { transitionMs: GENERIC_TRANSITION_MS, dwellMs: 650, hold: false }, index: i }) as unknown as Step);

describe('generic group reveal', () => {
  const plain = buildTimeline(steps(3));
  const overview = buildTimeline(steps(3), { overview: true, leadInMs: 900 });
  const at = (timeline: typeof plain, t: number, i: number, kind = 'node', reduced = false) => groupReveal(i, kind, positionAt(timeline, t), reduced, timeline.clear !== undefined);

  it('hides every group at step 0 without the overview', () => {
    for (let i = 0; i < 3; i++) expect(at(plain, 0, i).opacity).toBe(0);
  });

  it('shows every group at step 0 with the overview, through the lead-in', () => {
    for (let i = 0; i < 3; i++) {
      expect(at(overview, 0, i)).toEqual({ opacity: 1, draw: 1 });
      expect(at(overview, 900, i)).toEqual({ opacity: 1, draw: 1 });
    }
  });

  it('fades every group out during the clear, then reveals the first group', () => {
    const mid = 900 + CLEAR_MS / 2;
    for (let i = 0; i < 3; i++) {
      expect(at(overview, mid, i).opacity).toBeGreaterThan(0);
      expect(at(overview, mid, i).opacity).toBeLessThan(1);
    }
    const cleared = 900 + CLEAR_MS;
    expect(at(overview, cleared, 0).opacity).toBe(0);
    expect(at(overview, cleared, 1).opacity).toBe(0);
    expect(at(overview, cleared + GENERIC_TRANSITION_MS, 0, 'edge')).toEqual({ opacity: 1, draw: 1 });
    expect(at(overview, cleared + GENERIC_TRANSITION_MS, 1).opacity).toBe(0);
  });

  it('cuts the clear under reduced motion', () => {
    expect(at(overview, 900 + 1, 1, 'node', true).opacity).toBe(0);
  });

  it('draws identically after the clear and without the overview', () => {
    const offset = 900 + CLEAR_MS;
    for (const dt of [1, 100, 210, 420]) expect(at(overview, offset + dt, 0, 'edge')).toEqual(at(plain, dt, 0, 'edge'));
  });
});
