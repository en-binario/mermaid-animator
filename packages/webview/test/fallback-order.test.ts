import { describe, expect, it } from 'vitest';
import { orderGroups, type GroupInfo } from '../src/fallbackOrder';

const node = (id: string, x: number, y: number): GroupInfo => ({ id, kind: 'node', bbox: { x, y, w: 60, h: 30 } });
const edge = (id: string, from: GroupInfo, to: GroupInfo): GroupInfo => {
  const a = { x: from.bbox.x + 30, y: from.bbox.y + 30 };
  const b = { x: to.bbox.x + 30, y: to.bbox.y };
  return { id, kind: 'edge', bbox: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 }, endpoints: [a, b] };
};

describe('orderGroups', () => {
  // A flowchart with 4 nodes and 3 edges: A → B, A → C, C → D (edges listed in scrambled order).
  const A = node('A', 100, 0);
  const B = node('B', 0, 100);
  const C = node('C', 200, 100);
  const D = node('D', 200, 200);
  const groups = [edge('CD', C, D), D, edge('AC', A, C), B, edge('AB', A, B), C, A];

  it('has one step per group and reveals every node before the edges touching it', () => {
    const order = orderGroups(groups).map((g) => g.id);
    expect(order).toHaveLength(7);
    for (const [e, ends] of [['AB', ['A', 'B']], ['AC', ['A', 'C']], ['CD', ['C', 'D']]] as const) {
      for (const n of ends) expect(order.indexOf(n)).toBeLessThan(order.indexOf(e));
    }
  });

  it('orders nodes top-to-bottom then left-to-right', () => {
    const order = orderGroups(groups).filter((g) => g.kind === 'node').map((g) => g.id);
    expect(order).toEqual(['A', 'B', 'C', 'D']);
  });

  it('keeps edges without endpoints at the end', () => {
    const loose: GroupInfo = { id: 'L', kind: 'edge', bbox: { x: 0, y: 0, w: 5, h: 5 } };
    expect(orderGroups([loose, A, B]).map((g) => g.id)).toEqual(['A', 'B', 'L']);
  });
});
