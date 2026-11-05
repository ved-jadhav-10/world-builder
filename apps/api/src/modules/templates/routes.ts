import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  entryTemplateCreateSchema,
  entryTemplateListQuerySchema,
  entryTemplateParamsSchema,
  entryTemplateUpdateSchema,
  savedFilterCreateSchema,
  savedFilterListQuerySchema,
  savedFilterParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentUser,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import {
  createSavedFilter,
  createTemplate,
  deleteSavedFilter,
  deleteTemplate,
  listSavedFilters,
  listTemplates,
  renameTemplate,
} from './service';

export const templateRoutes: FastifyPluginAsyncZod = async (app) => {
  // Templates are copies of entries, GM-only secrets included, so they stay with the GM and
  // editors like the rest of the working side of a world.
  const read = { onRequest: requireAudience('gm') };
  const write = { onRequest: [requireRole('editor'), requireAudience('gm')] };

  app.get(
    '/templates',
    { ...read, schema: { querystring: entryTemplateListQuerySchema } },
    async (request) => listTemplates(db, currentWorldId(request), request.query.typeId),
  );

  app.post(
    '/templates',
    { ...write, schema: { body: entryTemplateCreateSchema } },
    async (request, reply) => {
      const template = await createTemplate(
        db,
        currentWorldId(request),
        currentUser(request).id,
        request.body,
      );
      return reply.status(201).send(template);
    },
  );

  app.patch(
    '/templates/:id',
    { ...write, schema: { params: entryTemplateParamsSchema, body: entryTemplateUpdateSchema } },
    async (request) =>
      renameTemplate(db, currentWorldId(request), request.params.id, request.body.name),
  );

  app.delete(
    '/templates/:id',
    { ...write, schema: { params: entryTemplateParamsSchema } },
    async (request, reply) => {
      await deleteTemplate(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  // Saved filters belong to whoever made them, and every member can keep some.
  app.get(
    '/saved-filters',
    { schema: { querystring: savedFilterListQuerySchema } },
    async (request) =>
      listSavedFilters(db, currentWorldId(request), currentUser(request).id, request.query.typeId),
  );

  app.post(
    '/saved-filters',
    { schema: { body: savedFilterCreateSchema } },
    async (request, reply) => {
      const filter = await createSavedFilter(
        db,
        currentWorldId(request),
        currentUser(request).id,
        request.body,
      );
      return reply.status(201).send(filter);
    },
  );

  app.delete(
    '/saved-filters/:id',
    { schema: { params: savedFilterParamsSchema } },
    async (request, reply) => {
      await deleteSavedFilter(
        db,
        currentWorldId(request),
        currentUser(request).id,
        request.params.id,
      );
      return reply.status(204).send();
    },
  );
};
