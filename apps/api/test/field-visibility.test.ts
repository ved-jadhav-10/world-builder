import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, EntityType, Progression, SearchResult, WorldExport } from '@atlas/shared';
import { buildApp } from '../src/app';
import { apiClient, joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function build() {
  const gm = await signUpWithWorld(app);
  const type = gm.types.find((t) => t.key === 'character')!;
  const patched = await gm.api.patch(`${gm.w}/entity-types/${type.id}`, {
    fieldSchema: [
      ...type.fieldSchema,
      { key: 'true_name', label: 'True name', type: 'text', gmOnly: true },
    ],
  });
  expect(patched.statusCode, patched.body).toBe(200);
  const made = await gm.api.post(`${gm.w}/entities`, {
    typeId: type.id,
    name: 'Mira',
    visibility: 'player',
    fields: { age: '31', true_name: 'Zarahel' },
  });
  expect(made.statusCode, made.body).toBe(201);
  const entity = made.json<Entity>();
  const player = await joinWorld(app, gm.world.id, 'player');
  return { gm, type, entity, player };
}

const names = (results: SearchResult[]) => results.map((r) => r.name);

describe('GM-only fields', () => {
  it('are sent to the GM but not to players, readers or previews', async () => {
    const { gm, entity, player } = await build();
    const url = `${gm.w}/entities/${entity.id}`;
    expect((await gm.api.get(url)).json<Entity>().fields.true_name).toBe('Zarahel');

    const seen = (await player.api.get(url)).json<Entity>();
    expect(seen.fields.age).toBe('31');
    expect(seen.fields).not.toHaveProperty('true_name');

    const preview = apiClient(app, gm.cookie, { 'x-view-as': 'player' });
    expect((await preview.get(url)).json<Entity>().fields).not.toHaveProperty('true_name');
  });

  it('are not named in the type list for anyone but the GM', async () => {
    const { gm, player } = await build();
    const keys = async (api: typeof gm.api) =>
      (await api.get(`${gm.w}/entity-types`))
        .json<EntityType[]>()
        .find((t) => t.key === 'character')!
        .fieldSchema.map((f) => f.key);
    expect(await keys(gm.api)).toContain('true_name');
    expect(await keys(player.api)).not.toContain('true_name');
  });

  it('are not searchable, and turning the flag on or off rebuilds the search text', async () => {
    const { gm, type, player } = await build();
    const find = async (api: typeof gm.api) =>
      names((await api.get(`${gm.w}/search?q=Zarahel`)).json<SearchResult[]>());
    expect(await find(player.api)).toEqual([]);
    expect(await find(gm.api)).toEqual([]);

    // Make it public again: the words are found again.
    const open = type.fieldSchema.map((f) => ({ ...f }));
    open.push({ key: 'true_name', label: 'True name', type: 'text' });
    const res = await gm.api.patch(`${gm.w}/entity-types/${type.id}`, { fieldSchema: open });
    expect(res.statusCode, res.body).toBe(200);
    expect(await find(player.api)).toEqual(['Mira']);
  });

  it('are left out of progressions, edits to them by the GM still work', async () => {
    const { gm, entity, player } = await build();
    const made = await gm.api.post(`${gm.w}/entities/${entity.id}/progressions`, {
      title: 'Unmasked',
      day: 10,
      visibility: 'player',
      changes: { fields: { age: '32', true_name: 'Zed' } },
    });
    expect(made.statusCode, made.body).toBe(201);
    const theirs = (await player.api.get(`${gm.w}/entities/${entity.id}/progressions`)).json<
      Progression[]
    >();
    expect(theirs[0]!.changes.fields).toEqual({ age: '32' });
    const mine = (await gm.api.get(`${gm.w}/entities/${entity.id}/progressions`)).json<
      Progression[]
    >();
    expect(mine[0]!.changes.fields).toEqual({ age: '32', true_name: 'Zed' });
  });

  it('are left out of audience exports, but not the GM export', async () => {
    const { gm } = await build();
    const full = (await gm.api.get(`${gm.w}/export`)).body;
    expect(full).toContain('Zarahel');
    const slice = (await gm.api.get(`${gm.w}/export?audience=player`)).json<WorldExport>();
    expect(JSON.stringify(slice)).not.toContain('Zarahel');
    expect(JSON.stringify(slice.entityTypes)).not.toContain('true_name');
  });
});
