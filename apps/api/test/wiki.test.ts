import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Entity,
  EntityType,
  ManuscriptNode,
  Progression,
  WikiEntry,
  WikiHome,
  WikiSettings,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

/** Calls the public wiki as a visitor: no session, only the cookie a password unlock gave. */
const visit = (url: string, cookie = '') =>
  app.inject({ method: 'GET', url: `/api/wiki/${url}`, headers: cookie ? { cookie } : {} });

/**
 * A small book: three chapters of one scene each. Mira is public from the start and changes her
 * name in chapter 2; the Drowned King is public but held back until chapter 3; the Smuggler is
 * for the GM alone.
 */
async function build() {
  const gm = await signUpWithWorld(app, `Wiki ${Math.random().toString(36).slice(2, 8)}`);
  const { api, w } = gm;
  const node = async (kind: string, title: string, parentId: string | null = null) => {
    const res = await api.post(`${w}/manuscript/nodes`, { kind, title, parentId });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<ManuscriptNode>();
  };
  const entity = async (type: string, name: string, extra: object = {}) => {
    const res = await api.post(`${w}/entities`, { typeId: gm.typeId(type), name, ...extra });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Entity>();
  };
  const progress = async (entityId: string, payload: object) => {
    const res = await api.post(`${w}/entities/${entityId}/progressions`, payload);
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Progression>();
  };

  const book = await node('book', 'The Salt Road');
  const chapters = [];
  const scenes = [];
  for (const title of ['Landfall', 'The Guild', 'What Lies Beneath']) {
    const chapter = await node('chapter', title, book.id);
    chapters.push(chapter);
    scenes.push(await node('scene', `${title} scene`, chapter.id));
  }

  const mira = await entity('character', 'Mira Vey', {
    visibility: 'public',
    summary: 'A harbour pilot.',
    body: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'She knows every channel.' }] },
        {
          type: 'secretBlock',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'She sank the ferry.' }] },
          ],
        },
      ],
    },
  });
  const king = await entity('character', 'The Drowned King', {
    visibility: 'public',
    summary: 'He sleeps under the lamp tower.',
    revealNodeId: chapters[2]!.id,
  });
  const smuggler = await entity('character', 'Old Tam', { visibility: 'gm' });
  const vesh = await entity('location', 'Vesh', { visibility: 'public' });

  // Chapter 2: Mira takes the Guild's name. A public change, set on that chapter's scene.
  await progress(mira.id, {
    title: 'Sworn to the Guild',
    sceneId: scenes[1]!.id,
    visibility: 'public',
    changes: { name: 'Pilot-Captain Vey', summary: 'Sworn to the Tide Guild.' },
  });
  // A change only the GM knows of must never show.
  await progress(mira.id, {
    title: 'Turned',
    sceneId: scenes[0]!.id,
    visibility: 'gm',
    changes: { summary: 'Secretly the King’s creature.' },
  });

  const link = await api.post(`${w}/relationships`, {
    sourceId: mira.id,
    targetId: vesh.id,
    typeId: (await api.get(`${w}/relationship-types`))
      .json<{ id: string; key: string }[]>()
      .find((type) => type.key === 'located_in')!.id,
  });
  expect(link.statusCode, link.body).toBe(201);
  const kingLink = await api.post(`${w}/relationships`, {
    sourceId: king.id,
    targetId: vesh.id,
    typeId: (await api.get(`${w}/relationship-types`))
      .json<{ id: string; key: string }[]>()
      .find((type) => type.key === 'located_in')!.id,
  });
  expect(kingLink.statusCode, kingLink.body).toBe(201);

  const on = await api.patch(`${w}/wiki-settings`, { enabled: true, intro: 'Welcome aboard.' });
  expect(on.statusCode, on.body).toBe(200);
  return { gm, chapters, scenes, mira, king, smuggler, vesh, slug: gm.world.slug };
}

