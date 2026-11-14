/*
 * Draws the sample world's chart: an archipelago in the manner of an old sea chart, as an SVG.
 * It is made here, from a fixed seed, so the sample needs no image file in the repository and
 * nobody's artwork is borrowed. `places` gives spots on the chart (as 0 to 1 fractions, the way
 * the Atlas stores positions) for the pins and roads the sample puts on it.
 */

const WIDTH = 2400;
const HEIGHT = 1600;

const INK = '#3d3327';
const PAPER = '#ece2c9';
const LAND = '#f1e8d2';
const SEA = '#cddbd3';

type Point = [number, number];

function randomSource(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Island {
  cx: number;
  cy: number;
  /** Outline points, in order. */
  outline: Point[];
}

/** An island: a circle whose radius wanders, by a few waves of different lengths. */
function makeIsland(
  random: () => number,
  cx: number,
  cy: number,
  radius: number,
  stretch: number,
): Island {
  const waves = [2, 3, 5, 8, 13].map((frequency) => ({
    frequency,
    phase: random() * Math.PI * 2,
    amount: (0.34 / Math.sqrt(frequency)) * (0.6 + random() * 0.8),
  }));
  const steps = Math.max(40, Math.round(radius / 3.2));
  const outline: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    let r = radius;
    for (const wave of waves)
      r += radius * wave.amount * Math.sin(angle * wave.frequency + wave.phase);
    r = Math.max(radius * 0.38, r);
    outline.push([cx + Math.cos(angle) * r * stretch, cy + Math.sin(angle) * r]);
  }
  return { cx, cy, outline };
}

