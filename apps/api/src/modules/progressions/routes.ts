import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  progressionCreateSchema,
  progressionUpdateSchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { currentWorldId, requireRole } from '../../plugins/auth-guard';
import {
  createProgression,
  deleteProgression,
  listProgressions,
  updateProgression,
} from './service';

export const progressionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/entities/:id/progressions',
    { schema: { params: worldItemParamsSchema } },
    async (request) => listProgressions(db, currentWorldId(request), request.params.id),
  );

  app.post(
    '/entities/:id/progressions',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: progressionCreateSchema },
    },
    async (request, reply) => {
      const progression = await createProgression(
        db,
        currentWorldId(request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(progression);
    },
  );

  app.patch(
    '/progressions/:id',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: progressionUpdateSchema },
    },
    async (request) =>
      updateProgression(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/progressions/:id',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema } },
    async (request, reply) => {
      await deleteProgression(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );
};
