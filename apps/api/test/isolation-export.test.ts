import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, RelationshipType, Tag, WorldExport } from '@atlas/shared';
import { buildApp } from '../src/app';
import { signUp, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

describe('world isolation', () => {
  it("hides one user's world from another user entirely", async () => {
    const owner = await signUpWithWorld(app);
    const entity = (
      await owner.api.post(`${owner.w}/entities`, { typeId: owner.typeId('character'), name: 'Secret' })
    ).json<Entity>();

    const intruder = await signUp(app);
    const { w } = owner;
    const reads = [
      `${w}`,
      `${w}/entity-types`,
      `${w}/entities`,
      `${w}/entities/${entity.id}`,
      `${w}/entities/${entity.id}/relationships`,
      `${w}/search?q=secret`,
      `${w}/trash`,
      `${w}/export`,
      `/worlds/by-slug/${owner.world.slug}`,
    ];
    for (const url of reads) {
      expect((await intruder.api.get(url)).statusCode, url).toBe(404);
    }
    expect((await intruder.api.patch(`${w}/entities/${entity.id}`, { name: 'Hacked' })).statusCode).toBe(404);
    expect((await intruder.api.delete(`${w}/entities/${entity.id}`)).statusCode).toBe(404);
    expect((await owner.api.get(`${w}/entities/${entity.id}`)).json<Entity>().name).toBe('Secret');
  });

  it("refuses to link or tag across worlds", async () => {
    const a = await signUpWithWorld(app);
    const b = await signUpWithWorld(app);
    const mine = (await a.api.post(`${a.w}/entities`, { typeId: a.typeId('item'), name: 'Mine' })).json<Entity>();
    const theirs = (await b.api.post(`${b.w}/entities`, { typeId: b.typeId('item'), name: 'Theirs' })).json<Entity>();
    const relTypes = (await a.api.get(`${a.w}/relationship-types`)).json<RelationshipType[]>();

    const link = await a.api.post(`${a.w}/relationships`, {
      sourceId: mine.id,
      targetId: theirs.id,
      typeId: relTypes[0]!.id,
    });
    expect(link.statusCode).toBe(404);

    const theirTag = (await b.api.post(`${b.w}/tags`, { name: 'Theirs' })).json<Tag>();
    expect((await a.api.put(`${a.w}/entities/${mine.id}/tags/${theirTag.id}`)).statusCode).toBe(404);

    // Using another world's type ID to create an entity fails too.
    const wrongType = await a.api.post(`${a.w}/entities`, { typeId: b.typeId('item'), name: 'X' });
    expect(wrongType.statusCode).toBe(404);
  });
});

describe('export', () => {
  it('exports the whole world as JSON, without trashed entities', async () => {
    const { api, w, typeId, world } = await signUpWithWorld(app);
    const tag = (await api.post(`${w}/tags`, { name: 'Main cast' })).json<Tag>();
    const mira = (await api.post(`${w}/entities`, { typeId: typeId('character'), name: 'Mira' })).json<Entity>();
    const eel = (await api.post(`${w}/entities`, { typeId: typeId('location'), name: 'Eel' })).json<Entity>();
    const trashed = (await api.post(`${w}/entities`, { typeId: typeId('item'), name: 'Gone' })).json<Entity>();
    await api.delete(`${w}/entities/${trashed.id}`);
    await api.put(`${w}/entities/${mira.id}/tags/${tag.id}`);
    const relTypes = (await api.get(`${w}/relationship-types`)).json<RelationshipType[]>();
    await api.post(`${w}/relationships`, {
      sourceId: mira.id,
      targetId: eel.id,
      typeId: relTypes.find((t) => t.key === 'located_in')!.id,
    });

    const res = await api.get(`${w}/export`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(new RegExp(`attachment; filename="${world.slug}-`));
    const data = res.json<WorldExport>();
    expect(data).toMatchObject({ format: 'atlas-ink.world', version: 1, world: { id: world.id } });
    expect(data.entityTypes).toHaveLength(8);
    expect(data.relationshipTypes).toHaveLength(10);
    expect(data.tags).toEqual([tag]);
    expect(data.entities.map((e) => e.name).sort()).toEqual(['Eel', 'Mira']);
    expect(data.entities.find((e) => e.id === mira.id)?.tagIds).toEqual([tag.id]);
    expect(data.relationships).toMatchObject([{ sourceId: mira.id, targetId: eel.id }]);
  });
});
