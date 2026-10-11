import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type FastifyPluginAsyncZod,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { errorHandler } from './errors';
import { entityRoutes } from './modules/entities/routes';
import { entityTypeRoutes } from './modules/entity-types/routes';
import { exportRoutes } from './modules/export/routes';
import { manuscriptRoutes } from './modules/manuscript/routes';
import { relationshipRoutes } from './modules/relationships/routes';
import { searchRoutes } from './modules/search/routes';
import { tagRoutes } from './modules/tags/routes';
import { worldCollectionRoutes, worldItemRoutes } from './modules/worlds/routes';
import { requireSession, requireWorldMember } from './plugins/auth-guard';
import { authRoutes } from './plugins/auth-routes';

/** Everything under /api/worlds/:worldId requires a session and world membership. */
const worldScopedRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireSession);
  app.addHook('onRequest', requireWorldMember);
  await app.register(worldItemRoutes);
  await app.register(entityTypeRoutes);
  await app.register(entityRoutes);
  await app.register(relationshipRoutes);
  await app.register(tagRoutes);
  await app.register(searchRoutes);
  await app.register(exportRoutes);
  await app.register(manuscriptRoutes);
};

export async function buildApp(options: { logger?: FastifyServerOptions['logger'] } = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 2 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: 'Not Found', message: 'Route not found' }),
  );
  app.decorateRequest('user', null);
  app.decorateRequest('world', null);

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(worldCollectionRoutes, { prefix: '/api/worlds' });
  await app.register(worldScopedRoutes, { prefix: '/api/worlds/:worldId' });

  return app;
}
