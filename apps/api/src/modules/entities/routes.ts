import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  bulkEntitySchema,
  entityCreateSchema,
  entityListQuerySchema,
  entityUpdateSchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentAudience,
  currentUser,
  currentWorldId,
  requireRole,
} from '../../plugins/auth-guard';
import {
  bulkUpdateEntities,
  createEntity,
  getEntity,
  listEntities,
  listTrash,
  purgeEntity,
  restoreEntity,
  softDeleteEntity,
  updateEntity,
} from './service';
import { afterEdit, beforeEdit } from '../revisions/service';

export const entityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/entities', { schema: { querystring: entityListQuerySchema } }, async (request) =>
    listEntities(db, currentWorldId(request), request.query, currentAudience(request)),
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
    getEntity(db, currentWorldId(request), request.params.id, currentAudience(request)),
  );

  // Registered before the item routes so "bulk" is never read as an id.
  app.post(
    '/entities/bulk',
    { onRequest: requireRole('editor'), schema: { body: bulkEntitySchema } },
    async (request) => bulkUpdateEntities(db, currentWorldId(request), request.body),
  );

  app.patch(
    '/entities/:id',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: entityUpdateSchema },
    },
    async (request) => {
      const worldId = currentWorldId(request);
      const subject = { kind: 'entity', id: request.params.id } as const;
      await beforeEdit(db, worldId, subject);
      const updated = await updateEntity(db, worldId, request.params.id, request.body);
      await afterEdit(db, worldId, subject, currentUser(request).id);
      return updated;
    },
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
