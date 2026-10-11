import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { eq, and, sql } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  THUMBNAIL_SIDE,
  type Entity,
  type EntityType,
  type GalleryImage,
  type ManuscriptNode,
  type QuestSummary,
  type RelationshipType,
  type WorldExport,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { entityTypes, relationshipTypes } from '../src/db/schema';
import { imageDir } from '../src/modules/gallery/files';
import { uploadsDir } from '../src/modules/atlas/files';
import { joinWorld, multipartForm, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#5a7' } })
    .png()
    .toBuffer();

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w, cookie, world } = ctx;
  const entity = async (type: string, name: string, extra: object = {}) =>
    (await api.post(`${w}/entities`, { typeId: ctx.typeId(type), name, ...extra })).json<Entity>();

  const upload = (
    fields: Record<string, string>,
    file: { name: string; type: string; data: Buffer } | undefined,
    as = cookie,
  ) => {
    const form = multipartForm(fields, file);
    return app.inject({
      method: 'POST',
      url: `/api${w}/images`,
      headers: { cookie: as, ...form.headers },
      payload: form.payload,
    });
  };
  const addImage = async (fields: Record<string, string> = {}, width = 300, height = 200) => {
    const res = await upload(fields, {
      name: 'p.png',
      type: 'image/png',
      data: await png(width, height),
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<GalleryImage>();
  };
  const list = async (query = '') => (await api.get(`${w}/images${query}`)).json<GalleryImage[]>();
  return { ...ctx, entity, upload, addImage, list, worldId: world.id };
}

describe('gallery', () => {
  it('stores a bounded WebP and a thumbnail, whatever was uploaded', async () => {
    const { api, w, addImage } = await setup();
    const big = await addImage({ caption: 'A huge picture' }, 6000, 3000);
    expect(big).toMatchObject({
      caption: 'A huge picture',
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_SIDE / 2,
    });
    expect(big.bytes).toBeGreaterThan(0);

    const file = await api.get(`${w}/images/${big.id}/file`);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect(file.headers['cache-control']).toContain('private');
    expect(file.rawPayload.subarray(0, 4).toString()).toBe('RIFF');
    expect(file.rawPayload.subarray(8, 12).toString()).toBe('WEBP');
    expect((await sharp(file.rawPayload).metadata()).width).toBe(MAX_IMAGE_SIDE);

    const thumb = await sharp(
      (await api.get(`${w}/images/${big.id}/thumbnail`)).rawPayload,
    ).metadata();
    expect(thumb.width).toBe(THUMBNAIL_SIDE);
    // A small picture is not enlarged.
    const small = await addImage({}, 120, 80);
    expect(small).toMatchObject({ width: 120, height: 80 });
  });

  it('strips what a photo carries besides the picture, and stands sideways photos up', async () => {
    const { api, w, upload } = await setup();
    const photo = await sharp({
      create: { width: 300, height: 200, channels: 3, background: '#888' },
    })
      .jpeg()
      .withExif({
        IFD0: { Copyright: 'Secret Studio', ImageDescription: 'taken at 12 Low Street' },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const res = await upload({}, { name: 'photo.jpg', type: 'image/jpeg', data: photo });
    expect(res.statusCode, res.body).toBe(201);
    const image = res.json<GalleryImage>();
    expect(image).toMatchObject({ width: 200, height: 300 }); // turned upright
    const stored = (await api.get(`${w}/images/${image.id}/file`)).rawPayload;
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(stored.toString('latin1')).not.toContain('Secret Studio');
    expect(stored.toString('latin1')).not.toContain('Low Street');
  });

  it('rejects uploads that are not usable images, and leaves nothing behind', async () => {
    const { upload, list } = await setup();
    const text = await upload(
      {},
      { name: 'fake.png', type: 'image/png', data: Buffer.from('not an image at all') },
    );
    expect(text.statusCode, text.body).toBe(400);
    expect((await upload({}, undefined)).statusCode).toBe(400);
    const orphan = await upload(
      { entityId: '', portrait: 'true' },
      { name: 'p.png', type: 'image/png', data: await png(10, 10) },
    );
    expect(orphan.statusCode, orphan.body).toBe(400); // only an entry can have a portrait
    expect(await list()).toEqual([]);
    expect(readdirSync(uploadsDir())).toEqual([]);
  });

  it('refuses a file over the size cap without keeping any of it', async () => {
    const { cookie, w, list } = await setup();
    const boundary = '----too-big';
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="huge.png"\r\nContent-Type: image/png\r\n\r\n`,
    );
    const chunk = Buffer.alloc(1024 * 1024);
    async function* body() {
      yield head;
      for (let i = 0; i < MAX_IMAGE_BYTES / chunk.length + 2; i++) yield chunk;
      yield Buffer.from(`\r\n--${boundary}--\r\n`);
    }
    const res = await app.inject({
      method: 'POST',
      url: `/api${w}/images`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Readable.from(body()),
    });
    expect(res.statusCode, res.body).toBe(413);
    expect(res.json<{ message: string }>().message).toContain('25 MB');
    expect(readdirSync(uploadsDir())).toEqual([]);
    expect(await list()).toEqual([]);
  }, 60_000);

  it("makes an entry's first picture its portrait, and lets another take over", async () => {
    const { api, w, entity, addImage, list } = await setup();
    const mira = await entity('character', 'Mira');
    const first = await addImage({ entityId: mira.id });
    const second = await addImage({ entityId: mira.id });
    expect([first.isPortrait, second.isPortrait]).toEqual([true, false]);

    const swapped = await api.patch(`${w}/images/${second.id}`, { portrait: true });
    expect(swapped.json<GalleryImage>().isPortrait).toBe(true);
    const now = await list(`?entityId=${mira.id}`);
    expect(now.map((i) => [i.id, i.isPortrait])).toEqual([
      [second.id, true],
      [first.id, false],
    ]); // portrait first
    expect(now.filter((i) => i.isPortrait)).toHaveLength(1);

    // Asking for a portrait at upload time takes the place of the current one.
    const third = await addImage({ entityId: mira.id, portrait: 'true' });
    expect((await list(`?entityId=${mira.id}`)).find((i) => i.isPortrait)?.id).toBe(third.id);

    // Deleting the portrait promotes the oldest remaining picture.
    expect((await api.delete(`${w}/images/${third.id}`)).statusCode).toBe(204);
    expect((await list(`?entityId=${mira.id}`)).find((i) => i.isPortrait)?.id).toBe(first.id);
  });

  it('deletes the files with the image', async () => {
    const { api, w, addImage, worldId } = await setup();
    const image = await addImage();
    expect(existsSync(imageDir(worldId, image.id))).toBe(true);
    expect((await api.delete(`${w}/images/${image.id}`)).statusCode).toBe(204);
    expect(existsSync(imageDir(worldId, image.id))).toBe(false);
    expect((await api.get(`${w}/images/${image.id}/file`)).statusCode).toBe(404);
  });

  it('tags a picture to a scene or a date, not both', async () => {
    const { api, w, entity, addImage } = await setup();
    const book = (
      await api.post(`${w}/manuscript/nodes`, { kind: 'book', title: 'B' })
    ).json<ManuscriptNode>();
    const chapter = (
      await api.post(`${w}/manuscript/nodes`, { kind: 'chapter', title: 'C', parentId: book.id })
    ).json<ManuscriptNode>();
    const scene = (
      await api.post(`${w}/manuscript/nodes`, { kind: 'scene', title: 'S', parentId: chapter.id })
    ).json<ManuscriptNode>();
    const mira = await entity('character', 'Mira');

    const both = await addImage({ entityId: mira.id, sceneId: scene.id }).then((i) => i);
    expect(both).toMatchObject({ sceneId: scene.id, day: null });
    const dated = await api.patch(`${w}/images/${both.id}`, { day: 5000 });
    expect(dated.json<GalleryImage>()).toMatchObject({ sceneId: null, day: 5000 }); // a date replaces the scene
    expect(
      (await api.patch(`${w}/images/${both.id}`, { sceneId: scene.id, day: 7 })).statusCode,
    ).toBe(400);
    expect((await api.patch(`${w}/images/${both.id}`, { sceneId: chapter.id })).statusCode).toBe(
      404,
    ); // not a scene
    const form = multipartForm(
      { sceneId: scene.id, day: '10' },
      { name: 'p.png', type: 'image/png', data: await png(10, 10) },
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api${w}/images`,
      headers: { cookie: (await signUpWithWorld(app)).cookie, ...form.headers },
      payload: form.payload,
    });
    expect(res.statusCode).toBe(404); // someone else's world
  });

  it("moves a picture to another entry, or to the world's own gallery", async () => {
    const { api, w, entity, addImage, list } = await setup();
    const a = await entity('character', 'A');
    const b = await entity('character', 'B');
    const image = await addImage({ entityId: a.id });
    expect(image.isPortrait).toBe(true);
    const moved = (
      await api.patch(`${w}/images/${image.id}`, { entityId: b.id })
    ).json<GalleryImage>();
    expect(moved).toMatchObject({ entityId: b.id, entityName: 'B', isPortrait: false });
    const loose = (
      await api.patch(`${w}/images/${image.id}`, { entityId: null })
    ).json<GalleryImage>();
    expect(loose).toMatchObject({ entityId: null, entityName: null });
    expect((await list('?scope=world')).map((i) => i.id)).toEqual([image.id]);
    expect((await api.patch(`${w}/images/${image.id}`, { portrait: true })).statusCode).toBe(400); // no entry to be portrait of
  });

  it("takes an entry's pictures with it into the trash, and removes the files when it is purged", async () => {
    const { api, w, entity, addImage, list, worldId } = await setup();
    const mira = await entity('character', 'Mira');
    const image = await addImage({ entityId: mira.id });
    await api.delete(`${w}/entities/${mira.id}`);
    expect(await list()).toEqual([]);
    await api.post(`${w}/trash/${mira.id}/restore`);
    expect((await list()).map((i) => i.id)).toEqual([image.id]);

    await api.delete(`${w}/entities/${mira.id}`);
    expect(existsSync(imageDir(worldId, image.id))).toBe(true);
    expect((await api.delete(`${w}/trash/${mira.id}`)).statusCode).toBe(204);
    expect(existsSync(imageDir(worldId, image.id))).toBe(false);
  });

  it('is private to the world, and changes need edit rights', async () => {
    const owner = await setup();
    const image = await owner.addImage();
    const other = await signUpWithWorld(app);
    expect((await other.api.get(`${owner.w}/images`)).statusCode).toBe(404);
    expect((await other.api.get(`${owner.w}/images/${image.id}/file`)).statusCode).toBe(404);
    expect((await other.api.delete(`${owner.w}/images/${image.id}`)).statusCode).toBe(404);
    // Another world's image ID inside your own world is just as unreachable.
    expect((await other.api.get(`${other.w}/images/${image.id}/file`)).statusCode).toBe(404);
    const reader = await joinWorld(app, owner.worldId, 'reader');
    expect(
      (await reader.api.patch(`${owner.w}/images/${image.id}`, { caption: 'x' })).statusCode,
    ).toBe(403);
    expect(
      (await owner.api.get(`${owner.w}/images/${image.id}`)).json<GalleryImage>().caption,
    ).toBe('');
  });
});

describe('quests', () => {
  it('gives every world a Quest type and a "given by" link', async () => {
    const { api, w } = await setup();
    const types = (await api.get(`${w}/entity-types`)).json<EntityType[]>();
    const quest = types.find((t) => t.key === 'quest')!;
    expect(quest).toMatchObject({ name: 'Quest', startLabel: 'Offered', endLabel: 'Resolved' });
    expect(quest.fieldSchema.find((f) => f.key === 'status')?.options).toEqual([
      'Not started',
      'Ongoing',
      'Completed',
      'Abandoned',
    ]);
    const rel = (await api.get(`${w}/relationship-types`)).json<RelationshipType[]>();
    expect(rel.find((r) => r.key === 'given_by')).toMatchObject({
      label: 'given by',
      inverseLabel: 'gave quest',
    });
  });

  it("changes a quest's status without touching its other details", async () => {
    const { api, w, entity } = await setup();
    const quest = await entity('quest', 'Find the Compass', {
      visibility: 'player',
      fields: { status: 'Not started', objectives: 'Search the wreck.', reward: '200 gold' },
    });
    const moved = await api.patch(`${w}/quests/${quest.id}/status`, { status: 'Ongoing' });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json<Entity>().fields).toEqual({
      status: 'Ongoing',
      objectives: 'Search the wreck.',
      reward: '200 gold',
    });
    const list = (await api.get(`${w}/quests`)).json<QuestSummary[]>();
    expect(list).toMatchObject([
      { name: 'Find the Compass', status: 'Ongoing', visibility: 'player' },
    ]);

    expect(
      (await api.patch(`${w}/quests/${quest.id}/status`, { status: 'Daydreaming' })).statusCode,
    ).toBe(400); // not an option
    expect((await api.patch(`${w}/quests/${quest.id}/status`, { status: '  ' })).statusCode).toBe(
      400,
    );
    const mira = await entity('character', 'Mira');
    expect(
      (await api.patch(`${w}/quests/${mira.id}/status`, { status: 'Ongoing' })).statusCode,
    ).toBe(404); // not a quest
  });

  it('treats a quest with no status as not started, and lists quests with their links', async () => {
    const { api, w, entity } = await setup();
    const vesh = await entity('location', 'Vesh');
    const quest = await entity('quest', 'A fresh quest');
    const rel = (await api.get(`${w}/relationship-types`)).json<RelationshipType[]>();
    await api.post(`${w}/relationships`, {
      sourceId: quest.id,
      targetId: vesh.id,
      typeId: rel.find((r) => r.key === 'located_in')!.id,
    });
    const [listed] = (await api.get(`${w}/quests`)).json<QuestSummary[]>();
    expect(listed).toMatchObject({
      status: '',
      links: [{ label: 'located in', other: { name: 'Vesh' } }],
    });
    // Seen from the place, the same link reads the other way.
    const vesh2 = (await api.get(`${w}/entities/${vesh.id}/relationships`)).json<
      { label: string }[]
    >();
    expect(vesh2.map((l) => l.label)).toEqual(['contains']);
  });

  it('is added to worlds made before it existed, by the migration', async () => {
    const { api, w, worldId } = await setup();
    // Make this world look like an old one, then replay the migration's backfill statements.
    await db
      .delete(entityTypes)
      .where(and(eq(entityTypes.worldId, worldId), eq(entityTypes.key, 'quest')));
    await db
      .delete(relationshipTypes)
      .where(and(eq(relationshipTypes.worldId, worldId), eq(relationshipTypes.key, 'given_by')));
    let types = (await api.get(`${w}/entity-types`)).json<EntityType[]>();
    expect(types.some((t) => t.key === 'quest')).toBe(false);

    const migration = readFileSync(
      new URL('../drizzle/0004_gm_tools.sql', import.meta.url),
      'utf8',
    );
    const backfill = migration
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => /^INSERT INTO/i.test(s));
    expect(backfill).toHaveLength(2);
    for (const statement of backfill) await db.execute(sql.raw(statement));
    // Running it twice changes nothing.
    for (const statement of backfill) await db.execute(sql.raw(statement));

    types = (await api.get(`${w}/entity-types`)).json<EntityType[]>();
    const quest = types.find((t) => t.key === 'quest')!;
    expect(quest).toMatchObject({ isBuiltin: true, icon: 'scroll-text' });
    expect(quest.sortOrder).toBe(
      Math.max(...types.filter((t) => t.key !== 'quest').map((t) => t.sortOrder)) + 1,
    );
    expect(types.filter((t) => t.key === 'quest')).toHaveLength(1);
    expect(
      (await api.get(`${w}/relationship-types`))
        .json<RelationshipType[]>()
        .filter((r) => r.key === 'given_by'),
    ).toHaveLength(1);
    // And it works: a quest can be created and moved.
    const made = await api.post(`${w}/entities`, {
      typeId: quest.id,
      name: 'Old world quest',
      fields: { status: 'Ongoing' },
    });
    expect(made.statusCode, made.body).toBe(201);
  });
});

