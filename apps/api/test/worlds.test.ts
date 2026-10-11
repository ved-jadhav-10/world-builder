import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntityType, RelationshipType, World } from '@atlas/shared';
import { buildApp } from '../src/app';
import { env } from '../src/env';
import { PASSWORD, signUp, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

describe('auth', () => {
  it('rejects API calls without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/worlds' });
    expect(res.statusCode).toBe(401);
  });

  it('signs a user back in with email and password', async () => {
    const { email } = await signUp(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: env.WEB_ORIGIN },
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.some((c) => c.name.endsWith('session_token'))).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const { email } = await signUp(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: env.WEB_ORIGIN },
      payload: { email, password: 'not-the-password' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('worlds', () => {
  it('creates a world with the built-in types and the creator as owner', async () => {
    const { api } = await signUp(app);
    const res = await api.post('/worlds', { name: 'The Gilded Realm', description: 'Test' });
    expect(res.statusCode).toBe(201);
    const world = res.json<World>();
    expect(world).toMatchObject({
      name: 'The Gilded Realm',
      slug: 'the-gilded-realm',
      role: 'owner',
    });

    const types = (await api.get(`/worlds/${world.id}/entity-types`)).json<EntityType[]>();
    expect(types.map((t) => t.key)).toEqual([
      'character',
      'location',
      'faction',
      'item',
      'species',
      'culture',
      'event',
      'lore_article',
    ]);
    expect(types.every((t) => t.isBuiltin && t.entityCount === 0)).toBe(true);

    const relTypes = (await api.get(`/worlds/${world.id}/relationship-types`)).json<
      RelationshipType[]
    >();
    expect(relTypes.find((t) => t.key === 'located_in')).toMatchObject({
      inverseLabel: 'contains',
    });
  });

  it('gives worlds with the same name distinct slugs', async () => {
    const { api } = await signUp(app);
    const a = (await api.post('/worlds', { name: 'Duplicate Name' })).json<World>();
    const b = (await api.post('/worlds', { name: 'Duplicate Name' })).json<World>();
    expect(a.slug).not.toBe(b.slug);
    expect(b.slug).toMatch(/^duplicate-name-[a-z0-9]{4}$/);
  });

  it('lists, finds by slug, updates and deletes worlds', async () => {
    const { api } = await signUp(app);
    const world = (await api.post('/worlds', { name: 'Listable' })).json<World>();

    expect((await api.get('/worlds')).json<World[]>().map((w) => w.id)).toContain(world.id);
    expect((await api.get(`/worlds/by-slug/${world.slug}`)).json<World>().id).toBe(world.id);

    const updated = await api.patch(`/worlds/${world.id}`, { name: 'Renamed' });
    expect(updated.json<World>()).toMatchObject({ name: 'Renamed', slug: world.slug });

    expect((await api.delete(`/worlds/${world.id}`)).statusCode).toBe(204);
    expect((await api.get(`/worlds/${world.id}`)).statusCode).toBe(404);
    expect((await api.get('/worlds')).json<World[]>()).toHaveLength(0);
  });

  it('validates input', async () => {
    const { api } = await signUp(app);
    const res = await api.post('/worlds', { name: '   ' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ issues: [{ path: 'name' }] });
  });
});
