import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { worldCreateSchema, worldUpdateSchema } from '@atlas/shared';
import { db } from '../../db/client';
import { fillSampleWorld, SAMPLE_WORLD } from '../../db/sample-world';
import { limits } from '../../lib/rate-limits';
import { currentUser, currentWorldId, requireRole, requireSession } from '../../plugins/auth-guard';
import {
  createWorld,
  getWorld,
  getWorldBySlug,
  listWorlds,
  softDeleteWorld,
  updateWorld,
} from './service';

/** /api/worlds — the signed-in user's worlds. */
export const worldCollectionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireSession);

  app.get('/', async (request) => listWorlds(db, currentUser(request).id));

  app.post(
    '/',
    { config: limits.worldCreate, schema: { body: worldCreateSchema } },
    async (request, reply) => {
      const userId = currentUser(request).id;
      const sample = request.body.template === 'sample';
      const world = await createWorld(db, userId, {
        ...request.body,
        description: request.body.description || (sample ? SAMPLE_WORLD.description : ''),
      });
      if (sample) {
        try {
          await fillSampleWorld(db, world.id, userId, request.log);
        } catch (error) {
          // Half a sample is worse than none: take the world away again and say it failed.
          await softDeleteWorld(db, world.id);
          throw error;
        }
      }
      return reply.status(201).send(world);
    },
  );

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
