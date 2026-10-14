import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { searchQuerySchema } from '@atlas/shared';
import { db } from '../../db/client';
import { limits } from '../../lib/rate-limits';
import { currentAudience, currentWorldId } from '../../plugins/auth-guard';
import { searchEntities } from './service';

export const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/search',
    { config: limits.search, schema: { querystring: searchQuerySchema } },
    async (request) =>
      searchEntities(db, currentWorldId(request), request.query, currentAudience(request)),
  );
};
