import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { diplomacyParamsSchema, diplomacySetSchema } from '@atlas/shared';
import { db } from '../../db/client';
import { currentAudience, currentWorldId, requireRole } from '../../plugins/auth-guard';
import { deleteDiplomacy, listDiplomacy, setDiplomacy } from './service';

export const diplomacyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/diplomacy', async (request) =>
    listDiplomacy(db, currentWorldId(request), currentAudience(request)),
  );

  // One standing per pair, so setting it again changes the one there.
  app.put(
    '/diplomacy',
    { onRequest: requireRole('editor'), schema: { body: diplomacySetSchema } },
    async (request) => setDiplomacy(db, currentWorldId(request), request.body),
  );

  app.delete(
    '/diplomacy/:id',
    { onRequest: requireRole('editor'), schema: { params: diplomacyParamsSchema } },
    async (request, reply) => {
      await deleteDiplomacy(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );
};
