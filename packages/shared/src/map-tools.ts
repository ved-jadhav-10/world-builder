import type { MapPoint } from './schemas/atlas';

/*
 * Map maths that needs no map: measuring a line against the map's scale, working out travel
 * time, and gathering pins that are too close together to tell apart. Positions are fractions
 * of the map's width and height, like everything else on a map.
 */

export interface TravelMode {
  /** "On foot", "Horse", "Ship"… */
  name: string;
  /** How far this mode goes in one day of travel, in the map's unit. */
  perDay: number;
}

export interface MapScale {
  /** How many units the whole width of the map covers. */
  width: number;
  /** What a unit is called: "mi", "km", "leagues"… */
  unit: string;
  modes: TravelMode[];
}

/** A day of travel counts as this many hours when a trip is shorter than a day. */
export const TRAVEL_HOURS_PER_DAY = 8;

/** Common walking, riding and sailing paces, in miles a day. */
const DEFAULT_MODES_MILES: TravelMode[] = [
  { name: 'On foot', perDay: 24 },
  { name: 'Horse', perDay: 40 },
  { name: 'Ship', perDay: 100 },
];

const MILES_PER_UNIT: Record<string, number> = { mi: 1, km: 0.621371, leagues: 3 };

/** Typical paces in the given unit (miles, kilometres or leagues; anything else reads as miles). */
export function defaultTravelModes(unit: string): TravelMode[] {
  const miles = MILES_PER_UNIT[unit.trim().toLowerCase()] ?? 1;
  return DEFAULT_MODES_MILES.map((mode) => ({
    name: mode.name,
    perDay: Math.max(1, Math.round(mode.perDay / miles)),
  }));
}

/** A map's height in its own units, assuming its pixels are square. */
const heightUnits = (scale: Pick<MapScale, 'width'>, size: { width: number; height: number }) =>
  (scale.width * size.height) / size.width;

/** The length of a line along `points`, in the scale's unit. */
export function pathLength(
  points: readonly MapPoint[],
  size: { width: number; height: number },
  scale: Pick<MapScale, 'width'>,
): number {
  const h = heightUnits(scale, size);
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot((b[0] - a[0]) * scale.width, (b[1] - a[1]) * h);
  }
  return total;
}

/**
 * The map width that makes a line of known length come out right: draw a line between two
 * places whose distance is known, and this says how many units the whole map is wide.
 * Null when the line has no length.
 */
export function scaleWidthFromReference(
  points: readonly MapPoint[],
  size: { width: number; height: number },
  knownDistance: number,
): number | null {
  const unitLength = pathLength(points, size, { width: 1 });
  if (!(unitLength > 0) || !(knownDistance > 0)) return null;
  return knownDistance / unitLength;
}

/** Days of travel for a distance at a pace. */
export const travelDays = (distance: number, perDay: number): number =>
  perDay > 0 ? distance / perDay : Infinity;

/** "5 hours", "2 days", "3 days 4 hours", or "about 14 days" for long trips. */
export function formatTravel(days: number): string {
  if (!Number.isFinite(days) || days < 0) return '—';
  const totalHours = Math.round(days * TRAVEL_HOURS_PER_DAY);
  if (totalHours <= 0) return 'under an hour';
  if (days >= 10) return `about ${Math.round(days)} days`;
  const wholeDays = Math.floor(totalHours / TRAVEL_HOURS_PER_DAY);
  const hours = totalHours % TRAVEL_HOURS_PER_DAY;
  const parts: string[] = [];
  if (wholeDays > 0) parts.push(`${wholeDays} ${wholeDays === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  return parts.join(' ');
}

/** A distance for display: whole numbers from 100 up, one decimal below that. */
export function formatDistance(distance: number, unit: string): string {
  const rounded = distance >= 100 ? Math.round(distance) : Math.round(distance * 10) / 10;
  return `${rounded.toLocaleString('en-US')} ${unit}`;
}

// ---- Clustering -----------------------------------------------------------

export interface ClusterInput {
  id: string;
  point: MapPoint;
}

export interface PinCluster {
  /** Every pin in the group, in the order they were given. A lone pin is a group of one. */
  ids: string[];
  /** The group's centre, as map fractions. */
  point: MapPoint;
}

/**
 * Groups pins that would sit within `radiusPx` of each other on screen. `pixels` is the size
 * of the whole map on screen at the current zoom. Pins in `keep` (the selected one) always
 * stay on their own. The result depends only on the input order, so it does not flicker.
 */
export function clusterPins(
  pins: readonly ClusterInput[],
  pixels: { width: number; height: number },
  radiusPx: number,
  keep: ReadonlySet<string> = new Set(),
): PinCluster[] {
  if (radiusPx <= 0) return pins.map((pin) => ({ ids: [pin.id], point: pin.point }));
  const cell = radiusPx;
  const grid = new Map<string, number[]>();
  const xy = pins.map((pin) => [pin.point[0] * pixels.width, pin.point[1] * pixels.height]);
  const cellKey = (cx: number, cy: number) => `${cx},${cy}`;
  xy.forEach(([x, y], index) => {
    const key = cellKey(Math.floor(x! / cell), Math.floor(y! / cell));
    const list = grid.get(key);
    if (list) list.push(index);
    else grid.set(key, [index]);
  });

  const taken = new Set<number>();
  const clusters: PinCluster[] = [];
  pins.forEach((pin, index) => {
    if (taken.has(index)) return;
    taken.add(index);
    const members = [index];
    if (!keep.has(pin.id)) {
      const [x, y] = xy[index]!;
      const cx = Math.floor(x! / cell);
      const cy = Math.floor(y! / cell);
      const near: number[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const other of grid.get(cellKey(cx + dx, cy + dy)) ?? []) {
            if (taken.has(other) || keep.has(pins[other]!.id)) continue;
            const [ox, oy] = xy[other]!;
            if (Math.hypot(ox! - x!, oy! - y!) <= radiusPx) near.push(other);
          }
        }
      }
      near.sort((a, b) => a - b);
      for (const other of near) {
        taken.add(other);
        members.push(other);
      }
    }
    const sumX = members.reduce((total, m) => total + pins[m]!.point[0], 0);
    const sumY = members.reduce((total, m) => total + pins[m]!.point[1], 0);
    clusters.push({
      ids: members.map((m) => pins[m]!.id),
      point: [sumX / members.length, sumY / members.length],
    });
  });
  return clusters;
}