describe('Markdown export', () => {
  it('downloads the world as a zip of notes, pictures and JSON', async () => {
    const { api, w, entity, addImage, worldId } = await setup();
    const vesh = await entity('location', 'Vesh', { summary: 'A harbour city.' });
    const mira = await entity('character', 'Mira Vey', {
      aliases: ['Mira'],
      startDay: 100,
      body: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'She counts the ships.' }] },
        ],
      },
    });
    const rel = (await api.get(`${w}/relationship-types`)).json<RelationshipType[]>();
    await api.post(`${w}/relationships`, {
      sourceId: mira.id,
      targetId: vesh.id,
      typeId: rel.find((r) => r.key === 'located_in')!.id,
    });
    const image = await addImage({ entityId: mira.id, caption: 'Mira at the docks' });

    const res = await api.get(`${w}/export/markdown`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename=".+-markdown-\d{4}-\d{2}-\d{2}\.zip"/,
    );

    const files = unzipSync(new Uint8Array(res.rawPayload));
    const root = Object.keys(files)[0]!.split('/')[0]!;
    const text = (path: string) => strFromU8(files[`${root}/${path}`]!);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        `${root}/README.md`,
        `${root}/world.json`,
        `${root}/Calendar.md`,
        `${root}/Codex/Character/Mira Vey.md`,
        `${root}/Codex/Location/Vesh.md`,
        `${root}/Gallery/${image.id}.webp`,
      ]),
    );
    const note = text('Codex/Character/Mira Vey.md');
    expect(note).toContain('aliases: ["Mira"]');
    expect(note).toContain('She counts the ships.');
    expect(note).toContain('- located in [[Codex/Location/Vesh|Vesh]]');
    expect(note).toContain(`![[Gallery/${image.id}.webp]]`);
    expect(text('Codex/Location/Vesh.md')).toContain(
      '- contains [[Codex/Character/Mira Vey|Mira Vey]]',
    );
    // The picture is a real WebP, and the JSON is the full export.
    expect(Buffer.from(files[`${root}/Gallery/${image.id}.webp`]!).subarray(8, 12).toString()).toBe(
      'WEBP',
    );
    const json = JSON.parse(text('world.json')) as WorldExport;
    expect(json.entities.map((e) => e.name).sort()).toEqual(['Mira Vey', 'Vesh']);
    expect(json.gallery.map((g) => g.id)).toEqual([image.id]);
    void worldId;
  });

  it('is for editors only', async () => {
    const { w, worldId } = await setup();
    const player = await joinWorld(app, worldId, 'player');
    expect((await player.api.get(`${w}/export/markdown`)).statusCode).toBe(403);
    const stranger = await signUpWithWorld(app);
    expect((await stranger.api.get(`${w}/export/markdown`)).statusCode).toBe(404);
  });
});
