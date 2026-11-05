import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sprintCreateSchema, writingGoalsSchema, writingStatsQuerySchema } from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentUser,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import { addSprint, getWritingStats, updateWritingGoals } from './service';

/** Writing goals belong to the author's workspace, so like the manuscript they are the GM's. */
export const writingRoutes: FastifyPluginAsyncZod = async (app) => {
  const read = { onRequest: requireAudience('gm') };
  const write = { onRequest: [requireRole('editor'), requireAudience('gm')] };

  app.get(
    '/writing',
    { ...read, schema: { querystring: writingStatsQuerySchema } },
    async (request) =>
      getWritingStats(db, currentWorldId(request), currentUser(request).id, request.query),
  );

  app.put('/writing/goals', { ...write, schema: { body: writingGoalsSchema } }, async (request) => {
    const worldId = currentWorldId(request);
    const userId = currentUser(request).id;
    await updateWritingGoals(db, worldId, userId, request.body);
    return getWritingStats(db, worldId, userId, { weeks: 26 });
  });

  app.post(
    '/writing/sprints',
    { ...write, schema: { body: sprintCreateSchema } },
    async (request, reply) => {
      const sprint = await addSprint(
        db,
        currentWorldId(request),
        currentUser(request).id,
        request.body,
      );
      return reply.status(201).send(sprint);
    },
  );
};
