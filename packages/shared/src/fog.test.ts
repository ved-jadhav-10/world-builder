import { describe, expect, it } from 'vitest';
import { isUncovered, levelSize, pointInPolygon, revealMaskSvg } from './fog';
import type { MapPoint } from './schemas/atlas';

const square: MapPoint[] = [
  [0.2, 0.2],
  [0.6, 0.2],
  [0.6, 0.6],
  [0.2, 0.6],
];
// An L shape, so a point in its notch is outside though inside its bounding box.
const ell: MapPoint[] = [
  [0, 0],
  [0.5, 0],
  [0.5, 0.25],
  [0.25, 0.25],
  [0.25, 0.5],
  [0, 0.5],
];

describe('pointInPolygon', () => {
  it('finds points inside and outside', () => {
    expect(pointInPolygon([0.4, 0.4], square)).toBe(true);
    expect(pointInPolygon([0.7, 0.4], square)).toBe(false);
    expect(pointInPolygon([0.4, 0.1], square)).toBe(false);
  });
  it('respects concave shapes', () => {
    expect(pointInPolygon([0.1, 0.4], ell)).toBe(true);
    expect(pointInPolygon([0.4, 0.1], ell)).toBe(true);
    expect(pointInPolygon([0.4, 0.4], ell)).toBe(false);
  });
});

describe('isUncovered', () => {
  it('counts an item as revealed when any of its points is in any area', () => {
    expect(isUncovered([[0.4, 0.4]], [square])).toBe(true);
    expect(
      isUncovered(
        [
          [0.9, 0.9],
          [0.4, 0.4],
        ],
        [square],
      ),
    ).toBe(true);
    expect(isUncovered([[0.9, 0.9]], [square])).toBe(false);
    expect(
      isUncovered(
        [[0.9, 0.9]],
        [
          square,
          [
            [0.8, 0.8],
            [1, 0.8],
            [1, 1],
          ],
        ],
      ),
    ).toBe(true);
  });
  it('reveals nothing when nothing is revealed', () => {
    expect(isUncovered([[0.4, 0.4]], [])).toBe(false);
  });
});

describe('revealMaskSvg', () => {
  it('works out the size of each zoom level', () => {
    // 1024 wide: levels 0 to 2 (256, 512, 1024 across).
    expect(levelSize(1024, 512, 2)).toEqual({ width: 1024, height: 512 });
    expect(levelSize(1024, 512, 0)).toEqual({ width: 256, height: 128 });
  });

  it('draws areas in the tile’s own pixels', () => {
    // Zoom 0 of a 256-wide map is one tile, so fractions are pixels directly.
    const svg = revealMaskSvg([square], { width: 256, height: 256 }, { z: 0, x: 0, y: 0 });
    expect(svg).toContain('points="51.20,51.20 153.60,51.20 153.60,153.60 51.20,153.60"');
    expect(svg).toContain('width="256"');
  });

  it('shifts areas for a tile that is not the first', () => {
    // At the deepest level of a 512-wide map, the second tile along starts at pixel 256.
    const svg = revealMaskSvg([square], { width: 512, height: 512 }, { z: 1, x: 1, y: 0 });
    // 0.2 * 512 - 256 = -153.6 (off the left edge); 0.6 * 512 - 256 = 51.2
    expect(svg).toContain('-153.60,102.40');
    expect(svg).toContain('51.20,102.40');
  });
});
