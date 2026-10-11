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

/** Uploads land here first, until the form has been validated. */
export const uploadsDir = () => join(env.storageDir, 'tmp');

export const removeMapFiles = (worldId: string, mapId: string) =>
  rm(mapDir(worldId, mapId), { recursive: true, force: true });