describe('the reader wiki', () => {
  it('does not exist until the owner turns it on', async () => {
    const gm = await signUpWithWorld(app, `Closed ${Math.random().toString(36).slice(2, 8)}`);
    expect((await visit(gm.world.slug)).statusCode).toBe(404);
    const settings = (await gm.api.get(`${gm.w}/wiki-settings`)).json<WikiSettings>();
    expect(settings).toMatchObject({ enabled: false, hasPassword: false, available: true });
    await gm.api.patch(`${gm.w}/wiki-settings`, { enabled: true });
    expect((await visit(gm.world.slug)).statusCode).toBe(200);
    await gm.api.patch(`${gm.w}/wiki-settings`, { enabled: false });
    expect((await visit(gm.world.slug)).statusCode).toBe(404);
  });

  it('shows a new reader only what is public and not held back', async () => {
    const { slug } = await build();
    const res = await visit(slug);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['x-robots-tag']).toContain('noai');
    const home = res.json<WikiHome>();
    expect(home.world).toMatchObject({ intro: 'Welcome aboard.' });
    expect(home.progress).toBe('start');
    expect(home.entries.map((entry) => entry.name).sort()).toEqual(['Mira Vey', 'Vesh']);
    // Chapter numbers only: titles can spoil, and are off unless the owner asks.
    expect(home.chapters.map((chapter) => chapter.label)).toEqual([
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
    ]);
    expect(home.types.map((type) => [type.key, type.count])).toEqual([
      ['character', 1],
      ['location', 1],
    ]);
  });

  it('shows each entry as it stood at the reader’s chapter', async () => {
    const { slug, chapters, mira } = await build();
    const at = async (chapter: string) =>
      (await visit(`${slug}/entries/${mira.id}?chapter=${chapter}`)).json<WikiEntry>();

    const early = await at(chapters[0]!.id);
    expect(early.name).toBe('Mira Vey');
    expect(early.summary).toBe('A harbour pilot.');

    const later = await at(chapters[1]!.id);
    expect(later.name).toBe('Pilot-Captain Vey');
    expect(later.summary).toBe('Sworn to the Tide Guild.');
    expect((await at('end')).name).toBe('Pilot-Captain Vey');

    // The list uses the same name, so the index never gives the change away early.
    const home = (await visit(`${slug}?chapter=${chapters[0]!.id}`)).json<WikiHome>();
    expect(home.entries.map((entry) => entry.name)).toContain('Mira Vey');
    expect(JSON.stringify(home)).not.toContain('Pilot-Captain');
  });

  it('never sends secret blocks, GM-only changes or GM entries', async () => {
    const { slug, mira, smuggler } = await build();
    const entry = await visit(`${slug}/entries/${mira.id}?chapter=end`);
    expect(entry.body).toContain('She knows every channel.');
    expect(entry.body).not.toContain('sank the ferry');
    expect(entry.body).not.toContain('creature');
    expect((await visit(`${slug}/entries/${smuggler.id}?chapter=end`)).statusCode).toBe(404);
    expect((await visit(`${slug}?chapter=end`)).body).not.toContain('Old Tam');
  });

  it('holds an entry back until its chapter has been read, links and all', async () => {
    const { slug, chapters, king, vesh } = await build();
    const kingAt = (chapter: string) => visit(`${slug}/entries/${king.id}?chapter=${chapter}`);
    expect((await kingAt('start')).statusCode).toBe(404);
    expect((await kingAt(chapters[1]!.id)).statusCode).toBe(404);
    expect((await kingAt(chapters[2]!.id)).statusCode).toBe(200);
    expect((await kingAt('end')).statusCode).toBe(200);

    const names = async (chapter: string) =>
      (await visit(`${slug}/entries/${vesh.id}?chapter=${chapter}`))
        .json<WikiEntry>()
        .links.map((link) => link.other.name);
    expect(await names(chapters[0]!.id)).toEqual(['Mira Vey']);
    expect(await names(chapters[1]!.id)).toEqual(['Pilot-Captain Vey']);
    expect((await names('end')).sort()).toEqual(['Pilot-Captain Vey', 'The Drowned King']);
  });

  it('treats a chapter it does not know as the start', async () => {
    const { slug } = await build();
    const home = (
      await visit(`${slug}?chapter=11111111-1111-4111-8111-111111111111`)
    ).json<WikiHome>();
    expect(home.progress).toBe('start');
    expect(home.entries.map((entry) => entry.name)).not.toContain('The Drowned King');
    expect((await visit(`${slug}?chapter=nonsense`)).statusCode).toBe(400);
  });

  it('can show chapter titles when the owner asks', async () => {
    const { gm, slug } = await build();
    await gm.api.patch(`${gm.w}/wiki-settings`, { showChapterTitles: true });
    const home = (await visit(slug)).json<WikiHome>();
    expect(home.chapters[2]!.label).toBe('Chapter 3: What Lies Beneath');
  });

  it('can sit behind a password', async () => {
    const { gm, slug, mira } = await build();
    const set = await gm.api.patch(`${gm.w}/wiki-settings`, { password: 'saltroad' });
    expect(set.json<WikiSettings>().hasPassword).toBe(true);

    const locked = await visit(slug);
    expect(locked.statusCode).toBe(401);
    expect(locked.json()).toEqual({ locked: true, world: { name: gm.world.name } });
    expect((await visit(`${slug}/entries/${mira.id}`)).statusCode).toBe(401);

    const unlock = (password: string) =>
      app.inject({ method: 'POST', url: `/api/wiki/${slug}/unlock`, payload: { password } });
    expect((await unlock('wrong')).statusCode).toBe(403);
    const ok = await unlock('saltroad');
    expect(ok.statusCode, ok.body).toBe(200);
    const cookie = ok.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect(cookie).toContain('wiki_');
    expect((await visit(slug, cookie)).statusCode).toBe(200);

    // A new password ends the passes handed out under the old one.
    await gm.api.patch(`${gm.w}/wiki-settings`, { password: 'another-word' });
    expect((await visit(slug, cookie)).statusCode).toBe(401);
    // Removing it opens the wiki again.
    await gm.api.patch(`${gm.w}/wiki-settings`, { password: '' });
    expect((await visit(slug)).statusCode).toBe(200);
  });

  it('leaves its settings to the owner and co-GMs', async () => {
    const { gm } = await build();
    const player = await joinWorld(app, gm.world.id, 'player');
    expect((await player.api.get(`${gm.w}/wiki-settings`)).statusCode).toBe(403);
    expect((await player.api.patch(`${gm.w}/wiki-settings`, { enabled: false })).statusCode).toBe(
      403,
    );
  });

  it('keeps the spoiler gate out of what players and readers are sent', async () => {
    const { gm, king, chapters } = await build();
    const full = (await gm.api.get(`${gm.w}/entities/${king.id}`)).json<Entity>();
    expect(full.revealNodeId).toBe(chapters[2]!.id);
    const reader = await joinWorld(app, gm.world.id, 'reader');
    const seen = (await reader.api.get(`${gm.w}/entities/${king.id}`)).json<Entity>();
    expect(seen.revealNodeId).toBeNull();

    // The gate must be a chapter or scene of this world.
    const other = await signUpWithWorld(app, 'Elsewhere');
    const theirs = (
      await other.api.post(`${other.w}/manuscript/nodes`, { kind: 'book', title: 'B' })
    ).json<ManuscriptNode>();
    const bad = await gm.api.patch(`${gm.w}/entities/${king.id}`, { revealNodeId: theirs.id });
    expect(bad.statusCode).toBe(404);
    const cleared = await gm.api.patch(`${gm.w}/entities/${king.id}`, { revealNodeId: null });
    expect(cleared.json<Entity>().revealNodeId).toBeNull();
  });

  it('leaves GM-only fields out', async () => {
    const { gm, slug, mira } = await build();
    const type = gm.types.find((t: EntityType) => t.key === 'character')!;
    const fieldSchema = type.fieldSchema.map((field, index) =>
      index === 0 ? { ...field, gmOnly: true } : field,
    );
    const first = type.fieldSchema[0]!;
    const second = type.fieldSchema.find((field) => field.type === 'text' && field !== first);
    await gm.api.patch(`${gm.w}/entity-types/${type.id}`, { fieldSchema });
    await gm.api.patch(`${gm.w}/entities/${mira.id}`, {
      fields: {
        ...(first.type === 'text' ? { [first.key]: 'for the GM alone' } : {}),
        ...(second ? { [second.key]: 'plain to see' } : {}),
      },
    });
    const entry = (await visit(`${slug}/entries/${mira.id}?chapter=end`)).json<WikiEntry>();
    expect(entry.fields.map((field) => field.key)).not.toContain(first.key);
    expect(JSON.stringify(entry)).not.toContain('for the GM alone');
    if (second)
      expect(entry.fields.find((field) => field.key === second.key)?.text).toBe('plain to see');
  });
});
