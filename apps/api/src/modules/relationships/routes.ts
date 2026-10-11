import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  relationshipCreateSchema,
  relationshipTypeCreateSchema,
  relationshipUpdateSchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { currentWorldId, requireRole } from '../../plugins/auth-guard';
import {
  createRelationship,
  createRelationshipType,
  deleteRelationship,
  deleteRelationshipType,
  listEntityRelationships,
  listRelationshipTypes,
  updateRelationship,
} from './service';

export const relationshipRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/relationship-types', async (request) =>
    listRelationshipTypes(db, currentWorldId(request)),
  );

  app.post(
    '/relationship-types',
    { onRequest: requireRole('editor'), schema: { body: relationshipTypeCreateSchema } },
    async (request, reply) => {
      const type = await createRelationshipType(db, currentWorldId(request), request.body);
      return reply.status(201).send(type);
    },
  );

  app.delete(
    '/relationship-types/:id',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema } },
    async (request, reply) => {
      await deleteRelationshipType(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  app.get(
    '/entities/:id/relationships',
    { schema: { params: worldItemParamsSchema } },
    async (request) => listEntityRelationships(db, currentWorldId(request), request.params.id),
  );

  app.post(
    '/relationships',
    { onRequest: requireRole('editor'), schema: { body: relationshipCreateSchema } },
    async (request, reply) => {
      const relationship = await createRelationship(db, currentWorldId(request), request.body);
      return reply.status(201).send(relationship);
    },
  );

  app.patch(
    '/relationships/:id',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: relationshipUpdateSchema },
    },
    async (request) =>
      updateRelationship(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/relationships/:id',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema } },
    async (request, reply) => {
      await deleteRelationship(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );
};
