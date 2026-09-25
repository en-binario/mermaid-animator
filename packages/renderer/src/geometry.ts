import type { Point } from '@mermaid-animator/core';

/** Point at fraction `p` (0–1) along a polyline, with the direction of travel there. */
export function pointAlong(points: readonly Point[], p: number): { x: number; y: number; angle: number } {
  const lengths = points.slice(1).map((pt, i) => Math.hypot(pt.x - points[i]!.x, pt.y - points[i]!.y));
  const total = lengths.reduce((a, b) => a + b, 0);
  let remaining = Math.max(0, Math.min(1, p)) * total;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i] as number;
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    if (remaining <= len || i === lengths.length - 1) {
      const f = len === 0 ? 0 : Math.min(1, remaining / len);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    remaining -= len;
  }
  const last = points[points.length - 1] as Point;
  return { x: last.x, y: last.y, angle: 0 };
}

/** SVG path data for the first fraction `p` of a polyline (rounded corners of radius 4). */
export function partialPath(points: readonly Point[], p: number): string {
  if (points.length < 2) return '';
  const clamped = Math.max(0, Math.min(1, p));
  const lengths = points.slice(1).map((pt, i) => Math.hypot(pt.x - points[i]!.x, pt.y - points[i]!.y));
  const total = lengths.reduce((a, b) => a + b, 0);
  let remaining = clamped * total;
  const out: Point[] = [points[0] as Point];
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i] as number;
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    if (remaining >= len) {
      out.push(b);
      remaining -= len;
    } else {
      const f = len === 0 ? 0 : remaining / len;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      break;
    }
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return out.map((pt, i) => `${i ? 'L' : 'M'}${r(pt.x)} ${r(pt.y)}`).join(' ');
}
