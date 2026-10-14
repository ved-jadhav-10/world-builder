import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../env';

/**
 * Where a map's files live. Every path is built from IDs the database issued (UUIDs) and
 * integers that route validation has already checked, never from a client-supplied name.
 */
export const mapDir = (worldId: string, mapId: string) =>
  join(env.storageDir, 'maps', worldId, mapId);

export const originalPath = (worldId: string, mapId: string) =>
  join(mapDir(worldId, mapId), 'original');

export const tilesDir = (worldId: string, mapId: string) => join(mapDir(worldId, mapId), 'tiles');

export const thumbnailPath = (worldId: string, mapId: string) =>
  join(mapDir(worldId, mapId), 'thumbnail.webp');

/** Tiles are written as tiles/{z}/{y}/{x}.webp. */
export const tilePath = (worldId: string, mapId: string, z: number, x: number, y: number) =>
  join(tilesDir(worldId, mapId), String(z), String(y), `${x}.webp`);

// Uploads of every kind land in one temporary folder first.
export { uploadsDir } from '../../lib/storage';

/** Every map file of a world, for when the world itself is gone. */
export const removeWorldMapFiles = (worldId: string) =>
  rm(join(env.storageDir, 'maps', worldId), {
    recursive: true,
    force: true,
    maxRetries: 4,
    retryDelay: 100,
  });

export const removeMapFiles = (worldId: string, mapId: string) =>
  rm(mapDir(worldId, mapId), { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
