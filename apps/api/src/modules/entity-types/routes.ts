import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  entityTypeCreateSchema,
  entityTypeUpdateSchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { currentAudience, currentWorldId, requireRole } from '../../plugins/auth-guard';
import { createEntityType, deleteEntityType, listEntityTypes, updateEntityType } from './service';

export const entityTypeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/entity-types', async (request) =>
    listEntityTypes(db, currentWorldId(request), currentAudience(request)),
  );

  app.post(
    '/entity-types',
    { onRequest: requireRole('editor'), schema: { body: entityTypeCreateSchema } },
    async (request, reply) => {
      const type = await createEntityType(db, currentWorldId(request), request.body);
      return reply.status(201).send(type);
    },
  );

  app.patch(
    '/entity-types/:id',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: entityTypeUpdateSchema },
    },
    async (request) =>
      updateEntityType(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/entity-types/:id',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema } },
    async (request, reply) => {
      await deleteEntityType(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );
};
