import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_AUTO_REVISIONS,
  type Entity,
  type EntityRevisionContent,
  type ManuscriptNode,
  type RevisionDetail,
  type RevisionSummary,
  type RichTextDoc,
  type Scene,
  type SceneRevisionContent,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { entities, revisions } from '../src/db/schema';
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
  const entity = async (name: string, extra: object = {}) =>
    (
      await api.post(`${w}/entities`, { typeId: ctx.typeId('character'), name, ...extra })
    ).json<Entity>();
  const edit = (id: string, body: object, client = api) =>
    client.patch(`${w}/entities/${id}`, body);
  const history = async (id: string, client = api, base = 'entities') => {
    const res = await client.get(`${w}/${base}/${id}/revisions`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<RevisionSummary[]>();
  };
  const book = (
    await api.post(`${w}/manuscript/nodes`, { kind: 'book', title: 'Book' })
  ).json<ManuscriptNode>();
  const chapter = (
    await api.post(`${w}/manuscript/nodes`, { kind: 'chapter', title: 'Ch', parentId: book.id })
  ).json<ManuscriptNode>();
  const scene = async (title: string) =>
    (
      await api.post(`${w}/manuscript/nodes`, { kind: 'scene', title, parentId: chapter.id })
    ).json<ManuscriptNode>();
  const write = (id: string, text: string, client = api) =>
    client.put(`${w}/manuscript/scenes/${id}/body`, { body: doc(text) });
  /** Pretends the newest version of something is old, so the next edit starts a new one. */
  const age = (column: 'entityId' | 'nodeId', id: string) =>
    db
      .update(revisions)
      .set({ createdAt: sql`${revisions.createdAt} - interval '1 hour'` })
      .where(eq(revisions[column], id));
  return { ...ctx, coGm, player, entity, edit, history, scene, write, age, chapter };
}

