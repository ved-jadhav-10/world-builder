import { existsSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_MAP_BYTES,
  mapMaxZoom,
  type AtlasMap,
  type AtlasSearchResult,
  type Entity,
  type EntityMapLink,
  type MapFeature,
  type WorldExport,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { maps } from '../src/db/schema';
import { mapDir, originalPath, uploadsDir } from '../src/modules/atlas/files';
import { enqueueTiling, tilingIdle } from '../src/modules/atlas/tiling';
import { multipartForm, signUp, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3a7a5a' } })
    .png()
    .toBuffer();

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w, cookie } = ctx;

  const upload = (
    fields: Record<string, string>,
    file?: { name: string; type: string; data: Buffer },
    as = cookie,
    base = w,
  ) => {
    const form = multipartForm(fields, file);
    return app.inject({
      method: 'POST',
      url: `/api${base}/maps`,
      headers: { cookie: as, ...form.headers },
      payload: form.payload,
    });
  };

  /** Uploads a PNG and waits for its tiles. */
  const makeMap = async (
    name: string,
    opts: { width?: number; height?: number; parentId?: string; entityId?: string } = {},
  ) => {
    const data = await png(opts.width ?? 600, opts.height ?? 400);
    const res = await upload(
      {
        name,
        ...(opts.parentId ? { parentId: opts.parentId } : {}),
        ...(opts.entityId ? { entityId: opts.entityId } : {}),
      },
      { name: 'map.png', type: 'image/png', data },
    );
    expect(res.statusCode, res.body).toBe(201);
    await tilingIdle();
    return (await api.get(`${w}/maps/${res.json<AtlasMap>().id}`)).json<AtlasMap>();
  };

  const entity = async (type: string, name: string) =>
    (await api.post(`${w}/entities`, { typeId: ctx.typeId(type), name })).json<Entity>();
  const feature = async (mapId: string, payload: object) => {
    const res = await api.post(`${w}/maps/${mapId}/features`, payload);
    expect(res.statusCode, res.body).toBe(201);
    return res.json<MapFeature>();
  };

  return { ...ctx, upload, makeMap, entity, feature };
}

