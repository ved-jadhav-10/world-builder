import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  plotBeatSchema,
  plotBeatUpdateSchema,
  plotBoardCreateSchema,
  plotBoardUpdateSchema,
  plotCardCreateSchema,
  plotCardMoveSchema,
  plotCardUpdateSchema,
  plotChildParamsSchema,
  plotOrderSchema,
  plotParamsSchema,
  plotThreadSchema,
  plotThreadUpdateSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { currentWorldId, requireAudience, requireRole } from '../../plugins/auth-guard';
import {
  addBeat,
  addCard,
  addThread,
  createBoard,
  deleteBeat,
  deleteBoard,
  deleteCard,
  deleteThread,
  getBoard,
  listBoards,
  moveCard,
  renameBoard,
  reorder,
  updateBeat,
  updateCard,
  updateThread,
} from './service';

export const plotRoutes: FastifyPluginAsyncZod = async (app) => {
  // Plot boards are the author's own workspace, like the manuscript: only the GM's view reads
  // them, and only editors change them. Every change answers with the whole board, so the page
  // never has to guess what the server renumbered.
  const read = { onRequest: requireAudience('gm') };
  const write = { onRequest: [requireRole('editor'), requireAudience('gm')] };
  const child = { params: plotChildParamsSchema };

  app.get('/plot', read, async (request) => listBoards(db, currentWorldId(request)));

  app.post('/plot', { ...write, schema: { body: plotBoardCreateSchema } }, async (request, reply) =>
    reply.status(201).send(await createBoard(db, currentWorldId(request), request.body)),
  );

  app.get('/plot/:id', { ...read, schema: { params: plotParamsSchema } }, async (request) =>
    getBoard(db, currentWorldId(request), request.params.id),
  );

  app.patch(
    '/plot/:id',
    { ...write, schema: { params: plotParamsSchema, body: plotBoardUpdateSchema } },
    async (request) =>
      renameBoard(db, currentWorldId(request), request.params.id, request.body.name),
  );

  app.delete(
    '/plot/:id',
    { ...write, schema: { params: plotParamsSchema } },
    async (request, reply) => {
      await deleteBoard(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  app.put(
    '/plot/:id/order',
    { ...write, schema: { params: plotParamsSchema, body: plotOrderSchema } },
    async (request) => reorder(db, currentWorldId(request), request.params.id, request.body),
  );

  app.post(
    '/plot/:id/beats',
    { ...write, schema: { params: plotParamsSchema, body: plotBeatSchema } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await addBeat(db, currentWorldId(request), request.params.id, request.body)),
  );
  app.patch(
    '/plot/:id/beats/:childId',
    { ...write, schema: { ...child, body: plotBeatUpdateSchema } },
    async (request) =>
      updateBeat(
        db,
        currentWorldId(request),
        request.params.id,
        request.params.childId,
        request.body,
      ),
  );
  app.delete('/plot/:id/beats/:childId', { ...write, schema: child }, async (request) =>
    deleteBeat(db, currentWorldId(request), request.params.id, request.params.childId),
  );

  app.post(
    '/plot/:id/threads',
    { ...write, schema: { params: plotParamsSchema, body: plotThreadSchema } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await addThread(db, currentWorldId(request), request.params.id, request.body)),
  );
  app.patch(
    '/plot/:id/threads/:childId',
    { ...write, schema: { ...child, body: plotThreadUpdateSchema } },
    async (request) =>
      updateThread(
        db,
        currentWorldId(request),
        request.params.id,
        request.params.childId,
        request.body,
      ),
  );
  app.delete('/plot/:id/threads/:childId', { ...write, schema: child }, async (request) =>
    deleteThread(db, currentWorldId(request), request.params.id, request.params.childId),
  );

  app.post(
    '/plot/:id/cards',
    { ...write, schema: { params: plotParamsSchema, body: plotCardCreateSchema } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await addCard(db, currentWorldId(request), request.params.id, request.body)),
  );
  app.patch(
    '/plot/:id/cards/:childId',
    { ...write, schema: { ...child, body: plotCardUpdateSchema } },
    async (request) =>
      updateCard(
        db,
        currentWorldId(request),
        request.params.id,
        request.params.childId,
        request.body,
      ),
  );
  app.post(
    '/plot/:id/cards/:childId/move',
    { ...write, schema: { ...child, body: plotCardMoveSchema } },
    async (request) =>
      moveCard(
        db,
        currentWorldId(request),
        request.params.id,
        request.params.childId,
        request.body,
      ),
  );
  app.delete('/plot/:id/cards/:childId', { ...write, schema: child }, async (request) =>
    deleteCard(db, currentWorldId(request), request.params.id, request.params.childId),
  );
};
