import { rm } from 'node:fs/promises';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  handoutCreateSchema,
  handoutParamsSchema,
  handoutUpdateSchema,
  MAX_HANDOUT_BYTES,
} from '@atlas/shared';
import { db } from '../../db/client';
import { limits } from '../../lib/rate-limits';
import { receiveUpload } from '../../lib/upload';
import {
  currentAudience,
  currentUser,
  currentWorldId,
  requireRole,
} from '../../plugins/auth-guard';
import {
  createHandout,
  deleteHandout,
  getHandout,
  listHandouts,
  readHandoutImage,
  removeHandoutImage,
  setHandoutImage,
  updateHandout,
} from './service';

// A handout's picture changes only when its version does, and it is private to the world.
const CACHE = 'private, max-age=31536000, immutable';

export const handoutRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: MAX_HANDOUT_BYTES, files: 1, fields: 4, parts: 6 },
  });
  const edit = { onRequest: requireRole('editor') };

  // Everyone in the world can ask; each audience is told only about what it may see.
  app.get('/handouts', async (request) =>
    listHandouts(db, currentWorldId(request), currentAudience(request)),
  );

  app.get('/handouts/:id', { schema: { params: handoutParamsSchema } }, async (request) =>
    getHandout(db, currentWorldId(request), request.params.id, currentAudience(request)),
  );

  app.post(
    '/handouts',
    { ...edit, schema: { body: handoutCreateSchema } },
    async (request, reply) => {
      const handout = await createHandout(
        db,
        currentWorldId(request),
        currentUser(request).id,
        request.body,
      );
      return reply.status(201).send(handout);
    },
  );

  app.patch(
    '/handouts/:id',
    { ...edit, schema: { params: handoutParamsSchema, body: handoutUpdateSchema } },
    async (request) => updateHandout(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/handouts/:id',
    { ...edit, schema: { params: handoutParamsSchema } },
    async (request, reply) => {
      await deleteHandout(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/handouts/:id/image',
    { ...edit, schema: { params: handoutParamsSchema }, config: limits.upload },
    async (request) => {
      const upload = await receiveUpload(request, MAX_HANDOUT_BYTES);
      try {
        return await setHandoutImage(
          db,
          currentWorldId(request),
          request.params.id,
          upload.imagePath,
        );
      } finally {
        await rm(upload.imagePath, { force: true });
      }
    },
  );

  app.delete(
    '/handouts/:id/image',
    { ...edit, schema: { params: handoutParamsSchema } },
    async (request) => removeHandoutImage(db, currentWorldId(request), request.params.id),
  );

  for (const [path, which] of [
    ['image', 'full'],
    ['thumbnail', 'thumb'],
  ] as const) {
    app.get(
      `/handouts/:id/${path}`,
      { schema: { params: handoutParamsSchema } },
      async (request, reply) => {
        const file = await readHandoutImage(
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
