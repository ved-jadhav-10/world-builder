import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import { MAX_TODOS, type Todo, type todoCreateSchema, type todoUpdateSchema } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, todos } from '../../db/schema';
import { conflict, notFound } from '../../errors';

const columns = {
  todo: todos,
  entityId: entities.id,
  entityName: entities.name,
  entityTypeId: entities.typeId,
};

type Row = {
  todo: typeof todos.$inferSelect;
  entityId: string | null;
  entityName: string | null;
  entityTypeId: string | null;
};

function toTodo({ todo, entityId, entityName, entityTypeId }: Row): Todo {
  return {
    id: todo.id,
    title: todo.title,
    notes: todo.notes,
    done: todo.done,
    doneAt: todo.doneAt?.toISOString() ?? null,
    entity:
      entityId && entityName !== null && entityTypeId
        ? { id: entityId, name: entityName, typeId: entityTypeId }
        : null,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

/** Todos joined to the entry they are about; an entry in the trash reads as no entry. */
function selectTodos(db: DbOrTx) {
  return db
    .select(columns)
    .from(todos)
    .leftJoin(entities, and(eq(entities.id, todos.entityId), isNull(entities.deletedAt)));
}

async function getRow(db: DbOrTx, worldId: string, id: string): Promise<Row> {
  const [row] = await selectTodos(db).where(and(eq(todos.id, id), eq(todos.worldId, worldId)));
  if (!row) throw notFound('To-do');
  return row;
}

/** Entries that are not in this world, or are in the trash, cannot be linked. */
async function checkEntity(db: DbOrTx, worldId: string, entityId: string | null) {
  if (!entityId) return;
  const [found] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(eq(entities.id, entityId), eq(entities.worldId, worldId), isNull(entities.deletedAt)),
    );
  if (!found) throw notFound('Entry');
}

/** Open tasks first, oldest first; finished ones after, the latest finished on top. */
export async function listTodos(db: DbOrTx, worldId: string): Promise<Todo[]> {
  const rows = await selectTodos(db)
    .where(eq(todos.worldId, worldId))
    .orderBy(asc(todos.done), asc(todos.createdAt), desc(todos.doneAt), asc(todos.id));
  const open = rows.filter((r) => !r.todo.done);
  const done = rows
    .filter((r) => r.todo.done)
    .sort((a, b) => (b.todo.doneAt?.getTime() ?? 0) - (a.todo.doneAt?.getTime() ?? 0));
  return [...open, ...done].map(toTodo);
}

export async function createTodo(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: z.output<typeof todoCreateSchema>,
): Promise<Todo> {
  await checkEntity(db, worldId, input.entityId);
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(todos)
    .where(eq(todos.worldId, worldId));
  if (total >= MAX_TODOS) {
    throw conflict(`A world holds up to ${MAX_TODOS} to-dos. Clear some finished ones first.`);
  }
  const [row] = await db
    .insert(todos)
    .values({
      worldId,
      title: input.title,
      notes: input.notes,
      entityId: input.entityId,
      createdBy: userId,
    })
    .returning();
  return getRow(db, worldId, row!.id).then(toTodo);
}

export async function updateTodo(
  db: DbOrTx,
  worldId: string,
  id: string,
  input: z.output<typeof todoUpdateSchema>,
): Promise<Todo> {
  const { todo } = await getRow(db, worldId, id);
  const set: Partial<typeof todos.$inferInsert> = {};
  if (input.title !== undefined) set.title = input.title;
  if (input.notes !== undefined) set.notes = input.notes;
  if (input.entityId !== undefined) {
    await checkEntity(db, worldId, input.entityId);
    set.entityId = input.entityId;
  }
  // Ticking an already finished task keeps its original finish time.
  if (input.done !== undefined && input.done !== todo.done) {
    set.done = input.done;
    set.doneAt = input.done ? new Date() : null;
  }
  if (Object.keys(set).length > 0) {
    await db
      .update(todos)
      .set(set)
      .where(and(eq(todos.id, id), eq(todos.worldId, worldId)));
  }
  return toTodo(await getRow(db, worldId, id));
}

export async function deleteTodo(db: DbOrTx, worldId: string, id: string): Promise<void> {
  await getRow(db, worldId, id);
  await db.delete(todos).where(and(eq(todos.id, id), eq(todos.worldId, worldId)));
}

/** Removes every finished task; returns how many went. */
export async function clearDoneTodos(db: DbOrTx, worldId: string): Promise<number> {
  const removed = await db
    .delete(todos)
    .where(and(eq(todos.worldId, worldId), eq(todos.done, true)))
    .returning({ id: todos.id });
  return removed.length;
}
