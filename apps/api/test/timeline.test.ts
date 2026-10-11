import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  dateToDay,
  DEFAULT_CALENDAR,
  GREGORIAN_CALENDAR,
  type Calendar,
  type Entity,
  type EntityRelationship,
  type EntityType,
  type ManuscriptNode,
  type Progression,
  type RelationshipType,
  type TimelineData,
  type WorldExport,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { signUp, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const entity = async (type: string, name: string, extra: object = {}) => {
    const res = await api.post(`${w}/entities`, { typeId: ctx.typeId(type), name, ...extra });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Entity>();
  };
  const node = async (kind: string, title: string, parentId: string | null = null) => {
    const res = await api.post(`${w}/manuscript/nodes`, { kind, title, parentId });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<ManuscriptNode>();
  };
  const progress = async (entityId: string, payload: object) => {
    const res = await api.post(`${w}/entities/${entityId}/progressions`, payload);
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Progression>();
  };
  return { ...ctx, entity, node, progress };
}

describe('calendar', () => {
  it('starts every world on the default calendar until one is saved', async () => {
    const { api, w } = await setup();
    const calendar = (await api.get(`${w}/calendar`)).json<Calendar>();
    expect(calendar.isDefault).toBe(true);
    expect(calendar.updatedAt).toBeNull();
    expect(calendar.definition.months).toHaveLength(12);
    expect(calendar.definition).toEqual(DEFAULT_CALENDAR);
  });

  it('saves a calendar, replaces it, and keeps worlds apart', async () => {
    const a = await setup();
    const b = await setup();
    const saved = await a.api.put(`${a.w}/calendar`, {
      name: 'Earth',
      definition: GREGORIAN_CALENDAR,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json<Calendar>()).toMatchObject({ name: 'Earth', isDefault: false });
    expect((await a.api.get(`${a.w}/calendar`)).json<Calendar>().definition.leapRules).toHaveLength(
      1,
    );

    const again = await a.api.put(`${a.w}/calendar`, {
      name: 'Tiny',
      definition: { months: [{ name: 'Only', days: 10 }], weekdays: ['One', 'Two'] },
    });
    expect(again.json<Calendar>()).toMatchObject({
      name: 'Tiny',
      definition: { eras: [], moons: [] },
    });
    // The other world is untouched.
    expect((await b.api.get(`${b.w}/calendar`)).json<Calendar>().isDefault).toBe(true);
  });

  it('refuses calendars that cannot work', async () => {
    const { api, w } = await setup();
    const bad = [
      { name: 'No months', definition: { months: [], weekdays: ['X'] } },
      {
        name: 'Bad leap',
        definition: {
          months: [{ name: 'M', days: 5 }],
          weekdays: ['X'],
          leapRules: [{ monthIndex: 4, extraDays: 1, every: 4 }],
        },
      },
      { name: '', definition: { months: [{ name: 'M', days: 5 }], weekdays: ['X'] } },
    ];
    for (const payload of bad) {
      expect((await api.put(`${w}/calendar`, payload)).statusCode, payload.name).toBe(400);
    }
    expect((await api.get(`${w}/calendar`)).json<Calendar>().isDefault).toBe(true);
  });

  it('hides a calendar from other users', async () => {
    const owner = await setup();
    const intruder = await signUp(app);
    expect((await intruder.api.get(`${owner.w}/calendar`)).statusCode).toBe(404);
    expect(
      (await intruder.api.put(`${owner.w}/calendar`, { name: 'X', definition: DEFAULT_CALENDAR }))
        .statusCode,
    ).toBe(404);
  });
});

describe('dates on entries', () => {
  it('names the dates for each type', async () => {
    const { api, w } = await setup();
    const types = (await api.get(`${w}/entity-types`)).json<EntityType[]>();
    const labels = Object.fromEntries(types.map((t) => [t.key, [t.startLabel, t.endLabel]]));
    expect(labels.character).toEqual(['Born', 'Died']);
    expect(labels.location).toEqual(['Founded', 'Abandoned']);
    expect(labels.event).toEqual(['Begins', 'Ends']);
    // Types can be relabelled; a bad label is refused.
    const character = types.find((t) => t.key === 'character')!;
    const renamed = await api.patch(`${w}/entity-types/${character.id}`, { startLabel: 'Hatched' });
    expect(renamed.json<EntityType>()).toMatchObject({ startLabel: 'Hatched', endLabel: 'Died' });
    expect(
      (await api.patch(`${w}/entity-types/${character.id}`, { endLabel: ' ' })).statusCode,
    ).toBe(400);
  });

  it('stores a start and end, and keeps them in order', async () => {
    const { api, w, entity } = await setup();
    const mira = await entity('character', 'Mira', { startDay: 100, endDay: 4000 });
    expect(mira).toMatchObject({ startDay: 100, endDay: 4000 });

    const onlyEnd = await api.patch(`${w}/entities/${mira.id}`, { startDay: null });
    expect(onlyEnd.json<Entity>()).toMatchObject({ startDay: null, endDay: 4000 });

    // End before start is refused: sent together, and against what is already stored.
    expect(
      (await api.patch(`${w}/entities/${mira.id}`, { startDay: 500, endDay: 400 })).statusCode,
    ).toBe(400);
    expect((await api.patch(`${w}/entities/${mira.id}`, { startDay: 9000 })).statusCode).toBe(400);
    expect(
      (await api.post(`${w}/entities`, { typeId: mira.typeId, name: 'X', startDay: 5, endDay: 1 }))
        .statusCode,
    ).toBe(400);
    expect((await api.get(`${w}/entities/${mira.id}`)).json<Entity>()).toMatchObject({
      startDay: null,
      endDay: 4000,
    });

    // Negative days (before year 0) and a day that is not a whole number.
    expect((await api.patch(`${w}/entities/${mira.id}`, { startDay: -250_000 })).statusCode).toBe(
      200,
    );
    expect((await api.patch(`${w}/entities/${mira.id}`, { startDay: 1.5 })).statusCode).toBe(400);
  });
});

describe('dated relationships', () => {
  it('sets, shows and clears the period a link holds for', async () => {
    const { api, w, entity } = await setup();
    const faction = await entity('faction', 'The Order');
    const mira = await entity('character', 'Mira');
    const types = (await api.get(`${w}/relationship-types`)).json<RelationshipType[]>();
    expect(types.some((t) => t.key === 'took_part_in')).toBe(true);
    const member = types.find((t) => t.key === 'member_of')!;
    const link = (
      await api.post(`${w}/relationships`, {
        sourceId: mira.id,
        targetId: faction.id,
        typeId: member.id,
      })
    ).json<EntityRelationship>();
    expect(link).toMatchObject({ validFromDay: null, validToDay: null });

    const dated = await api.patch(`${w}/relationships/${link.id}`, {
      validFromDay: 100,
      validToDay: 900,
      notes: 'Squire, then knight',
    });
    expect(dated.statusCode, dated.body).toBe(200);
    expect(dated.json()).toMatchObject({
      validFromDay: 100,
      validToDay: 900,
      notes: 'Squire, then knight',
    });
    const seen = (await api.get(`${w}/entities/${faction.id}/relationships`)).json<
      EntityRelationship[]
    >();
    expect(seen[0]).toMatchObject({ validFromDay: 100, validToDay: 900, direction: 'incoming' });

    // Order is enforced, including against the stored value, and ends can be opened again.
    expect(
      (await api.patch(`${w}/relationships/${link.id}`, { validFromDay: 50, validToDay: 40 }))
        .statusCode,
    ).toBe(400);
    expect(
      (await api.patch(`${w}/relationships/${link.id}`, { validFromDay: 1000 })).statusCode,
    ).toBe(400);
    const opened = await api.patch(`${w}/relationships/${link.id}`, { validToDay: null });
    expect(opened.json()).toMatchObject({ validFromDay: 100, validToDay: null });
  });

  it("will not touch another world's links", async () => {
    const a = await setup();
    const b = await setup();
    const x = await a.entity('character', 'X');
    const y = await a.entity('character', 'Y');
    const types = (await a.api.get(`${a.w}/relationship-types`)).json<RelationshipType[]>();
    const link = (
      await a.api.post(`${a.w}/relationships`, {
        sourceId: x.id,
        targetId: y.id,
        typeId: types[0]!.id,
      })
    ).json<EntityRelationship>();
    expect(
      (await b.api.patch(`${b.w}/relationships/${link.id}`, { validFromDay: 1 })).statusCode,
    ).toBe(404);
    expect(
      (await b.api.patch(`${a.w}/relationships/${link.id}`, { validFromDay: 1 })).statusCode,
    ).toBe(404);
  });
});

describe('scene dates and the timeline', () => {
  it('dates a scene and lists it with its chapter and book', async () => {
    const { api, w, node } = await setup();
    const book = await node('book', 'The Salt Road');
    const chapter = await node('chapter', 'Arrival', book.id);
    const scene = await node('scene', 'At the docks', chapter.id);
    await node('scene', 'Undated', chapter.id);

    const day = dateToDay(DEFAULT_CALENDAR, { year: 342, month: 2, day: 14 });
    const updated = await api.patch(`${w}/manuscript/nodes/${scene.id}`, {
      inWorldDay: day,
      inWorldDate: 'dawn',
    });
    expect(updated.json<ManuscriptNode>()).toMatchObject({ inWorldDay: day, inWorldDate: 'dawn' });
    // Only scenes have dates.
    expect(
      (await api.patch(`${w}/manuscript/nodes/${chapter.id}`, { inWorldDay: 5 })).statusCode,
    ).toBe(400);

    const timeline = (await api.get(`${w}/timeline`)).json<TimelineData>();
    expect(timeline.scenes).toEqual([
      {
        id: scene.id,
        title: 'At the docks',
        day,
        chapterTitle: 'Arrival',
        bookTitle: 'The Salt Road',
      },
    ]);
    // The date can be cleared again.
    await api.patch(`${w}/manuscript/nodes/${scene.id}`, { inWorldDay: null });
    expect((await api.get(`${w}/timeline`)).json<TimelineData>().scenes).toEqual([]);
  });

  it('lists dated entries in order, skipping undated and trashed ones', async () => {
    const { api, w, entity } = await setup();
    const war = await entity('event', 'The Salt War', { startDay: 300, endDay: 340 });
    await entity('character', 'Born early', { startDay: 10 });
    await entity('character', 'Only a death', { endDay: 200 });
    await entity('character', 'No dates');
    const gone = await entity('character', 'In the trash', { startDay: 1 });
    await api.delete(`${w}/entities/${gone.id}`);

    const { entities } = (await api.get(`${w}/timeline`)).json<TimelineData>();
    expect(entities.map((e) => e.name)).toEqual(['Born early', 'Only a death', 'The Salt War']);
    expect(entities[2]).toMatchObject({ id: war.id, startDay: 300, endDay: 340 });
    expect(entities[1]).toMatchObject({ startDay: null, endDay: 200 });
  });

  it("is private to the world's members", async () => {
    const owner = await setup();
    await owner.entity('event', 'Secret', { startDay: 1 });
    const intruder = await signUp(app);
    expect((await intruder.api.get(`${owner.w}/timeline`)).statusCode).toBe(404);
  });
});

describe('progressions', () => {
  it('records changes at a scene or a date', async () => {
    const { entity, node, progress, api, w } = await setup();
    const mira = await entity('character', 'Mira');
    const book = await node('book', 'B');
    const chapter = await node('chapter', 'C', book.id);
    const scene = await node('scene', 'S', chapter.id);

    const atScene = await progress(mira.id, {
      title: 'Loses her hand',
      note: 'In the siege.',
      sceneId: scene.id,
      changes: {
        fields: { appearance: 'One-handed', life_status: 'Alive' },
        summary: 'A one-handed squire.',
      },
    });
    expect(atScene).toMatchObject({ sceneId: scene.id, day: null, title: 'Loses her hand' });
    expect(atScene.changes).toEqual({
      fields: { appearance: 'One-handed', life_status: 'Alive' },
      summary: 'A one-handed squire.',
    });

    const atDay = await progress(mira.id, {
      title: 'Dies',
      day: 5000,
      changes: { fields: { life_status: 'Dead', appearance: null } },
    });
    expect(atDay).toMatchObject({ sceneId: null, day: 5000 });
    expect(atDay.changes.fields).toEqual({ life_status: 'Dead', appearance: null }); // null is kept: it clears the field

    const list = (await api.get(`${w}/entities/${mira.id}/progressions`)).json<Progression[]>();
    expect(list.map((p) => p.title)).toEqual(['Loses her hand', 'Dies']);
  });

  it('needs exactly one anchor', async () => {
    const { entity, node, progress, api, w } = await setup();
    const mira = await entity('character', 'Mira');
    const scene = await node(
      'scene',
      'S',
      (await node('chapter', 'C', (await node('book', 'B')).id)).id,
    );
    const post = (payload: object) => api.post(`${w}/entities/${mira.id}/progressions`, payload);
    expect((await post({ title: 'Neither' })).statusCode).toBe(400);
    expect((await post({ title: 'Both', sceneId: scene.id, day: 5 })).statusCode).toBe(400);

    const p = await progress(mira.id, { title: 'Ok', day: 5 });
    const patch = (payload: object) => api.patch(`${w}/progressions/${p.id}`, payload);
    expect((await patch({ day: null })).statusCode).toBe(400); // would leave none
    expect((await patch({ sceneId: scene.id })).statusCode).toBe(400); // would leave two
    const moved = await patch({ sceneId: scene.id, day: null });
    expect(moved.json<Progression>()).toMatchObject({ sceneId: scene.id, day: null });
    // Other edits don't touch the anchor.
    expect((await patch({ title: 'Renamed', note: 'More' })).json<Progression>()).toMatchObject({
      title: 'Renamed',
      sceneId: scene.id,
    });
  });

  it("checks field changes against the entry's type", async () => {
    const { entity, api, w } = await setup();
    const mira = await entity('character', 'Mira');
    const post = (changes: object) =>
      api.post(`${w}/entities/${mira.id}/progressions`, { title: 'T', day: 1, changes });
    expect((await post({ fields: { life_status: 'Sleeping' } })).statusCode).toBe(400); // not an option
    expect((await post({ fields: { life_status: 5 } })).statusCode).toBe(400);
    const ok = await post({ fields: { life_status: 'Missing', not_a_field: 'x' } });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json<Progression>().changes.fields).toEqual({ life_status: 'Missing' }); // unknown keys dropped
    expect((await post({ summary: 'x'.repeat(2001) })).statusCode).toBe(400);
  });

  it('only anchors to real scenes in the same world', async () => {
    const a = await setup();
    const b = await setup();
    const mira = await a.entity('character', 'Mira');
    const chapter = await a.node('chapter', 'C', (await a.node('book', 'B')).id);
    const foreignScene = await b.node(
      'scene',
      'S',
      (await b.node('chapter', 'C', (await b.node('book', 'B')).id)).id,
    );
    const post = (sceneId: string) =>
      a.api.post(`${a.w}/entities/${mira.id}/progressions`, { title: 'T', sceneId });
    expect((await post(chapter.id)).statusCode).toBe(404); // a chapter is not a scene
    expect((await post(foreignScene.id)).statusCode).toBe(404);
  });

  it('keeps a progression, unplaced, when its scene is deleted', async () => {
    const { entity, node, progress, api, w } = await setup();
    const mira = await entity('character', 'Mira');
    const book = await node('book', 'B');
    const scene = await node('scene', 'S', (await node('chapter', 'C', book.id)).id);
    const p = await progress(mira.id, {
      title: 'Scarred',
      sceneId: scene.id,
      changes: { summary: 'Scarred.' },
    });
    await api.delete(`${w}/manuscript/nodes/${book.id}`);
    const [kept] = (await api.get(`${w}/entities/${mira.id}/progressions`)).json<Progression[]>();
    expect(kept).toMatchObject({ id: p.id, sceneId: null, day: null, title: 'Scarred' });
    // Giving it a place again fixes it; other edits still work meanwhile.
    expect((await api.patch(`${w}/progressions/${p.id}`, { note: 'Still here' })).statusCode).toBe(
      200,
    );
    expect(
      (await api.patch(`${w}/progressions/${p.id}`, { day: 77 })).json<Progression>().day,
    ).toBe(77);
  });

  it('deletes a progression, and is private to the world', async () => {
    const owner = await setup();
    const mira = await owner.entity('character', 'Mira');
    const p = await owner.progress(mira.id, { title: 'T', day: 1 });
    const intruder = await signUp(app);
    const { w } = owner;
    expect((await intruder.api.get(`${w}/entities/${mira.id}/progressions`)).statusCode).toBe(404);
    expect((await intruder.api.patch(`${w}/progressions/${p.id}`, { title: 'X' })).statusCode).toBe(
      404,
    );
    expect((await intruder.api.delete(`${w}/progressions/${p.id}`)).statusCode).toBe(404);
    expect((await owner.api.delete(`${w}/progressions/${p.id}`)).statusCode).toBe(204);
    expect((await owner.api.get(`${w}/entities/${mira.id}/progressions`)).json()).toEqual([]);
    // Deleting an entry removes its progressions with it.
    const q = await owner.progress(mira.id, { title: 'T2', day: 2 });
    await owner.api.delete(`${w}/entities/${mira.id}`);
    await owner.api.delete(`${w}/trash/${mira.id}`);
    expect((await owner.api.patch(`${w}/progressions/${q.id}`, { title: 'X' })).statusCode).toBe(
      404,
    );
  });
});

describe('export', () => {
  it('includes the calendar, dates and progressions', async () => {
    const { api, w, entity, progress } = await setup();
    const empty = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(empty.calendar).toBeNull(); // still the default
    expect(empty.progressions).toEqual([]);

    await api.put(`${w}/calendar`, { name: 'Earth', definition: GREGORIAN_CALENDAR });
    const mira = await entity('character', 'Mira', { startDay: 10, endDay: 20 });
    const p = await progress(mira.id, { title: 'T', day: 15 });
    const exported = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(exported.calendar).toMatchObject({ name: 'Earth' });
    expect(exported.calendar?.definition.leapRules).toHaveLength(1);
    expect(exported.progressions.map((x) => x.id)).toEqual([p.id]);
    expect(exported.entities.find((e) => e.id === mira.id)).toMatchObject({
      startDay: 10,
      endDay: 20,
    });
    expect(exported.entityTypes.find((t) => t.key === 'character')).toMatchObject({
      startLabel: 'Born',
      endLabel: 'Died',
    });
  });
});
