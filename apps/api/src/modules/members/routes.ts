import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  idSchema,
  inviteCreateSchema,
  inviteTokenSchema,
  memberUpdateSchema,
  ROLE_LABELS,
} from '@atlas/shared';
import { db } from '../../db/client';
import { worlds } from '../../db/schema';
import { env } from '../../env';
import { badRequest } from '../../errors';
import { inviteEmail } from '../../lib/email-templates';
import { sendMailSoon } from '../../lib/mailer';
import { limits } from '../../lib/rate-limits';
import { currentUser, currentWorldId, requireRole, requireSession } from '../../plugins/auth-guard';
import {
  acceptInvite,
  createInvite,
  deleteInvite,
  listInvites,
  listMembers,
  previewInvite,
  removeMember,
  updateMemberRole,
} from './service';

const memberParams = z.object({ userId: z.string().min(1).max(200) });
const inviteParams = z.object({ id: idSchema });

/** /api/worlds/:worldId — who is in the world and the links that let people in. */
export const memberRoutes: FastifyPluginAsyncZod = async (app) => {
  const ownerOnly = requireRole('owner');

  app.get('/members', { onRequest: ownerOnly }, async (request) =>
    listMembers(db, currentWorldId(request)),
  );

  app.patch(
    '/members/:userId',
    { onRequest: ownerOnly, schema: { params: memberParams, body: memberUpdateSchema } },
    async (request, reply) => {
      await updateMemberRole(db, currentWorldId(request), request.params.userId, request.body.role);
      return reply.status(204).send();
    },
  );

  // Any member can leave; the owner cannot, since the world would be left without one.
  // The static `/members/me` is matched ahead of `/members/:userId`.
  app.delete('/members/me', { onRequest: requireRole('player') }, async (request, reply) => {
    if (request.world?.role === 'owner') {
      throw badRequest("The owner can't leave. Delete the world instead.");
    }
    await removeMember(db, currentWorldId(request), currentUser(request).id);
    return reply.status(204).send();
  });

  app.delete(
    '/members/:userId',
    { onRequest: ownerOnly, schema: { params: memberParams } },
    async (request, reply) => {
      await removeMember(db, currentWorldId(request), request.params.userId);
      return reply.status(204).send();
    },
  );

  app.get('/invites', { onRequest: ownerOnly }, async (request) =>
    listInvites(db, currentWorldId(request)),
  );

  app.post(
    '/invites',
    {
      onRequest: ownerOnly,
      config: limits.inviteCreate,
      schema: { body: inviteCreateSchema },
    },
    async (request, reply) => {
      const worldId = currentWorldId(request);
      const owner = currentUser(request);
      const invite = await createInvite(db, worldId, owner.id, request.body);

      // The secret exists only now, so this is the one chance to put it in an email. A failed
      // send is logged; the link is still shown to the owner, who can pass it on by hand.
      const emailedTo = [...new Set(request.body.emails)];
      if (emailedTo.length) {
        const [world] = await db
          .select({ name: worlds.name })
          .from(worlds)
          .where(eq(worlds.id, worldId));
        for (const to of emailedTo) {
          sendMailSoon(
            inviteEmail(to, {
              inviterName: owner.name,
              worldName: world?.name ?? 'a world',
              roleLabel: ROLE_LABELS[invite.role],
              url: `${env.WEB_ORIGIN}/join/${invite.token}`,
            }),
          );
        }
      }
      return reply
        .status(201)
        .header('cache-control', 'no-store')
        .send({ ...invite, emailedTo });
    },
  );

  app.delete(
    '/invites/:id',
    { onRequest: ownerOnly, schema: { params: inviteParams } },
    async (request, reply) => {
      await deleteInvite(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );
};

/** /api/invites — using a link. Whoever holds the secret may look at it; joining needs a session. */
export const inviteRoutes: FastifyPluginAsyncZod = async (app) => {
  const params = z.object({ token: inviteTokenSchema });

  app.get('/:token', { config: limits.inviteUse, schema: { params } }, async (request, reply) => {
    const preview = await previewInvite(db, request.params.token);
    return reply.header('cache-control', 'no-store').send(preview);
  });

  app.post(
    '/:token/accept',
    { onRequest: requireSession, config: limits.inviteUse, schema: { params } },
    async (request, reply) => {
      const result = await acceptInvite(db, request.params.token, currentUser(request).id);
      return reply.header('cache-control', 'no-store').send(result);
    },
  );
};
