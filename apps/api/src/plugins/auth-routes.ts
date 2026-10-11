import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth';
import { env } from '../env';

/** Forwards /api/auth/* to Better Auth's fetch-style handler. */
export async function authRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, env.BETTER_AUTH_URL);
      const hasBody = request.method !== 'GET' && request.body !== undefined;
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: hasBody ? JSON.stringify(request.body) : undefined,
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
