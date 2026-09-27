import type { Point, Rect } from '@mermaid-animator/core';

export interface GroupInfo {
  id: string;
  kind: 'node' | 'edge' | 'other';
  bbox: Rect;
  /** Start and end points of an edge path. */
  endpoints?: Point[];
}

/** A step's bounds: its group's box together with the edge labels revealed with it (spec camera: wide-step zoom-out). */
export function stepBoundsOf(bbox: Rect, labels: readonly Rect[]): Rect {
  const all = [bbox, ...labels.filter((r) => r.w > 0 || r.h > 0)];
  const x0 = Math.min(...all.map((r) => r.x));
  const y0 = Math.min(...all.map((r) => r.y));
  const x1 = Math.max(...all.map((r) => r.x + r.w));
  const y1 = Math.max(...all.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const contains = (r: Rect, p: Point, slack = 6) => p.x >= r.x - slack && p.x <= r.x + r.w + slack && p.y >= r.y - slack && p.y <= r.y + r.h + slack;
const reading = (a: Rect, b: Rect) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x);

/**
 * Orders animatable groups (spec generic-diagram-fallback): nodes and other groups top-to-bottom,
 * then left-to-right; each edge right after the last node it touches (never before either end).
 * Edges that touch no node follow in reading order at the end.
 */
export function orderGroups(groups: readonly GroupInfo[]): GroupInfo[] {
  const nodes = groups.filter((g) => g.kind !== 'edge').sort((a, b) => reading(a.bbox, b.bbox));
  const edges = groups.filter((g) => g.kind === 'edge').sort((a, b) => reading(a.bbox, b.bbox));
  const after = new Map<number, GroupInfo[]>();
  const loose: GroupInfo[] = [];
  for (const edge of edges) {
    const touching = (edge.endpoints ?? [])
      .map((p) => {
        // The smallest node containing the point (clusters contain their children).
        const hits = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.kind === 'node' && contains(n.bbox, p));
        hits.sort((x, y) => x.n.bbox.w * x.n.bbox.h - y.n.bbox.w * y.n.bbox.h);
        return hits[0]?.i;
      })
      .filter((i): i is number => i !== undefined);
    if (!touching.length) {
      loose.push(edge);
      continue;
    }
    const last = Math.max(...touching);
    after.set(last, [...(after.get(last) ?? []), edge]);
  }
  const ordered: GroupInfo[] = [];
  nodes.forEach((n, i) => {
    ordered.push(n);
    ordered.push(...(after.get(i) ?? []));
  });
  return [...ordered, ...loose];
}
