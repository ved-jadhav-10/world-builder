import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, ManuscriptNode, Page, EntitySummary } from '@atlas/shared';
import { buildApp } from '../src/app';
import { signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const book = async (title: string) =>
    (await api.post(`${w}/manuscript/nodes`, { kind: 'book', title })).json<ManuscriptNode>();
  const entry = async (name: string, extra: object = {}) => {
    const res = await api.post(`${w}/entities`, {
      typeId: ctx.typeId('character'),
      name,
      ...extra,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Entity>();
  };
  const names = async (query = '') =>
    (await api.get(`${w}/entities${query}`)).json<Page<EntitySummary>>().items.map((e) => e.name);
  return { ...ctx, book, entry, names };
}

describe('series codex', () => {
  it('shares entries across every book unless they are scoped', async () => {
    const { book, entry, names } = await setup();
    const one = await book('Dawn');
    const two = await book('Dusk');
    await entry('Everyone');
    await entry('Only dawn', { scopeBookIds: [one.id] });
    await entry('Both', { scopeBookIds: [one.id, two.id, one.id] });
    await entry('Only dusk', { scopeBookIds: [two.id] });

    expect((await names()).sort()).toEqual(['Both', 'Everyone', 'Only dawn', 'Only dusk']);
    expect((await names(`?bookId=${one.id}`)).sort()).toEqual(['Both', 'Everyone', 'Only dawn']);
    expect((await names(`?bookId=${two.id}`)).sort()).toEqual(['Both', 'Everyone', 'Only dusk']);
  });

  it('can be rescoped or shared again, and keeps each book once', async () => {
    const { api, w, book, entry } = await setup();
    const one = await book('Dawn');
    const hero = await entry('Hero', { scopeBookIds: [one.id, one.id] });
    expect(hero.scopeBookIds).toEqual([one.id]);
    const shared = await api.patch(`${w}/entities/${hero.id}`, { scopeBookIds: [] });
    expect(shared.json<Entity>().scopeBookIds).toEqual([]);
    const back = await api.patch(`${w}/entities/${hero.id}`, { scopeBookIds: [one.id] });
    expect(back.json<Entity>().scopeBookIds).toEqual([one.id]);
    // Editing something else leaves the scope alone.
    const renamed = await api.patch(`${w}/entities/${hero.id}`, { name: 'Heroine' });
    expect(renamed.json<Entity>().scopeBookIds).toEqual([one.id]);
  });

  it('only accepts books of this world, not chapters, scenes or strangers', async () => {
    const { api, w, book, typeId } = await setup();
    const other = await setup();
    const mine = await book('Mine');
    const chapter = (
      await api.post(`${w}/manuscript/nodes`, { kind: 'chapter', title: 'Ch', parentId: mine.id })
    ).json<ManuscriptNode>();
    const foreign = await other.book('Theirs');
    const make = (scopeBookIds: string[]) =>
      api.post(`${w}/entities`, { typeId: typeId('character'), name: 'X', scopeBookIds });
    expect((await make([chapter.id])).statusCode).toBe(404);
    expect((await make([foreign.id])).statusCode).toBe(404);
    expect((await make([mine.id])).statusCode).toBe(201);
  });

  it('frees an entry for every book when its only book is deleted', async () => {
    const { api, w, book, entry, names } = await setup();
    const one = await book('Dawn');
    const two = await book('Dusk');
    const solo = await entry('Solo', { scopeBookIds: [one.id] });
    const pair = await entry('Pair', { scopeBookIds: [one.id, two.id] });
    await api.delete(`${w}/manuscript/nodes/${one.id}`);
    const fetched = async (id: string) =>
      (await api.get(`${w}/entities/${id}`)).json<Entity>().scopeBookIds;
    expect(await fetched(solo.id)).toEqual([]);
    expect(await fetched(pair.id)).toEqual([two.id]);
    expect((await names(`?bookId=${two.id}`)).sort()).toEqual(['Pair', 'Solo']);
  });
});
