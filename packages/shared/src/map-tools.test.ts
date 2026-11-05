import { describe, expect, it } from 'vitest';
import {
  clusterPins,
  defaultTravelModes,
  formatDistance,
  formatTravel,
  pathLength,
  scaleWidthFromReference,
  travelDays,
} from './map-tools';
import type { MapPoint } from './schemas/atlas';

const square = { width: 1000, height: 1000 };

describe('pathLength', () => {
  it('measures along the width in the scale’s unit', () => {
    expect(
      pathLength(
        [
          [0, 0.5],
          [1, 0.5],
        ],
        square,
        { width: 300 },
      ),
    ).toBeCloseTo(300);
  });

  it('adds up a bent line', () => {
    const points: MapPoint[] = [
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
    ];
    expect(pathLength(points, square, { width: 200 })).toBeCloseTo(200);
  });

  it('keeps a wide map’s pixels square: going down is shorter per fraction', () => {
    const wide = { width: 2000, height: 1000 };
    // The map is 400 units wide, so 200 units tall; the full height is 200 units.
    expect(
      pathLength(
        [
          [0, 0],
          [0, 1],
        ],
        wide,
        { width: 400 },
      ),
    ).toBeCloseTo(200);
    expect(
      pathLength(
        [
          [0, 0],
          [1, 0],
        ],
        wide,
        { width: 400 },
      ),
    ).toBeCloseTo(400);
  });

  it('is zero for fewer than two points', () => {
    expect(pathLength([], square, { width: 10 })).toBe(0);
    expect(pathLength([[0.2, 0.2]], square, { width: 10 })).toBe(0);
  });
});

describe('scaleWidthFromReference', () => {
  it('finds the map width from a line of known length', () => {
    // Half the map across is 120 miles, so the whole map is 240 wide.
    expect(
      scaleWidthFromReference(
        [
          [0.25, 0.5],
          [0.75, 0.5],
        ],
        square,
        120,
      ),
    ).toBeCloseTo(240);
  });

  it('agrees with pathLength', () => {
    const wide = { width: 3000, height: 1200 };
    const line: MapPoint[] = [
      [0.1, 0.2],
      [0.6, 0.9],
    ];
    const width = scaleWidthFromReference(line, wide, 85)!;
    expect(pathLength(line, wide, { width })).toBeCloseTo(85);
  });

  it('refuses a line with no length or a distance that is not positive', () => {
    expect(
      scaleWidthFromReference(
        [
          [0.5, 0.5],
          [0.5, 0.5],
        ],
        square,
        10,
      ),
    ).toBeNull();
    expect(
      scaleWidthFromReference(
        [
          [0, 0],
          [1, 1],
        ],
        square,
        0,
      ),
    ).toBeNull();
    expect(
      scaleWidthFromReference(
        [
          [0, 0],
          [1, 1],
        ],
        square,
        -5,
      ),
    ).toBeNull();
  });
});

describe('travel', () => {
  it('divides distance by pace', () => {
    expect(travelDays(120, 24)).toBe(5);
    expect(travelDays(10, 0)).toBe(Infinity);
  });

  it('says hours for a short trip and days and hours for a longer one', () => {
    expect(formatTravel(0)).toBe('under an hour');
    expect(formatTravel(0.5)).toBe('4 hours');
    expect(formatTravel(1 / 8)).toBe('1 hour');
    expect(formatTravel(1)).toBe('1 day');
    expect(formatTravel(2.5)).toBe('2 days 4 hours');
    expect(formatTravel(9.9)).toBe('9 days 7 hours');
    expect(formatTravel(10)).toBe('about 10 days');
    expect(formatTravel(14.4)).toBe('about 14 days');
  });

  it('shows nothing useful for an impossible trip', () => {
    expect(formatTravel(Infinity)).toBe('—');
    expect(formatTravel(-1)).toBe('—');
  });

  it('keeps defaults sensible in other units', () => {
    expect(defaultTravelModes('mi').map((m) => m.perDay)).toEqual([24, 40, 100]);
    expect(defaultTravelModes('km').map((m) => m.perDay)).toEqual([39, 64, 161]);
    expect(defaultTravelModes('leagues').map((m) => m.perDay)).toEqual([8, 13, 33]);
    expect(defaultTravelModes('furlongs').map((m) => m.perDay)).toEqual([24, 40, 100]);
  });

  it('formats distances with sensible rounding', () => {
    expect(formatDistance(12.345, 'mi')).toBe('12.3 mi');
    expect(formatDistance(1234.6, 'km')).toBe('1,235 km');
  });
});

describe('clusterPins', () => {
  const pin = (id: string, x: number, y: number) => ({ id, point: [x, y] as MapPoint });
  const screen = { width: 1000, height: 1000 };

  it('leaves far-apart pins alone', () => {
    const out = clusterPins([pin('a', 0.1, 0.1), pin('b', 0.9, 0.9)], screen, 40);
    expect(out.map((c) => c.ids)).toEqual([['a'], ['b']]);
    expect(out[0]!.point).toEqual([0.1, 0.1]);
  });

  it('groups pins closer than the radius and centres the group', () => {
    const out = clusterPins(
      [pin('a', 0.5, 0.5), pin('b', 0.52, 0.5), pin('c', 0.9, 0.9)],
      screen,
      40,
    );
    expect(out.map((c) => c.ids)).toEqual([['a', 'b'], ['c']]);
    expect(out[0]!.point[0]).toBeCloseTo(0.51);
    expect(out[0]!.point[1]).toBeCloseTo(0.5);
  });

  it('splits as the map is zoomed in', () => {
    const pins = [pin('a', 0.5, 0.5), pin('b', 0.52, 0.5)];
    expect(clusterPins(pins, { width: 1000, height: 1000 }, 40)).toHaveLength(1);
    expect(clusterPins(pins, { width: 8000, height: 8000 }, 40)).toHaveLength(2);
  });

  it('never absorbs a pin that must stay on its own', () => {
    const out = clusterPins(
      [pin('a', 0.5, 0.5), pin('b', 0.51, 0.5), pin('c', 0.52, 0.5)],
      screen,
      40,
      new Set(['b']),
    );
    expect(out.map((c) => c.ids).sort()).toEqual([['a', 'c'], ['b']].sort());
  });

  it('puts every pin in exactly one group, whatever the layout', () => {
    const pins = Array.from({ length: 200 }, (_, i) =>
      pin(`p${i}`, ((i * 37) % 101) / 101, ((i * 53) % 97) / 97),
    );
    const out = clusterPins(pins, screen, 60);
    const ids = out.flatMap((c) => c.ids).sort();
    expect(ids).toEqual(pins.map((p) => p.id).sort());
    expect(new Set(ids).size).toBe(200);
  });

  it('gives the same answer for the same input', () => {
    const pins = [pin('a', 0.5, 0.5), pin('b', 0.505, 0.5), pin('c', 0.51, 0.5)];
    expect(clusterPins(pins, screen, 40)).toEqual(clusterPins(pins, screen, 40));
  });

  it('does nothing with a radius of zero or no pins', () => {
    expect(clusterPins([], screen, 40)).toEqual([]);
    expect(clusterPins([pin('a', 0.5, 0.5), pin('b', 0.5, 0.5)], screen, 0)).toHaveLength(2);
  });
});