describe('map upload and tiling', () => {
  it('accepts an image, tiles it in the background and serves the tiles', async () => {
    const { api, w, upload } = await setup();
    const res = await upload(
      { name: 'Aerth', description: 'The whole world' },
      { name: 'aerth.png', type: 'image/png', data: await png(1000, 700) },
    );
    expect(res.statusCode, res.body).toBe(201);
    const created = res.json<AtlasMap>();
    expect(created).toMatchObject({
      name: 'Aerth',
      description: 'The whole world',
      status: 'processing',
      width: 1000,
      height: 700,
      parentId: null,
      featureCount: 0,
    });

    await tilingIdle();
    const map = (await api.get(`${w}/maps/${created.id}`)).json<AtlasMap>();
    expect(map.status).toBe('ready');
    expect(mapMaxZoom(map.width, map.height)).toBe(2);

    const tile = async (z: number, x: number, y: number) =>
      api.get(`${w}/maps/${map.id}/tiles/${z}/${x}/${y}`);
    for (const [z, x, y] of [
      [0, 0, 0],
      [1, 1, 1],
      [2, 3, 2], // the bottom-right tile at full size: 4 columns by 3 rows
    ] as const) {
      const ok = await tile(z, x, y);
      expect(ok.statusCode, `${z}/${x}/${y}`).toBe(200);
      expect(ok.headers['content-type']).toBe('image/webp');
      expect(ok.headers['cache-control']).toContain('private');
      const meta = await sharp(ok.rawPayload).metadata();
      expect([meta.width, meta.height]).toEqual([256, 256]);
    }
    expect((await tile(2, 4, 0)).statusCode).toBe(404); // past the right edge
    expect((await tile(3, 0, 0)).statusCode).toBe(404); // deeper than the pyramid

    const thumbnail = await api.get(`${w}/maps/${map.id}/thumbnail`);
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers['content-type']).toBe('image/webp');
  });

  it('builds the number of zoom levels the viewer expects at tile-size boundaries', async () => {
    const { api, w, makeMap } = await setup();
    for (const [width, height] of [
      [256, 256],
      [257, 100],
      [512, 300],
      [513, 40],
      [90, 700],
    ] as const) {
      const map = await makeMap(`${width}x${height}`, { width, height });
      expect(map.status, `${width}x${height}`).toBe('ready');
      const maxZ = mapMaxZoom(width, height);
      const cols = Math.ceil(width / 256);
      const rows = Math.ceil(height / 256);
      const last = await api.get(`${w}/maps/${map.id}/tiles/${maxZ}/${cols - 1}/${rows - 1}`);
      expect(last.statusCode, `${width}x${height} last tile`).toBe(200);
      const beyond = await api.get(`${w}/maps/${map.id}/tiles/${maxZ}/${cols}/0`);
      expect(beyond.statusCode, `${width}x${height} past edge`).toBe(404);
      // Level 0 always holds the whole map in a single tile.
      expect((await api.get(`${w}/maps/${map.id}/tiles/0/0/0`)).statusCode).toBe(200);
    }
  });

  it('turns sideways photos upright when cutting tiles', async () => {
    const { api, w, upload } = await setup();
    const jpeg = await sharp({
      create: { width: 300, height: 200, channels: 3, background: '#888' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const res = await upload(
      { name: 'Rotated' },
      { name: 'r.jpg', type: 'image/jpeg', data: jpeg },
    );
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json<AtlasMap>()).toMatchObject({ width: 200, height: 300 });
    await tilingIdle();
    const map = (await api.get(`${w}/maps/${res.json<AtlasMap>().id}`)).json<AtlasMap>();
    expect(map.status).toBe('ready');
    // The upright image is 200 wide and 300 tall: one tile at level 0, two rows at level 1.
    expect((await api.get(`${w}/maps/${map.id}/tiles/1/0/1`)).statusCode).toBe(200);
    expect((await api.get(`${w}/maps/${map.id}/tiles/1/1/0`)).statusCode).toBe(404);
  });

  it('takes uploads far larger than the normal request size limit', async () => {
    const { api, w, upload } = await setup();
    // Noise does not compress, so this PNG is several megabytes: over the 2 MB limit for JSON.
    const noisy = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: '#000',
        noise: { type: 'gaussian', mean: 128, sigma: 60 },
      },
    })
      .png()
      .toBuffer();
    expect(noisy.length).toBeGreaterThan(4 * 1024 * 1024);
    const res = await upload(
      { name: 'Detailed' },
      { name: 'big.png', type: 'image/png', data: noisy },
    );
    expect(res.statusCode, res.body).toBe(201);
    await tilingIdle();
    const map = (await api.get(`${w}/maps/${res.json<AtlasMap>().id}`)).json<AtlasMap>();
    expect(map).toMatchObject({ status: 'ready', width: 2000, height: 1500 });
  });

  it('refuses a file over the size cap without keeping any of it', async () => {
    const { cookie, w, api } = await setup();
    const boundary = '----too-big';
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nHuge\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="huge.png"\r\n` +
        'Content-Type: image/png\r\n\r\n',
    );
    const chunk = Buffer.alloc(1024 * 1024);
    // Stream the body, so the test never holds 200 MB in memory.
    async function* body() {
      yield head;
      for (let i = 0; i < MAX_MAP_BYTES / chunk.length + 2; i++) yield chunk;
      yield Buffer.from(`\r\n--${boundary}--\r\n`);
    }
    const res = await app.inject({
      method: 'POST',
      url: `/api${w}/maps`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Readable.from(body()),
    });
    expect(res.statusCode, res.body).toBe(413);
    expect(res.json<{ message: string }>().message).toContain('200 MB');
    expect(readdirSync(uploadsDir())).toEqual([]);
    expect((await api.get(`${w}/maps`)).json<AtlasMap[]>()).toHaveLength(0);
  }, 60_000);

  it('rejects things that are not usable map images', async () => {
    const { upload, api, w } = await setup();
    const image = { name: 'map.png', type: 'image/png', data: await png(100, 100) };

    // Not an image, whatever the file name says.
    const text = await upload(
      { name: 'Fake' },
      { name: 'fake.png', type: 'image/png', data: Buffer.from('definitely not a png') },
    );
    expect(text.statusCode, text.body).toBe(400);
    // No file, no name, a name that is only spaces.
    expect((await upload({ name: 'No image' })).statusCode).toBe(400);
    expect((await upload({}, image)).statusCode).toBe(400);
    expect((await upload({ name: '   ' }, image)).statusCode).toBe(400);
    // Too many pixels along one side.
    const tall = await sharp({
      create: { width: 1, height: 40_001, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    const huge = await upload(
      { name: 'Huge' },
      { name: 'tall.png', type: 'image/png', data: tall },
    );
    expect(huge.statusCode, huge.body).toBe(400);
    // A body that is not a multipart form.
    const json = await api.post(`${w}/maps`, { name: 'JSON' });
    expect(json.statusCode).toBe(400);

    expect((await api.get(`${w}/maps`)).json<AtlasMap[]>()).toHaveLength(0);
    // Rejected uploads leave nothing behind in the temporary folder.
    expect(readdirSync(uploadsDir())).toEqual([]);
  });

  it('marks a map as failed when tiling breaks, and retries on request', async () => {
    const { makeMap, api, w, world } = await setup();
    const map = await makeMap('Fragile');
    expect((await api.post(`${w}/maps/${map.id}/retry`)).statusCode).toBe(409); // not failed

    // Lose the original and ask for tiling again.
    await rm(originalPath(world.id, map.id), { force: true });
    await db.update(maps).set({ status: 'processing' }).where(eq(maps.id, map.id));
    enqueueTiling(map.id, { error: () => {} });
    await tilingIdle();
    const failed = (await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>();
    expect(failed.status).toBe('failed');
    expect(failed.error).not.toBe('');

    const retry = await api.post(`${w}/maps/${map.id}/retry`);
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json<AtlasMap>().status).toBe('processing');
    await tilingIdle();
    expect((await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>().status).toBe('failed');
    // A map that is not ready serves no tiles.
    expect((await api.get(`${w}/maps/${map.id}/tiles/0/0/0`)).statusCode).toBe(404);
  });
});

describe('map hierarchy', () => {
  it('nests maps, blocks cycles and lifts children when a parent is deleted', async () => {
    const { api, w, makeMap } = await setup();
    const world = await makeMap('World', { width: 300, height: 200 });
    const region = await makeMap('Region', { parentId: world.id, width: 300, height: 200 });
    const city = await makeMap('City', { parentId: region.id, width: 300, height: 200 });
    expect(city.parentId).toBe(region.id);

    for (const [id, parentId] of [
      [world.id, city.id], // under its own grandchild
      [region.id, region.id], // under itself
    ]) {
      const res = await api.patch(`${w}/maps/${id}`, { parentId });
      expect(res.statusCode, `${id} -> ${parentId}`).toBe(400);
    }
    const moved = await api.patch(`${w}/maps/${city.id}`, { parentId: world.id });
    expect(moved.json<AtlasMap>().parentId).toBe(world.id);
    const detached = await api.patch(`${w}/maps/${city.id}`, { parentId: null });
    expect(detached.json<AtlasMap>().parentId).toBeNull();

    expect((await api.delete(`${w}/maps/${world.id}`)).statusCode).toBe(204);
    const rest = (await api.get(`${w}/maps`)).json<AtlasMap[]>();
    expect(rest.map((m) => m.name).sort()).toEqual(['City', 'Region']);
    expect(rest.find((m) => m.name === 'Region')?.parentId).toBeNull();
  });

  it('links a map to the entry it shows, and refuses other worlds', async () => {
    const { api, w, makeMap, entity, upload } = await setup();
    const eel = await entity('location', 'The Gilded Eel');
    const map = await makeMap('Tavern', { entityId: eel.id });
    expect(map.entity).toMatchObject({ id: eel.id, name: 'The Gilded Eel' });

    const other = await signUpWithWorld(app);
    const foreign = (
      await other.api.post(`${other.w}/entities`, { typeId: other.typeId('location'), name: 'X' })
    ).json<Entity>();
    const bad = await api.patch(`${w}/maps/${map.id}`, { entityId: foreign.id });
    expect(bad.statusCode).toBe(404);
    const badUpload = await upload(
      { name: 'Bad', entityId: foreign.id },
      { name: 'm.png', type: 'image/png', data: await png(50, 50) },
    );
    expect(badUpload.statusCode, badUpload.body).toBe(404);

    // Trashing the entry hides it from the map; restoring brings it back.
    await api.delete(`${w}/entities/${eel.id}`);
    expect((await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>().entity).toBeNull();
    await api.post(`${w}/trash/${eel.id}/restore`);
    expect((await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>().entity?.id).toBe(eel.id);
  });

  it('removes the files when a map is deleted', async () => {
    const { api, w, makeMap, world } = await setup();
    const map = await makeMap('Doomed');
    expect(existsSync(mapDir(world.id, map.id))).toBe(true);
    expect((await api.delete(`${w}/maps/${map.id}`)).statusCode).toBe(204);
    expect(existsSync(mapDir(world.id, map.id))).toBe(false);
    expect((await api.get(`${w}/maps/${map.id}`)).statusCode).toBe(404);
  });
});

describe('map features', () => {
  it('creates, edits and deletes pins, labels, paths and regions', async () => {
    const { api, w, makeMap, feature, entity } = await setup();
    const map = await makeMap('World');
    const eel = await entity('location', 'The Gilded Eel');

    const pin = await feature(map.id, {
      kind: 'pin',
      points: [[0.25, 0.5]],
      entityId: eel.id,
      color: '#ff0000',
      minZoom: 2,
    });
    expect(pin).toMatchObject({
      kind: 'pin',
      points: [[0.25, 0.5]],
      entity: { id: eel.id, name: 'The Gilded Eel' },
      color: '#ff0000',
      icon: null,
      size: 'md',
      minZoom: 2,
    });
    const road = await feature(map.id, {
      kind: 'path',
      label: 'Salt Road',
      points: [
        [0.1, 0.1],
        [0.5, 0.4],
        [0.9, 0.2],
      ],
      lineStyle: 'dashed',
    });
    await feature(map.id, {
      kind: 'region',
      label: 'The Reach',
      points: [
        [0.1, 0.1],
        [0.4, 0.1],
        [0.4, 0.4],
      ],
    });
    await feature(map.id, { kind: 'label', label: 'Sea of Glass', points: [[0.7, 0.8]] });

    const list = (await api.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>();
    expect(list.map((f) => f.kind)).toEqual(['pin', 'path', 'region', 'label']);
    expect((await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>().featureCount).toBe(4);

    const edited = await api.patch(`${w}/maps/${map.id}/features/${road.id}`, {
      points: [
        [0.123456789, 0.2],
        [0.8, 0.9],
      ],
      label: 'Old Salt Road',
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json<MapFeature>()).toMatchObject({
      label: 'Old Salt Road',
      points: [
        [0.123457, 0.2], // rounded to six decimals
        [0.8, 0.9],
      ],
    });

    expect((await api.delete(`${w}/maps/${map.id}/features/${pin.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>()).toHaveLength(3);
  });

  it('validates shape, position and links', async () => {
    const { api, w, makeMap, feature } = await setup();
    const map = await makeMap('World');
    const post = (payload: object) => api.post(`${w}/maps/${map.id}/features`, payload);
    const bad: [string, object][] = [
      [
        'pin with two points',
        {
          kind: 'pin',
          points: [
            [0.1, 0.1],
            [0.2, 0.2],
          ],
        },
      ],
      ['path with one point', { kind: 'path', points: [[0.1, 0.1]] }],
      [
        'region with two points',
        {
          kind: 'region',
          points: [
            [0.1, 0.1],
            [0.2, 0.2],
          ],
        },
      ],
      ['x past the edge', { kind: 'pin', points: [[1.2, 0.5]] }],
      ['negative y', { kind: 'pin', points: [[0.5, -0.1]] }],
      ['label without text', { kind: 'label', points: [[0.5, 0.5]] }],
      ['bad colour', { kind: 'pin', points: [[0.5, 0.5]], color: 'red' }],
      ['zoom too deep', { kind: 'pin', points: [[0.5, 0.5]], minZoom: 99 }],
      ['link to itself', { kind: 'pin', points: [[0.5, 0.5]], linkMapId: map.id }],
    ];
    for (const [name, payload] of bad) expect((await post(payload)).statusCode, name).toBe(400);

    const pin = await feature(map.id, { kind: 'pin', points: [[0.5, 0.5]] });
    const twoPoints = await api.patch(`${w}/maps/${map.id}/features/${pin.id}`, {
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    });
    expect(twoPoints.statusCode).toBe(400);
    const label = await feature(map.id, { kind: 'label', label: 'Hi', points: [[0.5, 0.5]] });
    expect(
      (await api.patch(`${w}/maps/${map.id}/features/${label.id}`, { label: '' })).statusCode,
    ).toBe(400);

    // A pin can open another map, and falls back to no link if that map is deleted.
    const child = await makeMap('Child');
    const linked = await feature(map.id, {
      kind: 'pin',
      points: [[0.3, 0.3]],
      linkMapId: child.id,
    });
    expect(linked.linkMapId).toBe(child.id);
    await api.delete(`${w}/maps/${child.id}`);
    const after = (await api.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>();
    expect(after.find((f) => f.id === linked.id)?.linkMapId).toBeNull();
  });

  it('hides trashed entries on the map and lists a map on the entry page', async () => {
    const { api, w, makeMap, feature, entity } = await setup();
    const world = await makeMap('World');
    const city = await makeMap('Port City');
    const eel = await entity('location', 'The Gilded Eel');
    const pin = await feature(world.id, { kind: 'pin', points: [[0.4, 0.4]], entityId: eel.id });
    await api.patch(`${w}/maps/${city.id}`, { entityId: eel.id });

    const links = (await api.get(`${w}/entities/${eel.id}/maps`)).json<EntityMapLink[]>();
    expect(links).toEqual([
      { mapId: city.id, mapName: 'Port City', featureId: null, kind: null },
      { mapId: world.id, mapName: 'World', featureId: pin.id, kind: 'pin' },
    ]);

    await api.delete(`${w}/entities/${eel.id}`);
    const [hidden] = (await api.get(`${w}/maps/${world.id}/features`)).json<MapFeature[]>();
    expect(hidden).toMatchObject({ entity: null, entityId: eel.id });
    expect((await api.get(`${w}/entities/${eel.id}/maps`)).statusCode).toBe(404);
    await api.post(`${w}/trash/${eel.id}/restore`);
    const [back] = (await api.get(`${w}/maps/${world.id}/features`)).json<MapFeature[]>();
    expect(back?.entity?.name).toBe('The Gilded Eel');
  });

  it('refuses entries and maps from other worlds', async () => {
    const a = await setup();
    const b = await setup();
    const mapA = await a.makeMap('A');
    const mapB = await b.makeMap('B');
    const theirs = await b.entity('location', 'Theirs');
    const post = (payload: object) => a.api.post(`${a.w}/maps/${mapA.id}/features`, payload);

    expect(
      (await post({ kind: 'pin', points: [[0.5, 0.5]], entityId: theirs.id })).statusCode,
    ).toBe(404);
    expect((await post({ kind: 'pin', points: [[0.5, 0.5]], linkMapId: mapB.id })).statusCode).toBe(
      404,
    );
    // Another world's map is not a valid parent either.
    expect((await a.api.patch(`${a.w}/maps/${mapA.id}`, { parentId: mapB.id })).statusCode).toBe(
      404,
    );
  });
});

