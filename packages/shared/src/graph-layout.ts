/**
 * A force-directed layout for the relationship graph: every node pushes the others away, every
 * link pulls its two ends together, and a weak pull toward the middle keeps separate clusters
 * from drifting off. It is deterministic (nodes start on a circle in the order given and nothing
 * is random), so the same data always draws the same picture and the tests can check it.
 */

export interface LayoutNode {
  id: string;
}
export interface LayoutEdge {
  sourceId: string;
  targetId: string;
}
export interface PlacedNode {
  id: string;
  x: number;
  y: number;
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  /** Held at the centre, so the picture is organised around it. */
  pinnedId?: string | null;
  iterations?: number;
}

/** The distance two nodes would like to keep, so labels have room. */
const IDEAL_PER_NODE = 1;

export function layoutGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  { width = 1000, height = 700, pinnedId = null, iterations = 300 }: LayoutOptions = {},
): PlacedNode[] {
  const n = nodes.length;
  if (n === 0) return [];
  const cx = width / 2;
  const cy = height / 2;
  if (n === 1) return [{ id: nodes[0]!.id, x: cx, y: cy }];

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  // Links between nodes that are in the picture; repeats and loops add nothing.
  const links: [number, number][] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const a = index.get(edge.sourceId);
    const b = index.get(edge.targetId);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push([a, b]);
  }

  const pinned = pinnedId === null ? -1 : (index.get(pinnedId) ?? -1);
  const area = width * height;
  // Fruchterman-Reingold's ideal edge length, scaled to the space available.
  const k = Math.sqrt((area / n) * IDEAL_PER_NODE) * 0.8;

  // Start on a circle, the pinned node in the middle. The order is the data's order.
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const radius = Math.min(width, height) * 0.35;
  let slot = 0;
  const ring = pinned === -1 ? n : n - 1;
  for (let i = 0; i < n; i++) {
    if (i === pinned) {
      x[i] = cx;
      y[i] = cy;
      continue;
    }
    const angle = (slot++ / Math.max(1, ring)) * Math.PI * 2;
    x[i] = cx + Math.cos(angle) * radius;
    y[i] = cy + Math.sin(angle) * radius;
  }

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temperature = Math.min(width, height) / 8;
  const cooling = temperature / (iterations + 1);

  for (let step = 0; step < iterations; step++) {
    dx.fill(0);
    dy.fill(0);
    // Repulsion between every pair.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ex = x[i]! - x[j]!;
        let ey = y[i]! - y[j]!;
        let dist = Math.hypot(ex, ey);
        if (dist < 0.01) {
          // Exactly on top of each other: nudge apart in a fixed direction per pair.
          ex = ((i + j) % 2 === 0 ? 1 : -1) * 0.01;
          ey = ((i * 7 + j) % 2 === 0 ? 1 : -1) * 0.01;
          dist = Math.hypot(ex, ey);
        }
        const force = (k * k) / dist;
        const fx = (ex / dist) * force;
        const fy = (ey / dist) * force;
        dx[i]! += fx;
        dy[i]! += fy;
        dx[j]! -= fx;
        dy[j]! -= fy;
      }
    }
    // Attraction along links.
    for (const [a, b] of links) {
      const ex = x[a]! - x[b]!;
      const ey = y[a]! - y[b]!;
      const dist = Math.max(0.01, Math.hypot(ex, ey));
      const force = (dist * dist) / k;
      const fx = (ex / dist) * force;
      const fy = (ey / dist) * force;
      dx[a]! -= fx;
      dy[a]! -= fy;
      dx[b]! += fx;
      dy[b]! += fy;
    }
    // A weak pull to the middle, then move, no further than the temperature allows.
    for (let i = 0; i < n; i++) {
      if (i === pinned) continue;
      dx[i]! += (cx - x[i]!) * 0.05;
      dy[i]! += (cy - y[i]!) * 0.05;
      const move = Math.hypot(dx[i]!, dy[i]!);
      if (move > 0) {
        const limited = Math.min(move, temperature);
        x[i]! += (dx[i]! / move) * limited;
        y[i]! += (dy[i]! / move) * limited;
      }
    }
    temperature = Math.max(0.5, temperature - cooling);
  }

  // Fit the result into the frame with a margin, keeping its shape.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]!);
    maxX = Math.max(maxX, x[i]!);
    minY = Math.min(minY, y[i]!);
    maxY = Math.max(maxY, y[i]!);
  }
  const margin = 60;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetY = (height - spanY * scale) / 2 - minY * scale;
  return nodes.map((node, i) => ({
    id: node.id,
    x: x[i]! * scale + offsetX,
    y: y[i]! * scale + offsetY,
  }));
}
