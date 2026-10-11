import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Entity,
  EntityRelationship,
  EntitySummary,
  Page,
  RelationshipType,
  SearchResult,
  Tag,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const create = async (type: string, name: string, extra: object = {}) =>
    (
      await ctx.api.post(`${ctx.w}/entities`, { typeId: ctx.typeId(type), name, ...extra })
    ).json<Entity>();
  const relTypes = (await ctx.api.get(`${ctx.w}/relationship-types`)).json<RelationshipType[]>();
  const relType = (key: string) => relTypes.find((t) => t.key === key)!.id;
  return { ...ctx, create, relType };
}

describe('relationships', () => {
  it('shows a link from both sides, using the inverse label for incoming links', async () => {
    const { api, w, create, relType } = await setup();
    const mira = await create('character', 'Mira');
    const eel = await create('location', 'The Gilded Eel');

    const res = await api.post(`${w}/relationships`, {
      sourceId: mira.id,
      targetId: eel.id,
      typeId: relType('located_in'),
    });
    expect(res.statusCode, res.body).toBe(201);

    const fromMira = (await api.get(`${w}/entities/${mira.id}/relationships`)).json<
      EntityRelationship[]
    >();
    expect(fromMira).toMatchObject([
      { direction: 'outgoing', label: 'located in', other: { name: 'The Gilded Eel' } },
    ]);
    const fromEel = (await api.get(`${w}/entities/${eel.id}/relationships`)).json<
      EntityRelationship[]
    >();
    expect(fromEel).toMatchObject([
      { direction: 'incoming', label: 'contains', other: { name: 'Mira' } },
    ]);

    // Duplicates and self-links are refused.
    const dup = await api.post(`${w}/relationships`, {
      sourceId: mira.id,
      targetId: eel.id,
      typeId: relType('located_in'),
    });
    expect(dup.statusCode).toBe(409);
    const self = await api.post(`${w}/relationships`, {
      sourceId: mira.id,
      targetId: mira.id,
      typeId: relType('ally_of'),
    });
    expect(self.statusCode).toBe(400);

    // Trashing one side hides the link; deleting the link removes it.
    await api.delete(`${w}/entities/${eel.id}`);
    expect((await api.get(`${w}/entities/${mira.id}/relationships`)).json()).toEqual([]);
    await api.post(`${w}/trash/${eel.id}/restore`);
    const linkId = fromMira[0]!.id;
    expect((await api.delete(`${w}/relationships/${linkId}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/entities/${mira.id}/relationships`)).json()).toEqual([]);
  });

  it('supports custom relationship types', async () => {
    const { api, w, create } = await setup();
    const res = await api.post(`${w}/relationship-types`, {
      label: 'mentor of',
      inverseLabel: 'apprentice of',
    });
    expect(res.statusCode).toBe(201);
    const type = res.json<RelationshipType>();
    const a = await create('character', 'Old Hask');
    const b = await create('character', 'Pip');
    await api.post(`${w}/relationships`, { sourceId: a.id, targetId: b.id, typeId: type.id });
    expect((await api.get(`${w}/entities/${b.id}/relationships`)).json()).toMatchObject([
      { label: 'apprentice of', other: { name: 'Old Hask' } },
    ]);
    expect((await api.delete(`${w}/relationship-types/${type.id}`)).statusCode).toBe(409);
  });
});

describe('tags', () => {
  it('attaches tags and filters entities by tag', async () => {
    const { api, w, create } = await setup();
    const tag = (await api.post(`${w}/tags`, { name: 'Act One', color: '#ff0000' })).json<Tag>();
    expect((await api.post(`${w}/tags`, { name: 'act one' })).statusCode).toBe(409);

    const a = await create('character', 'Tagged');
    await create('character', 'Untagged');
    expect((await api.put(`${w}/entities/${a.id}/tags/${tag.id}`)).statusCode).toBe(200);
    expect((await api.get(`${w}/entities/${a.id}`)).json<Entity>().tags).toEqual([tag]);

    const filtered = (await api.get(`${w}/entities?tagId=${tag.id}`)).json<Page<EntitySummary>>();
    expect(filtered.items.map((e) => e.name)).toEqual(['Tagged']);

    expect((await api.delete(`${w}/entities/${a.id}/tags/${tag.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/entities/${a.id}`)).json<Entity>().tags).toEqual([]);
  });
});

describe('search', () => {
  it('finds entities by name and alias prefixes, ranking name matches first', async () => {
    const { api, w, create } = await setup();
    const eel = await create('location', 'The Gilded Eel');
    await create('character', 'Mira', { aliases: ['Gilda'], summary: 'Barkeep' });
    const gone = await create('item', 'Gilded Cup');
    await api.delete(`${w}/entities/${gone.id}`);

    const results = (await api.get(`${w}/search?q=gild`)).json<SearchResult[]>();
    expect(results.map((r) => r.name)).toEqual(['The Gilded Eel', 'Mira']);

    const exact = (await api.get(`${w}/search?q=the%20gil`)).json<SearchResult[]>();
    expect(exact[0]?.id).toBe(eel.id);
    expect((await api.get(`${w}/search?q=barkeep`)).json<SearchResult[]>()).toHaveLength(1);
    // Punctuation is ignored rather than breaking the query.
    expect((await api.get(`${w}/search?q=${encodeURIComponent('&|!:*')}`)).json()).toEqual([]);
  });
});
