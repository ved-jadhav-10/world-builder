import { describe, expect, it } from 'vitest';
import { buildUniversalVtt, gridSquares, tokenCrop, type VttInput } from './vtt';

const base: VttInput = {
  imageWidth: 1400,
  imageHeight: 700,
  pixelsPerGrid: 70,
  features: [],
  layers: [],
  imageBase64: 'AAAA',
};

describe('buildUniversalVtt', () => {
  it('describes the picture and grid in squares', () => {
    const vtt = buildUniversalVtt(base);
    expect(vtt.format).toBe(0.3);
    expect(vtt.resolution).toEqual({
      map_origin: { x: 0, y: 0 },
      map_size: { x: 20, y: 10 },
      pixels_per_grid: 70,
    });
    expect(vtt.image).toBe('AAAA');
    expect(vtt.line_of_sight).toEqual([]);
    expect(vtt.lights).toEqual([]);
  });

  it('turns paths and regions on a layer named Walls into sight-blocking lines', () => {
    const vtt = buildUniversalVtt({
      ...base,
      layers: [
        { id: 'w', name: ' Walls ' },
        { id: 'x', name: 'Roads' },
      ],
      features: [
        {
          kind: 'path',
          layerId: 'w',
          points: [
            [0, 0],
            [0.5, 0],
          ],
        },
        {
          kind: 'region',
          layerId: 'w',
          points: [
            [0.1, 0.1],
            [0.2, 0.1],
            [0.2, 0.2],
          ],
        },
        {
          kind: 'path',
          layerId: 'x',
          points: [
            [0, 0],
            [1, 1],
          ],
        },
        {
          kind: 'path',
          layerId: null,
          points: [
            [0, 0],
            [1, 1],
          ],
        },
        { kind: 'pin', layerId: 'w', points: [[0.5, 0.5]] },
      ],
    });
    expect(vtt.line_of_sight).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 2, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 2 },
        { x: 2, y: 1 },
      ],
    ]);
  });

  it('turns pins on a layer named Lights into lights', () => {
    const vtt = buildUniversalVtt({
      ...base,
      layers: [{ id: 'l', name: 'LIGHTS' }],
      features: [
        { kind: 'pin', layerId: 'l', points: [[0.25, 0.5]] },
        { kind: 'label', layerId: 'l', points: [[0.5, 0.5]] },
      ],
    });
    expect(vtt.lights).toHaveLength(1);
    expect(vtt.lights[0]).toMatchObject({ position: { x: 5, y: 5 }, shadows: true });
  });

  it('rounds squares to three places for pictures that do not divide evenly', () => {
    expect(gridSquares(1000, 70)).toBe(14.286);
  });
});

describe('tokenCrop', () => {
  it('takes the largest centred square at zoom 1', () => {
    expect(tokenCrop(400, 200, 1, 0, 0)).toEqual({ sx: 100, sy: 0, sw: 200, sh: 200 });
  });
  it('shows less of the picture as it zooms in', () => {
    expect(tokenCrop(400, 200, 2, 0, 0)).toEqual({ sx: 150, sy: 50, sw: 100, sh: 100 });
  });
  it('slides towards an edge but never off the picture', () => {
    expect(tokenCrop(400, 200, 2, -1, -1)).toEqual({ sx: 0, sy: 0, sw: 100, sh: 100 });
    expect(tokenCrop(400, 200, 2, 1, 1)).toEqual({ sx: 300, sy: 100, sw: 100, sh: 100 });
    expect(tokenCrop(400, 200, 2, 9, -9)).toEqual({ sx: 300, sy: 0, sw: 100, sh: 100 });
  });
  it('does not zoom out past the whole square', () => {
    expect(tokenCrop(200, 200, 0.2, 0, 0)).toEqual({ sx: 0, sy: 0, sw: 200, sh: 200 });
  });
});
