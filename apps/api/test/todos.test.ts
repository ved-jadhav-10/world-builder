import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_TODOS, type Entity, type Todo, type WorldExport } from '@atlas/shared';
import { buildApp } from '../src/app';
import { apiClient, joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const make = async (title: string, extra: object = {}) => {
    const res = await api.post(`${w}/todos`, { title, ...extra });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Todo>();
  };
  const list = async (client = api) => {
    const res = await client.get(`${w}/todos`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Todo[]>();
  };
  const entry = async (name: string) =>
    (await api.post(`${w}/entities`, { typeId: ctx.typeId('item'), name })).json<Entity>();
  return { ...ctx, make, list, entry };
}

describe('to-do list', () => {
  it('adds, edits, ticks and deletes tasks', async () => {
    const { api, w, make, list } = await setup();
    const todo = await make('  Name the harbour  ', { notes: 'Not Havenmouth.' });
    expect(todo).toMatchObject({ title: 'Name the harbour', done: false, entity: null });

    const edited = await api.patch(`${w}/todos/${todo.id}`, { title: 'Name the port' });
    expect(edited.json<Todo>().title).toBe('Name the port');

    const ticked = (await api.patch(`${w}/todos/${todo.id}`, { done: true })).json<Todo>();
    expect(ticked.done).toBe(true);
    expect(ticked.doneAt).not.toBeNull();
    // Ticking again does not move the finish time.
    const again = (await api.patch(`${w}/todos/${todo.id}`, { done: true })).json<Todo>();
    expect(again.doneAt).toBe(ticked.doneAt);

    const unticked = (await api.patch(`${w}/todos/${todo.id}`, { done: false })).json<Todo>();
    expect(unticked).toMatchObject({ done: false, doneAt: null });

    expect((await api.delete(`${w}/todos/${todo.id}`)).statusCode).toBe(204);
    expect(await list()).toHaveLength(0);
    expect((await api.delete(`${w}/todos/${todo.id}`)).statusCode).toBe(404);
  });

  it('rejects an empty title', async () => {
    const { api, w } = await setup();
    expect((await api.post(`${w}/todos`, { title: '   ' })).statusCode).toBe(400);
  });

  it('lists open tasks first in the order they were added, then finished ones, latest first', async () => {
    const { api, w, make, list } = await setup();
    const a = await make('A');
    const b = await make('B');
    const c = await make('C');
    await api.patch(`${w}/todos/${a.id}`, { done: true });
    await api.patch(`${w}/todos/${c.id}`, { done: true });
    expect((await list()).map((t) => t.title)).toEqual(['B', 'C', 'A']);
    expect(b.done).toBe(false);
  });

  it('links a task to an entry, and drops the link when the entry is trashed or deleted', async () => {
    const { api, w, make, list, entry } = await setup();
    const ring = await entry('Lost Ring');
    const todo = await make('Describe the ring', { entityId: ring.id });
    expect(todo.entity).toMatchObject({ id: ring.id, name: 'Lost Ring' });

    await api.delete(`${w}/entities/${ring.id}`);
    expect((await list())[0]!.entity).toBeNull();

    await api.post(`${w}/trash/${ring.id}/restore`);
    expect((await list())[0]!.entity?.name).toBe('Lost Ring');

    await api.delete(`${w}/entities/${ring.id}`);
    expect((await api.delete(`${w}/trash/${ring.id}`)).statusCode).toBe(204);
    expect((await list())[0]).toMatchObject({ title: 'Describe the ring', entity: null });
  });

  it('refuses an entry from another world or in the trash, and can unlink', async () => {
    const { api, w, make, entry } = await setup();
    const other = await setup();
    const foreign = await other.entry('Foreign');
    expect((await api.post(`${w}/todos`, { title: 'x', entityId: foreign.id })).statusCode).toBe(
      404,
    );

    const ring = await entry('Ring');
    const todo = await make('Ring task', { entityId: ring.id });
    await api.delete(`${w}/entities/${ring.id}`);
    expect((await api.patch(`${w}/todos/${todo.id}`, { entityId: ring.id })).statusCode).toBe(404);
    const unlinked = await api.patch(`${w}/todos/${todo.id}`, { entityId: null });
    expect(unlinked.json<Todo>().entity).toBeNull();
  });

  it('clears finished tasks only', async () => {
    const { api, w, make, list } = await setup();
    const a = await make('Done one');
    await make('Open one');
    await api.patch(`${w}/todos/${a.id}`, { done: true });
    const res = await api.post(`${w}/todos/clear-done`);
    expect(res.json()).toEqual({ removed: 1 });
    expect((await list()).map((t) => t.title)).toEqual(['Open one']);
  });

  it('keeps tasks inside their own world', async () => {
    const { api, w, make } = await setup();
    const other = await setup();
    const todo = await make('Mine');
    expect((await other.api.get(`${w}/todos`)).statusCode).toBe(404);
    expect((await other.api.patch(`${other.w}/todos/${todo.id}`, { done: true })).statusCode).toBe(
      404,
    );
    expect((await api.get(`${w}/todos`)).json<Todo[]>()).toHaveLength(1);
  });

  it('is for the GM and editors, not for players, readers or the player preview', async () => {
    const { w, make, world, cookie } = await setup();
    await make('Secret plan');
    const editor = await joinWorld(app, world.id, 'editor');
    const player = await joinWorld(app, world.id, 'player');
    const reader = await joinWorld(app, world.id, 'reader');
    expect((await editor.api.get(`${w}/todos`)).statusCode).toBe(200);
    expect((await editor.api.post(`${w}/todos`, { title: 'Editor idea' })).statusCode).toBe(201);
    for (const who of [player, reader]) {
      expect((await who.api.get(`${w}/todos`)).statusCode).toBe(403);
      expect((await who.api.post(`${w}/todos`, { title: 'x' })).statusCode).toBe(403);
    }
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await preview.get(`${w}/todos`)).statusCode).toBe(403);
  });

  it('stops at the limit per world', async () => {
    const { api, w, world } = await setup();
    const { db } = await import('../src/db/client');
    const { todos } = await import('../src/db/schema');
    await db
      .insert(todos)
      .values(Array.from({ length: MAX_TODOS }, (_, i) => ({ worldId: world.id, title: `t${i}` })));
    const res = await api.post(`${w}/todos`, { title: 'one too many' });
    expect(res.statusCode).toBe(409);
  });

  it('is part of the world export', async () => {
    const { api, w, make } = await setup();
    await make('Export me');
    const exported = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(exported.todos.map((t) => t.title)).toEqual(['Export me']);
  });
});
