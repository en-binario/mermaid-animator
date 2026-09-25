import type { DiagramInfo } from './locate';

/** What a panel remembers about the diagram it shows. */
export interface DiagramBinding {
  id?: string;
  index: number;
  source: string;
}

function bigrams(text: string): Map<string, number> {
  const s = text.replace(/\s+/g, ' ').trim().toLowerCase();
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

/** Sørensen–Dice coefficient over character bigrams (0–1). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const x = bigrams(a);
  const y = bigrams(b);
  let total = 0;
  let shared = 0;
  for (const n of x.values()) total += n;
  for (const n of y.values()) total += n;
  if (total === 0) return 0;
  for (const [g, n] of x) shared += Math.min(n, y.get(g) ?? 0);
  return (2 * shared) / total;
}

/**
 * Re-finds a bound diagram after its document changed (diagram-discovery "Stable binding"):
 * by `@id`, then by greatest content similarity (≥ 0.5), then by the same index.
 */
export function rebind(binding: DiagramBinding, diagrams: DiagramInfo[]): DiagramInfo | undefined {
  if (binding.id) {
    const byId = diagrams.find((d) => d.id === binding.id);
    if (byId) return byId;
  }
  let best: DiagramInfo | undefined;
  let bestScore = 0.5;
  for (const d of diagrams) {
    const score = similarity(binding.source, d.source);
    // Prefer the same index on ties so identical diagrams keep their panels.
    if (score > bestScore || (score === bestScore && best && d.index === binding.index)) {
      best = d;
      bestScore = score;
    }
  }
  if (best) return best;
  return diagrams.find((d) => d.index === binding.index);
}