describe('version history of entries', () => {
  it('keeps the entry as it was before the first edit, and the edit after it', async () => {
    const { entity, edit, history } = await setup();
    const mira = await entity('Mira', { summary: 'A fisher.' });
    expect(await history(mira.id)).toEqual([]);
    await edit(mira.id, { summary: 'A fisher turned smuggler.' });
    const versions = await history(mira.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ kind: 'auto', title: 'Mira', label: '' });
    expect(versions[0]!.author).toBeTruthy();
    // The earlier one is what it said before, and has no author.
    expect(versions[1]!.author).toBeNull();
  });

  it('folds saves in quick succession into one version, and starts a new one later', async () => {
    const { entity, edit, history, age, api, w } = await setup();
    const mira = await entity('Mira');
    await edit(mira.id, { summary: 'one' });
    await edit(mira.id, { summary: 'two' });
    await edit(mira.id, { summary: 'three' });
    let versions = await history(mira.id);
    expect(versions).toHaveLength(2);
    const newest = (await api.get(`${w}/entities/${mira.id}/revisions/${versions[0]!.id}`)).json<
      RevisionDetail<EntityRevisionContent>
    >();
    expect(newest.content.summary).toBe('three');

    await age('entityId', mira.id);
    await edit(mira.id, { summary: 'four' });
    versions = await history(mira.id);
    expect(versions).toHaveLength(3);
  });

  it('adds nothing for a save that changes nothing it keeps', async () => {
    const { entity, edit, history } = await setup();
    const mira = await entity('Mira');
    await edit(mira.id, { summary: 'x' });
    const before = await history(mira.id);
    await edit(mira.id, { visibility: 'player' });
    await edit(mira.id, { summary: 'x' });
    expect(await history(mira.id)).toEqual(before);
  });

  it('keeps names, aliases, fields, dates and the body', async () => {
    const { entity, edit, history, api, w } = await setup();
    const mira = await entity('Mira');
    await edit(mira.id, {
      name: 'Mira Vey',
      aliases: ['Fisher'],
      body: doc('Born under a red moon.'),
      startDay: 10,
      endDay: 99,
    });
    const [latest] = await history(mira.id);
    const detail = (await api.get(`${w}/entities/${mira.id}/revisions/${latest!.id}`)).json<
      RevisionDetail<EntityRevisionContent>
    >();
    expect(detail.content).toMatchObject({
      name: 'Mira Vey',
      aliases: ['Fisher'],
      startDay: 10,
      endDay: 99,
    });
    expect(JSON.stringify(detail.content.body)).toContain('red moon');
    expect(detail.title).toBe('Mira Vey');
    expect(detail.words).toBeGreaterThan(0);
  });

  it('lets the author name a version of what is there now', async () => {
    const { entity, edit, history, api, w } = await setup();
    const mira = await entity('Mira');
    await edit(mira.id, { summary: 'Draft one' });
    const named = await api.post(`${w}/entities/${mira.id}/revisions`, {
      label: 'Before the rewrite',
    });
    expect(named.statusCode).toBe(201);
    expect(named.json<RevisionSummary>()).toMatchObject({
      kind: 'manual',
      label: 'Before the rewrite',
    });
    expect((await history(mira.id))[0]).toMatchObject({ kind: 'manual' });
    for (const label of ['', '   ', 'x'.repeat(81)]) {
      expect((await api.post(`${w}/entities/${mira.id}/revisions`, { label })).statusCode).toBe(
        400,
      );
    }
  });

  it('restores an older version, keeping the text it replaces so the restore can be undone', async () => {
    const { entity, edit, history, api, w, age } = await setup();
    const mira = await entity('Mira', { summary: 'Original' });
    await edit(mira.id, { summary: 'Second', name: 'Mira Vey' });
    await age('entityId', mira.id);
    await edit(mira.id, { summary: 'Third', name: 'Mira the Grey' });
    const versions = await history(mira.id);
    const second = versions.find((v) => v.title === 'Mira Vey')!;

    const res = await api.post(`${w}/entities/${mira.id}/revisions/${second.id}/restore`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<Entity>()).toMatchObject({ name: 'Mira Vey', summary: 'Second' });
    expect((await api.get(`${w}/entities/${mira.id}`)).json<Entity>().name).toBe('Mira Vey');

    // The text it replaced is already a version of its own, and a marker records the restore.
    const after = await history(mira.id);
    expect(after[0]).toMatchObject({
      kind: 'restore',
      title: 'Mira Vey',
      label: 'Restored an older version',
    });
    const grey = after.find((v) => v.kind === 'auto' && v.title === 'Mira the Grey')!;
    expect(grey).toBeDefined();

    // Editing afterwards starts a new version instead of overwriting the one before it.
    await edit(mira.id, { summary: 'Fourth' });
    const greyAfter = (await api.get(`${w}/entities/${mira.id}/revisions/${grey.id}`)).json<
      RevisionDetail<EntityRevisionContent>
    >();
    expect(greyAfter.content.summary).toBe('Third');

    await api.post(`${w}/entities/${mira.id}/revisions/${grey.id}/restore`);
    expect((await api.get(`${w}/entities/${mira.id}`)).json<Entity>()).toMatchObject({
      name: 'Mira the Grey',
      summary: 'Third',
    });
  });

  it('keeps the present text first when it was never saved as a version', async () => {
    const { entity, edit, history, api, w } = await setup();
    const mira = await entity('Mira', { summary: 'Original' });
    await edit(mira.id, { summary: 'Second' });
    const [latest] = await history(mira.id);
    // A change that did not go through the editor (a script, an import).
    await db
      .update(entities)
      .set({ summary: 'Changed behind its back' })
      .where(eq(entities.id, mira.id));
    await api.post(`${w}/entities/${mira.id}/revisions/${latest!.id}/restore`);
    const kept = (await history(mira.id)).find(
      (v) => v.label === 'Before restoring an older version',
    )!;
    expect(kept).toBeDefined();
    const detail = (await api.get(`${w}/entities/${mira.id}/revisions/${kept.id}`)).json<
      RevisionDetail<EntityRevisionContent>
    >();
    expect(detail.content.summary).toBe('Changed behind its back');
  });

  it('leaves visibility alone when restoring', async () => {
    const { entity, edit, history, api, w } = await setup();
    const mira = await entity('Mira');
    await edit(mira.id, { summary: 'Public', visibility: 'public' });
    await edit(mira.id, { summary: 'Secret now', visibility: 'gm' });
    const [first, ...rest] = await history(mira.id);
    expect(first).toBeDefined();
    const target = rest[0]!;
    await api.post(`${w}/entities/${mira.id}/revisions/${target.id}/restore`);
    expect((await api.get(`${w}/entities/${mira.id}`)).json<Entity>().visibility).toBe('gm');
  });

  it('drops the oldest automatic versions past the cap', async () => {
    const { entity, edit, history, age, world } = await setup();
    const mira = await entity('Mira');
    await edit(mira.id, { summary: 'start' });
    const rows = Array.from({ length: MAX_AUTO_REVISIONS + 5 }, (_, i) => ({
      worldId: world.id,
      entityId: mira.id,
      kind: 'auto' as const,
      content: { name: 'Mira', n: i },
      contentHash: `fake-${i}`,
      title: 'Mira',
      createdBy: null,
    }));
    await db.insert(revisions).values(rows);
    await age('entityId', mira.id);
    await edit(mira.id, { summary: 'after the pile' });
    const autos = (await history(mira.id)).filter((v) => v.kind === 'auto');
    expect(autos).toHaveLength(MAX_AUTO_REVISIONS);
  });

  it('can delete a version', async () => {
    const { entity, edit, history, api, w } = await setup();
    const mira = await entity('Mira');
    await edit(mira.id, { summary: 'x' });
    const [latest] = await history(mira.id);
    expect((await api.delete(`${w}/entities/${mira.id}/revisions/${latest!.id}`)).statusCode).toBe(
      204,
    );
    expect((await history(mira.id)).map((v) => v.id)).not.toContain(latest!.id);
    expect((await api.delete(`${w}/entities/${mira.id}/revisions/${latest!.id}`)).statusCode).toBe(
      404,
    );
  });

  it('is the GM’s alone and private to the world', async () => {
    const { entity, edit, history, api, w, player, coGm, cookie } = await setup();
    const mira = await entity('Mira');
    await edit(mira.id, { summary: 'x' });
    const [latest] = await history(mira.id);
    const url = `${w}/entities/${mira.id}/revisions`;
    expect((await player.api.get(url)).statusCode).toBe(403);
    expect((await player.api.get(`${url}/${latest!.id}`)).statusCode).toBe(403);
    expect((await player.api.post(url, { label: 'x' })).statusCode).toBe(403);
    expect((await player.api.post(`${url}/${latest!.id}/restore`)).statusCode).toBe(403);
    expect((await player.api.delete(`${url}/${latest!.id}`)).statusCode).toBe(403);
    expect((await apiClient(app, cookie, { 'x-view-as': 'player' }).get(url)).statusCode).toBe(403);
    // A co-GM's edits are recorded under their own name.
    expect((await edit(mira.id, { summary: 'by the co-GM' }, coGm.api)).statusCode).toBe(200);
    expect((await history(mira.id, coGm.api))[0]!.author).toBeTruthy();
    const other = await signUpWithWorld(app, 'Elsewhere');
    expect((await other.api.get(`${w}/entities/${mira.id}/revisions`)).statusCode).toBe(404);
    expect((await api.get(`${w}/entities/${crypto.randomUUID()}/revisions`)).statusCode).toBe(404);
  });
});

