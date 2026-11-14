import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/** A small repeatable random source, so a world always gets the same chart. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A closed, wobbly outline around a centre: one island. */
function island(random: () => number, cx: number, cy: number, radius: number): string {
  const points = 11;
  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (0.62 + random() * 0.62);
    coords.push([cx + Math.cos(angle) * r * 1.25, cy + Math.sin(angle) * r]);
  }
  // Smooth the corners by running the path through the midpoints.
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const first = mid(coords[points - 1]!, coords[0]!);
  let d = `M${first[0]!.toFixed(1)} ${first[1]!.toFixed(1)}`;
  for (let i = 0; i < points; i++) {
    const here = coords[i]!;
    const next = mid(here, coords[(i + 1) % points]!);
    d += ` Q${here[0].toFixed(1)} ${here[1].toFixed(1)} ${next[0]!.toFixed(1)} ${next[1]!.toFixed(1)}`;
  }
  return `${d}Z`;
}

/**
 * The cover of a world on the shelf: a little sea chart drawn from the world's id, with islands,
 * compass lines and a wind rose. No two worlds share one, and a world's never changes.
 */
export function WorldCover({ seed, className }: { seed: string; className?: string }) {
  const chart = useMemo(() => {
    const random = seeded(seed);
    const islands = Array.from({ length: 3 + Math.floor(random() * 3) }, (_, i) => {
      const big = i === 0;
      return island(
        random,
        40 + random() * 240,
        24 + random() * 72,
        big ? 30 + random() * 14 : 9 + random() * 14,
      );
    });
    const rose = { x: 34 + random() * 252, y: 22 + random() * 76 };
    const lines = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      return { x: rose.x + Math.cos(angle) * 400, y: rose.y + Math.sin(angle) * 400 };
    });
    return { islands, rose, lines };
  }, [seed]);

  return (
    <svg
      viewBox="0 0 320 120"
      preserveAspectRatio="xMidYMid slice"
      className={cn('block w-full bg-accent text-foreground', className)}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="0.5" opacity="0.22">
        {chart.lines.map((line, i) => (
          <line key={i} x1={chart.rose.x} y1={chart.rose.y} x2={line.x} y2={line.y} />
        ))}
      </g>
      {chart.islands.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="currentColor" strokeWidth="5" opacity="0.07" />
          <path d={d} className="fill-card" stroke="currentColor" strokeWidth="0.9" />
        </g>
      ))}
      <g transform={`translate(${chart.rose.x} ${chart.rose.y})`}>
        <circle r="7" className="fill-card" stroke="currentColor" strokeWidth="0.7" />
        <path d="M0-10 2 0 0 10-2 0Z M-10 0 0-2 10 0 0 2Z" fill="currentColor" />
      </g>
    </svg>
  );
}
