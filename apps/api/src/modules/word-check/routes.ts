import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { wordCheckQuerySchema } from '@atlas/shared';
import { db } from '../../db/client';
import { currentWorldId, requireAudience } from '../../plugins/auth-guard';
import { wordCheck } from './service';

/** The manuscript is the GM side's, so its word check is too. */
export const wordCheckRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/manuscript/word-check',
    { onRequest: requireAudience('gm'), schema: { querystring: wordCheckQuerySchema } },
    async (request) => wordCheck(db, currentWorldId(request), request.query),
  );
};
