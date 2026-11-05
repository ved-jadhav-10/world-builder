import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import {
  commentCreateSchema,
  commentInboxQuerySchema,
  commentParamsSchema,
  commentUpdateSchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { forbidden } from '../../errors';
import {
  currentAudience,
  currentUser,
  currentWorldId,
  requireRole,
} from '../../plugins/auth-guard';
import {
  createComment,
  deleteComment,
  listComments,
  listInbox,
  updateComment,
  type Actor,
  type Subject,
} from './service';

function actorOf(request: FastifyRequest): Actor {
  if (!request.world) throw forbidden();
  return {
    userId: currentUser(request).id,
    role: request.world.role,
    audience: currentAudience(request),
  };
}

/**
 * Comments are for the people working on the world: the owner, co-GMs and commenters. Players
 * and readers never see them, and neither does a GM previewing as one of them (the role guard
 * refuses previews). What a commenter can comment on is limited to what readers can see.
 */
export const commentRoutes: FastifyPluginAsyncZod = async (app) => {
  const team = { onRequest: requireRole('commenter') };

  const mount = (prefix: string, kind: Subject['kind']) => {
    const subject = (id: string): Subject => ({ kind, id });

    app.get(
      `${prefix}/:id/comments`,
      { ...team, schema: { params: worldItemParamsSchema } },
      async (request) =>
        listComments(
          db,
          currentWorldId(request),
          subject(request.params.id),
          currentAudience(request),
        ),
    );

    app.post(
      `${prefix}/:id/comments`,
      { ...team, schema: { params: worldItemParamsSchema, body: commentCreateSchema } },
      async (request, reply) => {
        const created = await createComment(
          db,
          currentWorldId(request),
          subject(request.params.id),
          actorOf(request),
          request.body,
        );
        return reply.status(201).send(created);
      },
    );
  };
  mount('/entities', 'entity');
  mount('/manuscript/scenes', 'scene');

  app.get(
    '/comments',
    { ...team, schema: { querystring: commentInboxQuerySchema } },
    async (request) =>
      listInbox(db, currentWorldId(request), currentAudience(request), request.query.status),
  );

  app.patch(
    '/comments/:id',
    { ...team, schema: { params: commentParamsSchema, body: commentUpdateSchema } },
    async (request) =>
      updateComment(db, currentWorldId(request), request.params.id, actorOf(request), request.body),
  );

  app.delete(
    '/comments/:id',
    { ...team, schema: { params: commentParamsSchema } },
    async (request, reply) => {
      await deleteComment(db, currentWorldId(request), request.params.id, actorOf(request));
      return reply.status(204).send();
    },
  );
};
