import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, Journal, PlayerJournal } from '@atlas/shared';
import { buildApp } from '../src/app';
import { apiClient, joinWorld, signUp, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function build() {
  const gm = await signUpWithWorld(app);
  const entry = async (name: string, visibility: string) =>
    (
      await gm.api.post(`${gm.w}/entities`, { typeId: gm.typeId('character'), name, visibility })
    ).json<Entity>();
  const seen = await entry('Known Face', 'player');
  const secret = await entry('Hidden Face', 'gm');
  const player = await joinWorld(app, gm.world.id, 'player');
  const other = await joinWorld(app, gm.world.id, 'player');
  return { gm, seen, secret, player, other };
}

describe('player journals', () => {
  it('start empty, save, update and clear', async () => {
    const { gm, seen, player } = await build();
    const url = `${gm.w}/entities/${seen.id}/journal`;
    expect((await player.api.get(url)).json<Journal>()).toEqual({ body: '', updatedAt: null });

    const saved = await player.api.put(url, { body: 'She lied about the ferry.' });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json<Journal>().body).toBe('She lied about the ferry.');
    expect((await player.api.get(url)).json<Journal>().body).toBe('She lied about the ferry.');

    await player.api.put(url, { body: 'Updated.' });
    expect((await player.api.get(url)).json<Journal>().body).toBe('Updated.');

    await player.api.put(url, { body: '   ' });
    expect((await player.api.get(url)).json<Journal>()).toEqual({ body: '', updatedAt: null });
  });

  it('are private to each player, and the GM reads everyone else’s', async () => {
    const { gm, seen, player, other } = await build();
    const url = `${gm.w}/entities/${seen.id}/journal`;
    await player.api.put(url, { body: 'Mine.' });
    await other.api.put(url, { body: 'Theirs.' });
    expect((await other.api.get(url)).json<Journal>().body).toBe('Theirs.');

    // Players cannot list the notes; the GM can, without their own.
    expect((await player.api.get(`${gm.w}/entities/${seen.id}/journals`)).statusCode).toBe(403);
    await gm.api.put(url, { body: 'GM note.' });
    const all = (await gm.api.get(`${gm.w}/entities/${seen.id}/journals`)).json<PlayerJournal[]>();
    expect(all.map((j) => j.body).sort()).toEqual(['Mine.', 'Theirs.']);
  });

  it('refuse entries the person cannot see, readers, strangers, previews and long notes', async () => {
    const { gm, seen, secret, player } = await build();
    const secretUrl = `${gm.w}/entities/${secret.id}/journal`;
    expect((await player.api.put(secretUrl, { body: 'x' })).statusCode).toBe(404);
    expect((await player.api.get(secretUrl)).statusCode).toBe(404);

    const reader = await joinWorld(app, gm.world.id, 'reader');
    const url = `${gm.w}/entities/${seen.id}/journal`;
    expect((await reader.api.put(url, { body: 'x' })).statusCode).toBe(403);
    expect((await (await signUp(app)).api.get(url)).statusCode).toBe(404);

    const preview = apiClient(app, gm.cookie, { 'x-view-as': 'player' });
    expect((await preview.put(url, { body: 'x' })).statusCode).toBe(403);
    expect((await player.api.put(url, { body: 'x'.repeat(10_001) })).statusCode).toBe(400);
  });

  it('go when the entry is trashed forever, and are not part of the entry itself', async () => {
    const { gm, seen, player } = await build();
    await player.api.put(`${gm.w}/entities/${seen.id}/journal`, { body: 'Private.' });
    const entity = (await gm.api.get(`${gm.w}/entities/${seen.id}`)).json<Entity>();
    expect(JSON.stringify(entity)).not.toContain('Private.');
    const exported = (await gm.api.get(`${gm.w}/export`)).body;
    expect(exported).not.toContain('Private.');
  });
});
