import { rm } from 'node:fs/promises';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  imageCreateSchema,
  imageListQuerySchema,
  imageParamsSchema,
  imageUpdateSchema,
  MAX_IMAGE_BYTES,
} from '@atlas/shared';
import { db } from '../../db/client';
import { receiveUpload } from '../../lib/upload';
import {
  currentAudience,
  currentUser,
  currentWorldId,
  requireRole,
} from '../../plugins/auth-guard';
import { createImage, deleteImage, getImage, listImages, readImage, updateImage } from './service';

// An image never changes once stored, but it is private: only the browser may keep it.
const CACHE = 'private, max-age=31536000, immutable';

export const galleryRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 12, parts: 14 },
  });

  app.get('/images', { schema: { querystring: imageListQuerySchema } }, async (request) =>
    listImages(db, currentWorldId(request), request.query, currentAudience(request)),
  );

  app.post('/images', { onRequest: requireRole('editor') }, async (request, reply) => {
    const upload = await receiveUpload(request, MAX_IMAGE_BYTES);
    try {
      const input = imageCreateSchema.parse(upload.fields);
      const image = await createImage(
        db,
        currentWorldId(request),
        currentUser(request).id,
        input,
        upload.imagePath,
      );
      return await reply.status(201).send(image);
    } finally {
      // The upload is only a temporary copy; the stored image is a new file.
      await rm(upload.imagePath, { force: true });
    }
  });

  app.get('/images/:id', { schema: { params: imageParamsSchema } }, async (request) =>
    getImage(db, currentWorldId(request), request.params.id, currentAudience(request)),
  );

  app.patch(
    '/images/:id',
    {
      onRequest: requireRole('editor'),
      schema: { params: imageParamsSchema, body: imageUpdateSchema },
    },
    async (request) => updateImage(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/images/:id',
    { onRequest: requireRole('editor'), schema: { params: imageParamsSchema } },
    async (request, reply) => {
      await deleteImage(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  for (const [path, which] of [
    ['file', 'full'],
    ['thumbnail', 'thumb'],
  ] as const) {
    app.get(
      `/images/:id/${path}`,
      { schema: { params: imageParamsSchema } },
      async (request, reply) => {
        const file = await readImage(
          db,
          currentWorldId(request),
          request.params.id,
          which,
          currentAudience(request),
        );
        return reply.header('content-type', 'image/webp').header('cache-control', CACHE).send(file);
      },
    );
  }
};
