import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, EntitySummary, EntityType, Page, TrashedEntity } from '@atlas/shared';
import { buildApp } from '../src/app';
import { signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

describe('entities', () => {
  it('creates, reads and updates an entity with validated fields', async () => {
    const { api, w, typeId } = await signUpWithWorld(app);
    const created = await api.post(`${w}/entities`, {
      typeId: typeId('character'),
      name: 'Mira',
      aliases: ['The Barkeep'],
      summary: 'Keeps the Gilded Eel',
      fields: { age: '41', life_status: 'Alive', appearance: '', removed: 'x' },
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] },
    });
    expect(created.statusCode, created.body).toBe(201);
    const mira = created.json<Entity>();
    // Empty values and unknown keys are dropped.
    expect(mira.fields).toEqual({ age: '41', life_status: 'Alive' });
    expect(mira.visibility).toBe('gm');

    const updated = await api.patch(`${w}/entities/${mira.id}`, {
      name: 'Mira Vey',
      fields: { life_status: 'Missing' },
    });
    expect(updated.json<Entity>()).toMatchObject({
      name: 'Mira Vey',
      aliases: ['The Barkeep'],
      fields: { life_status: 'Missing' },
    });
    expect((await api.get(`${w}/entities/${mira.id}`)).json<Entity>().name).toBe('Mira Vey');
  });

  it('rejects field values that do not match the type', async () => {
    const { api, w, typeId } = await signUpWithWorld(app);
    const res = await api.post(`${w}/entities`, {
      typeId: typeId('character'),
      name: 'Bad',
      fields: { life_status: 'Undead' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ issues: [{ path: 'life_status' }] });
  });

  it('paginates by name with a cursor and filters by type', async () => {
    const { api, w, typeId } = await signUpWithWorld(app);
    for (const name of ['delta', 'Alpha', 'charlie', 'Bravo', 'echo']) {
      await api.post(`${w}/entities`, { typeId: typeId('location'), name });
    }
    await api.post(`${w}/entities`, { typeId: typeId('item'), name: 'Aardvark Amulet' });

    const names: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = `typeId=${typeId('location')}&limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const page: Page<EntitySummary> = (await api.get(`${w}/entities?${query}`)).json();
      names.push(...page.items.map((e) => e.name));
      cursor = page.nextCursor;
    } while (cursor);
    expect(names).toEqual(['Alpha', 'Bravo', 'charlie', 'delta', 'echo']);

    const recent = (await api.get(`${w}/entities?sort=updated&limit=1`)).json<Page<EntitySummary>>();
    expect(recent.items[0]?.name).toBe('Aardvark Amulet');
    expect((await api.get(`${w}/entities?cursor=garbage`)).statusCode).toBe(400);
  });

  it('moves entities to trash, restores them and deletes them forever', async () => {
    const { api, w, typeId } = await signUpWithWorld(app);
    const entity = (await api.post(`${w}/entities`, { typeId: typeId('item'), name: 'Lost Ring' })).json<Entity>();

    expect((await api.delete(`${w}/entities/${entity.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/entities/${entity.id}`)).statusCode).toBe(404);
    expect((await api.get(`${w}/entities`)).json<Page<EntitySummary>>().items).toHaveLength(0);
    expect((await api.get(`${w}/trash`)).json<TrashedEntity[]>().map((e) => e.id)).toEqual([entity.id]);

    expect((await api.post(`${w}/trash/${entity.id}/restore`)).statusCode).toBe(200);
    expect((await api.get(`${w}/entities/${entity.id}`)).statusCode).toBe(200);

    await api.delete(`${w}/entities/${entity.id}`);
    expect((await api.delete(`${w}/trash/${entity.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/trash`)).json<TrashedEntity[]>()).toHaveLength(0);
  });
});

describe('entity types', () => {
  it('creates a custom type, enforces its fields and blocks deleting it while used', async () => {
    const { api, w } = await signUpWithWorld(app);
    const created = await api.post(`${w}/entity-types`, {
      name: 'Ship',
      icon: 'ship',
      fieldSchema: [
        { key: 'crew', label: 'Crew size', type: 'number' },
        { key: 'rig', label: 'Rig', type: 'select', options: ['Sloop', 'Brig'] },
      ],
    });
    expect(created.statusCode, created.body).toBe(201);
    const ship = created.json<EntityType>();
    expect(ship).toMatchObject({ key: 'ship', isBuiltin: false, sortOrder: 8 });

    const bad = await api.post(`${w}/entities`, { typeId: ship.id, name: 'Wave', fields: { crew: 'many' } });
    expect(bad.statusCode).toBe(400);
    const good = await api.post(`${w}/entities`, { typeId: ship.id, name: 'Wave', fields: { crew: 30 } });
    expect(good.statusCode).toBe(201);

    expect((await api.delete(`${w}/entity-types/${ship.id}`)).statusCode).toBe(409);

    const renamed = await api.patch(`${w}/entity-types/${ship.id}`, { name: 'Vessel' });
    expect(renamed.json<EntityType>()).toMatchObject({ name: 'Vessel', key: 'ship', entityCount: 1 });

    const second = (await api.post(`${w}/entity-types`, { name: 'ship' })).json<EntityType>();
    expect(second.key).toBe('ship_2');
    expect((await api.delete(`${w}/entity-types/${second.id}`)).statusCode).toBe(204);
  });

  it('rejects invalid field schemas', async () => {
    const { api, w } = await signUpWithWorld(app);
    const res = await api.post(`${w}/entity-types`, {
      name: 'Broken',
      fieldSchema: [{ key: 'mood', label: 'Mood', type: 'select' }],
    });
    expect(res.statusCode).toBe(400);
  });
});
