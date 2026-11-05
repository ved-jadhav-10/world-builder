import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { todoCreateSchema, todoParamsSchema, todoUpdateSchema } from '@atlas/shared';
import { db } from '../../db/client';
import {
  currentUser,
  currentWorldId,
  requireAudience,
  requireRole,
} from '../../plugins/auth-guard';
import { clearDoneTodos, createTodo, deleteTodo, listTodos, updateTodo } from './service';

/** The to-do list is the working side of a world, so like the manuscript it is the GM's. */
export const todoRoutes: FastifyPluginAsyncZod = async (app) => {
  const read = { onRequest: requireAudience('gm') };
  const write = { onRequest: [requireRole('editor'), requireAudience('gm')] };

  app.get('/todos', read, async (request) => listTodos(db, currentWorldId(request)));

  app.post('/todos', { ...write, schema: { body: todoCreateSchema } }, async (request, reply) => {
    const todo = await createTodo(
      db,
      currentWorldId(request),
      currentUser(request).id,
      request.body,
    );
    return reply.status(201).send(todo);
  });

  app.patch(
    '/todos/:id',
    { ...write, schema: { params: todoParamsSchema, body: todoUpdateSchema } },
    async (request) => updateTodo(db, currentWorldId(request), request.params.id, request.body),
  );

  app.delete(
    '/todos/:id',
    { ...write, schema: { params: todoParamsSchema } },
    async (request, reply) => {
      await deleteTodo(db, currentWorldId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  app.post('/todos/clear-done', write, async (request) => ({
    removed: await clearDoneTodos(db, currentWorldId(request)),
  }));
};
