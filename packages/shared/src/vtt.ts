import type { MapPoint } from './schemas/atlas';

/*
 * Universal VTT (.dd2vtt) is the file Dungeondraft and other mapmakers export and Foundry,
 * Roll20 (with a script), Fantasy Grounds and others import: the picture, the grid, walls that
 * block sight, and lights. All positions are in grid squares from the top-left corner.
 */

export const VTT_FORMAT_VERSION = 0.3;
export const DEFAULT_PIXELS_PER_GRID = 70;
export const MIN_PIXELS_PER_GRID = 16;
export const MAX_PIXELS_PER_GRID = 512;
/** The longest side the picture is sent at; bigger maps are scaled down to this. */
export const VTT_MAX_IMAGE_SIDE = 8192;

/** Layers with these names (any capitals) become walls and lights on export. */
export const VTT_WALLS_LAYER = 'walls';
export const VTT_LIGHTS_LAYER = 'lights';

export interface VttPoint {
  x: number;
  y: number;
}

export interface UniversalVtt {
  format: number;
  resolution: {
    map_origin: VttPoint;
    /** Map size in grid squares. */
    map_size: VttPoint;
    pixels_per_grid: number;
  };
  /** Each wall is a line of points; sight stops at it. */
  line_of_sight: VttPoint[][];
  objects_line_of_sight: VttPoint[][];
  portals: never[];
  environment: { baked_lighting: boolean; ambient_light: string };
  lights: {
    position: VttPoint;
    range: number;
    intensity: number;
    color: string;
    shadows: boolean;
  }[];
  /** The picture, as base64 PNG. */
  image: string;
}

export interface VttFeature {
  kind: string;
  points: MapPoint[];
  layerId: string | null;
}

export interface VttInput {
  /** The picture's size in pixels, as it will be sent. */
  imageWidth: number;
  imageHeight: number;
  pixelsPerGrid: number;
  features: readonly VttFeature[];
  layers: readonly { id: string; name: string }[];
  imageBase64: string;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** How many grid squares of the given size fit across a picture. */
export function gridSquares(pixels: number, pixelsPerGrid: number): number {
  return round(pixels / pixelsPerGrid);
}

export function buildUniversalVtt(input: VttInput): UniversalVtt {
  const squares = {
    x: gridSquares(input.imageWidth, input.pixelsPerGrid),
    y: gridSquares(input.imageHeight, input.pixelsPerGrid),
  };
  const at = ([fx, fy]: MapPoint): VttPoint => ({
    x: round(fx * squares.x),
    y: round(fy * squares.y),
  });
  const layerNamed = (name: string) =>
    new Set(input.layers.filter((l) => l.name.trim().toLowerCase() === name).map((l) => l.id));
  const walls = layerNamed(VTT_WALLS_LAYER);
  const lights = layerNamed(VTT_LIGHTS_LAYER);

  const sight: VttPoint[][] = [];
  const lamps: UniversalVtt['lights'] = [];
  for (const feature of input.features) {
    if (!feature.layerId) continue;
    if (walls.has(feature.layerId) && (feature.kind === 'path' || feature.kind === 'region')) {
      const line = feature.points.map(at);
      // A region is a closed room: join the last corner back to the first.
      if (feature.kind === 'region' && line.length > 0) line.push(line[0]!);
      sight.push(line);
    } else if (lights.has(feature.layerId) && feature.kind === 'pin') {
      lamps.push({
        position: at(feature.points[0]!),
        range: 6,
        intensity: 1,
        color: 'ffffffff',
        shadows: true,
      });
    }
  }

  return {
    format: VTT_FORMAT_VERSION,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: squares,
      pixels_per_grid: input.pixelsPerGrid,
    },
    line_of_sight: sight,
    objects_line_of_sight: [],
    portals: [],
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    lights: lamps,
    image: input.imageBase64,
  };
}

// ---- Tokens ---------------------------------------------------------------------------------

export interface TokenCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * The square part of a picture a token shows. At zoom 1 it is the largest centred square; more
 * zoom shows less of it. `panX` and `panY` (-1 to 1) slide the square towards an edge, as far
 * as it can go without leaving the picture.
 */
export function tokenCrop(
  width: number,
  height: number,
  zoom: number,
  panX: number,
  panY: number,
): TokenCrop {
  const side = Math.min(width, height) / Math.max(1, zoom);
  const slack = { x: width - side, y: height - side };
  const clamp = (n: number) => Math.min(1, Math.max(-1, n));
  return {
    sx: slack.x / 2 + (slack.x / 2) * clamp(panX),
    sy: slack.y / 2 + (slack.y / 2) * clamp(panY),
    sw: side,
    sh: side,
  };
}
