import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DiplomacyScore, Entity, WorldExport } from '@atlas/shared';
import { buildApp } from '../src/app';
import { joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const faction = async (name: string, visibility = 'gm') => {
    const res = await api.post(`${w}/entities`, {
      typeId: ctx.typeId('faction'),
      name,
      visibility,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Entity>();
  };
  const set = (aId: string, bId: string, score: number, extra: object = {}) =>
    api.put(`${w}/diplomacy`, { aId, bId, score, ...extra });
  const list = async (client = api) =>
    (await client.get(`${w}/diplomacy`)).json<DiplomacyScore[]>();
  return { ...ctx, faction, set, list };
}

describe('diplomacy scores', () => {
  it('stores one standing per pair, whichever way round it is set', async () => {
    const { faction, set, list } = await setup();
    const a = await faction('Sunward League');
    const b = await faction('Iron Court');
    const first = await set(a.id, b.id, -40, { notes: 'Border war.' });
    expect(first.statusCode, first.body).toBe(200);
    const again = await set(b.id, a.id, 25);
    expect(again.json<DiplomacyScore>().id).toBe(first.json<DiplomacyScore>().id);
    const all = await list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ score: 25, notes: '' });
    expect([all[0]!.a.id, all[0]!.b.id].sort()).toEqual([a.id, b.id].sort());
  });

  it('refuses scores out of range, a faction with itself, and strangers', async () => {
    const { faction, set } = await setup();
    const other = await setup();
    const a = await faction('A');
    const b = await faction('B');
    expect((await set(a.id, b.id, 101)).statusCode).toBe(400);
    expect((await set(a.id, b.id, -101)).statusCode).toBe(400);
    expect((await set(a.id, b.id, 1.5)).statusCode).toBe(400);
    expect((await set(a.id, a.id, 10)).statusCode).toBe(400);
    const foreign = await other.faction('Foreign');
    expect((await set(a.id, foreign.id, 10)).statusCode).toBe(404);
  });

  it('deletes a standing, and drops it with an entry sent to the trash', async () => {
    const { api, w, faction, set, list } = await setup();
    const a = await faction('A');
    const b = await faction('B');
    const c = await faction('C');
    const ab = (await set(a.id, b.id, 10)).json<DiplomacyScore>();
    await set(a.id, c.id, -10);
    expect((await api.delete(`${w}/diplomacy/${ab.id}`)).statusCode).toBe(204);
    expect((await api.delete(`${w}/diplomacy/${ab.id}`)).statusCode).toBe(404);
    expect(await list()).toHaveLength(1);
    await api.delete(`${w}/entities/${c.id}`);
    expect(await list()).toHaveLength(0);
    await api.post(`${w}/trash/${c.id}/restore`);
    expect(await list()).toHaveLength(1);
  });
});

describe('diplomacy and audiences', () => {
  it('hides standings and entries from those who should not see them', async () => {
    const ctx = await setup();
    const { api, w, faction, set } = ctx;
    const open = await faction('Open League', 'player');
    const open2 = await faction('Open Court', 'player');
    const secret = await faction('Hidden Cabal', 'gm');
    await set(open.id, open2.id, 50, { visibility: 'player' });
    await set(open.id, secret.id, -80, { visibility: 'player' });
    await set(open.id, open2.id, 60, { visibility: 'player' });
    const gmOnly = await faction('Another', 'player');
    await set(open.id, gmOnly.id, 5);

    const player = await joinWorld(app, ctx.world.id, 'player');
    const seen = (await player.api.get(`${w}/diplomacy`)).json<DiplomacyScore[]>();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ score: 60 });
    expect(
      (await player.api.put(`${w}/diplomacy`, { aId: open.id, bId: open2.id, score: 1 }))
        .statusCode,
    ).toBe(403);
    expect((await api.get(`${w}/diplomacy`)).json<DiplomacyScore[]>()).toHaveLength(3);
  });

  it('is part of the world export', async () => {
    const { api, w, faction, set } = await setup();
    const a = await faction('A');
    const b = await faction('B');
    await set(a.id, b.id, 33);
    const exported = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(exported.diplomacy).toHaveLength(1);
    expect(exported.diplomacy[0]!.score).toBe(33);
  });
});
