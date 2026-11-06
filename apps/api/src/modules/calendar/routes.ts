import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { calendarUpdateSchema, extraCalendarParamsSchema, todaySchema } from '@atlas/shared';
import { db } from '../../db/client';
import { currentWorldId, requireRole } from '../../plugins/auth-guard';
import {
  createExtraCalendar,
  deleteExtraCalendar,
  getCalendar,
  listExtraCalendars,
  saveCalendar,
  setToday,
  updateExtraCalendar,
} from './service';

export const calendarRoutes: FastifyPluginAsyncZod = async (app) => {
  const write = { onRequest: requireRole('editor') };

  app.get('/calendar', async (request) => getCalendar(db, currentWorldId(request)));

  app.put('/calendar', { ...write, schema: { body: calendarUpdateSchema } }, async (request) =>
    saveCalendar(db, currentWorldId(request), request.body),
  );

  app.put('/calendar/today', { ...write, schema: { body: todaySchema } }, async (request) =>
    setToday(db, currentWorldId(request), request.body.day),
  );

  app.get('/calendars', async (request) => listExtraCalendars(db, currentWorldId(request)));

  app.post(
    '/calendars',
    { ...write, schema: { body: calendarUpdateSchema } },
    async (request, reply) => {
      const calendar = await createExtraCalendar(db, currentWorldId(request), request.body);
      return reply.status(201).send(calendar);
    },
  );

  app.put(
    '/calendars/:id',
    { ...write, schema: { params: extraCalendarParamsSchema, body: calendarUpdateSchema } },
    async (request) =>
      updateExtraCalendar(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/calendars/:id',
    { ...write, schema: { params: extraCalendarParamsSchema } },
    async (request, reply) => {
      await deleteExtraCalendar(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );
};
