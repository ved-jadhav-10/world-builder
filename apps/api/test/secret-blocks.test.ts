import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, SearchResult } from '@atlas/shared';
import { buildApp } from '../src/app';
import { joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const body = {
  type: 'doc',
  content: [
    p('The citadel stands on a hill.'),
    { type: 'secretBlock', content: [p('A tunnel runs beneath the chapel.')] },
    { type: 'mapEmbed', attrs: { mapId: '00000000-0000-4000-8000-000000000000' } },
  ],
};

describe('secret blocks', () => {
  it('are sent to the GM but not to players or in previews, and are not searchable', async () => {
    const ctx = await signUpWithWorld(app);
    const { api, w } = ctx;
    const made = await api.post(`${w}/entities`, {
      typeId: ctx.typeId('location'),
      name: 'Citadel',
      visibility: 'player',
      body,
    });
    expect(made.statusCode, made.body).toBe(201);
    const id = made.json<Entity>().id;

    const mine = (await api.get(`${w}/entities/${id}`)).json<Entity>();
    expect(JSON.stringify(mine.body)).toContain('tunnel');

    const player = await joinWorld(app, ctx.world.id, 'player');
    const seen = (await player.api.get(`${w}/entities/${id}`)).json<Entity>();
    expect(JSON.stringify(seen.body)).toContain('citadel');
    expect(JSON.stringify(seen.body)).not.toContain('tunnel');
    // The embedded map stays; whether it opens depends on the map's own visibility.
    expect(JSON.stringify(seen.body)).toContain('mapEmbed');

    // A GM previewing as a player is treated as one.
    const preview = (
      await (
        await import('./helpers')
      )
        .apiClient(app, ctx.cookie, { 'x-view-as': 'player' })
        .get(`${w}/entities/${id}`)
    ).json<Entity>();
    expect(JSON.stringify(preview.body)).not.toContain('tunnel');

    // Nobody finds the entry by its secret words, though its open words work.
    const search = async (q: string) =>
      (await api.get(`${w}/search?q=${encodeURIComponent(q)}`)).json<SearchResult[]>();
    expect(await search('tunnel')).toHaveLength(0);
    expect((await search('citadel')).map((r) => r.name)).toContain('Citadel');
  });

  it('survive an edit that leaves the article alone', async () => {
    const ctx = await signUpWithWorld(app);
    const { api, w } = ctx;
    const made = (
      await api.post(`${w}/entities`, { typeId: ctx.typeId('location'), name: 'Keep', body })
    ).json<Entity>();
    const renamed = await api.patch(`${w}/entities/${made.id}`, { name: 'Keep II' });
    expect(JSON.stringify(renamed.json<Entity>().body)).toContain('tunnel');
  });
});
