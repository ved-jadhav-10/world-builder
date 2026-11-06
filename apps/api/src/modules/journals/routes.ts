import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { journalSaveSchema, worldItemParamsSchema } from '@atlas/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../../db/client';
import { forbidden } from '../../errors';
import {
  currentAudience,
  currentUser,
  currentWorldId,
  requireRole,
} from '../../plugins/auth-guard';
import { getJournal, listJournals, saveJournal } from './service';

/**
 * Private notes on entries. Players (and everyone above them) keep their own; only the GM can read
 * other people's. Readers and previews are refused by the role guard.
 */
/** Players, commenters and GMs keep notes. Readers have the same rank as players but do not. */
const keepsNotes = async (request: FastifyRequest, reply: FastifyReply) => {
  await requireRole('player')(request, reply);
  if (request.world?.role === 'reader') throw forbidden();
};

export const journalRoutes: FastifyPluginAsyncZod = async (app) => {
  const params = worldItemParamsSchema;

  app.get('/entities/:id/journal', { onRequest: keepsNotes, schema: { params } }, async (request) =>
    getJournal(
      db,
      currentWorldId(request),
      request.params.id,
      currentUser(request).id,
      currentAudience(request),
    ),
  );

  app.put(
    '/entities/:id/journal',
    { onRequest: keepsNotes, schema: { params, body: journalSaveSchema } },
    async (request) =>
      saveJournal(
        db,
        currentWorldId(request),
        request.params.id,
        currentUser(request).id,
        currentAudience(request),
        request.body.body,
      ),
  );

  app.get(
    '/entities/:id/journals',
    { onRequest: requireRole('editor'), schema: { params } },
    async (request) =>
      listJournals(db, currentWorldId(request), request.params.id, currentUser(request).id),
  );
};
