import { rm } from 'node:fs/promises';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  atlasSearchQuerySchema,
  blankMapSchema,
  featureCreateSchema,
  featureListQuerySchema,
  featureParamsSchema,
  featureUpdateSchema,
  geojsonImportSchema,
  layerCreateSchema,
  layerParamsSchema,
  layerUpdateSchema,
  MAX_MAP_BYTES,
  mapCreateSchema,
  mapItemParamsSchema,
  mapUpdateSchema,
  tileParamsSchema,
  vttExportQuerySchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { limits } from '../../lib/rate-limits';
import { receiveUpload } from '../../lib/upload';
import {
  currentAudience,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import {
  createFeature,
  createLayer,
  createBlankMap,
  createMap,
  deleteFeature,
  deleteLayer,
  deleteMap,
  exportUniversalVtt,
  getMap,
  importGeoJson,
  listEntityMapLinks,
  listFeatures,
  listLayers,
  listMaps,
  readThumbnail,
  readTile,
  replaceMapImage,
  retryTiling,
  searchAtlas,
  updateFeature,
  updateLayer,
  updateMap,
} from './service';
import { inspectImage, rasterizeIfSvg } from './tiling';

// Tiles never change for a given map, but they are private: only the browser may keep them.
const TILE_CACHE = 'private, max-age=31536000, immutable';

export const atlasRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: MAX_MAP_BYTES, files: 1, fields: 10, parts: 12 },
  });

  app.get('/maps', async (request) =>
    listMaps(db, currentWorldId(request), currentAudience(request)),
  );

  app.post(
    '/maps',
    { onRequest: requireRole('editor'), config: limits.upload },
    async (request, reply) => {
      const upload = await receiveUpload(request, MAX_MAP_BYTES);
      try {
        upload.imagePath = await rasterizeIfSvg(upload.imagePath);
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
    },
  );

  // A plain canvas for node maps and pointcrawls: the picture is drawn here, not uploaded.
  app.post(
    '/maps/blank',
    { onRequest: requireRole('editor'), schema: { body: blankMapSchema } },
    async (request, reply) => {
      const map = await createBlankMap(db, currentWorldId(request), request.body, request.log);
      return reply.status(201).send(map);
    },
  );

  app.post(
    '/maps/:id/import/geojson',
    {
      onRequest: requireRole('editor'),
      schema: { params: mapItemParamsSchema, body: geojsonImportSchema },
    },
    async (request, reply) => {
      const result = await importGeoJson(
        db,
        currentWorldId(request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(result);
    },
  );

  // A Universal VTT file for Foundry, Fantasy Grounds and the like. It holds the full picture
  // and the GM's walls, so it is for editors.
  app.get(
    '/maps/:id/export/vtt',
    {
      onRequest: [requireRole('editor'), requireAudience('gm')],
      config: limits.export,
      schema: { params: mapItemParamsSchema, querystring: vttExportQuerySchema },
    },
    async (request, reply) => {
      const { filename, json } = await exportUniversalVtt(
        db,
        currentWorldId(request),
        request.params.id,
        request.query.grid,
      );
      return reply
        .header('content-type', 'application/json')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(json);
    },
  );

  app.get('/maps/:id', { schema: { params: mapItemParamsSchema } }, async (request) =>
    getMap(db, currentWorldId(request), request.params.id, currentAudience(request)),
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
    '/maps/:id/image',
    {
      onRequest: requireRole('editor'),
      schema: { params: mapItemParamsSchema },
      config: limits.upload,
    },
    async (request) => {
      const upload = await receiveUpload(request, MAX_MAP_BYTES);
      try {
        upload.imagePath = await rasterizeIfSvg(upload.imagePath);
        const size = await inspectImage(upload.imagePath);
        return await replaceMapImage(
          db,
          currentWorldId(request),
          request.params.id,
          { path: upload.imagePath, ...size },
          request.log,
        );
      } finally {
        await rm(upload.imagePath, { force: true });
      }
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
      const tile = await readTile(
        db,
        currentWorldId(request),
        id,
        z,
        x,
        y,
        currentAudience(request),
      );
      // What a player is sent depends on what has been revealed so far, so it can't be kept.
      return reply
        .header('content-type', 'image/webp')
        .header('cache-control', tile.fogged ? 'private, no-cache' : TILE_CACHE)
        .send(tile.data);
    },
  );

  app.get(
    '/maps/:id/thumbnail',
    { schema: { params: mapItemParamsSchema } },
    async (request, reply) => {
      const image = await readThumbnail(
        db,
        currentWorldId(request),
        request.params.id,
        currentAudience(request),
      );
      return reply
        .header('content-type', 'image/webp')
        .header('cache-control', 'private, max-age=3600')
        .send(image);
    },
  );

  app.get(
    '/maps/:id/features',
    { schema: { params: mapItemParamsSchema, querystring: featureListQuerySchema } },
    async (request) =>
      listFeatures(
        db,
        currentWorldId(request),
        request.params.id,
        currentAudience(request),
        request.query.asOf,
      ),
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

  app.get('/maps/:id/layers', { schema: { params: mapItemParamsSchema } }, async (request) =>
    listLayers(db, currentWorldId(request), request.params.id, currentAudience(request)),
  );

  app.post(
    '/maps/:id/layers',
    {
      onRequest: requireRole('editor'),
      schema: { params: mapItemParamsSchema, body: layerCreateSchema },
    },
    async (request, reply) => {
      const layer = await createLayer(db, currentWorldId(request), request.params.id, request.body);
      return reply.status(201).send(layer);
    },
  );

  app.patch(
    '/maps/:id/layers/:layerId',
    {
      onRequest: requireRole('editor'),
      schema: { params: layerParamsSchema, body: layerUpdateSchema },
    },
    async (request) =>
      updateLayer(
        db,
        currentWorldId(request),
        request.params.id,
        request.params.layerId,
        request.body,
      ),
  );

  app.delete(
    '/maps/:id/layers/:layerId',
    { onRequest: requireRole('editor'), schema: { params: layerParamsSchema } },
    async (request, reply) => {
      await deleteLayer(db, currentWorldId(request), request.params.id, request.params.layerId);
      return reply.status(204).send();
    },
  );

  app.get('/entities/:id/maps', { schema: { params: worldItemParamsSchema } }, async (request) =>
    listEntityMapLinks(db, currentWorldId(request), request.params.id, currentAudience(request)),
  );

  app.get('/atlas/search', { schema: { querystring: atlasSearchQuerySchema } }, async (request) =>
    searchAtlas(
      db,
      currentWorldId(request),
      request.query.q,
      request.query.limit,
      currentAudience(request),
    ),
  );
};