/** A closed curve through the midpoints of an outline, so the coast has no corners. */
function smoothPath(points: Point[]): string {
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = points.length;
  const first = mid(points[n - 1]!, points[0]!);
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const here = points[i]!;
    const next = mid(here, points[(i + 1) % n]!);
    d += `Q${here[0].toFixed(1)} ${here[1].toFixed(1)} ${next[0].toFixed(1)} ${next[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

/** A point of an island: `along` its outline (0 to 1), pulled `inland` toward the centre (0 to 1). */
function spot(island: Island, along: number, inland: number): Point {
  const p = island.outline[Math.floor(along * island.outline.length) % island.outline.length]!;
  return [p[0] + (island.cx - p[0]) * inland, p[1] + (island.cy - p[1]) * inland];
}

function insideIsland(island: Island, x: number, y: number): boolean {
  let inside = false;
  const pts = island.outline;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function windRose(x: number, y: number, size: number): string {
  let out = `<g transform="translate(${x} ${y})">`;
  out += `<circle r="${size}" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`;
  out += `<circle r="${size * 0.78}" fill="none" stroke="${INK}" stroke-width="1"/>`;
  for (let i = 0; i < 16; i++) {
    const long = i % 4 === 0 ? 1.45 : i % 2 === 0 ? 1.05 : 0.7;
    const angle = (i / 16) * 360;
    const fill = i % 2 === 0 ? INK : PAPER;
    out += `<path transform="rotate(${angle})" d="M0 ${-size * long} L${size * 0.11} 0 L0 ${size * 0.11} L${-size * 0.11} 0Z" fill="${fill}" stroke="${INK}" stroke-width="1.2"/>`;
  }
  out += `<circle r="${size * 0.1}" fill="#a8452d"/>`;
  out += `<text y="${-size * 1.62}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${size * 0.42}" fill="${INK}">N</text>`;
  return `${out}</g>`;
}

export interface SampleMap {
  svg: string;
  width: number;
  height: number;
  /** Spots on the chart, as fractions of its width and height. */
  places: Record<
    'vesh' | 'eel' | 'kaldorPeak' | 'northCape' | 'guildHall' | 'saltmere' | 'wreck' | 'lampRock',
    Point
  >;
  /** The coast road from Vesh to Saltmere, and the sea lane to Lamp Rock. */
  road: Point[];
  seaLane: Point[];
  /** The outline of the main island, thinned out, for a region. */
  kaldorOutline: Point[];
}

export function drawSampleMap(seed = 20261114): SampleMap {
  const random = randomSource(seed);
  const kaldor = makeIsland(random, 1040, 800, 430, 1.35);
  const others: Island[] = [
    makeIsland(random, 1930, 420, 150, 1.2),
    makeIsland(random, 2060, 980, 120, 1.0),
    makeIsland(random, 1790, 1290, 95, 1.4),
    makeIsland(random, 330, 330, 110, 1.25),
    makeIsland(random, 290, 1220, 135, 0.95),
    makeIsland(random, 1810, 640, 58, 1.1),
    makeIsland(random, 2180, 680, 46, 1.0),
    makeIsland(random, 740, 1445, 52, 1.5),
  ];
  const islands = [kaldor, ...others];
  const onLand = (x: number, y: number) => islands.some((island) => insideIsland(island, x, y));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`;
  svg += `<defs><radialGradient id="age" cx="50%" cy="50%" r="72%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#5a4424" stop-opacity="0.28"/></radialGradient></defs>`;
  svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>`;
  svg += `<rect x="70" y="70" width="${WIDTH - 140}" height="${HEIGHT - 140}" fill="${SEA}"/>`;

  // Old stains and foxing.
  for (let i = 0; i < 26; i++) {
    svg += `<circle cx="${(random() * WIDTH).toFixed(0)}" cy="${(random() * HEIGHT).toFixed(0)}" r="${(30 + random() * 150).toFixed(0)}" fill="#8a6a3a" opacity="${(0.015 + random() * 0.035).toFixed(3)}"/>`;
  }

  // Compass lines from two wind roses.
  const roses: Point[] = [
    [1500, 215],
    [2140, 1340],
  ];
  svg += `<g stroke="${INK}" stroke-width="1" opacity="0.2">`;
  for (const [rx, ry] of roses) {
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      svg += `<line x1="${rx}" y1="${ry}" x2="${(rx + Math.cos(angle) * 3200).toFixed(0)}" y2="${(ry + Math.sin(angle) * 3200).toFixed(0)}"/>`;
    }
  }
  svg += `</g>`;

  // Little waves on the open sea.
  svg += `<g fill="none" stroke="${INK}" stroke-width="1.3" opacity="0.32" stroke-linecap="round">`;
  for (let i = 0; i < 420; i++) {
    const x = 110 + random() * (WIDTH - 220);
    const y = 110 + random() * (HEIGHT - 220);
    if (onLand(x, y) || onLand(x + 26, y)) continue;
    svg += `<path d="M${x.toFixed(0)} ${y.toFixed(0)}q6.5 -7 13 0t13 0"/>`;
  }
  svg += `</g>`;

  // Islands: shallows shading first, then land, then the coast in ink.
  for (const island of islands) {
    const d = smoothPath(island.outline);
    svg += `<path d="${d}" fill="none" stroke="#9fb8ae" stroke-width="46" stroke-linejoin="round" opacity="0.5"/>`;
    svg += `<path d="${d}" fill="none" stroke="#b9cdc4" stroke-width="22" stroke-linejoin="round"/>`;
  }
  for (const island of islands) {
    const d = smoothPath(island.outline);
    svg += `<path d="${d}" fill="${LAND}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`;
    // Shore hatching, just inside the coast.
    svg += `<g stroke="${INK}" stroke-width="1" opacity="0.5">`;
    for (let i = 0; i < island.outline.length; i += 1) {
      const [x, y] = island.outline[i]!;
      const dx = island.cx - x;
      const dy = island.cy - y;
      const length = Math.hypot(dx, dy) || 1;
      const reach = 7 + random() * 9;
      svg += `<line x1="${(x + (dx / length) * 3).toFixed(1)}" y1="${(y + (dy / length) * 3).toFixed(1)}" x2="${(x + (dx / length) * reach).toFixed(1)}" y2="${(y + (dy / length) * reach).toFixed(1)}"/>`;
    }
    svg += `</g>`;
  }

  // A spine of mountains down the main island, and a few on the larger outliers.
  const mountain = (x: number, y: number, s: number) =>
    `<path d="M${(x - 15 * s).toFixed(1)} ${(y + 12 * s).toFixed(1)} L${x.toFixed(1)} ${(y - 15 * s).toFixed(1)} L${(x + 15 * s).toFixed(1)} ${(y + 12 * s).toFixed(1)}" fill="${LAND}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M${x.toFixed(1)} ${(y - 15 * s).toFixed(1)} l${(4 * s).toFixed(1)} ${(13 * s).toFixed(1)} M${(x + 3 * s).toFixed(1)} ${(y - 6 * s).toFixed(1)} l${(5 * s).toFixed(1)} ${(13 * s).toFixed(1)}" stroke="${INK}" stroke-width="1.1" fill="none" opacity="0.7"/>`;
  svg += `<g>`;
  const ridge: Point[] = [];
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const x = kaldor.cx - 330 + t * 560 + (random() - 0.5) * 50;
    const y = kaldor.cy - 190 + Math.sin(t * Math.PI) * -70 + t * 170 + (random() - 0.5) * 60;
    if (insideIsland(kaldor, x, y) && insideIsland(kaldor, x, y + 40)) ridge.push([x, y]);
  }
  ridge.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of ridge) svg += mountain(x, y, 0.9 + random() * 0.7);
  for (const island of others.slice(0, 3)) {
    for (let i = 0; i < 4; i++) {
      const x = island.cx + (random() - 0.5) * 90;
      const y = island.cy + (random() - 0.5) * 60;
      if (insideIsland(island, x, y + 14)) svg += mountain(x, y, 0.7 + random() * 0.4);
    }
  }
  svg += `</g>`;

  // Woods: small rounded tufts in the south-west of the main island.
  svg += `<g fill="none" stroke="${INK}" stroke-width="1.3" opacity="0.75">`;
  for (let i = 0; i < 150; i++) {
    const x = kaldor.cx - 420 + random() * 420;
    const y = kaldor.cy + 60 + random() * 260;
    if (!insideIsland(kaldor, x, y) || !insideIsland(kaldor, x - 24, y + 16)) continue;
    svg += `<path d="M${(x - 7).toFixed(1)} ${y.toFixed(1)}a7 7 0 0 1 14 0M${x.toFixed(1)} ${y.toFixed(1)}v6"/>`;
  }
  svg += `</g>`;

  // The chart's furniture: wind roses, neatline, scale and title.
  svg += windRose(roses[0]![0], roses[0]![1], 34);
  svg += windRose(roses[1]![0], roses[1]![1], 62);
  svg += `<rect x="70" y="70" width="${WIDTH - 140}" height="${HEIGHT - 140}" fill="none" stroke="${INK}" stroke-width="5"/>`;
  svg += `<rect x="52" y="52" width="${WIDTH - 104}" height="${HEIGHT - 104}" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
  svg += `<g stroke="${INK}" stroke-width="1.5">`;
  for (let x = 70; x <= WIDTH - 70; x += 113)
    svg += `<line x1="${x}" y1="52" x2="${x}" y2="70"/><line x1="${x}" y1="${HEIGHT - 70}" x2="${x}" y2="${HEIGHT - 52}"/>`;
  for (let y = 70; y <= HEIGHT - 70; y += 104.3)
    svg += `<line x1="52" y1="${y.toFixed(1)}" x2="70" y2="${y.toFixed(1)}"/><line x1="${WIDTH - 70}" y1="${y.toFixed(1)}" x2="${WIDTH - 52}" y2="${y.toFixed(1)}"/>`;
  svg += `</g>`;
  // Scale of leagues.
  svg += `<g transform="translate(150 ${HEIGHT - 170})" stroke="${INK}" fill="${INK}" font-family="Georgia, 'Times New Roman', serif">`;
  for (let i = 0; i < 4; i++)
    svg += `<rect x="${i * 90}" y="0" width="90" height="10" fill="${i % 2 ? PAPER : INK}" stroke-width="1.5"/>`;
  svg += `<text x="0" y="-10" font-size="24" stroke="none">0</text><text x="360" y="-10" font-size="24" text-anchor="end" stroke="none">40 leagues</text></g>`;
  // Title cartouche.
  svg += `<g transform="translate(${WIDTH - 720} 118)">`;
  svg += `<rect width="560" height="150" fill="${PAPER}" stroke="${INK}" stroke-width="3"/><rect x="9" y="9" width="542" height="132" fill="none" stroke="${INK}" stroke-width="1"/>`;
  svg += `<text x="280" y="70" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="46" letter-spacing="5" fill="${INK}">THE SHATTERED REACH</text>`;
  svg += `<text x="280" y="112" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="26" fill="${INK}">with the isle of Kaldor and its waters</text>`;
  svg += `</g>`;
  svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#age)"/>`;
  svg += `</svg>`;

  const fraction = ([x, y]: Point): Point => [
    Math.round((x / WIDTH) * 10000) / 10000,
    Math.round((y / HEIGHT) * 10000) / 10000,
  ];
  const vesh = spot(kaldor, 0.06, 0.07);
  const saltmere = spot(kaldor, 0.3, 0.08);
  const roadPoints: Point[] = [vesh];
  for (const along of [0.11, 0.16, 0.21, 0.26]) roadPoints.push(spot(kaldor, along, 0.16));
  roadPoints.push(saltmere);
  const lampRock: Point = [others[5]!.cx, others[5]!.cy];
  return {
    svg,
    width: WIDTH,
    height: HEIGHT,
    places: {
      vesh: fraction(vesh),
      eel: fraction([vesh[0] - 26, vesh[1] + 18]),
      guildHall: fraction([vesh[0] - 6, vesh[1] - 30]),
      kaldorPeak: fraction(ridge[Math.floor(ridge.length / 2)] ?? [kaldor.cx, kaldor.cy]),
      northCape: fraction(spot(kaldor, 0.78, 0.06)),
      saltmere: fraction(saltmere),
      wreck: fraction([others[1]!.cx - 150, others[1]!.cy - 110]),
      lampRock: fraction(lampRock),
    },
    road: roadPoints.map(fraction),
    seaLane: [
      vesh,
      [vesh[0] + 90, vesh[1] - 40] as Point,
      [lampRock[0] - 70, lampRock[1] + 30] as Point,
      lampRock,
    ].map(fraction),
    kaldorOutline: kaldor.outline.filter((_, i) => i % 5 === 0).map(fraction),
  };
}