describe('atlas search and export', () => {
  it('finds maps by name and map items by label', async () => {
    const { api, w, makeMap, feature } = await setup();
    const map = await makeMap('Western Marches');
    await feature(map.id, { kind: 'label', label: 'Marchfield', points: [[0.2, 0.2]] });
    await feature(map.id, {
      kind: 'path',
      label: 'Salt Road',
      points: [
        [0.1, 0.1],
        [0.9, 0.9],
      ],
    });
    await feature(map.id, { kind: 'pin', points: [[0.5, 0.5]] }); // unlabelled

    const search = async (q: string) =>
      (await api.get(`${w}/atlas/search?q=${encodeURIComponent(q)}`)).json<AtlasSearchResult[]>();
    // Results that start with the query come first.
    const march = await search('march');
    expect(march.map((r) => r.label)).toEqual(['Marchfield', 'Western Marches']);
    expect(march[0]).toMatchObject({ kind: 'label', mapName: 'Western Marches', mapId: map.id });
    expect(march[1]).toMatchObject({ kind: 'map', mapId: map.id, featureId: null });
    expect((await search('salt'))[0]).toMatchObject({ kind: 'path', mapId: map.id });
    // Wildcards in the query are plain text.
    expect(await search('%')).toEqual([]);
    expect((await api.get(`${w}/atlas/search?q=`)).statusCode).toBe(400);
  });

  it('includes maps and their features in the world export', async () => {
    const { api, w, makeMap, feature } = await setup();
    const map = await makeMap('World');
    const pin = await feature(map.id, { kind: 'pin', label: 'Home', points: [[0.5, 0.5]] });
    const exported = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(exported.atlas.maps.map((m) => m.id)).toEqual([map.id]);
    expect(exported.atlas.features.map((f) => f.id)).toEqual([pin.id]);
  });
});

