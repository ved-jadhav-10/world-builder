import { readFile } from 'node:fs/promises';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { safeName, worldToMarkdown } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { fullPath } from '../gallery/files';
import { exportWorld } from './service';

/** Pictures are left out of the zip above this total size, to keep the download reasonable. */
export const MAX_IMAGE_BYTES_IN_ZIP = 150 * 1024 * 1024;

/**
 * The whole world as a zip of Markdown notes (see `worldToMarkdown`), with the gallery's pictures
 * and the full JSON export alongside. It includes everything, GM-only content too.
 */
export async function buildMarkdownZip(
  db: DbOrTx,
  worldId: string,
): Promise<{ filename: string; data: Uint8Array }> {
  const data = await exportWorld(db, worldId);
  const root = safeName(data.world.slug, 'world');
  const files: Zippable = {};

  // Pictures go in as they are (they are already compressed); one that can't be read is skipped.
  const total = data.gallery.reduce((sum, image) => sum + image.bytes, 0);
  const includeImages = total <= MAX_IMAGE_BYTES_IN_ZIP;
  const imagePaths = new Map<string, string>();
  if (includeImages) {
    for (const image of data.gallery) {
      try {
        const bytes = await readFile(fullPath(worldId, image.id));
        imagePaths.set(image.id, `Gallery/${image.id}.webp`);
        files[`${root}/Gallery/${image.id}.webp`] = [bytes, { level: 0 }];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }

  for (const file of worldToMarkdown(data, { imagePaths })) {
    const note =
      !includeImages && file.path === `${root}/README.md`
        ? `${file.content}\nPictures were left out because they add up to more than ${Math.round(MAX_IMAGE_BYTES_IN_ZIP / 1024 / 1024)} MB. Download them from the gallery.\n`
        : file.content;
    files[file.path] = strToU8(note);
  }
  files[`${root}/world.json`] = strToU8(JSON.stringify(data, null, 2));

  return {
    filename: `${root}-markdown-${data.exportedAt.slice(0, 10)}.zip`,
    data: zipSync(files, { level: 6 }),
  };
}
