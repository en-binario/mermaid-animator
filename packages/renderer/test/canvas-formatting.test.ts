import { describe, expect, it } from 'vitest';
import { approximateMeasure, compileDiagram, layoutSequence } from '@mermaid-animator/core';
import { canvasPalette, DEFAULT_DISPLAY, drawSequence, prepareScene, runFont, sceneAt, type Ctx2D } from '../src';

/** A 2D context stub that records the font in effect for every drawn string. */
function recordingContext() {
  const drawn: { text: string; font: string; x: number }[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif' };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === 'fillText') return (text: string, x: number) => drawn.push({ text, font: String(target.font), x });
      if (key === 'measureText') return (text: string) => ({ width: text.length * (String(target.font).startsWith('650') || String(target.font).startsWith('italic') ? 8 : 7) });
      if (key in target) return target[key as string];
      return () => undefined;
    },
    set(target, key, value) {
      target[key as string] = value;
      return true;
    },
  }) as unknown as Ctx2D;
  return { ctx, drawn };
}

describe('formatted labels on the canvas', () => {
  // Node has no Path2D: every method is a no-op.
  (globalThis as { Path2D?: unknown }).Path2D ??= function Path2D() {
    return new Proxy({}, { get: () => () => undefined });
  };

  it('switches the font per run and never draws tag text', () => {
    const d = compileDiagram('sequenceDiagram\nA->>B: <b>POST</b> /iniciar <i>now</i>').sequence!;
    const layout = layoutSequence(d.model, d.compiled, { measure: approximateMeasure });
    const scene = prepareScene(layout, d.compiled, d.timeline);
    const { ctx, drawn } = recordingContext();
    drawSequence(ctx, layout, sceneAt(scene, d.timeline.duration, DEFAULT_DISPLAY), canvasPalette('ivory'));
    const post = drawn.find((c) => c.text === 'POST')!;
    const rest = drawn.find((c) => c.text === ' /iniciar ')!;
    const now = drawn.find((c) => c.text === 'now')!;
    expect(post.font).toMatch(/^650 /);
    expect(rest.font).not.toMatch(/^650 |^italic/);
    expect(now.font).toMatch(/^italic /);
    // Left to right, one after the other.
    expect(rest.x).toBeGreaterThan(post.x);
    expect(now.x).toBeGreaterThan(rest.x);
    expect(drawn.some((c) => c.text.includes('<b>'))).toBe(false);
  });

  it('derives run fonts from the base font', () => {
    expect(runFont('italic 400 13px "Inter Variable"', { text: 'x', bold: true }, 'label')).toBe('italic 650 13px "Inter Variable"');
    expect(runFont('560 13.5px "Inter Variable"', { text: 'x', italic: true }, 'participant')).toBe('italic 560 13.5px "Inter Variable"');
  });
});
