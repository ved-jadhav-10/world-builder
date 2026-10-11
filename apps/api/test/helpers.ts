import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { EntityType, World } from '@atlas/shared';
import type { buildApp } from '../src/app';
import { env } from '../src/env';

export type TestApp = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export const PASSWORD = 'correct-horse-battery';

/** Calls /api/* as a signed-in user. */
export function apiClient(app: TestApp, cookie: string) {
  const call = (method: Method, url: string, payload?: object) =>
    app.inject({ method, url: `/api${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, payload?: object) => call('POST', url, payload),
    patch: (url: string, payload: object) => call('PATCH', url, payload),
    put: (url: string) => call('PUT', url),
    delete: (url: string) => call('DELETE', url),
  };
}
export type ApiClient = ReturnType<typeof apiClient>;

export async function signUp(app: TestApp, name = 'Test User') {
  const email = `${randomUUID()}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: env.WEB_ORIGIN },
    payload: { email, password: PASSWORD, name },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  expect(cookie).toContain('session_token');
  return { email, cookie, api: apiClient(app, cookie) };
}

/** Signs up a user and creates a world for them. */
export async function signUpWithWorld(app: TestApp, worldName = 'Aerth') {
  const user = await signUp(app);
  const res = await user.api.post('/worlds', { name: worldName });
  expect(res.statusCode, res.body).toBe(201);
  const world = res.json<World>();
  const types = (await user.api.get(`/worlds/${world.id}/entity-types`)).json<EntityType[]>();
  const typeId = (key: string) => {
    const type = types.find((t) => t.key === key);
    if (!type) throw new Error(`No built-in type ${key}`);
    return type.id;
  };
  return { ...user, world, types, typeId, w: `/worlds/${world.id}` };
}
