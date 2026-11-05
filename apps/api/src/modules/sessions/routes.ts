import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sessionCreateSchema } from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentAudience,
  currentUser,
  currentWorldId,
  requireRole,
} from '../../plugins/auth-guard';
import { createSession, listSessions } from './service';

export const sessionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/sessions', async (request) =>
    listSessions(db, currentWorldId(request), currentAudience(request)),
  );

  app.post(
    '/sessions',
    { onRequest: requireRole('editor'), schema: { body: sessionCreateSchema } },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await createSession(db, currentWorldId(request), currentUser(request).id, request.body),
        ),
  );
};
