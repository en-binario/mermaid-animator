import type { Point, Rect } from '@mermaid-animator/core';

export interface GroupInfo {
  id: string;
  kind: 'node' | 'edge' | 'other';
  bbox: Rect;
  /** Start and end points of an edge path. */
  endpoints?: Point[];
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
