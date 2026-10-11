import { mkdir } from 'node:fs/promises';
import type { Metadata } from 'sharp';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, THUMBNAIL_SIDE } from '@atlas/shared';
import { badRequest } from '../../errors';
import sharp from '../../lib/sharp';
import { fullPath, imageDir, thumbPath } from './files';

const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);

/**
 * Checks an upload is really an image (from its bytes, not its name or type), then saves a
 * bounded WebP and a thumbnail. Saving re-encodes the picture, which drops anything else in
 * the file: location tags, camera details, embedded text. Animated images keep their first frame.
 */
export async function storeImage(
  sourcePath: string,
  worldId: string,
  imageId: string,
): Promise<{ width: number; height: number; bytes: number }> {
  let meta: Metadata;
  try {
    meta = await sharp(sourcePath, { limitInputPixels: false }).metadata();
  } catch {
    throw badRequest('That file is not an image we can read. Use a PNG, JPEG, WebP, GIF or AVIF.');
  }
  if (!meta.format || !SUPPORTED_FORMATS.has(meta.format) || !meta.width || !meta.height) {
    throw badRequest('Use a PNG, JPEG, WebP, GIF or AVIF image.');
  }
  if (meta.width * meta.height > MAX_IMAGE_PIXELS) {
    throw badRequest('That image has too many pixels. Export a smaller version.');
  }

  await mkdir(imageDir(worldId, imageId), { recursive: true });
  const full = await sharp(sourcePath, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 86 })
    .toFile(fullPath(worldId, imageId));
  await sharp(fullPath(worldId, imageId))
    .resize({
      width: THUMBNAIL_SIDE,
      height: THUMBNAIL_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 78 })
    .toFile(thumbPath(worldId, imageId));
  return { width: full.width, height: full.height, bytes: full.size };
}