describe('version history of scenes', () => {
  it('records the text as it is written and restores it', async () => {
    const { scene, write, history, api, w, age } = await setup();
    const s = await scene('Docks');
    await write(s.id, 'The first draft.');
    await age('nodeId', s.id);
    await write(s.id, 'The second draft, much better.');
    const versions = await history(s.id, api, 'manuscript/scenes');
    expect(versions.length).toBeGreaterThanOrEqual(3);
    const detail = (
      await api.get(`${w}/manuscript/scenes/${s.id}/revisions/${versions[1]!.id}`)
    ).json<RevisionDetail<SceneRevisionContent>>();
    expect(JSON.stringify(detail.content.body)).toContain('first draft');

    const restored = await api.post(
      `${w}/manuscript/scenes/${s.id}/revisions/${versions[1]!.id}/restore`,
    );
    expect(restored.statusCode, restored.body).toBe(200);
    const scened = restored.json<Scene>();
    expect(JSON.stringify(scened.body)).toContain('first draft');
    expect(scened.wordCount).toBe(3);
    const after = await history(s.id, api, 'manuscript/scenes');
    expect(after.some((v) => v.kind === 'restore')).toBe(true);
  });

  it('records a changed title and summary, but not a chapter’s', async () => {
    const { scene, api, w, history, chapter } = await setup();
    const s = await scene('Docks');
    await api.patch(`${w}/manuscript/nodes/${s.id}`, { title: 'The Docks at Dawn' });
    expect((await history(s.id, api, 'manuscript/scenes'))[0]!.title).toBe('The Docks at Dawn');
    // Changing only the scene's date or point of view is not a change to its writing.
    const count = (await history(s.id, api, 'manuscript/scenes')).length;
    await api.patch(`${w}/manuscript/nodes/${s.id}`, { inWorldDay: 12 });
    expect(await history(s.id, api, 'manuscript/scenes')).toHaveLength(count);

    expect(
      (await api.patch(`${w}/manuscript/nodes/${chapter.id}`, { title: 'Renamed' })).statusCode,
    ).toBe(200);
    expect((await api.get(`${w}/manuscript/scenes/${chapter.id}/revisions`)).statusCode).toBe(404);
  });

  it('is the GM’s alone', async () => {
    const { scene, write, history, api, w, player } = await setup();
    const s = await scene('Docks');
    await write(s.id, 'Secret plans.');
    const [latest] = await history(s.id, api, 'manuscript/scenes');
    const url = `${w}/manuscript/scenes/${s.id}/revisions`;
    expect((await player.api.get(url)).statusCode).toBe(403);
    expect((await player.api.get(`${url}/${latest!.id}`)).statusCode).toBe(403);
    expect((await player.api.post(`${url}/${latest!.id}/restore`)).statusCode).toBe(403);
  });
});
