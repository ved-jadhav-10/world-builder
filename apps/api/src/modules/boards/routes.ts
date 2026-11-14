import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { boardCreateSchema, boardParamsSchema, boardUpdateSchema } from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentAudience,
  currentUser,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import { createBoard, deleteBoard, getBoard, listBoards, updateBoard } from './service';

/**
 * Boards are the GM's to make and change. A board marked as shared can also be read by players,
 * who get it without anything marked GM-only and without entries or pictures hidden from them.
 */
export const boardRoutes: FastifyPluginAsyncZod = async (app) => {
  const write = { onRequest: [requireRole('editor'), requireAudience('gm')] };

  app.get('/boards', async (request) =>
    listBoards(db, currentWorldId(request), currentAudience(request)),
  );

  app.post('/boards', { ...write, schema: { body: boardCreateSchema } }, async (request, reply) => {
    const board = await createBoard(
      db,
      currentWorldId(request),
      currentUser(request).id,
      request.body,
    );
    return reply.status(201).send(board);
  });

  app.get('/boards/:id', { schema: { params: boardParamsSchema } }, async (request) =>
    getBoard(db, currentWorldId(request), request.params.id, currentAudience(request)),
  );

  app.patch(
    '/boards/:id',
    {
      ...write,
      // A full board of long notes is larger than the default allowance.
      bodyLimit: 3 * 1024 * 1024,
      schema: { params: boardParamsSchema, body: boardUpdateSchema },
    },
    async (request) => updateBoard(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/boards/:id',
    { ...write, schema: { params: boardParamsSchema } },
    async (request, reply) => {
      await deleteBoard(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );
};
