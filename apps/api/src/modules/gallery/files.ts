import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../env';

/** Every path is built from IDs the database issued, never from a client-supplied name. */
export const imageDir = (worldId: string, imageId: string) =>
  join(env.storageDir, 'images', worldId, imageId);

export const fullPath = (worldId: string, imageId: string) =>
  join(imageDir(worldId, imageId), 'full.webp');

export const thumbPath = (worldId: string, imageId: string) =>
  join(imageDir(worldId, imageId), 'thumb.webp');

export const removeImageFiles = (worldId: string, imageId: string) =>
  rm(imageDir(worldId, imageId), { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
