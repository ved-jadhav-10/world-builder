import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, CLIENT_IP_HEADER } from '../auth';
import { env } from '../env';

/** Forwards /api/auth/* to Better Auth's fetch-style handler. */
export async function authRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, env.BETTER_AUTH_URL);
      const hasBody = request.method !== 'GET' && request.body !== undefined;
      // Better Auth counts sign-in attempts per client address. Fastify knows the real address
      // (it honours TRUST_PROXY), so hand it over in a header that overwrites anything sent.
      const headers = fromNodeHeaders(request.headers);
      headers.set(CLIENT_IP_HEADER, request.ip);
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers,
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
