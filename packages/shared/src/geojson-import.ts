import { z } from 'zod';
import type { FeatureKind, MapPoint } from './schemas/atlas';

/*
 * Map generators such as Azgaar's Fantasy Map Generator and Watabou's city generators can
 * export GeoJSON. This turns the places, roads and areas in one into map items: points become
 * pins, lines become paths and polygons become regions, scaled to fit the map.
 */

export const MAX_IMPORT_ITEMS = 500;
const MAX_POINTS = 500;

export interface ImportedItem {
  kind: Extract<FeatureKind, 'pin' | 'path' | 'region'>;
  points: MapPoint[];
  label: string;
}

export interface GeoJsonImport {
  items: ImportedItem[];
  /** Things in the file that could not be used, or were over the limit. */
  skipped: number;
}

const position = z.tuple([z.number(), z.number()]).rest(z.number());
const geometry = z.object({ type: z.string(), coordinates: z.unknown() });
const feature = z.object({
  type: z.literal('Feature'),
  geometry: geometry.nullable(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
});
const collection = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.unknown()).max(200_000),
});

const NAME_KEYS = ['name', 'Name', 'title', 'label', 'burg', 'state', 'id'];

function nameOf(properties: Record<string, unknown> | null | undefined): string {
  for (const key of NAME_KEYS) {
    const value = properties?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120);
    if (typeof value === 'number') return String(value);
  }
  return '';
}

const positions = (value: unknown) => z.array(position).safeParse(value);

interface Raw {
  kind: ImportedItem['kind'];
  coordinates: [number, number][];
  label: string;
}

/** Pulls the usable shapes out of a GeoJSON document, in file order. */
function collect(json: unknown): { raw: Raw[]; skipped: number } {
  const root = collection.safeParse(json);
  const features: unknown[] = root.success ? root.data.features : [json];
  const raw: Raw[] = [];
  let skipped = 0;
  for (const item of features) {
    const parsed = feature.safeParse(item);
    if (!parsed.success || !parsed.data.geometry) {
      skipped++;
      continue;
    }
    const { type, coordinates } = parsed.data.geometry;
    const label = nameOf(parsed.data.properties);
    const add = (kind: Raw['kind'], coords: unknown) => {
      const ok = positions(coords);
      if (ok.success && ok.data.length > 0) {
        raw.push({ kind, coordinates: ok.data.map(([x, y]) => [x, y]), label });
      } else skipped++;
    };
    if (type === 'Point') add('pin', [coordinates]);
    else if (type === 'MultiPoint' && Array.isArray(coordinates)) {
      for (const point of coordinates) add('pin', [point]);
    } else if (type === 'LineString') add('path', coordinates);
    else if (type === 'MultiLineString' && Array.isArray(coordinates)) {
      for (const line of coordinates) add('path', line);
    } else if (type === 'Polygon' && Array.isArray(coordinates)) add('region', coordinates[0]);
    else if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
      for (const polygon of coordinates) {
        if (Array.isArray(polygon)) add('region', polygon[0]);
      }
    } else skipped++;
  }
  return { raw, skipped };
}

/** Keeps at most `limit` points of a line, evenly spaced, always keeping both ends. */
function thin<T>(points: T[], limit: number): T[] {
  if (points.length <= limit) return points;
  const out: T[] = [];
  for (let i = 0; i < limit; i++)
    out.push(points[Math.round((i * (points.length - 1)) / (limit - 1))]!);
  return out;
}

export interface GeoJsonOptions {
  /** True when y grows upward, as latitude does; false for pixel coordinates. */
  flipY: boolean;
}

/**
 * Scales everything in a GeoJSON document into the map, keeping its proportions and leaving a
 * small margin. `width` and `height` are the map's pixel size, so a square drawing is not
 * stretched over a wide map.
 */
export function geojsonToItems(
  json: unknown,
  map: { width: number; height: number },
  options: GeoJsonOptions,
): GeoJsonImport {
  const { raw, skipped: unusable } = collect(json);
  const kept = raw.slice(0, MAX_IMPORT_ITEMS);
  let skipped = unusable + (raw.length - kept.length);
  if (kept.length === 0) return { items: [], skipped };

  const xs = kept.flatMap((r) => r.coordinates.map((c) => c[0]));
  const ys = kept.flatMap((r) => r.coordinates.map((c) => c[1]));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const margin = 0.04;
  // One scale for both axes (in map pixels) so shapes keep their proportions.
  const room = { x: map.width * (1 - 2 * margin), y: map.height * (1 - 2 * margin) };
  const scale = Math.min(
    spanX > 0 ? room.x / spanX : Infinity,
    spanY > 0 ? room.y / spanY : Infinity,
  );
  const used = {
    x: Number.isFinite(scale) ? spanX * scale : 0,
    y: Number.isFinite(scale) ? spanY * scale : 0,
  };
  const offset = { x: (map.width - used.x) / 2, y: (map.height - used.y) / 2 };

  const toPoint = ([x, y]: [number, number]): MapPoint => {
    const px = Number.isFinite(scale) ? (x - minX) * scale : room.x / 2;
    const rawY = Number.isFinite(scale) ? (y - minY) * scale : room.y / 2;
    const py = options.flipY ? used.y - rawY : rawY;
    const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
    return [
      round(Math.min(1, Math.max(0, (offset.x + px) / map.width))),
      round(Math.min(1, Math.max(0, (offset.y + py) / map.height))),
    ];
  };

  const items: ImportedItem[] = [];
  for (const r of kept) {
    let coordinates = r.coordinates;
    // A polygon repeats its first point at the end; a region does not need that.
    if (r.kind === 'region' && coordinates.length > 1) {
      const first = coordinates[0]!;
      const last = coordinates.at(-1)!;
      if (first[0] === last[0] && first[1] === last[1]) coordinates = coordinates.slice(0, -1);
    }
    coordinates = thin(coordinates, MAX_POINTS);
    const needs = r.kind === 'pin' ? 1 : r.kind === 'path' ? 2 : 3;
    if (coordinates.length < needs) {
      skipped++;
      continue;
    }
    items.push({ kind: r.kind, points: coordinates.map(toPoint), label: r.label });
  }
  return { items, skipped };
}
