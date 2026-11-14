import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idSchema,
  wikiProgressSchema,
  wikiSettingsSchema,
  wikiUnlockSchema,
  type WikiLocked,
} from '@atlas/shared';
import { db } from '../../db/client';
import type { worlds } from '../../db/schema';
import { env } from '../../env';
import { forbidden } from '../../errors';
import { limits } from '../../lib/rate-limits';
import { currentWorldId, requireRole } from '../../plugins/auth-guard';
import { readImage } from '../gallery/service';
import {
  checkWikiPassword,
  getWikiSettings,
  signWikiPass,
  updateWikiSettings,
  wikiEntry,
  wikiHome,
  wikiImageWorld,
  wikiPassSeconds,
  wikiPassValid,
  wikiWorld,
} from './service';

type WorldRow = typeof worlds.$inferSelect;

/** World settings › Reader wiki, for the owner and co-GMs. Lives under /api/worlds/:worldId. */
export const wikiSettingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/wiki-settings', { onRequest: requireRole('editor') }, async (request) =>
    getWikiSettings(db, currentWorldId(request)),
  );

  app.patch(
    '/wiki-settings',
    { onRequest: requireRole('editor'), schema: { body: wikiSettingsSchema } },
    async (request) => {
      if (request.body.enabled && !env.publicWikis) {
        throw forbidden('Public wikis are switched off on this server');
      }
      return updateWikiSettings(db, currentWorldId(request), request.body);
    },
  );
};

const slugParams = z.object({ slug: z.string().min(1).max(200) });
const progressQuery = z.object({ chapter: wikiProgressSchema });

const cookieName = (world: WorldRow) => `wiki_${world.id}`;

function readCookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/**
 * Finds the wiki and, when it has a password, checks the visitor's pass. A locked wiki answers
 * 401 with only the world's name, so the page can ask for the password.
 */
async function openWiki(request: FastifyRequest, reply: FastifyReply, slug: string) {
  const world = await wikiWorld(db, slug);
  // Ask crawlers that train or answer from AI models to stay out, and never cache a reader's view.
  void reply.header('x-robots-tag', 'noai, noimageai').header('cache-control', 'private, no-store');
  if (world.wikiPasswordHash && !wikiPassValid(world, readCookie(request, cookieName(world)))) {
    const locked: WikiLocked = { locked: true, world: { name: world.name } };
    void reply.status(401).send(locked);
    return null;
  }
  return world;
}

/** The public reader wiki. No session: anyone with the address (and the password, if set). */
export const wikiRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/:slug',
    { config: limits.wikiRead, schema: { params: slugParams, querystring: progressQuery } },
    async (request, reply) => {
      const world = await openWiki(request, reply, request.params.slug);
      if (!world) return reply;
      return {
        ...(await wikiHome(db, world, request.query.chapter)),
        reportTo: env.ABUSE_EMAIL ?? null,
      };
    },
  );

  app.get(
    '/:slug/entries/:id',
    {
      config: limits.wikiRead,
      schema: { params: slugParams.extend({ id: idSchema }), querystring: progressQuery },
    },
    async (request, reply) => {
      const world = await openWiki(request, reply, request.params.slug);
      if (!world) return reply;
      return wikiEntry(db, world, request.params.id, request.query.chapter);
    },
  );

  app.post(
    '/:slug/unlock',
    { config: limits.wikiUnlock, schema: { params: slugParams, body: wikiUnlockSchema } },
    async (request, reply) => {
      const world = await wikiWorld(db, request.params.slug);
      if (!world.wikiPasswordHash) return { ok: true };
      if (!(await checkWikiPassword(request.body.password, world.wikiPasswordHash))) {
        throw forbidden('That is not the password');
      }
      const secure = env.isProduction ? '; Secure' : '';
      void reply.header(
        'set-cookie',
        `${cookieName(world)}=${signWikiPass(world)}; Path=/api/wiki; Max-Age=${wikiPassSeconds}; HttpOnly; SameSite=Lax${secure}`,
      );
      return { ok: true };
    },
  );

  for (const [path, which] of [
    ['file', 'full'],
    ['thumbnail', 'thumb'],
  ] as const) {
    app.get(
      `/:slug/images/:id/${path}`,
      { config: limits.wikiRead, schema: { params: slugParams.extend({ id: idSchema }) } },
      async (request, reply) => {
        const world = await openWiki(request, reply, request.params.slug);
        if (!world) return reply;
        await wikiImageWorld(db, world, request.params.id);
        const file = await readImage(db, world.id, request.params.id, which, 'public');
        return reply
          .header('content-type', 'image/webp')
          .header(
            'cache-control',
            world.wikiPasswordHash ? 'private, max-age=3600' : 'public, max-age=3600',
          )
          .send(file);
      },
    );
  }
};
