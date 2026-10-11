import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  entityCreateSchema,
  entityListQuerySchema,
  entityUpdateSchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { currentUser, currentWorldId, requireRole } from '../../plugins/auth-guard';
import {
  createEntity,
  getEntity,
  listEntities,
  listTrash,
  purgeEntity,
  restoreEntity,
  softDeleteEntity,
  updateEntity,
} from './service';

export const entityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/entities', { schema: { querystring: entityListQuerySchema } }, async (request) =>
    listEntities(db, currentWorldId(request), request.query),
  );

  app.post(
    '/entities',
    { onRequest: requireRole('editor'), schema: { body: entityCreateSchema } },
    async (request, reply) => {
      const entity = await createEntity(
        db,
        currentWorldId(request),
        currentUser(request).id,
        request.body,
      );
      return reply.status(201).send(entity);
    },
  );

  app.get('/entities/:id', { schema: { params: worldItemParamsSchema } }, async (request) =>
    getEntity(db, currentWorldId(request), request.params.id),
  );

  app.patch(
    '/entities/:id',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: entityUpdateSchema },
    },
    async (request) => updateEntity(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/entities/:id',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema } },
    async (request, reply) => {
      await softDeleteEntity(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  app.get('/trash', { onRequest: requireRole('editor') }, async (request) =>
    listTrash(db, currentWorldId(request)),
  );

  app.post(
    '/trash/:id/restore',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema } },
    async (request) => restoreEntity(db, currentWorldId(request), request.params.id),
  );

  app.delete(
    '/trash/:id',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema } },
    async (request, reply) => {
      await purgeEntity(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );
};
