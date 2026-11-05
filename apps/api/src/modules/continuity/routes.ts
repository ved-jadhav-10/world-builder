import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { continuityDismissSchema, continuityRestoreQuerySchema } from '@atlas/shared';
import { db } from '../../db/client';
import { limits } from '../../lib/rate-limits';
import {
  currentUser,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import { dismissFinding, getContinuityReport, restoreFinding } from './service';

export const continuityRoutes: FastifyPluginAsyncZod = async (app) => {
  // The checker reads the manuscript and GM-only entries, so like them it is the GM's alone.
  const read = { onRequest: requireAudience('gm'), config: limits.graph };
  const write = { onRequest: [requireRole('editor'), requireAudience('gm')] };

  app.get('/continuity', read, async (request) => getContinuityReport(db, currentWorldId(request)));

  app.post(
    '/continuity/dismissals',
    { ...write, schema: { body: continuityDismissSchema } },
    async (request, reply) => {
      await dismissFinding(db, currentWorldId(request), currentUser(request).id, request.body.key);
      return reply.status(204).send();
    },
  );

  app.delete(
    '/continuity/dismissals',
    { ...write, schema: { querystring: continuityRestoreQuerySchema } },
    async (request, reply) => {
      await restoreFinding(db, currentWorldId(request), request.query.key);
      return reply.status(204).send();
    },
  );
};
