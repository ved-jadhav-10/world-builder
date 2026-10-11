import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { worldCreateSchema, worldUpdateSchema } from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentUser,
  currentWorldId,
  requireRole,
  requireSession,
} from '../../plugins/auth-guard';
import { createWorld, getWorld, getWorldBySlug, listWorlds, softDeleteWorld, updateWorld } from './service';

/** /api/worlds — the signed-in user's worlds. */
export const worldCollectionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireSession);

  app.get('/', async (request) => listWorlds(db, currentUser(request).id));

  app.post('/', { schema: { body: worldCreateSchema } }, async (request, reply) => {
    const world = await createWorld(db, currentUser(request).id, request.body);
    return reply.status(201).send(world);
  });

  app.get(
    '/by-slug/:slug',
    { schema: { params: z.object({ slug: z.string().min(1).max(100) }) } },
    async (request) => getWorldBySlug(db, currentUser(request).id, request.params.slug),
  );
};

/** /api/worlds/:worldId — runs behind requireWorldMember. */
export const worldItemRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', async (request) => getWorld(db, currentWorldId(request), request.world!.role));

  app.patch(
    '/',
    { onRequest: requireRole('owner'), schema: { body: worldUpdateSchema } },
    async (request) => updateWorld(db, currentWorldId(request), request.world!.role, request.body),
  );

  app.delete('/', { onRequest: requireRole('owner') }, async (request, reply) => {
    await softDeleteWorld(db, currentWorldId(request));
    return reply.status(204).send();
  });
};
