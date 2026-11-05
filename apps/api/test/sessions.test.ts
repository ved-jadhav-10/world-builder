import { readFileSync } from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SESSION_LINK_KEY,
  type Entity,
  type EntityType,
  type RelationshipType,
  type SessionSummary,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { entityTypes, relationshipTypes } from '../src/db/schema';
import { apiClient, joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const player = await joinWorld(app, ctx.world.id, 'player');
  const reader = await joinWorld(app, ctx.world.id, 'reader');
  const rels = (await ctx.api.get(`${ctx.w}/relationship-types`)).json<RelationshipType[]>();
  const featured = rels.find((r) => r.key === SESSION_LINK_KEY)!;
  const entity = async (type: string, name: string, extra: object = {}) =>
    (
      await ctx.api.post(`${ctx.w}/entities`, { typeId: ctx.typeId(type), name, ...extra })
    ).json<Entity>();
  const session = async (body: object = {}) => {
    const res = await ctx.api.post(`${ctx.w}/sessions`, body);
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Entity>();
  };
  const list = async (api = ctx.api) =>
    (await api.get(`${ctx.w}/sessions`)).json<SessionSummary[]>();
  return { ...ctx, player, reader, featured, entity, session, list };
}

describe('sessions', () => {
  it('is a built-in type with a "features" link in every new world', async () => {
    const { types, featured } = await setup();
    expect(types.find((t) => t.key === 'session')).toMatchObject({
      isBuiltin: true,
      name: 'Session',
    });
    expect(featured).toMatchObject({ label: 'features', inverseLabel: 'featured in' });
  });

  it('starts sessions numbered one after the highest, planned and GM-only', async () => {
    const { session, list } = await setup();
    const one = await session();
    const two = await session({ name: 'The heist' });
    expect(one).toMatchObject({ name: 'Session 1', visibility: 'gm' });
    expect(one.fields).toMatchObject({ number: 1, status: 'Planned' });
    expect(two).toMatchObject({ name: 'The heist', fields: { number: 2 } });
    expect((await list()).map((s) => [s.number, s.name, s.status])).toEqual([
      [2, 'The heist', 'Planned'],
      [1, 'Session 1', 'Planned'],
    ]);
  });

  it('does not reuse the number of a trashed session', async () => {
    const { api, w, session } = await setup();
    await session();
    const two = await session();
    await api.delete(`${w}/entities/${two.id}`);
    // Trashed sessions still count until they are emptied from the trash.
    expect((await session()).fields.number).toBe(3);
  });

  it('shows what each session features, from the session side', async () => {
    const { api, w, session, entity, featured, list } = await setup();
    const s = await session();
    const mira = await entity('character', 'Mira');
    const vesh = await entity('location', 'Vesh');
    for (const target of [mira, vesh]) {
      const res = await api.post(`${w}/relationships`, {
        sourceId: s.id,
        targetId: target.id,
        typeId: featured.id,
      });
      expect(res.statusCode, res.body).toBe(201);
    }
    const [listed] = await list();
    expect(listed!.links.map((l) => [l.label, l.other.name])).toEqual([
      ['features', 'Mira'],
      ['features', 'Vesh'],
    ]);
    // And from the character's side it reads the other way round.
    const back = (await api.get(`${w}/entities/${mira.id}/relationships`)).json<
      { label: string }[]
    >();
    expect(back.map((l) => l.label)).toEqual(['featured in']);
  });

  it('shows players only the sessions shared with them, and only the links they may see', async () => {
    const { w, api, cookie, session, entity, featured, list, player, reader } = await setup();
    const hidden = await session({ name: 'Secret prep' });
    const shared = await session({ name: 'Recap night', visibility: 'player' });
    const open = await entity('character', 'Open friend', { visibility: 'player' });
    const secret = await entity('character', 'Secret villain');
    for (const target of [open, secret]) {
      await api.post(`${w}/relationships`, {
        sourceId: shared.id,
        targetId: target.id,
        typeId: featured.id,
      });
    }

    expect((await list()).map((s) => s.name)).toEqual(['Recap night', 'Secret prep']);
    const asPlayer = await list(player.api);
    expect(asPlayer.map((s) => s.name)).toEqual(['Recap night']);
    expect(asPlayer[0]!.links.map((l) => l.other.name)).toEqual(['Open friend']);
    expect(await list(reader.api)).toEqual([]);
    expect((await player.api.get(`${w}/entities/${hidden.id}`)).statusCode).toBe(404);

    // A GM previewing as a player sees what the player sees, and cannot change anything.
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await list(preview)).map((s) => s.name)).toEqual(['Recap night']);
    expect((await preview.post(`${w}/sessions`, {})).statusCode).toBe(403);
  });

  it('lets only the GM start a session', async () => {
    const { w, player, reader } = await setup();
    for (const other of [player.api, reader.api]) {
      expect((await other.post(`${w}/sessions`, {})).statusCode).toBe(403);
    }
  });

  it('is private to its world', async () => {
    const mine = await setup();
    const other = await signUpWithWorld(app, 'Elsewhere');
    await mine.session();
    expect((await other.api.get(`${mine.w}/sessions`)).statusCode).toBe(404);
    expect((await other.api.post(`${mine.w}/sessions`, {})).statusCode).toBe(404);
    expect((await other.api.get(`${other.w}/sessions`)).json<SessionSummary[]>()).toEqual([]);
  });

  it('explains itself in a world with no Session type', async () => {
    const { api, w, world } = await signUpWithWorld(app);
    await db
      .delete(entityTypes)
      .where(and(eq(entityTypes.worldId, world.id), eq(entityTypes.key, 'session')));
    const res = await api.post(`${w}/sessions`, {});
    expect(res.statusCode).toBe(400);
    expect(res.json<{ message: string }>().message).toContain('no Session type');
    expect((await api.get(`${w}/sessions`)).json()).toEqual([]);
  });

  it('is added to worlds made before it existed, by the migration', async () => {
    const { api, w, world } = await setup();
    await db
      .delete(entityTypes)
      .where(and(eq(entityTypes.worldId, world.id), eq(entityTypes.key, 'session')));
    await db
      .delete(relationshipTypes)
      .where(
        and(eq(relationshipTypes.worldId, world.id), eq(relationshipTypes.key, SESSION_LINK_KEY)),
      );
    const migration = readFileSync(
      new URL('../drizzle/0007_sessions.sql', import.meta.url),
      'utf8',
    );
    const backfill = migration
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => /^INSERT INTO/i.test(s));
    expect(backfill).toHaveLength(2);
    // Running it twice changes nothing.
    for (const statement of [...backfill, ...backfill]) await db.execute(sql.raw(statement));

    const types = (await api.get(`${w}/entity-types`)).json<EntityType[]>();
    expect(types.filter((t) => t.key === 'session')).toHaveLength(1);
    expect(types.find((t) => t.key === 'session')!.sortOrder).toBe(
      Math.max(...types.filter((t) => t.key !== 'session').map((t) => t.sortOrder)) + 1,
    );
    expect(
      (await api.get(`${w}/relationship-types`))
        .json<RelationshipType[]>()
        .filter((r) => r.key === SESSION_LINK_KEY),
    ).toHaveLength(1);
    // And it works: a session can be started.
    expect((await api.post(`${w}/sessions`, {})).statusCode).toBe(201);
  });
});
