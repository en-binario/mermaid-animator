/** Easing tokens of the motion system (spec §9.8.1), as functions of 0–1 progress. */

export type Easing = (t: number) => number;

/** CSS-compatible cubic Bézier timing function. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) break;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Bisection fallback for robustness.
    if (Math.abs(sampleX(t) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 30; i++) {
        if (sampleX(t) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sampleY(t);
  };
}

export const EASE = {
  standard: cubicBezier(0.2, 0, 0, 1),
  enter: cubicBezier(0, 0, 0.2, 1),
  exit: cubicBezier(0.4, 0, 1, 1),
  travel: cubicBezier(0.45, 0, 0.25, 1),
  linear: (t: number) => Math.min(1, Math.max(0, t)),
} satisfies Record<string, Easing>;

/** Gentle spring used by the Expressive profile (damping ratio ≈ 0.85, overshoot ≤ 3%). */
export const springy: Easing = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const zeta = 0.85;
  const omega = 9;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
};

export const DURATION = { xfast: 90, fast: 150, base: 240, slow: 400, deliberate: 640 } as const;

/** Progress of a window [start, end] at time e, eased. */
export function windowed(e: number, start: number, end: number, ease: Easing = EASE.standard): number {
  if (end <= start) return e >= start ? 1 : 0;
  return ease(Math.min(1, Math.max(0, (e - start) / (end - start))));
}
