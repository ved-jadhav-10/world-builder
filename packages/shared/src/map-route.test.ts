import { describe, expect, it } from 'vitest';
import { findRoute, type RoutePath, type RoutePin } from './map-route';
import type { MapPoint } from './schemas/atlas';

const size = { width: 1000, height: 1000 };
const pin = (id: string, point: MapPoint): RoutePin => ({ id, point });
const path = (id: string, ...points: MapPoint[]): RoutePath => ({ id, points });

describe('findRoute', () => {
  const pins = [
    pin('A', [0.1, 0.1]),
    pin('B', [0.5, 0.1]),
    pin('C', [0.5, 0.5]),
    pin('D', [0.9, 0.9]),
  ];

  it('walks roads from one pin to another through a shared junction', () => {
    const roads = [path('r1', [0.1, 0.1], [0.5, 0.1]), path('r2', [0.5, 0.1], [0.5, 0.5])];
    const route = findRoute(pins, roads, 'A', 'C', size)!;
    expect(route.pathIds).toEqual(['r1', 'r2']);
    expect(route.points).toEqual([
      [0.1, 0.1],
      [0.5, 0.1],
      [0.5, 0.5],
    ]);
    expect(route.length).toBeCloseTo(800, 5);
  });

  it('joins a road to a pin that is only close to its end', () => {
    const roads = [path('r1', [0.1, 0.1], [0.502, 0.1])];
    expect(findRoute(pins, roads, 'A', 'B', size)).not.toBeNull();
    expect(findRoute(pins, roads, 'A', 'B', { ...size, tolerance: 0.0005 })).toBeNull();
  });

  it('takes the shorter of two ways, and can travel a road backwards', () => {
    const roads = [
      path('direct', [0.5, 0.5], [0.5, 0.1]),
      path('around', [0.5, 0.5], [0.9, 0.5], [0.9, 0.1], [0.5, 0.1]),
    ];
    const route = findRoute(pins, roads, 'B', 'C', size)!;
    expect(route.pathIds).toEqual(['direct']);
    expect(route.points[0]).toEqual([0.5, 0.1]);
    expect(route.length).toBeCloseTo(400, 5);
  });

  it('returns null when the pins are not connected or a pin is unknown', () => {
    const roads = [path('r1', [0.1, 0.1], [0.5, 0.1])];
    expect(findRoute(pins, roads, 'A', 'D', size)).toBeNull();
    expect(findRoute(pins, roads, 'A', 'nope', size)).toBeNull();
  });

  it('gives an empty route between a pin and itself', () => {
    expect(findRoute(pins, [], 'A', 'A', size)).toEqual({ pathIds: [], points: [], length: 0 });
  });

  it('weighs a tall map’s vertical roads by its real height', () => {
    const tall = { width: 1000, height: 3000 };
    const roads = [path('up', [0.1, 0.1], [0.1, 0.2]), path('across', [0.1, 0.1], [0.3, 0.1])];
    const ends = [pin('s', [0.1, 0.1]), pin('v', [0.1, 0.2]), pin('h', [0.3, 0.1])];
    expect(findRoute(ends, roads, 's', 'v', tall)!.length).toBeCloseTo(300, 5);
    expect(findRoute(ends, roads, 's', 'h', tall)!.length).toBeCloseTo(200, 5);
  });
});
