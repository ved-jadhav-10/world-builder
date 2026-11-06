import { mapMaxZoom, TILE_SIZE, type MapPoint } from './schemas/atlas';

/*
 * Fog of war. A map with fog on shows players only the areas the GM has revealed: the tiles they
 * are sent are painted over outside those areas, and items outside them are not sent at all.
 */

/** The colour fog is painted in. */
export const FOG_COLOR = '#0f172a';

/** Is `point` inside `polygon`? (Ray casting; points exactly on an edge may go either way.) */
export function pointInPolygon(point: MapPoint, polygon: readonly MapPoint[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is any of an item's points inside any revealed area? */
export function isUncovered(points: readonly MapPoint[], reveals: readonly MapPoint[][]): boolean {
  return points.some((point) => reveals.some((area) => pointInPolygon(point, area)));
}

/** The size of the whole map at one zoom level of its tile pyramid, in that level's pixels. */
export function levelSize(width: number, height: number, z: number) {
  const scale = 2 ** (z - mapMaxZoom(width, height));
  return { width: width * scale, height: height * scale };
}

/**
 * An SVG the size of one tile with the revealed areas filled white and everything else clear.
 * Used as a mask: the tile shows only where it is white.
 */
export function revealMaskSvg(
  reveals: readonly MapPoint[][],
  map: { width: number; height: number },
  tile: { z: number; x: number; y: number },
): string {
  const level = levelSize(map.width, map.height, tile.z);
  const shapes = reveals
    .map((area) => {
      const points = area
        .map(([fx, fy]) => {
          const x = fx * level.width - tile.x * TILE_SIZE;
          const y = fy * level.height - tile.y * TILE_SIZE;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
      return `<polygon points="${points}" fill="#fff"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}">${shapes}</svg>`;
}
