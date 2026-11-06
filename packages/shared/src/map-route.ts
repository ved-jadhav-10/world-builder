import type { MapPoint } from './schemas/atlas';

/*
 * Pointcrawl routes: places are pins, roads are paths. Where a road starts or ends on a pin, or
 * two roads share a point, they connect. The route finder walks that network.
 */

export interface RoutePin {
  id: string;
  point: MapPoint;
}

export interface RoutePath {
  id: string;
  points: MapPoint[];
}

export interface Route {
  /** The roads taken, in order. */
  pathIds: string[];
  /** The line to draw, from the first pin to the last. */
  points: MapPoint[];
  /** Length in the map's own pixels (fractions scaled by its width and height). */
  length: number;
}

export interface RouteOptions {
  /** The map's size in pixels, so a fraction of its width and of its height weigh the same. */
  width: number;
  height: number;
  /** How close, as a fraction of the map's width, two points must be to count as joined. */
  tolerance?: number;
}

/** Default reach for joining a road to a pin: a little under a percent of the map's width. */
export const DEFAULT_ROUTE_TOLERANCE = 0.006;

class Joiner {
  private parent: number[] = [];
  add() {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]!]!;
      i = this.parent[i]!;
    }
    return i;
  }
  join(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b);
  }
}

/**
 * The shortest way along the roads between two pins, or null if they are not connected.
 * Roads may only be joined at their own vertices and at pins, never mid-segment.
 */
export function findRoute(
  pins: readonly RoutePin[],
  paths: readonly RoutePath[],
  fromId: string,
  toId: string,
  options: RouteOptions,
): Route | null {
  const tolerance = (options.tolerance ?? DEFAULT_ROUTE_TOLERANCE) * options.width;
  const px = (p: MapPoint): [number, number] => [p[0] * options.width, p[1] * options.height];

  // Every vertex and pin is a spot; spots within the tolerance are the same junction.
  const spots: { at: [number, number] }[] = [];
  const joiner = new Joiner();
  const place = (p: MapPoint) => {
    const at = px(p);
    const id = joiner.add();
    spots.push({ at });
    for (let other = 0; other < id; other++) {
      const o = spots[other]!.at;
      if (Math.hypot(o[0] - at[0], o[1] - at[1]) <= tolerance) joiner.join(id, other);
    }
    return id;
  };

  const pinSpot = new Map(pins.map((pin) => [pin.id, place(pin.point)]));
  const edges: {
    a: number;
    b: number;
    length: number;
    pathId: string;
    from: MapPoint;
    to: MapPoint;
  }[] = [];
  for (const path of paths) {
    const ids = path.points.map(place);
    for (let i = 1; i < path.points.length; i++) {
      const a = px(path.points[i - 1]!);
      const b = px(path.points[i]!);
      edges.push({
        a: ids[i - 1]!,
        b: ids[i]!,
        length: Math.hypot(b[0] - a[0], b[1] - a[1]),
        pathId: path.id,
        from: path.points[i - 1]!,
        to: path.points[i]!,
      });
    }
  }

  const start = pinSpot.get(fromId);
  const goal = pinSpot.get(toId);
  if (start === undefined || goal === undefined) return null;
  const startNode = joiner.find(start);
  const goalNode = joiner.find(goal);
  if (startNode === goalNode) return { pathIds: [], points: [], length: 0 };

  // Dijkstra over junctions. The graph is small (a map's roads), so a plain scan will do.
  const adjacent = new Map<number, typeof edges>();
  for (const edge of edges) {
    for (const node of [joiner.find(edge.a), joiner.find(edge.b)]) {
      adjacent.set(node, [...(adjacent.get(node) ?? []), edge]);
    }
  }
  const distance = new Map<number, number>([[startNode, 0]]);
  const via = new Map<
    number,
    { previous: number; edge: (typeof edges)[number]; forward: boolean }
  >();
  const done = new Set<number>();
  for (;;) {
    let current = -1;
    let best = Infinity;
    for (const [node, d] of distance) {
      if (!done.has(node) && d < best) {
        best = d;
        current = node;
      }
    }
    if (current === -1) return null;
    if (current === goalNode) break;
    done.add(current);
    for (const edge of adjacent.get(current) ?? []) {
      const forward = joiner.find(edge.a) === current;
      const next = joiner.find(forward ? edge.b : edge.a);
      const candidate = best + edge.length;
      if (candidate < (distance.get(next) ?? Infinity)) {
        distance.set(next, candidate);
        via.set(next, { previous: current, edge, forward });
      }
    }
  }

  const steps: { edge: (typeof edges)[number]; forward: boolean }[] = [];
  for (let node = goalNode; node !== startNode;) {
    const step = via.get(node)!;
    steps.unshift({ edge: step.edge, forward: step.forward });
    node = step.previous;
  }
  const points: MapPoint[] = [];
  const pathIds: string[] = [];
  for (const { edge, forward } of steps) {
    const [from, to] = forward ? [edge.from, edge.to] : [edge.to, edge.from];
    if (points.length === 0) points.push(from);
    points.push(to);
    if (pathIds.at(-1) !== edge.pathId) pathIds.push(edge.pathId);
  }
  return { pathIds, points, length: distance.get(goalNode)! };
}
