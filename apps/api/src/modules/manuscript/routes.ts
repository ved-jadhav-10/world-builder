import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  nodeCreateSchema,
  nodeMoveSchema,
  nodeUpdateSchema,
  sceneBodySchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentAudience,
  currentUser,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import { getEntityRow } from '../entities/service';
import {
  createNode,
  deleteNode,
  getScene,
  listAppearances,
  listTree,
  mentionIndex,
  moveNode,
  saveSceneBody,
  updateNode,
} from './service';
import { afterEdit, beforeEdit, isScene } from '../revisions/service';
import { recordWords, sceneWordCount } from '../writing/service';

export const manuscriptRoutes: FastifyPluginAsyncZod = async (app) => {
  // The manuscript is the author's own workspace, so only the GM's view reads it.
  const gmOnly = { onRequest: requireAudience('gm') };

  app.get('/manuscript', gmOnly, async (request) => listTree(db, currentWorldId(request)));

  app.post(
    '/manuscript/nodes',
    { onRequest: requireRole('editor'), schema: { body: nodeCreateSchema } },
    async (request, reply) => {
      const node = await createNode(db, currentWorldId(request), request.body);
      return reply.status(201).send(node);
    },
  );

  app.patch(
    '/manuscript/nodes/:id',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: nodeUpdateSchema },
    },
    async (request) => {
      const worldId = currentWorldId(request);
      const { id } = request.params;
      // Only a scene's title and summary have a history, and only when they are being changed.
      const tracked =
        (request.body.title !== undefined || request.body.summary !== undefined) &&
        (await isScene(db, worldId, id));
      const subject = { kind: 'scene', id } as const;
      if (tracked) await beforeEdit(db, worldId, subject);
      const updated = await updateNode(db, worldId, id, request.body);
      if (tracked) await afterEdit(db, worldId, subject, currentUser(request).id);
      return updated;
    },
  );

  app.post(
    '/manuscript/nodes/:id/move',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: nodeMoveSchema },
    },
    async (request) => moveNode(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/manuscript/nodes/:id',
    { onRequest: requireRole('editor'), schema: { params: worldItemParamsSchema } },
    async (request, reply) => {
      await deleteNode(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  app.get(
    '/manuscript/scenes/:id',
    { ...gmOnly, schema: { params: worldItemParamsSchema } },
    async (request) => getScene(db, currentWorldId(request), request.params.id),
  );

  app.put(
    '/manuscript/scenes/:id/body',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: sceneBodySchema },
    },
    async (request) => {
      const worldId = currentWorldId(request);
      const subject = { kind: 'scene', id: request.params.id } as const;
      await beforeEdit(db, worldId, subject);
      const words = await sceneWordCount(db, worldId, request.params.id);
      const saved = await saveSceneBody(db, worldId, request.params.id, request.body.body);
      // Counting the day's words must never get in the way of saving the text.
      await recordWords(db, worldId, currentUser(request).id, saved.wordCount - words).catch(
        (error: unknown) => request.log.warn({ err: error }, 'Could not record words written'),
      );
      await afterEdit(db, worldId, subject, currentUser(request).id);
      return saved;
    },
  );

  app.get('/mention-index', gmOnly, async (request) => mentionIndex(db, currentWorldId(request)));

  app.get(
    '/entities/:id/appearances',
    { schema: { params: worldItemParamsSchema } },
    async (request) => {
      const audience = currentAudience(request);
      if (audience !== 'gm') {
        // Scenes are the author's; other audiences see no appearances (but not hidden entries).
        await getEntityRow(db, currentWorldId(request), request.params.id, audience);
        return [];
      }
      return listAppearances(db, currentWorldId(request), request.params.id);
    },
  );
};
