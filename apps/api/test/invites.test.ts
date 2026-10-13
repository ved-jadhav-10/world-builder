import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CreatedInvite,
  Entity,
  EntitySummary,
  Invite,
  InvitePreview,
  JoinResult,
  Member,
  Page,
  World,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { worldInvites } from '../src/db/schema';
import { apiClient, signUp, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

/** An owner with a world holding one public and one GM-only entry, and an anonymous caller. */
async function build() {
  const gm = await signUpWithWorld(app);
  const entry = async (name: string, visibility: string) =>
    (
      await gm.api.post(`${gm.w}/entities`, { typeId: gm.typeId('character'), name, visibility })
    ).json<Entity>();
  const open = await entry('Open Hero', 'public');
  const forPlayers = await entry('Player Hero', 'player');
  const secret = await entry('Secret Villain', 'gm');
  const anonymous = {
    get: (url: string) => app.inject({ method: 'GET', url: `/api${url}` }),
    post: (url: string) => app.inject({ method: 'POST', url: `/api${url}` }),
  };
  const invite = async (body: object = {}) => {
    const res = await gm.api.post(`${gm.w}/invites`, { role: 'player', ...body });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<CreatedInvite>();
  };
  return { gm, open, forPlayers, secret, anonymous, invite };
}

const visibleNames = async (api: ReturnType<typeof apiClient>, w: string) =>
  (await api.get(`${w}/entities?limit=100`))
    .json<Page<EntitySummary>>()
    .items.map((e) => e.name)
    .sort();

describe('making invite links', () => {
  it('returns the secret once, and lists the link without it', async () => {
    const t = await build();
    const created = await t.invite({ role: 'reader', label: 'Beta readers', maxUses: 5 });
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created).toMatchObject({
      role: 'reader',
      label: 'Beta readers',
      uses: 0,
      maxUses: 5,
      status: 'active',
    });
    // A week by default.
    const days = (new Date(created.expiresAt!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    const list = (await t.gm.api.get(`${t.gm.w}/invites`)).json<Invite[]>();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(created.token);
  });

  it('stores only a hash of the secret', async () => {
    const t = await build();
    const created = await t.invite();
    const [row] = await db.select().from(worldInvites).where(eq(worldInvites.id, created.id));
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(created.token);
  });

  it('supports links that never expire and are unlimited', async () => {
    const t = await build();
    const created = await t.invite({ role: 'editor', expiresInDays: null });
    expect(created.expiresAt).toBeNull();
    expect(created.maxUses).toBeNull();
  });

  it('refuses to make an owner, or a link with silly limits', async () => {
    const t = await build();
    for (const body of [
      { role: 'owner' },
      { role: 'commenter' },
      { role: 'player', maxUses: 0 },
      { role: 'player', expiresInDays: 0 },
      { role: 'player', label: 'x'.repeat(81) },
      {},
    ]) {
      expect(
        (await t.gm.api.post(`${t.gm.w}/invites`, body)).statusCode,
        JSON.stringify(body),
      ).toBe(400);
    }
  });

  it('can be cancelled, after which the link stops working', async () => {
    const t = await build();
    const created = await t.invite();
    const joiner = await signUp(app);
    expect((await t.gm.api.delete(`${t.gm.w}/invites/${created.id}`)).statusCode).toBe(204);
    expect((await t.gm.api.get(`${t.gm.w}/invites`)).json<Invite[]>()).toEqual([]);
    expect((await t.anonymous.get(`/invites/${created.token}`)).statusCode).toBe(404);
    expect((await joiner.api.post(`/invites/${created.token}/accept`)).statusCode).toBe(404);
    expect((await t.gm.api.delete(`${t.gm.w}/invites/${created.id}`)).statusCode).toBe(404);
  });
});

describe('who may manage invites', () => {
  it('is the owner only', async () => {
    const t = await build();
    const created = await t.invite({ role: 'editor' });
    const coGm = await signUp(app);
    await coGm.api.post(`/invites/${created.token}/accept`);
    const player = await signUp(app);
    await player.api.post(`/invites/${(await t.invite()).token}/accept`);
    const stranger = await signUp(app);

    for (const who of [coGm.api, player.api]) {
      expect((await who.get(`${t.gm.w}/invites`)).statusCode).toBe(403);
      expect((await who.post(`${t.gm.w}/invites`, { role: 'player' })).statusCode).toBe(403);
      expect((await who.delete(`${t.gm.w}/invites/${created.id}`)).statusCode).toBe(403);
      expect((await who.get(`${t.gm.w}/members`)).statusCode).toBe(403);
    }
    // Strangers can't even tell the world exists.
    expect((await stranger.api.get(`${t.gm.w}/invites`)).statusCode).toBe(404);
    expect((await stranger.api.post(`${t.gm.w}/invites`, { role: 'player' })).statusCode).toBe(404);
  });

  it('is not possible while previewing as a player', async () => {
    const t = await build();
    const previewing = apiClient(app, t.gm.cookie, { 'x-view-as': 'player' });
    expect((await previewing.post(`${t.gm.w}/invites`, { role: 'player' })).statusCode).toBe(403);
    expect((await previewing.get(`${t.gm.w}/members`)).statusCode).toBe(403);
  });

  it('needs a session', async () => {
    const t = await build();
    expect((await t.anonymous.get(`${t.gm.w}/invites`)).statusCode).toBe(401);
    expect((await t.anonymous.get(`${t.gm.w}/members`)).statusCode).toBe(401);
  });
});

describe('looking at a link before joining', () => {
  it('tells anyone holding it what it is for, and nothing else', async () => {
    const t = await build();
    const created = await t.invite({ role: 'player' });
    const res = await t.anonymous.get(`/invites/${created.token}`);
    expect(res.statusCode).toBe(200);
    expect(res.json<InvitePreview>()).toEqual({
      worldName: 'Aerth',
      role: 'player',
      invitedBy: 'Test User',
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers 404 for a made-up or malformed token', async () => {
    const t = await build();
    expect((await t.anonymous.get(`/invites/${'a'.repeat(43)}`)).statusCode).toBe(404);
    expect((await t.anonymous.get('/invites/short')).statusCode).toBe(400);
  });

  it('answers 410 with a reason for an expired or used-up link', async () => {
    const t = await build();
    const expired = await t.invite();
    await db
      .update(worldInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(worldInvites.id, expired.id));
    const res = await t.anonymous.get(`/invites/${expired.token}`);
    expect(res.statusCode).toBe(410);
    expect(res.json<{ message: string }>().message).toMatch(/expired/);

    const single = await t.invite({ role: 'reader', maxUses: 1 });
    await (await signUp(app)).api.post(`/invites/${single.token}/accept`);
    const used = await t.anonymous.get(`/invites/${single.token}`);
    expect(used.statusCode).toBe(410);
    expect(used.json<{ message: string }>().message).toMatch(/used/);
  });

  it('stops working when the world is deleted', async () => {
    const t = await build();
    const created = await t.invite();
    expect((await t.gm.api.delete(t.gm.w)).statusCode).toBe(204);
    expect((await t.anonymous.get(`/invites/${created.token}`)).statusCode).toBe(404);
    const joiner = await signUp(app);
    expect((await joiner.api.post(`/invites/${created.token}/accept`)).statusCode).toBe(404);
  });
});

describe('joining with a link', () => {
  it('needs a session', async () => {
    const t = await build();
    const created = await t.invite();
    expect((await t.anonymous.post(`/invites/${created.token}/accept`)).statusCode).toBe(401);
  });

  it('makes a player who sees what the world shares with players, and nothing more', async () => {
    const t = await build();
    const created = await t.invite({ role: 'player' });
    const player = await signUp(app, 'Pat');

    // Before joining, the world doesn't exist for them.
    expect((await player.api.get(`${t.gm.w}/entities`)).statusCode).toBe(404);

    const res = await player.api.post(`/invites/${created.token}/accept`);
    expect(res.statusCode, res.body).toBe(200);
    const joined = res.json<JoinResult>();
    expect(joined.joined).toBe(true);
    expect(joined.world).toMatchObject({ id: t.gm.world.id, name: 'Aerth', role: 'player' });

    expect(await visibleNames(player.api, t.gm.w)).toEqual(['Open Hero', 'Player Hero']);
    expect((await player.api.get(`${t.gm.w}/entities/${t.secret.id}`)).statusCode).toBe(404);
    expect(
      (await player.api.patch(`${t.gm.w}/entities/${t.open.id}`, { name: 'X' })).statusCode,
    ).toBe(403);
    expect((await player.api.get(`${t.gm.w}/invites`)).statusCode).toBe(403);

    // It shows up in their list of worlds, with their role.
    const worlds = (await player.api.get('/worlds')).json<World[]>();
    expect(worlds.map((w) => [w.name, w.role])).toEqual([['Aerth', 'player']]);
    const bySlug = await player.api.get(`/worlds/by-slug/${joined.world.slug}`);
    expect(bySlug.json<World>().role).toBe('player');
  });

  it('makes a reader who sees only reader and public content', async () => {
    const t = await build();
    await t.gm.api.post(`${t.gm.w}/entities`, {
      typeId: t.gm.typeId('lore_article'),
      name: 'Reader Lore',
      visibility: 'reader',
    });
    const reader = await signUp(app);
    await reader.api.post(`/invites/${(await t.invite({ role: 'reader' })).token}/accept`);
    expect(await visibleNames(reader.api, t.gm.w)).toEqual(['Open Hero', 'Reader Lore']);
  });

  it('makes a co-GM who sees and edits everything but cannot manage people', async () => {
    const t = await build();
    const coGm = await signUp(app);
    await coGm.api.post(`/invites/${(await t.invite({ role: 'editor' })).token}/accept`);
    expect(await visibleNames(coGm.api, t.gm.w)).toEqual([
      'Open Hero',
      'Player Hero',
      'Secret Villain',
    ]);
    const edit = await coGm.api.patch(`${t.gm.w}/entities/${t.secret.id}`, { name: 'Renamed' });
    expect(edit.statusCode, edit.body).toBe(200);
    expect((await coGm.api.delete(t.gm.w)).statusCode).toBe(403);
    expect((await coGm.api.post(`${t.gm.w}/invites`, { role: 'editor' })).statusCode).toBe(403);
  });

  it('counts each person once, and leaves an existing member as they are', async () => {
    const t = await build();
    const created = await t.invite({ role: 'player', maxUses: 3 });
    const player = await signUp(app);
    await player.api.post(`/invites/${created.token}/accept`);

    const again = await player.api.post(`/invites/${created.token}/accept`);
    expect(again.statusCode).toBe(200);
    expect(again.json<JoinResult>().joined).toBe(false);

    // The owner using a player link must not demote themselves.
    const owner = await t.gm.api.post(`/invites/${created.token}/accept`);
    expect(owner.json<JoinResult>()).toMatchObject({ joined: false, world: { role: 'owner' } });
    expect((await t.gm.api.get(`${t.gm.w}/invites`)).json<Invite[]>()[0]!.uses).toBe(1);
    expect((await t.gm.api.get(`${t.gm.w}/members`)).json<Member[]>().map((m) => m.role)).toEqual([
      'owner',
      'player',
    ]);

    // A player holding a co-GM link is not promoted by it either.
    const editorLink = await t.invite({ role: 'editor' });
    const noPromotion = await player.api.post(`/invites/${editorLink.token}/accept`);
    expect(noPromotion.json<JoinResult>()).toMatchObject({
      joined: false,
      world: { role: 'player' },
    });
  });

  it('lets an already-member in even when the link has run out', async () => {
    const t = await build();
    const created = await t.invite({ maxUses: 1 });
    const player = await signUp(app);
    await player.api.post(`/invites/${created.token}/accept`);
    const res = await player.api.post(`/invites/${created.token}/accept`);
    expect(res.statusCode).toBe(200);
    expect(res.json<JoinResult>().joined).toBe(false);
  });

  it('stops at the limit, and a refused attempt leaves no membership behind', async () => {
    const t = await build();
    const created = await t.invite({ maxUses: 2 });
    const people = [await signUp(app), await signUp(app), await signUp(app)];
    const codes: number[] = [];
    for (const person of people) {
      codes.push((await person.api.post(`/invites/${created.token}/accept`)).statusCode);
    }
    expect(codes).toEqual([200, 200, 410]);
    expect((await people[2]!.api.get(`${t.gm.w}/entities`)).statusCode).toBe(404);
    expect((await t.gm.api.get(`${t.gm.w}/members`)).json<Member[]>()).toHaveLength(3);
  });

  it('lets exactly one of several people racing for the last use in', async () => {
    const t = await build();
    const created = await t.invite({ maxUses: 1 });
    const racers = await Promise.all(Array.from({ length: 5 }, () => signUp(app)));
    const results = await Promise.all(
      racers.map((r) => r.api.post(`/invites/${created.token}/accept`)),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 410)).toHaveLength(4);
    const [row] = await db.select().from(worldInvites).where(eq(worldInvites.id, created.id));
    expect(row!.uses).toBe(1);
    expect((await t.gm.api.get(`${t.gm.w}/members`)).json<Member[]>()).toHaveLength(2);
  });

  it('refuses an expired link', async () => {
    const t = await build();
    const created = await t.invite();
    await db
      .update(worldInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(worldInvites.id, created.id));
    const person = await signUp(app);
    const res = await person.api.post(`/invites/${created.token}/accept`);
    expect(res.statusCode).toBe(410);
    expect(res.json<{ message: string }>().message).toMatch(/expired/);
    expect((await person.api.get(`${t.gm.w}/entities`)).statusCode).toBe(404);
    expect((await t.gm.api.get(`${t.gm.w}/invites`)).json<Invite[]>()[0]).toMatchObject({
      status: 'expired',
      uses: 0,
    });
  });

  it('cannot be used to join a different world than the one it was made for', async () => {
    const t = await build();
    const other = await signUpWithWorld(app, 'Other');
    const created = await t.invite();
    const person = await signUp(app);
    await person.api.post(`/invites/${created.token}/accept`);
    expect((await person.api.get(`${other.w}/entities`)).statusCode).toBe(404);
  });
});

describe('managing members', () => {
  async function party() {
    const t = await build();
    const player = await signUp(app, 'Pat');
    const reader = await signUp(app, 'Rae');
    await player.api.post(`/invites/${(await t.invite({ role: 'player' })).token}/accept`);
    await reader.api.post(`/invites/${(await t.invite({ role: 'reader' })).token}/accept`);
    const members = (await t.gm.api.get(`${t.gm.w}/members`)).json<Member[]>();
    const idOf = (name: string) => members.find((m) => m.name === name)!.userId;
    return { ...t, player, reader, members, idOf };
  }

  it('lists people with their name, email and role, owner first', async () => {
    const t = await party();
    expect(t.members.map((m) => [m.name, m.role])).toEqual([
      ['Test User', 'owner'],
      ['Pat', 'player'],
      ['Rae', 'reader'],
    ]);
    expect(t.members[1]!.email).toBe(t.player.email);
  });

  it('changes a role, which changes what the person sees straight away', async () => {
    const t = await party();
    expect(await visibleNames(t.player.api, t.gm.w)).toEqual(['Open Hero', 'Player Hero']);
    const res = await t.gm.api.patch(`${t.gm.w}/members/${t.idOf('Pat')}`, { role: 'reader' });
    expect(res.statusCode, res.body).toBe(204);
    expect(await visibleNames(t.player.api, t.gm.w)).toEqual(['Open Hero']);

    await t.gm.api.patch(`${t.gm.w}/members/${t.idOf('Pat')}`, { role: 'editor' });
    expect(await visibleNames(t.player.api, t.gm.w)).toHaveLength(3);
  });

  it('never changes or removes the owner, and cannot make another owner', async () => {
    const t = await party();
    const ownerId = t.members[0]!.userId;
    expect(
      (await t.gm.api.patch(`${t.gm.w}/members/${ownerId}`, { role: 'player' })).statusCode,
    ).toBe(400);
    expect((await t.gm.api.delete(`${t.gm.w}/members/${ownerId}`)).statusCode).toBe(400);
    expect(
      (await t.gm.api.patch(`${t.gm.w}/members/${t.idOf('Pat')}`, { role: 'owner' })).statusCode,
    ).toBe(400);
    expect((await t.gm.api.patch(`${t.gm.w}/members/nobody`, { role: 'reader' })).statusCode).toBe(
      404,
    );
  });

  it('removes someone, who then loses access', async () => {
    const t = await party();
    expect((await t.gm.api.delete(`${t.gm.w}/members/${t.idOf('Pat')}`)).statusCode).toBe(204);
    expect((await t.player.api.get(`${t.gm.w}/entities`)).statusCode).toBe(404);
    expect((await t.player.api.get('/worlds')).json<World[]>()).toEqual([]);
    expect((await t.gm.api.delete(`${t.gm.w}/members/${t.idOf('Pat')}`)).statusCode).toBe(404);
    // The reader is untouched.
    expect(await visibleNames(t.reader.api, t.gm.w)).toEqual(['Open Hero']);
  });

  it('lets a removed person back in with a fresh link', async () => {
    const t = await party();
    await t.gm.api.delete(`${t.gm.w}/members/${t.idOf('Pat')}`);
    const fresh = await t.invite({ role: 'player' });
    const res = await t.player.api.post(`/invites/${fresh.token}/accept`);
    expect(res.json<JoinResult>().joined).toBe(true);
    expect(await visibleNames(t.player.api, t.gm.w)).toEqual(['Open Hero', 'Player Hero']);
  });

  it('keeps people who joined with a link after the link is cancelled', async () => {
    const t = await party();
    const [invite] = (await t.gm.api.get(`${t.gm.w}/invites`)).json<Invite[]>();
    await t.gm.api.delete(`${t.gm.w}/invites/${invite!.id}`);
    expect((await t.gm.api.get(`${t.gm.w}/members`)).json<Member[]>()).toHaveLength(3);
    expect((await t.player.api.get(`${t.gm.w}/entities`)).statusCode).toBe(200);
  });

  it('only lets the owner change or remove others', async () => {
    const t = await party();
    expect(
      (await t.player.api.patch(`${t.gm.w}/members/${t.idOf('Rae')}`, { role: 'editor' }))
        .statusCode,
    ).toBe(403);
    expect((await t.player.api.delete(`${t.gm.w}/members/${t.idOf('Rae')}`)).statusCode).toBe(403);
    expect((await t.gm.api.get(`${t.gm.w}/members`)).json<Member[]>()).toHaveLength(3);
  });

  it('lets a member leave, but not the owner', async () => {
    const t = await party();
    expect((await t.player.api.delete(`${t.gm.w}/members/me`)).statusCode).toBe(204);
    expect((await t.player.api.get(`${t.gm.w}/entities`)).statusCode).toBe(404);
    expect((await t.player.api.delete(`${t.gm.w}/members/me`)).statusCode).toBe(404);

    const owner = await t.gm.api.delete(`${t.gm.w}/members/me`);
    expect(owner.statusCode).toBe(400);
    expect((await t.gm.api.get(`${t.gm.w}/members`)).json<Member[]>()).toHaveLength(2);
  });

  it('does not let a previewing owner leave or remove anyone', async () => {
    const t = await party();
    const previewing = apiClient(app, t.gm.cookie, { 'x-view-as': 'player' });
    expect((await previewing.delete(`${t.gm.w}/members/${t.idOf('Pat')}`)).statusCode).toBe(403);
    expect((await previewing.delete(`${t.gm.w}/members/me`)).statusCode).toBe(403);
  });
});
