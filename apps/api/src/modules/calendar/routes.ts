import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { calendarUpdateSchema } from '@atlas/shared';
import { db } from '../../db/client';
import { currentWorldId, requireRole } from '../../plugins/auth-guard';
import { getCalendar, saveCalendar } from './service';

export const calendarRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/calendar', async (request) => getCalendar(db, currentWorldId(request)));

  app.put(
    '/calendar',
    { onRequest: requireRole('editor'), schema: { body: calendarUpdateSchema } },
    async (request) => saveCalendar(db, currentWorldId(request), request.body),
  );
};
