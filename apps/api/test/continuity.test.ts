import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ContinuityReport,
  Entity,
  ManuscriptNode,
  RelationshipType,
  RichTextDoc,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { apiClient, joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const doc = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const coGm = await joinWorld(app, ctx.world.id, 'editor');
  const player = await joinWorld(app, ctx.world.id, 'player');
  const rels = (await api.get(`${w}/relationship-types`)).json<RelationshipType[]>();
  const rel = (key: string) => rels.find((r) => r.key === key)!;
  const entity = async (type: string, name: string, extra: object = {}) =>
    (await api.post(`${w}/entities`, { typeId: ctx.typeId(type), name, ...extra })).json<Entity>();
  const link = async (a: Entity, key: string, b: Entity) =>
    (
      await api.post(`${w}/relationships`, { sourceId: a.id, targetId: b.id, typeId: rel(key).id })
    ).json<{ id: string }>();
  const book = (
    await api.post(`${w}/manuscript/nodes`, { kind: 'book', title: 'Book' })
  ).json<ManuscriptNode>();
  const chapter = (
    await api.post(`${w}/manuscript/nodes`, { kind: 'chapter', title: 'Ch', parentId: book.id })
  ).json<ManuscriptNode>();
  /** A scene on a day, with some text (names in it become mentions) and optionally a narrator. */
  const scene = async (title: string, day: number | null, text = '', extra: object = {}) => {
    const made = (
      await api.post(`${w}/manuscript/nodes`, { kind: 'scene', title, parentId: chapter.id })
    ).json<ManuscriptNode>();
    await api.patch(`${w}/manuscript/nodes/${made.id}`, { inWorldDay: day, ...extra });
    if (text) await api.put(`${w}/manuscript/scenes/${made.id}/body`, { body: doc(text) });
    return made;
  };
  const report = async (client = api) => {
    const res = await client.get(`${w}/continuity`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<ContinuityReport>();
  };
  return { ...ctx, coGm, player, entity, link, scene, report };
}

describe('continuity checker', () => {
  it('finds nothing wrong in a world with nothing wrong', async () => {
    const { report, entity, scene } = await setup();
    await entity('character', 'Mira', { startDay: 0, endDay: 5000 });
    await scene('Fine', 100, 'Mira walks the docks.');
    const r = await report();
    expect(r.findings).toEqual([]);
    expect(r.dismissed).toEqual([]);
    expect(r.checked).toMatchObject({ entries: 1, scenes: 1, links: 0 });
  });

  it('finds a dead character who is mentioned in a later scene, from the scene text', async () => {
    const { report, entity, scene } = await setup();
    const mira = await entity('character', 'Mira', { startDay: 0, endDay: 1000 });
    await scene('Before', 900, 'Mira laughs.');
    const late = await scene('After', 1500, 'Everyone thought of Mira.');
    const r = await report();
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      rule: 'after_end',
      severity: 'warning',
      entityIds: [mira.id],
      sceneIds: [late.id],
      days: [1000],
    });
    // Names for what it mentions come along, so the page needs no more calls.
    expect(r.entities).toEqual([{ id: mira.id, name: 'Mira', typeId: expect.any(String) }]);
    expect(r.scenes).toEqual([{ id: late.id, title: 'After' }]);
  });

  it('is only a notice for a place that fell, and reads GM-only entries too', async () => {
    const { report, entity, scene } = await setup();
    await entity('location', 'Old Vesh', { startDay: 0, endDay: 100, visibility: 'gm' });
    await scene('Ruins', 500, 'They rode through Old Vesh.');
    const r = await report();
    expect(r.findings.map((f) => [f.rule, f.severity])).toEqual([['after_end', 'notice']]);
  });

  it('finds a narrator outside their life, and the same character in two places on a day', async () => {
    const { report, entity, scene } = await setup();
    const mira = await entity('character', 'Mira', { startDay: 100, endDay: 1000 });
    const docks = await entity('location', 'Docks');
    const palace = await entity('location', 'Palace');
    await scene('Too late', 2000, '', { povId: mira.id });
    await scene('Morning', 500, '', { povId: mira.id, locationId: docks.id });
    await scene('Evening', 500, '', { povId: mira.id, locationId: palace.id });
    const r = await report();
    expect(r.findings.map((f) => f.rule).sort()).toEqual(['pov_outside_life', 'two_places']);
    const places = r.findings.find((f) => f.rule === 'two_places')!;
    expect(places.severity).toBe('notice');
    expect(places.entityIds[0]).toBe(mira.id);
  });

  it('checks families, links outside a life, and items with two owners', async () => {
    const { report, entity, link, api, w } = await setup();
    const dad = await entity('character', 'Dad', { startDay: 5000 });
    const kid = await entity('character', 'Kid', { startDay: 4000 });
    await link(dad, 'parent_of', kid);
    const a = await entity('character', 'Ann', { startDay: 0, endDay: 800 });
    const b = await entity('character', 'Bo', { startDay: 0 });
    const marriage = await link(a, 'spouse_of', b);
    await api.patch(`${w}/relationships/${marriage.id}`, { validFromDay: 900 });
    const sword = await entity('item', 'The Sword');
    await link(a, 'owns', sword);
    await link(b, 'owns', sword);
    const rules = (await report()).findings.map((f) => f.rule).sort();
    expect(rules).toEqual(['link_outside_life', 'parent_after_child', 'two_owners']);
    const r = await report();
    expect(Object.values(r.linkLabels)).toContain('spouse of');
  });

  it('ignores trashed entries and trashed links', async () => {
    const { report, entity, scene, api, w } = await setup();
    const mira = await entity('character', 'Mira', { startDay: 0, endDay: 1000 });
    await scene('After', 1500, 'Mira again.');
    expect((await report()).findings).toHaveLength(1);
    await api.delete(`${w}/entities/${mira.id}`);
    expect((await report()).findings).toEqual([]);
  });

  it('lets the author dismiss a finding, and bring it back', async () => {
    const { report, entity, scene, api, w } = await setup();
    await entity('character', 'Mira', { startDay: 0, endDay: 1000 });
    await scene('Flashback', 1500, 'Mira, as remembered.');
    const [finding] = (await report()).findings;
    const dismissed = await api.post(`${w}/continuity/dismissals`, { key: finding!.key });
    expect(dismissed.statusCode).toBe(204);
    // Dismissing twice is harmless.
    expect((await api.post(`${w}/continuity/dismissals`, { key: finding!.key })).statusCode).toBe(
      204,
    );
    let r = await report();
    expect(r.findings).toEqual([]);
    expect(r.dismissed.map((f) => f.key)).toEqual([finding!.key]);
    // Names are still there, so a dismissed finding can be shown.
    expect(r.entities.map((e) => e.name)).toEqual(['Mira']);

    expect(
      (await api.delete(`${w}/continuity/dismissals?key=${encodeURIComponent(finding!.key)}`))
        .statusCode,
    ).toBe(204);
    r = await report();
    expect(r.findings.map((f) => f.key)).toEqual([finding!.key]);
    expect(r.dismissed).toEqual([]);
  });

  it('brings a dismissed finding back when a new scene makes it worse', async () => {
    const { report, entity, scene, api, w } = await setup();
    await entity('character', 'Mira', { startDay: 0, endDay: 1000 });
    await scene('Flashback', 1500, 'Mira, as remembered.');
    const [first] = (await report()).findings;
    await api.post(`${w}/continuity/dismissals`, { key: first!.key });
    await scene('Another', 1800, 'Mira once more.');
    const r = await report();
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.key).not.toBe(first!.key);
    expect(r.findings[0]!.sceneIds).toHaveLength(2);
    expect(r.dismissed).toEqual([]);
  });

  it('refuses keys that are not finding keys', async () => {
    const { api, w } = await setup();
    for (const key of [
      '',
      'x',
      'no colon here',
      'rule:has spaces',
      'RULE:upper',
      'a:' + 'b'.repeat(250),
    ]) {
      expect((await api.post(`${w}/continuity/dismissals`, { key })).statusCode, key).toBe(400);
    }
    expect((await api.delete(`${w}/continuity/dismissals`)).statusCode).toBe(400);
  });

  it('is the GM’s alone, and dismissals are shared between co-GMs', async () => {
    const { w, report, entity, scene, player, coGm, cookie, api } = await setup();
    await entity('character', 'Mira', { startDay: 0, endDay: 1000 });
    await scene('After', 1500, 'Mira again.');
    expect((await player.api.get(`${w}/continuity`)).statusCode).toBe(403);
    expect(
      (await player.api.post(`${w}/continuity/dismissals`, { key: 'after_end:x:y' })).statusCode,
    ).toBe(403);
    expect(
      (await player.api.delete(`${w}/continuity/dismissals?key=after_end:x:y`)).statusCode,
    ).toBe(403);
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await preview.get(`${w}/continuity`)).statusCode).toBe(403);
    // A co-GM sees the same findings, and dismissing as one clears it for both.
    const [finding] = (await report(coGm.api)).findings;
    expect(finding).toBeDefined();
    await coGm.api.post(`${w}/continuity/dismissals`, { key: finding!.key });
    expect((await report(api)).findings).toEqual([]);
  });

  it('is private to its world', async () => {
    const mine = await setup();
    await mine.entity('character', 'Mira', { startDay: 0, endDay: 1000 });
    await mine.scene('After', 1500, 'Mira again.');
    const other = await signUpWithWorld(app, 'Elsewhere');
    expect((await other.api.get(`${mine.w}/continuity`)).statusCode).toBe(404);
    expect(
      (await other.api.post(`${mine.w}/continuity/dismissals`, { key: 'after_end:a:b' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await other.api.get(`${other.w}/continuity`)).json<ContinuityReport>().findings,
    ).toEqual([]);
    // Another world's dismissal key does nothing here.
    const [finding] = (await mine.report()).findings;
    await other.api.post(`${other.w}/continuity/dismissals`, { key: finding!.key });
    expect((await mine.report()).findings).toHaveLength(1);
  });
});
