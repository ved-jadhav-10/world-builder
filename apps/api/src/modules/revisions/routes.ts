import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  revisionCreateSchema,
  revisionParamsSchema,
  worldItemParamsSchema,
  type EntityRevisionContent,
  type SceneRevisionContent,
} from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentUser,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import {
  createNamedRevision,
  deleteRevision,
  getRevision,
  listRevisions,
  restoreEntityRevision,
  restoreSceneRevision,
  type Subject,
} from './service';
import { getScene } from '../manuscript/service';

/**
 * Version history is the GM's alone: an old version can hold what has since been hidden or
 * cut, so it is never shown to players or readers, or while previewing as one.
 */
export const revisionRoutes: FastifyPluginAsyncZod = async (app) => {
  const read = { onRequest: [requireRole('editor'), requireAudience('gm')] };
  const write = read;

  const mount = (prefix: string, kind: Subject['kind']) => {
    const subject = (id: string): Subject => ({ kind, id });

    app.get(
      `${prefix}/:id/revisions`,
      { ...read, schema: { params: worldItemParamsSchema } },
      async (request) => listRevisions(db, currentWorldId(request), subject(request.params.id)),
    );

    app.post(
      `${prefix}/:id/revisions`,
      { ...write, schema: { params: worldItemParamsSchema, body: revisionCreateSchema } },
      async (request, reply) => {
        const created = await createNamedRevision(
          db,
          currentWorldId(request),
          subject(request.params.id),
          currentUser(request).id,
          request.body.label,
        );
        return reply.status(201).send(created);
      },
    );

    app.get(
      `${prefix}/:id/revisions/:revisionId`,
      { ...read, schema: { params: revisionParamsSchema } },
      async (request) =>
        getRevision<EntityRevisionContent | SceneRevisionContent>(
          db,
          currentWorldId(request),
          subject(request.params.id),
          request.params.revisionId,
        ),
    );

    app.delete(
      `${prefix}/:id/revisions/:revisionId`,
      { ...write, schema: { params: revisionParamsSchema } },
      async (request, reply) => {
        await deleteRevision(
          db,
          currentWorldId(request),
          subject(request.params.id),
          request.params.revisionId,
        );
        return reply.status(204).send();
      },
    );
  };

  mount('/entities', 'entity');
  mount('/manuscript/scenes', 'scene');

  app.post(
    '/entities/:id/revisions/:revisionId/restore',
    { ...write, schema: { params: revisionParamsSchema } },
    async (request) =>
      restoreEntityRevision(
        db,
        currentWorldId(request),
        request.params.id,
        request.params.revisionId,
        currentUser(request).id,
      ),
  );

  app.post(
    '/manuscript/scenes/:id/revisions/:revisionId/restore',
    { ...write, schema: { params: revisionParamsSchema } },
    async (request) => {
      const worldId = currentWorldId(request);
      await restoreSceneRevision(
        db,
        worldId,
        request.params.id,
        request.params.revisionId,
        currentUser(request).id,
      );
      return getScene(db, worldId, request.params.id);
    },
  );
};
