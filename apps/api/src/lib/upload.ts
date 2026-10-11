import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyRequest } from 'fastify';
import { badRequest, HttpError } from '../errors';
import { uploadsDir } from './storage';

export interface ReceivedUpload {
  /** The text fields of the form. */
  fields: Record<string, string>;
  /** Where the image was written; the caller moves it into place or deletes it. */
  imagePath: string;
}

/**
 * Reads a multipart form with one `image` file and some text fields. The image is streamed to
 * disk before the fields are looked at, since a form can send them in any order. `maxBytes`
 * must match the `fileSize` limit the route registered the multipart plugin with.
 */
export async function receiveUpload(
  request: FastifyRequest,
  maxBytes: number,
): Promise<ReceivedUpload> {
  if (!request.isMultipart()) throw badRequest('Send a multipart form with an image');

  const directory = uploadsDir();
  await mkdir(directory, { recursive: true });
  const imagePath = join(directory, randomUUID());
  const fields: Record<string, string> = {};
  let hasImage = false;

  try {
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') fields[part.fieldname] = part.value;
      } else if (part.fieldname === 'image' && !hasImage) {
        hasImage = true;
        await pipeline(part.file, createWriteStream(imagePath));
      } else {
        part.file.resume(); // Not the image; discard it.
      }
    }
  } catch (error) {
    await rm(imagePath, { force: true });
    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new HttpError(
        413,
        `That image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`,
      );
    }
    throw error;
  }

  if (!hasImage) throw badRequest('Choose an image to upload');
  return { fields, imagePath };
}
