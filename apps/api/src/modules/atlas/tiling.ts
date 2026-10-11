import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'sharp';
import { MAX_MAP_PIXELS, MAX_MAP_SIDE, TILE_SIZE } from '@atlas/shared';
import { db } from '../../db/client';
import { maps } from '../../db/schema';
import { badRequest } from '../../errors';
import sharp from '../../lib/sharp';
import { originalPath, thumbnailPath, tilesDir } from './files';

const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'tiff', 'avif']);

export interface TilingLog {
  error: (details: object, message: string) => void;
}

/** Reads an upload's real format and size from its bytes; the file name and type are not trusted. */
export async function inspectImage(path: string): Promise<{ width: number; height: number }> {
  let meta: Metadata;
  try {
    meta = await sharp(path, { limitInputPixels: false }).metadata();
  } catch {
    throw badRequest('That file is not an image we can read. Use a PNG, JPEG, WebP, TIFF or AVIF.');
  }
  if (!meta.format || !SUPPORTED_FORMATS.has(meta.format) || !meta.width || !meta.height) {
    throw badRequest('Use a PNG, JPEG, WebP, TIFF or AVIF image.');
  }
  // EXIF orientations 5 to 8 turn the picture on its side; tiles are cut from the upright image.
  const sideways = (meta.orientation ?? 1) >= 5;
  const width = sideways ? meta.height : meta.width;
  const height = sideways ? meta.width : meta.height;
  if (width > MAX_MAP_SIDE || height > MAX_MAP_SIDE || width * height > MAX_MAP_PIXELS) {
    throw badRequest(
      `That image is too large. Keep it under ${MAX_MAP_SIDE.toLocaleString('en-US')} px per side.`,
    );
  }
  return { width, height };
}

/** Cuts one map into a zoomable tile pyramid, plus a small thumbnail for the map list. */
async function cutTiles(worldId: string, mapId: string) {
  const source = originalPath(worldId, mapId);
  const output = tilesDir(worldId, mapId);
  await rm(output, { recursive: true, force: true });

  // Tiles use WebP with an alpha channel: the padding on the right and bottom edges is
  // transparent, so the viewer never shows a black strip past the map.
  await sharp(source, { limitInputPixels: MAX_MAP_PIXELS, sequentialRead: true })
    .rotate()
    .ensureAlpha()
    .webp({ quality: 82 })
    .tile({
      size: TILE_SIZE,
      layout: 'google',
      overlap: 0,
      skipBlanks: -1,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      container: 'fs',
    })
    .toFile(output);
  await rm(join(output, 'blank.png'), { force: true });

  await sharp(source, { limitInputPixels: MAX_MAP_PIXELS, sequentialRead: true })
    .rotate()
    .resize({ width: 640, height: 400, fit: 'cover' })
    .webp({ quality: 75 })
    .toFile(thumbnailPath(worldId, mapId));
}

async function processMap(mapId: string, log: TilingLog) {
  const [map] = await db
    .select({ id: maps.id, worldId: maps.worldId })
    .from(maps)
    .where(and(eq(maps.id, mapId), eq(maps.status, 'processing')));
  if (!map) return; // Deleted, or already done.

  try {
    await cutTiles(map.worldId, map.id);
    await db.update(maps).set({ status: 'ready', error: '' }).where(eq(maps.id, map.id));
  } catch (error) {
    log.error({ err: error, mapId }, 'Cutting map tiles failed');
    await db
      .update(maps)
      .set({ status: 'failed', error: 'We could not cut this image into tiles.' })
      .where(eq(maps.id, map.id))
      .catch((updateError: unknown) =>
        log.error({ err: updateError, mapId }, 'Could not record the tiling failure'),
      );
  }
}

// Tiling is heavy, so maps are cut one at a time in the background. This is an in-process
// queue: maps still marked "processing" are picked up again when the server restarts.
let tail: Promise<void> = Promise.resolve();
const queued = new Set<string>();

export function enqueueTiling(mapId: string, log: TilingLog) {
  if (queued.has(mapId)) return;
  queued.add(mapId);
  tail = tail
    .then(() => processMap(mapId, log))
    .catch((error: unknown) => log.error({ err: error, mapId }, 'Tiling job crashed'))
    .finally(() => queued.delete(mapId));
}

/** Resolves once everything queued so far has finished. */
export const tilingIdle = () => tail;

export async function resumeTiling(log: TilingLog) {
  const pending = await db.select({ id: maps.id }).from(maps).where(eq(maps.status, 'processing'));
  for (const { id } of pending) enqueueTiling(id, log);
}
