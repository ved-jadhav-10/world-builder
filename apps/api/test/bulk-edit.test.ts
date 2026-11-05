import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BulkEntityResult, Entity, Tag, TrashedEntity } from '@atlas/shared';
import { MAX_BULK_ENTRIES } from '@atlas/shared';
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
  const player = await joinWorld(app, ctx.world.id, 'player');
  const entity = async (name: string, extra: object = {}) =>
    (
      await api.post(`${w}/entities`, { typeId: ctx.typeId('character'), name, ...extra })
    ).json<Entity>();
  const tag = async (name: string) => (await api.post(`${w}/tags`, { name })).json<Tag>();
  const bulk = (body: object, client = api) => client.post(`${w}/entities/bulk`, body);
  const get = async (id: string) => (await api.get(`${w}/entities/${id}`)).json<Entity>();
  return { ...ctx, player, entity, tag, bulk, get };
}

describe('bulk edit', () => {
  it('sets who can see many entries at once', async () => {
    const { entity, bulk, get } = await setup();
    const a = await entity('Ann');
    const b = await entity('Bo');
    const c = await entity('Cy');
    const res = await bulk({ action: 'visibility', ids: [a.id, b.id], visibility: 'player' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<BulkEntityResult>()).toEqual({ updated: 2, skipped: 0 });
    expect((await get(a.id)).visibility).toBe('player');
    expect((await get(b.id)).visibility).toBe('player');
    expect((await get(c.id)).visibility).toBe('gm');
  });

  it('adds a tag to many entries, and adding it twice is harmless', async () => {
    const { entity, tag, bulk, get } = await setup();
    const a = await entity('Ann');
    const b = await entity('Bo');
    const guild = await tag('guild');
    await bulk({ action: 'add_tag', ids: [a.id], tagId: guild.id });
    const res = await bulk({ action: 'add_tag', ids: [a.id, b.id], tagId: guild.id });
    expect(res.json<BulkEntityResult>().updated).toBe(2);
    expect((await get(a.id)).tags.map((t) => t.name)).toEqual(['guild']);
    expect((await get(b.id)).tags.map((t) => t.name)).toEqual(['guild']);
  });

  it('removes a tag from many entries and leaves other tags', async () => {
    const { entity, tag, bulk, get } = await setup();
    const a = await entity('Ann');
    const b = await entity('Bo');
    const guild = await tag('guild');
    const noble = await tag('noble');
    await bulk({ action: 'add_tag', ids: [a.id, b.id], tagId: guild.id });
    await bulk({ action: 'add_tag', ids: [a.id], tagId: noble.id });
    await bulk({ action: 'remove_tag', ids: [a.id, b.id], tagId: guild.id });
    expect((await get(a.id)).tags.map((t) => t.name)).toEqual(['noble']);
    expect((await get(b.id)).tags).toEqual([]);
  });

  it('moves many entries to the trash, where they can be restored', async () => {
    const { entity, bulk, api, w } = await setup();
    const a = await entity('Ann');
    const b = await entity('Bo');
    const keep = await entity('Cy');
    const res = await bulk({ action: 'trash', ids: [a.id, b.id] });
    expect(res.json<BulkEntityResult>()).toEqual({ updated: 2, skipped: 0 });
    expect((await api.get(`${w}/entities/${a.id}`)).statusCode).toBe(404);
    expect((await api.get(`${w}/entities/${keep.id}`)).statusCode).toBe(200);
    const trash = (await api.get(`${w}/trash`)).json<TrashedEntity[]>();
    expect(trash.map((t) => t.name).sort()).toEqual(['Ann', 'Bo']);
    expect((await api.post(`${w}/trash/${a.id}/restore`)).statusCode).toBe(200);
  });

  it('skips ids that are not live entries of this world instead of failing', async () => {
    const { entity, bulk, get } = await setup();
    const a = await entity('Ann');
    const trashed = await entity('Gone');
    await bulk({ action: 'trash', ids: [trashed.id] });
    const res = await bulk({
      action: 'visibility',
      ids: [a.id, trashed.id, crypto.randomUUID()],
      visibility: 'public',
    });
    expect(res.json<BulkEntityResult>()).toEqual({ updated: 1, skipped: 2 });
    expect((await get(a.id)).visibility).toBe('public');
  });

  it('counts a repeated id once', async () => {
    const { entity, bulk } = await setup();
    const a = await entity('Ann');
    const res = await bulk({ action: 'visibility', ids: [a.id, a.id, a.id], visibility: 'player' });
    expect(res.json<BulkEntityResult>()).toEqual({ updated: 1, skipped: 0 });
  });

  it('never touches another world’s entries or tags', async () => {
    const mine = await setup();
    const theirs = await setup();
    const a = await mine.entity('Ann');
    const guild = await theirs.tag('guild');
    // My ids against their world do nothing.
    const res = await theirs.bulk({ action: 'visibility', ids: [a.id], visibility: 'public' });
    expect(res.json<BulkEntityResult>()).toEqual({ updated: 0, skipped: 1 });
    expect((await mine.get(a.id)).visibility).toBe('gm');
    // Their tag cannot be put on my entry through my world.
    expect((await mine.bulk({ action: 'add_tag', ids: [a.id], tagId: guild.id })).statusCode).toBe(
      404,
    );
  });

  it('rejects empty, oversized and malformed requests', async () => {
    const { entity, bulk, tag } = await setup();
    const a = await entity('Ann');
    const guild = await tag('guild');
    expect((await bulk({ action: 'trash', ids: [] })).statusCode).toBe(400);
    expect(
      (
        await bulk({
          action: 'trash',
          ids: Array.from({ length: MAX_BULK_ENTRIES + 1 }, () => crypto.randomUUID()),
        })
      ).statusCode,
    ).toBe(400);
    expect((await bulk({ action: 'trash', ids: ['not-an-id'] })).statusCode).toBe(400);
    expect((await bulk({ action: 'explode', ids: [a.id] })).statusCode).toBe(400);
    expect(
      (await bulk({ action: 'visibility', ids: [a.id], visibility: 'everyone' })).statusCode,
    ).toBe(400);
    expect((await bulk({ action: 'add_tag', ids: [a.id] })).statusCode).toBe(400);
    expect((await bulk({ action: 'add_tag', ids: [a.id], tagId: guild.id })).statusCode).toBe(200);
  });

  it('is for editors, and not while previewing as someone else', async () => {
    const { entity, bulk, player, cookie, get } = await setup();
    const a = await entity('Ann');
    expect(
      (await bulk({ action: 'visibility', ids: [a.id], visibility: 'public' }, player.api))
        .statusCode,
    ).toBe(403);
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await bulk({ action: 'trash', ids: [a.id] }, preview)).statusCode).toBe(403);
    expect((await get(a.id)).visibility).toBe('gm');
  });
});
