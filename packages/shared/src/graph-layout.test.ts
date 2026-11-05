import { describe, expect, it } from 'vitest';
import { layoutGraph } from './graph-layout';

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}` }));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('layoutGraph', () => {
  it('handles nothing, one node and two nodes', () => {
    expect(layoutGraph([], [])).toEqual([]);
    expect(layoutGraph([{ id: 'a' }], [], { width: 400, height: 200 })).toEqual([
      { id: 'a', x: 200, y: 100 },
    ]);
    const two = layoutGraph(ids(2), [{ sourceId: 'n0', targetId: 'n1' }]);
    expect(two).toHaveLength(2);
    expect(dist(two[0]!, two[1]!)).toBeGreaterThan(10);
  });

  it('is deterministic: the same data always gives the same picture', () => {
    const nodes = ids(30);
    const edges = nodes.slice(1).map((n, i) => ({ sourceId: nodes[i]!.id, targetId: n.id }));
    expect(layoutGraph(nodes, edges)).toEqual(layoutGraph(nodes, edges));
  });

  it('keeps every node inside the frame, with no NaN, even with odd input', () => {
    const nodes = ids(40);
    const edges = [
      ...nodes.slice(1).map((n) => ({ sourceId: 'n0', targetId: n.id })),
      { sourceId: 'n3', targetId: 'n3' }, // a loop
      { sourceId: 'n4', targetId: 'missing' }, // an edge to nothing
      { sourceId: 'n0', targetId: 'n1' }, // a repeat
    ];
    const placed = layoutGraph(nodes, edges, { width: 800, height: 500 });
    expect(placed).toHaveLength(40);
    for (const p of placed) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(800);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(500);
    }
  });

  it('does not stack nodes on top of one another', () => {
    const nodes = ids(60);
    const edges = nodes.slice(1).map((n, i) => ({ sourceId: nodes[i % 5]!.id, targetId: n.id }));
    const placed = layoutGraph(nodes, edges);
    let closest = Infinity;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++)
        closest = Math.min(closest, dist(placed[i]!, placed[j]!));
    }
    expect(closest).toBeGreaterThan(8);
  });

  it('draws linked nodes nearer than unlinked ones, and separates clusters', () => {
    // Two triangles with no link between them.
    const nodes = ids(6);
    const edges = [
      ['n0', 'n1'],
      ['n1', 'n2'],
      ['n0', 'n2'],
      ['n3', 'n4'],
      ['n4', 'n5'],
      ['n3', 'n5'],
    ].map(([sourceId, targetId]) => ({ sourceId: sourceId!, targetId: targetId! }));
    const at = new Map(layoutGraph(nodes, edges).map((p) => [p.id, p]));
    const within = (dist(at.get('n0')!, at.get('n1')!) + dist(at.get('n3')!, at.get('n4')!)) / 2;
    const across = (dist(at.get('n0')!, at.get('n3')!) + dist(at.get('n1')!, at.get('n5')!)) / 2;
    expect(within).toBeLessThan(across);
  });

  it('puts the hub of a star in the middle of its leaves', () => {
    const nodes = ids(9);
    const edges = nodes.slice(1).map((n) => ({ sourceId: 'n0', targetId: n.id }));
    const placed = layoutGraph(nodes, edges, { width: 600, height: 600, pinnedId: 'n0' });
    const hub = placed[0]!;
    const meanX = placed.slice(1).reduce((s, p) => s + p.x, 0) / 8;
    const meanY = placed.slice(1).reduce((s, p) => s + p.y, 0) / 8;
    expect(Math.abs(hub.x - meanX)).toBeLessThan(60);
    expect(Math.abs(hub.y - meanY)).toBeLessThan(60);
  });

  it('copes with a few hundred nodes quickly', () => {
    const nodes = ids(250);
    const edges = nodes
      .slice(1)
      .map((n, i) => ({ sourceId: nodes[Math.floor(i / 3)]!.id, targetId: n.id }));
    const started = Date.now();
    layoutGraph(nodes, edges, { iterations: 200 });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
