import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  diceRollSchema,
  rollLogQuerySchema,
  rollTableCreateSchema,
  rollTableUpdateSchema,
  tableParamsSchema,
  tableRollSchema,
  worldParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { limits } from '../../lib/rate-limits';
import {
  currentAudience,
  currentUser,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import {
  clearRolls,
  createTable,
  deleteTable,
  getTable,
  listRolls,
  listTables,
  rollDiceExpression,
  rollTableById,
  updateTable,
} from './service';

export const tableRoutes: FastifyPluginAsyncZod = async (app) => {
  // Tables are filtered by visibility like everything else; a player sees the ones shared with them.
  app.get('/tables', async (request) =>
    listTables(db, currentWorldId(request), currentAudience(request)),
  );

  app.get('/tables/:id', { schema: { params: tableParamsSchema } }, async (request) =>
    getTable(db, currentWorldId(request), request.params.id, currentAudience(request)),
  );

  app.post(
    '/tables',
    { onRequest: requireRole('editor'), schema: { body: rollTableCreateSchema } },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await createTable(db, currentWorldId(request), currentUser(request).id, request.body),
        ),
  );

  app.patch(
    '/tables/:id',
    {
      onRequest: requireRole('editor'),
      schema: { params: tableParamsSchema, body: rollTableUpdateSchema },
    },
    async (request) => updateTable(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/tables/:id',
    { onRequest: requireRole('editor'), schema: { params: tableParamsSchema } },
    async (request, reply) => {
      await deleteTable(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  // Rolling is the GM's. The result goes in the log, and the GM chooses whether the table sees it.
  app.post(
    '/tables/:id/roll',
    {
      onRequest: [requireRole('editor'), requireAudience('gm')],
      config: limits.roll,
      schema: { params: tableParamsSchema, body: tableRollSchema },
    },
    async (request) =>
      rollTableById(
        db,
        currentWorldId(request),
        currentUser(request).id,
        request.params.id,
        request.body,
      ),
  );

  app.post(
    '/dice/roll',
    {
      onRequest: [requireRole('editor'), requireAudience('gm')],
      config: limits.roll,
      schema: { body: diceRollSchema },
    },
    async (request) =>
      rollDiceExpression(db, currentWorldId(request), currentUser(request).id, request.body),
  );

  app.get('/rolls', { schema: { querystring: rollLogQuerySchema } }, async (request) =>
    listRolls(db, currentWorldId(request), currentAudience(request), request.query.limit),
  );

  app.delete(
    '/rolls',
    { onRequest: requireRole('editor'), schema: { params: worldParamsSchema } },
    async (request, reply) => {
      await clearRolls(db, currentWorldId(request));
      return reply.status(204).send();
    },
  );
};