describe('atlas isolation', () => {
  it("hides one user's maps, tiles and features from another user", async () => {
    const owner = await setup();
    const map = await owner.makeMap('Private');
    const pin = await owner.feature(map.id, { kind: 'pin', points: [[0.5, 0.5]] });
    const intruder = await signUp(app);
    const { w } = owner;

    const reads = [
      `${w}/maps`,
      `${w}/maps/${map.id}`,
      `${w}/maps/${map.id}/tiles/0/0/0`,
      `${w}/maps/${map.id}/thumbnail`,
      `${w}/maps/${map.id}/features`,
      `${w}/atlas/search?q=private`,
    ];
    for (const url of reads) {
      expect((await intruder.api.get(url)).statusCode, url).toBe(404);
    }
    expect((await intruder.api.patch(`${w}/maps/${map.id}`, { name: 'Hacked' })).statusCode).toBe(
      404,
    );
    expect((await intruder.api.delete(`${w}/maps/${map.id}`)).statusCode).toBe(404);
    expect((await intruder.api.delete(`${w}/maps/${map.id}/features/${pin.id}`)).statusCode).toBe(
      404,
    );
    const upload = await owner.upload(
      { name: 'Intruder map' },
      { name: 'm.png', type: 'image/png', data: await png(50, 50) },
      intruder.cookie,
    );
    expect(upload.statusCode).toBe(404);

    // Tiles also need a session.
    const anonymous = await app.inject({
      method: 'GET',
      url: `/api${w}/maps/${map.id}/tiles/0/0/0`,
    });
    expect(anonymous.statusCode).toBe(401);

    // Another world's map ID under your own world is just as unreachable.
    const mine = await setup();
    expect((await mine.api.get(`${mine.w}/maps/${map.id}`)).statusCode).toBe(404);
    expect((await mine.api.get(`${mine.w}/maps/${map.id}/tiles/0/0/0`)).statusCode).toBe(404);
    expect((await owner.api.get(`${w}/maps/${map.id}`)).json<AtlasMap>().name).toBe('Private');
  });
});
