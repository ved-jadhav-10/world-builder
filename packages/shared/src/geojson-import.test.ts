import { describe, expect, it } from 'vitest';
import { geojsonToItems, MAX_IMPORT_ITEMS } from './geojson-import';

const square = { width: 1000, height: 1000 };
const point = (name: string | undefined, x: number, y: number) => ({
  type: 'Feature',
  properties: name ? { name } : {},
  geometry: { type: 'Point', coordinates: [x, y] },
});
const collection = (...features: object[]) => ({ type: 'FeatureCollection', features });

describe('geojsonToItems', () => {
  it('turns points into named pins scaled into the map, north up', () => {
    const { items, skipped } = geojsonToItems(
      collection(point('Havenmouth', 0, 0), point('Vael', 10, 10)),
      square,
      { flipY: true },
    );
    expect(skipped).toBe(0);
    expect(items.map((i) => [i.kind, i.label])).toEqual([
      ['pin', 'Havenmouth'],
      ['pin', 'Vael'],
    ]);
    // With a margin of 4% each side; latitude grows upward so y is flipped.
    expect(items[0]!.points[0]).toEqual([0.04, 0.96]);
    expect(items[1]!.points[0]).toEqual([0.96, 0.04]);
  });

  it('keeps pixel-style coordinates the way up they came', () => {
    const { items } = geojsonToItems(collection(point('a', 0, 0), point('b', 10, 10)), square, {
      flipY: false,
    });
    expect(items[0]!.points[0]).toEqual([0.04, 0.04]);
  });

  it('keeps proportions on a wide map instead of stretching', () => {
    const wide = { width: 2000, height: 1000 };
    const { items } = geojsonToItems(collection(point('a', 0, 0), point('b', 10, 10)), wide, {
      flipY: false,
    });
    const a = items[0]!.points[0]!;
    const b = items[1]!.points[0]!;
    // The drawing is square, so it spans the same number of pixels both ways.
    const pxWide = (b[0] - a[0]) * wide.width;
    const pxTall = (b[1] - a[1]) * wide.height;
    expect(pxWide).toBeCloseTo(pxTall, 3);
  });

  it('makes lines into paths and polygons into regions without the repeated first point', () => {
    const { items } = geojsonToItems(
      collection(
        {
          type: 'Feature',
          properties: { name: 'Salt road' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [5, 5],
              [10, 0],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { name: 'Marches' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 0],
              ],
            ],
          },
        },
      ),
      square,
      { flipY: true },
    );
    expect(items.map((i) => [i.kind, i.points.length])).toEqual([
      ['path', 3],
      ['region', 3],
    ]);
  });

  it('splits multi-part shapes and counts what it cannot use', () => {
    const { items, skipped } = geojsonToItems(
      collection(
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'MultiPoint',
            coordinates: [
              [1, 1],
              [2, 2],
            ],
          },
        },
        { type: 'Feature', properties: null, geometry: null },
        {
          type: 'Feature',
          properties: null,
          geometry: { type: 'GeometryCollection', coordinates: [] },
        },
        {
          type: 'Feature',
          properties: null,
          geometry: { type: 'LineString', coordinates: [[0, 0]] },
        },
        'junk' as unknown as object,
      ),
      square,
      { flipY: true },
    );
    expect(items).toHaveLength(2);
    expect(skipped).toBe(4);
  });

  it('accepts a single feature, and an empty or unreadable document', () => {
    expect(geojsonToItems(point('Solo', 3, 3), square, { flipY: true }).items).toHaveLength(1);
    expect(geojsonToItems(collection(), square, { flipY: true })).toEqual({
      items: [],
      skipped: 0,
    });
    expect(geojsonToItems({ nonsense: true }, square, { flipY: true }).items).toEqual([]);
  });

  it('caps how much it brings in', () => {
    const many = collection(
      ...Array.from({ length: MAX_IMPORT_ITEMS + 25 }, (_, i) => point(`p${i}`, i, i)),
    );
    const { items, skipped } = geojsonToItems(many, square, { flipY: true });
    expect(items).toHaveLength(MAX_IMPORT_ITEMS);
    expect(skipped).toBe(25);
  });

  it('thins a very long line to the most a path can hold', () => {
    const coordinates = Array.from({ length: 2000 }, (_, i) => [i, i % 7]);
    const { items } = geojsonToItems(
      collection({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      }),
      square,
      { flipY: true },
    );
    expect(items[0]!.points).toHaveLength(500);
  });
});
