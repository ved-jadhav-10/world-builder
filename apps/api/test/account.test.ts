import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreatedInvite, World } from '@atlas/shared';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { entities, user, worlds } from '../src/db/schema';
import { env } from '../src/env';
import { outbox } from '../src/lib/mailer';
import { PASSWORD, apiClient, joinWorld, signUp, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());
beforeEach(() => {
  outbox.length = 0;
});

const origin = { origin: env.WEB_ORIGIN };
const deleteAccount = (cookie: string, password: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/delete-user',
    headers: { ...origin, cookie },
    payload: { password },
  });

/** Puts a file where a map's tiles or a picture would be, and returns its path. */
async function plantFile(kind: 'maps' | 'images', worldId: string) {
  const path = join(env.storageDir, kind, worldId, randomUUID(), 'file.bin');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, 'x');
  return path;
}

describe('deleting an account', () => {
  it('asks for the password first', async () => {
    const owner = await signUpWithWorld(app);
    const wrong = await deleteAccount(owner.cookie, 'not-the-password');
    expect(wrong.statusCode).toBeGreaterThanOrEqual(400);
    expect((await owner.api.get('/worlds')).statusCode).toBe(200);
  });

  it('removes the person, their worlds and every file in them, and ends the session', async () => {
    const owner = await signUpWithWorld(app, 'Doomed');
    const entity = await owner.api.post(`${owner.w}/entities`, {
      typeId: owner.typeId('character'),
      name: 'Gone Soon',
    });
    expect(entity.statusCode).toBe(201);
    const mapFile = await plantFile('maps', owner.world.id);
    const imageFile = await plantFile('images', owner.world.id);

    // A world in the trash still belongs to the account, so it goes too.
    const trashed = (await owner.api.post('/worlds', { name: 'In the trash' })).json<World>();
    expect((await owner.api.delete(`/worlds/${trashed.id}`)).statusCode).toBe(204);
    const trashedFile = await plantFile('maps', trashed.id);

    const done = await deleteAccount(owner.cookie, PASSWORD);
    expect(done.statusCode, done.body).toBe(200);

    expect((await owner.api.get('/worlds')).statusCode).toBe(401);
    expect(await db.select().from(user).where(eq(user.email, owner.email))).toHaveLength(0);
    expect(
      await db
        .select({ id: worlds.id })
        .from(worlds)
        .where(inArray(worlds.id, [owner.world.id, trashed.id])),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: entities.id })
        .from(entities)
        .where(eq(entities.worldId, owner.world.id)),
    ).toHaveLength(0);
    for (const file of [mapFile, imageFile, trashedFile]) expect(existsSync(file)).toBe(false);
  });

  it("takes the person out of other people's worlds and leaves those worlds alone", async () => {
    const gm = await signUpWithWorld(app, 'Safe');
    const player = await joinWorld(app, gm.world.id, 'player');
    const survivor = await plantFile('maps', gm.world.id);

    expect((await deleteAccount(player.cookie, PASSWORD)).statusCode).toBe(200);

    expect((await gm.api.get(gm.w)).statusCode).toBe(200);
    expect(existsSync(survivor)).toBe(true);
    const members = (await gm.api.get(`${gm.w}/members`)).json<unknown[]>();
    expect(members).toHaveLength(1);
  });
});

describe('emailing an invite', () => {
  it('sends the link to each address once, in the background', async () => {
    const gm = await signUpWithWorld(app, 'The Shire');
    const res = await gm.api.post(`${gm.w}/invites`, {
      role: 'player',
      emails: ['Frodo@Test.local', 'frodo@test.local', 'sam@test.local'],
    });
    expect(res.statusCode, res.body).toBe(201);
    const created = res.json<CreatedInvite>();
    expect(created.emailedTo).toEqual(['frodo@test.local', 'sam@test.local']);

    expect(outbox.map((m) => m.to)).toEqual(['frodo@test.local', 'sam@test.local']);
    const mail = outbox[0]!;
    expect(mail.subject).toContain('The Shire');
    expect(mail.text).toContain(`${env.WEB_ORIGIN}/join/${created.token}`);
    expect(mail.text).toContain('Player');
  });

  it('sends nothing when no address is given, and refuses bad ones', async () => {
    const gm = await signUpWithWorld(app);
    const plain = await gm.api.post(`${gm.w}/invites`, { role: 'reader' });
    expect(plain.json<CreatedInvite>().emailedTo).toEqual([]);
    expect(outbox).toHaveLength(0);

    for (const emails of [
      ['not-an-email'],
      Array.from({ length: 11 }, (_, i) => `p${i}@t.local`),
    ]) {
      const bad = await gm.api.post(`${gm.w}/invites`, { role: 'reader', emails });
      expect(bad.statusCode).toBe(400);
    }
    expect(outbox).toHaveLength(0);
  });

  it('is only for the owner, like every other invite action', async () => {
    const gm = await signUpWithWorld(app);
    const coGm = await joinWorld(app, gm.world.id, 'editor');
    const res = await coGm.api.post(`${gm.w}/invites`, { role: 'player', emails: ['a@t.local'] });
    expect(res.statusCode).toBe(403);
    expect(outbox).toHaveLength(0);
  });
});

describe('request limits', () => {
  let limited: TestApp;
  beforeAll(async () => {
    limited = await buildApp({ rateLimits: true });
  });
  afterAll(() => limited.close());

  const token = 'A'.repeat(43);

  it('slows down someone guessing invite links, with a readable error', async () => {
    const statuses: number[] = [];
    let last;
    for (let i = 0; i < 32; i++) {
      last = await limited.inject({ method: 'GET', url: `/api/invites/${token}` });
      statuses.push(last.statusCode);
    }
    expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(30)).toEqual([429, 429]);
    expect(last!.json()).toMatchObject({ error: 'Too Many Requests' });
    expect(last!.headers['retry-after']).toBeDefined();
  });

  it('counts each signed-in person separately', async () => {
    const a = await signUp(limited);
    const b = await signUp(limited);
    const call = (cookie: string) => apiClient(limited, cookie).post(`/invites/${token}/accept`);
    for (let i = 0; i < 30; i++) await call(a.cookie);
    expect((await call(a.cookie)).statusCode).toBe(429);
    expect((await call(b.cookie)).statusCode).toBe(404);
  });

  it('does not count anything unless a route asks for it', async () => {
    const a = await signUp(limited);
    for (let i = 0; i < 40; i++) {
      expect((await apiClient(limited, a.cookie).get('/worlds')).statusCode).toBe(200);
    }
  });
});
