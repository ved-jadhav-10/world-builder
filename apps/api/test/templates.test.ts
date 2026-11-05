import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_SAVED_FILTERS,
  type Entity,
  type EntryTemplate,
  type EntitySummary,
  type Page,
  type SavedFilter,
  type Tag,
  type WorldExport,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w, typeId } = ctx;
  const character = async (name: string, extra: object = {}) =>
    (
      await api.post(`${w}/entities`, { typeId: typeId('character'), name, ...extra })
    ).json<Entity>();
  const tag = async (name: string) => (await api.post(`${w}/tags`, { name })).json<Tag>();
  const template = async (entityId: string, name: string) => {
    const res = await api.post(`${w}/templates`, { entityId, name });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<EntryTemplate>();
  };
  return { ...ctx, character, tag, template };
}

describe('entry templates', () => {
  it('copy an entry’s summary, fields, text and visibility', async () => {
    const { api, w, character, template } = await setup();
    const hero = await character('Mira', {
      summary: 'A smuggler with a code.',
      visibility: 'player',
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const made = await template(hero.id, '  Smuggler  ');
    expect(made).toMatchObject({
      name: 'Smuggler',
      typeId: hero.typeId,
      summary: 'A smuggler with a code.',
      visibility: 'player',
    });
    expect(made.body).toEqual(hero.body);

    // Changing the entry afterwards leaves the template as it was.
    await api.patch(`${w}/entities/${hero.id}`, { summary: 'Changed' });
    const [again] = (await api.get(`${w}/templates`)).json<EntryTemplate[]>();
    expect(again!.summary).toBe('A smuggler with a code.');
  });

  it('can be listed by type, renamed and deleted', async () => {
    const { api, w, character, template, typeId } = await setup();
    const a = await template((await character('A')).id, 'Zed');
    await template((await character('B')).id, 'Alpha');
    expect((await api.get(`${w}/templates`)).json<EntryTemplate[]>().map((t) => t.name)).toEqual([
      'Alpha',
      'Zed',
    ]);
    expect((await api.get(`${w}/templates?typeId=${typeId('location')}`)).json()).toEqual([]);

    const renamed = await api.patch(`${w}/templates/${a.id}`, { name: 'Beta' });
    expect(renamed.json<EntryTemplate>().name).toBe('Beta');
    expect((await api.delete(`${w}/templates/${a.id}`)).statusCode).toBe(204);
    expect((await api.delete(`${w}/templates/${a.id}`)).statusCode).toBe(404);
  });

  it('refuse entries that are trashed or from another world, and empty names', async () => {
    const { api, w, character } = await setup();
    const other = await setup();
    const foreign = await other.character('Foreign');
    expect((await api.post(`${w}/templates`, { entityId: foreign.id, name: 'x' })).statusCode).toBe(
      404,
    );
    const gone = await character('Gone');
    await api.delete(`${w}/entities/${gone.id}`);
    expect((await api.post(`${w}/templates`, { entityId: gone.id, name: 'x' })).statusCode).toBe(
      404,
    );
    const live = await character('Live');
    expect((await api.post(`${w}/templates`, { entityId: live.id, name: ' ' })).statusCode).toBe(
      400,
    );
  });

  it('are for the GM and editors only, and are part of the export', async () => {
    const { api, w, world, character, template } = await setup();
    const hero = await character('Mira');
    await template(hero.id, 'Hero');
    const editor = await joinWorld(app, world.id, 'editor');
    const player = await joinWorld(app, world.id, 'player');
    expect((await editor.api.get(`${w}/templates`)).statusCode).toBe(200);
    expect((await player.api.get(`${w}/templates`)).statusCode).toBe(403);
    expect(
      (await player.api.post(`${w}/templates`, { entityId: hero.id, name: 'x' })).statusCode,
    ).toBe(403);
    const exported = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(exported.entryTemplates.map((t) => t.name)).toEqual(['Hero']);
  });

  it('are removed with their type', async () => {
    const { api, w, template, character } = await setup();
    const type = (
      await api.post(`${w}/entity-types`, { name: 'Ship', icon: 'ship', color: '#336699' })
    ).json<{ id: string }>();
    const ship = (
      await api.post(`${w}/entities`, { typeId: type.id, name: 'The Gull' })
    ).json<Entity>();
    await template(ship.id, 'Ship');
    await character('Unrelated');
    await api.delete(`${w}/entities/${ship.id}`);
    await api.delete(`${w}/trash/${ship.id}`);
    expect((await api.delete(`${w}/entity-types/${type.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/templates`)).json()).toEqual([]);
  });
});

describe('saved filters', () => {
  it('keep a type, tag, visibility and sort, per person', async () => {
    const { api, w, world, tag, typeId } = await setup();
    const cast = await tag('Cast');
    const res = await api.post(`${w}/saved-filters`, {
      name: 'Public cast',
      typeId: typeId('character'),
      tagId: cast.id,
      visibility: 'player',
      sort: 'updated',
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json<SavedFilter>()).toMatchObject({
      name: 'Public cast',
      tagId: cast.id,
      visibility: 'player',
      sort: 'updated',
    });
    expect((await api.get(`${w}/saved-filters`)).json<SavedFilter[]>()).toHaveLength(1);
    expect(
      (await api.get(`${w}/saved-filters?typeId=${typeId('location')}`)).json<SavedFilter[]>(),
    ).toHaveLength(0);

    // Someone else's list is their own.
    const editor = await joinWorld(app, world.id, 'editor');
    expect((await editor.api.get(`${w}/saved-filters`)).json()).toEqual([]);
    const id = (await api.get(`${w}/saved-filters`)).json<SavedFilter[]>()[0]!.id;
    expect((await editor.api.delete(`${w}/saved-filters/${id}`)).statusCode).toBe(404);
    expect((await api.delete(`${w}/saved-filters/${id}`)).statusCode).toBe(204);
  });

  it('let players keep some too, and drop with their tag', async () => {
    const { api, w, world, tag, typeId } = await setup();
    const player = await joinWorld(app, world.id, 'player');
    const made = await player.api.post(`${w}/saved-filters`, {
      name: 'By date',
      typeId: typeId('character'),
      sort: 'updated',
    });
    expect(made.statusCode, made.body).toBe(201);

    const cast = await tag('Cast');
    await api.post(`${w}/saved-filters`, {
      name: 'Cast',
      typeId: typeId('character'),
      tagId: cast.id,
    });
    expect((await api.delete(`${w}/tags/${cast.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/saved-filters`)).json()).toEqual([]);
  });

  it('refuse a type or tag from elsewhere, and stop at the limit', async () => {
    const { api, w, typeId } = await setup();
    const other = await setup();
    const foreignTag = await other.tag('Elsewhere');
    expect(
      (
        await api.post(`${w}/saved-filters`, {
          name: 'x',
          typeId: other.typeId('character'),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await api.post(`${w}/saved-filters`, {
          name: 'x',
          typeId: typeId('character'),
          tagId: foreignTag.id,
        })
      ).statusCode,
    ).toBe(404);

    for (let i = 0; i < MAX_SAVED_FILTERS; i++) {
      const res = await api.post(`${w}/saved-filters`, {
        name: `f${i}`,
        typeId: typeId('character'),
      });
      expect(res.statusCode, res.body).toBe(201);
    }
    const over = await api.post(`${w}/saved-filters`, {
      name: 'more',
      typeId: typeId('character'),
    });
    expect(over.statusCode).toBe(409);
  });
});

describe('the visibility filter on lists', () => {
  it('narrows a list to one visibility, and never shows more than the viewer may see', async () => {
    const { api, w, world, character, typeId } = await setup();
    await character('Secret', { visibility: 'gm' });
    await character('Open', { visibility: 'player' });
    const names = async (client: typeof api, query: string) =>
      (await client.get(`${w}/entities?typeId=${typeId('character')}${query}`))
        .json<Page<EntitySummary>>()
        .items.map((e) => e.name);
    expect(await names(api, '&visibility=gm')).toEqual(['Secret']);
    expect(await names(api, '&visibility=player')).toEqual(['Open']);
    expect((await api.get(`${w}/entities?visibility=bogus`)).statusCode).toBe(400);

    const player = await joinWorld(app, world.id, 'player');
    expect(await names(player.api, '&visibility=gm')).toEqual([]);
    expect(await names(player.api, '')).toEqual(['Open']);
  });
});
