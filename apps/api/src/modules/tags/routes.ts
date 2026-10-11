import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idSchema, tagCreateSchema, tagUpdateSchema, worldItemParamsSchema } from '@atlas/shared';
import { db } from '../../db/client';
import { currentWorldId, requireRole } from '../../plugins/auth-guard';
import { attachTag, createTag, deleteTag, detachTag, listTags, updateTag } from './service';

const entityTagParams = z.object({ worldId: idSchema, id: idSchema, tagId: idSchema });

export const tagRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/tags', async (request) => listTags(db, currentWorldId(request)));

  app.post(
    '/tags',
    { onRequest: requireRole('editor'), schema: { body: tagCreateSchema } },
    async (request, reply) => {
      const tag = await createTag(db, currentWorldId(request), request.body);
      return reply.status(201).send(tag);
    },
  );

  app.patch(
    '/tags/:id',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema, body: tagUpdateSchema } },
    async (request) => updateTag(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/tags/:id',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema } },
    async (request, reply) => {
      await deleteTag(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  app.put(
    '/entities/:id/tags/:tagId',
    { onRequest: requireRole('editor'), schema: { params: entityTagParams } },
    async (request) => attachTag(db, currentWorldId(request), request.params.id, request.params.tagId),
  );

  app.delete(
    '/entities/:id/tags/:tagId',
    { onRequest: requireRole('editor'), schema: { params: entityTagParams } },
    async (request, reply) => {
      await detachTag(db, currentWorldId(request), request.params.id, request.params.tagId);
      return reply.status(204).send();
    },
  );
};
