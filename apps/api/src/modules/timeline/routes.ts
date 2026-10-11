import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { db } from '../../db/client';
import { currentWorldId } from '../../plugins/auth-guard';
import { getTimeline } from './service';

export const timelineRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/timeline', async (request) => getTimeline(db, currentWorldId(request)));
};
