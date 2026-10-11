import { rm } from 'node:fs/promises';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  atlasSearchQuerySchema,
  featureCreateSchema,
  featureParamsSchema,
  featureUpdateSchema,
  MAX_MAP_BYTES,
  mapCreateSchema,
  mapItemParamsSchema,
  mapUpdateSchema,
  tileParamsSchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { currentWorldId, requireRole } from '../../plugins/auth-guard';
import {
  createFeature,
  createMap,
  deleteFeature,
  deleteMap,
  getMap,
  listEntityMapLinks,
  listFeatures,
  listMaps,
  readThumbnail,
  readTile,
  retryTiling,
  searchAtlas,
  updateFeature,
  updateMap,
} from './service';
import { inspectImage } from './tiling';
import { receiveUpload } from './upload';

// Tiles never change for a given map, but they are private: only the browser may keep them.
const TILE_CACHE = 'private, max-age=31536000, immutable';

export const atlasRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: MAX_MAP_BYTES, files: 1, fields: 10, parts: 12 },
  });

  app.get('/maps', async (request) => listMaps(db, currentWorldId(request)));

  app.post('/maps', { onRequest: requireRole('editor') }, async (request, reply) => {
    const upload = await receiveUpload(request);
    try {
      const input = mapCreateSchema.parse(upload.fields);
      const size = await inspectImage(upload.imagePath);
      const map = await createMap(
        db,
        currentWorldId(request),
        input,
        { path: upload.imagePath, ...size },
        request.log,
      );
      return await reply.status(201).send(map);
    } finally {
      // After a successful create the file has moved, so this only cleans up failures.
      await rm(upload.imagePath, { force: true });
    }
  });

  app.get('/maps/:id', { schema: { params: mapItemParamsSchema } }, async (request) =>
    getMap(db, currentWorldId(request), request.params.id),
  );

  app.patch(
    '/maps/:id',
    {
      onRequest: requireRole('editor'),
      schema: { params: mapItemParamsSchema, body: mapUpdateSchema },
    },
    async (request) => updateMap(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/maps/:id',
    { onRequest: requireRole('editor'), schema: { params: mapItemParamsSchema } },
    async (request, reply) => {
      await deleteMap(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/maps/:id/retry',
    { onRequest: requireRole('editor'), schema: { params: mapItemParamsSchema } },
    async (request) => retryTiling(db, currentWorldId(request), request.params.id, request.log),
  );

  app.get(
    '/maps/:id/tiles/:z/:x/:y',
    { schema: { params: tileParamsSchema } },
    async (request, reply) => {
      const { id, z, x, y } = request.params;
      const tile = await readTile(db, currentWorldId(request), id, z, x, y);
      return reply
        .header('content-type', 'image/webp')
        .header('cache-control', TILE_CACHE)
        .send(tile);
    },
  );

  app.get(
    '/maps/:id/thumbnail',
    { schema: { params: mapItemParamsSchema } },
    async (request, reply) => {
      const image = await readThumbnail(db, currentWorldId(request), request.params.id);
      return reply
        .header('content-type', 'image/webp')
        .header('cache-control', 'private, max-age=3600')
        .send(image);
    },
  );

  app.get('/maps/:id/features', { schema: { params: mapItemParamsSchema } }, async (request) =>
    listFeatures(db, currentWorldId(request), request.params.id),
  );

  app.post(
    '/maps/:id/features',
    {
      onRequest: requireRole('editor'),
      schema: { params: mapItemParamsSchema, body: featureCreateSchema },
    },
    async (request, reply) => {
      const feature = await createFeature(
        db,
        currentWorldId(request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(feature);
    },
  );

  app.patch(
    '/maps/:id/features/:featureId',
    {
      onRequest: requireRole('editor'),
      schema: { params: featureParamsSchema, body: featureUpdateSchema },
    },
    async (request) =>
      updateFeature(
        db,
        currentWorldId(request),
        request.params.id,
        request.params.featureId,
        request.body,
      ),
  );

  app.delete(
    '/maps/:id/features/:featureId',
    { onRequest: requireRole('editor'), schema: { params: featureParamsSchema } },
    async (request, reply) => {
      await deleteFeature(db, currentWorldId(request), request.params.id, request.params.featureId);
      return reply.status(204).send();
    },
  );

  app.get('/entities/:id/maps', { schema: { params: worldItemParamsSchema } }, async (request) =>
    listEntityMapLinks(db, currentWorldId(request), request.params.id),
  );

  app.get('/atlas/search', { schema: { querystring: atlasSearchQuerySchema } }, async (request) =>
    searchAtlas(db, currentWorldId(request), request.query.q, request.query.limit),
  );
};
