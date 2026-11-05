import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { gmScreenSchema } from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentUser,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import { getGmScreen, saveGmScreen } from './service';

// The screen is the GM's own working space: GM view only, one per person per world.
const gmOnly = [requireRole('editor'), requireAudience('gm')];

export const gmScreenRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/gm-screen', { onRequest: gmOnly }, async (request) =>
    getGmScreen(db, currentWorldId(request), currentUser(request).id),
  );

  app.put('/gm-screen', { onRequest: gmOnly, schema: { body: gmScreenSchema } }, async (request) =>
    saveGmScreen(db, currentWorldId(request), currentUser(request).id, request.body),
  );
};
