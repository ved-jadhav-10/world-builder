import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  nodeCreateSchema,
  nodeMoveSchema,
  nodeUpdateSchema,
  sceneBodySchema,
  worldItemParamsSchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { currentWorldId, requireRole } from '../../plugins/auth-guard';
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

export const manuscriptRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/manuscript', async (request) => listTree(db, currentWorldId(request)));

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
    async (request) => updateNode(db, currentWorldId(request), request.params.id, request.body),
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
    { schema: { params: worldItemParamsSchema } },
    async (request) => getScene(db, currentWorldId(request), request.params.id),
  );

  app.put(
    '/manuscript/scenes/:id/body',
    {
      onRequest: requireRole('editor'),
      schema: { params: worldItemParamsSchema, body: sceneBodySchema },
    },
    async (request) =>
      saveSceneBody(db, currentWorldId(request), request.params.id, request.body.body),
  );

  app.get('/mention-index', async (request) => mentionIndex(db, currentWorldId(request)));

  app.get(
    '/entities/:id/appearances',
    { schema: { params: worldItemParamsSchema } },
    async (request) => listAppearances(db, currentWorldId(request), request.params.id),
  );
};
