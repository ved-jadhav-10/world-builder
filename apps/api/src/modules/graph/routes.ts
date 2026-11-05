import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { familyQuerySchema, graphQuerySchema, worldItemParamsSchema } from '@atlas/shared';
import { db } from '../../db/client';
import { limits } from '../../lib/rate-limits';
import { currentAudience, currentWorldId } from '../../plugins/auth-guard';
import { getFamily, getGraph } from './service';

export const graphRoutes: FastifyPluginAsyncZod = async (app) => {
  // Both are filtered by audience: a player's graph has no hidden entries and no links to them.
  app.get(
    '/graph',
    { config: limits.graph, schema: { querystring: graphQuerySchema } },
    async (request) =>
      getGraph(db, currentWorldId(request), currentAudience(request), request.query),
  );

  app.get(
    '/family/:id',
    {
      config: limits.graph,
      schema: { params: worldItemParamsSchema, querystring: familyQuerySchema },
    },
    async (request) =>
      getFamily(
        db,
        currentWorldId(request),
        currentAudience(request),
        request.params.id,
        request.query,
      ),
  );
};
