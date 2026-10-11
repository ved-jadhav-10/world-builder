import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { worldItemParamsSchema } from '@atlas/shared';
import { db } from '../../db/client';
import { currentAudience, currentWorldId, requireRole } from '../../plugins/auth-guard';
import { listQuests, setQuestStatus } from './service';

const statusBodySchema = z.object({ status: z.string().trim().min(1).max(60) });

export const questRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/quests', async (request) =>
    listQuests(db, currentWorldId(request), currentAudience(request)),
  );

  app.patch(
    '/quests/:id/status',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: statusBodySchema },
    },
    async (request) =>
      setQuestStatus(db, currentWorldId(request), request.params.id, request.body.status),
  );
};
