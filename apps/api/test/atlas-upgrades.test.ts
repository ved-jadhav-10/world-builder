import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  mapMaxZoom,
  type AtlasMap,
  type MapFeature,
  type MapLayer,
  type WorldExport,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { maps } from '../src/db/schema';
import { tilingIdle } from '../src/modules/atlas/tiling';
import { joinWorld, multipartForm, signUpWithWorld, type TestApp } from './helpers';

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
  const player = await joinWorld(app, ctx.world.id, 'player');
  const coGm = await joinWorld(app, ctx.world.id, 'editor');

  const post = (url: string, fields: Record<string, string>, data: Buffer, as = cookie) => {
    const form = multipartForm(fields, { name: 'map.png', type: 'image/png', data });
    return app.inject({
      method: 'POST',
      url: `/api${url}`,
      headers: { cookie: as, ...form.headers },
      payload: form.payload,
    });
  };
  const makeMap = async (name: string, width = 600, height = 400) => {
    const res = await post(`${w}/maps`, { name }, await png(width, height));
    expect(res.statusCode, res.body).toBe(201);
    await tilingIdle();
    return (await api.get(`${w}/maps/${res.json<AtlasMap>().id}`)).json<AtlasMap>();
  };
  const replaceImage = (mapId: string, data: Buffer, as = cookie) =>
    post(`${w}/maps/${mapId}/image`, {}, data, as);
  const feature = async (mapId: string, payload: object = {}) => {
    const res = await api.post(`${w}/maps/${mapId}/features`, {
      kind: 'pin',
      points: [[0.5, 0.5]],
      ...payload,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<MapFeature>();
  };
  const layer = async (mapId: string, name: string, extra: object = {}) => {
    const res = await api.post(`${w}/maps/${mapId}/layers`, { name, ...extra });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<MapLayer>();
  };
  return { ...ctx, player, coGm, makeMap, replaceImage, feature, layer, post };
}

describe('map scale', () => {
  it('starts without a scale and can set, change and clear one', async () => {
    const { api, w, makeMap } = await setup();
    const map = await makeMap('Aerth');
    expect(map.scale).toBeNull();
    expect(map.imageVersion).toBe(1);

    const scale = {
      width: 900,
      unit: 'mi',
      modes: [
        { name: 'On foot', perDay: 24 },
        { name: 'Ship', perDay: 100 },
      ],
    };
    const set = await api.patch(`${w}/maps/${map.id}`, { scale });
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json<AtlasMap>().scale).toEqual(scale);
    expect((await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>().scale).toEqual(scale);

    // Other edits leave the scale alone.
    const renamed = await api.patch(`${w}/maps/${map.id}`, { name: 'Aerth, drawn' });
    expect(renamed.json<AtlasMap>().scale).toEqual(scale);

    const cleared = await api.patch(`${w}/maps/${map.id}`, { scale: null });
    expect(cleared.json<AtlasMap>().scale).toBeNull();
  });

  it('refuses scales that make no sense', async () => {
    const { api, w, makeMap } = await setup();
    const map = await makeMap('Aerth');
    const bad = [
      { width: 0, unit: 'mi', modes: [] },
      { width: -5, unit: 'mi', modes: [] },
      { width: 100, unit: '', modes: [] },
      { width: 100, unit: 'a very long unit name', modes: [] },
      { width: 100, unit: 'mi', modes: [{ name: 'Walk', perDay: 0 }] },
      { width: 100, unit: 'mi', modes: [{ name: '', perDay: 10 }] },
      {
        width: 100,
        unit: 'mi',
        modes: Array.from({ length: 9 }, (_, i) => ({ name: `m${i}`, perDay: 1 })),
      },
    ];
    for (const scale of bad) {
      expect(
        (await api.patch(`${w}/maps/${map.id}`, { scale })).statusCode,
        JSON.stringify(scale),
      ).toBe(400);
    }
  });

  it('is the GM’s to change; players read it with the map', async () => {
    const { api, w, player, makeMap } = await setup();
    const map = await makeMap('Aerth');
    const scale = { width: 500, unit: 'km', modes: [] };
    await api.patch(`${w}/maps/${map.id}`, { scale, visibility: 'player' });
    expect((await player.api.patch(`${w}/maps/${map.id}`, { scale: null })).statusCode).toBe(403);
    expect((await player.api.get(`${w}/maps/${map.id}`)).json<AtlasMap>().scale).toEqual(scale);
  });
});

describe('replacing a map’s image', () => {
  it('re-tiles at the new size, keeps the pins and bumps the version', async () => {
    const { api, w, makeMap, replaceImage, feature } = await setup();
    const map = await makeMap('Aerth', 600, 400);
    const pin = await feature(map.id, { label: 'Port' });

    const res = await replaceImage(map.id, await png(2400, 1600));
    expect(res.statusCode, res.body).toBe(200);
    const swapped = res.json<AtlasMap>();
    expect(swapped).toMatchObject({ id: map.id, width: 2400, height: 1600, imageVersion: 2 });
    expect(swapped.status).toBe('processing');

    await tilingIdle();
    const done = (await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>();
    expect(done.status).toBe('ready');
    // The deepest tile level now matches the bigger image.
    const deepest = mapMaxZoom(2400, 1600);
    expect(deepest).toBeGreaterThan(mapMaxZoom(600, 400));
    expect((await api.get(`${w}/maps/${map.id}/tiles/${deepest}/0/0`)).statusCode).toBe(200);

    const kept = (await api.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>();
    expect(kept.map((f) => f.id)).toEqual([pin.id]);
    expect(kept[0]!.points).toEqual([[0.5, 0.5]]);
  });

  it('can be done again, and fixes a map whose tiling failed', async () => {
    const { api, w, makeMap, replaceImage } = await setup();
    const map = await makeMap('Aerth');
    await db.update(maps).set({ status: 'failed', error: 'boom' }).where(eq(maps.id, map.id));
    const res = await replaceImage(map.id, await png(700, 500));
    expect(res.statusCode, res.body).toBe(200);
    await tilingIdle();
    const done = (await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>();
    expect(done).toMatchObject({ status: 'ready', error: '', imageVersion: 2, width: 700 });
    expect((await replaceImage(map.id, await png(300, 300))).statusCode).toBe(200);
    await tilingIdle();
    expect((await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>().imageVersion).toBe(3);
  });

  it('refuses while the map is still being prepared', async () => {
    const { makeMap, replaceImage } = await setup();
    const map = await makeMap('Aerth');
    await db.update(maps).set({ status: 'processing' }).where(eq(maps.id, map.id));
    const res = await replaceImage(map.id, await png(300, 300));
    expect(res.statusCode).toBe(409);
    await db.update(maps).set({ status: 'ready' }).where(eq(maps.id, map.id));
  });

  it('leaves the map untouched when the file is not an image', async () => {
    const { api, w, makeMap, post } = await setup();
    const map = await makeMap('Aerth', 600, 400);
    const res = await post(`${w}/maps/${map.id}/image`, {}, Buffer.from('not an image at all'));
    expect(res.statusCode).toBe(400);
    const after = (await api.get(`${w}/maps/${map.id}`)).json<AtlasMap>();
    expect(after).toMatchObject({ status: 'ready', width: 600, imageVersion: 1 });
    expect((await api.get(`${w}/maps/${map.id}/tiles/0/0/0`)).statusCode).toBe(200);
  });

  it('is for editors of that world only', async () => {
    const { w, player, makeMap, replaceImage } = await setup();
    const map = await makeMap('Aerth');
    expect((await replaceImage(map.id, await png(100, 100), player.cookie)).statusCode).toBe(403);
    const other = await signUpWithWorld(app, 'Elsewhere');
    expect((await replaceImage(map.id, await png(100, 100), other.cookie)).statusCode).toBe(404);
    expect(w).toBeTruthy();
  });
});

describe('map layers', () => {
  it('creates, orders, renames and deletes layers', async () => {
    const { api, w, makeMap, layer } = await setup();
    const map = await makeMap('Aerth');
    const politics = await layer(map.id, 'Political');
    const roads = await layer(map.id, 'Trade routes', { visibleByDefault: false });
    expect(politics.sortOrder).toBe(0);
    expect(roads).toMatchObject({ sortOrder: 1, visibleByDefault: false });

    const list = (await api.get(`${w}/maps/${map.id}/layers`)).json<MapLayer[]>();
    expect(list.map((l) => l.name)).toEqual(['Political', 'Trade routes']);

    const moved = await api.patch(`${w}/maps/${map.id}/layers/${roads.id}`, {
      name: 'Roads',
      sortOrder: 0,
      visibleByDefault: true,
    });
    expect(moved.json<MapLayer>()).toMatchObject({
      name: 'Roads',
      sortOrder: 0,
      visibleByDefault: true,
    });

    expect((await api.delete(`${w}/maps/${map.id}/layers/${politics.id}`)).statusCode).toBe(204);
    const after = (await api.get(`${w}/maps/${map.id}/layers`)).json<MapLayer[]>();
    expect(after.map((l) => l.name)).toEqual(['Roads']);
    expect((await api.delete(`${w}/maps/${map.id}/layers/${politics.id}`)).statusCode).toBe(404);
  });

  it('refuses empty names and caps the number of layers', async () => {
    const { api, w, makeMap, layer } = await setup();
    const map = await makeMap('Aerth');
    expect((await api.post(`${w}/maps/${map.id}/layers`, { name: '  ' })).statusCode).toBe(400);
    for (let i = 0; i < 20; i++) await layer(map.id, `Layer ${i}`);
    expect(
      (await api.post(`${w}/maps/${map.id}/layers`, { name: 'One too many' })).statusCode,
    ).toBe(400);
  });

  it('puts features on a layer, and back on the base map when the layer is deleted', async () => {
    const { api, w, makeMap, layer, feature } = await setup();
    const map = await makeMap('Aerth');
    const borders = await layer(map.id, 'Borders');
    const pin = await feature(map.id, { label: 'Capital', layerId: borders.id });
    expect(pin.layerId).toBe(borders.id);

    const moved = await api.patch(`${w}/maps/${map.id}/features/${pin.id}`, { layerId: null });
    expect(moved.json<MapFeature>().layerId).toBeNull();
    await api.patch(`${w}/maps/${map.id}/features/${pin.id}`, { layerId: borders.id });

    await api.delete(`${w}/maps/${map.id}/layers/${borders.id}`);
    const kept = (await api.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>();
    expect(kept).toHaveLength(1);
    expect(kept[0]!.layerId).toBeNull();
  });

  it('only accepts a layer that belongs to the same map', async () => {
    const { api, w, makeMap, layer, feature } = await setup();
    const a = await makeMap('A');
    const b = await makeMap('B');
    const onB = await layer(b.id, 'Elsewhere');
    const res = await api.post(`${w}/maps/${a.id}/features`, {
      kind: 'pin',
      points: [[0.1, 0.1]],
      layerId: onB.id,
    });
    expect(res.statusCode).toBe(404);
    const pin = await feature(a.id);
    expect(
      (await api.patch(`${w}/maps/${a.id}/features/${pin.id}`, { layerId: onB.id })).statusCode,
    ).toBe(404);
    // And a layer of another world is no better.
    const other = await signUpWithWorld(app, 'Elsewhere');
    const otherMap = (await other.api.get(`${other.w}/maps`)).json<AtlasMap[]>();
    expect(otherMap).toEqual([]);
    expect((await other.api.get(`${other.w}/maps/${a.id}/layers`)).statusCode).toBe(404);
  });

  it('shows other audiences only layers with something they can see', async () => {
    const { api, w, player, coGm, makeMap, layer, feature } = await setup();
    const map = await makeMap('Aerth');
    await api.patch(`${w}/maps/${map.id}`, { visibility: 'player' });
    const open = await layer(map.id, 'Known roads');
    const secret = await layer(map.id, 'Smugglers’ cove');
    await layer(map.id, 'Empty');
    await feature(map.id, { label: 'Road', layerId: open.id, visibility: 'player' });
    await feature(map.id, { label: 'Cove', layerId: secret.id, visibility: 'gm' });

    const seen = (await player.api.get(`${w}/maps/${map.id}/layers`)).json<MapLayer[]>();
    expect(seen.map((l) => l.name)).toEqual(['Known roads']);
    expect((await api.get(`${w}/maps/${map.id}/layers`)).json<MapLayer[]>()).toHaveLength(3);
    expect((await coGm.api.get(`${w}/maps/${map.id}/layers`)).json<MapLayer[]>()).toHaveLength(3);

    expect((await player.api.post(`${w}/maps/${map.id}/layers`, { name: 'Mine' })).statusCode).toBe(
      403,
    );
    expect(
      (await player.api.patch(`${w}/maps/${map.id}/layers/${open.id}`, { name: 'Mine' }))
        .statusCode,
    ).toBe(403);
    expect((await player.api.delete(`${w}/maps/${map.id}/layers/${open.id}`)).statusCode).toBe(403);
  });

  it('goes into the world export', async () => {
    const { api, w, makeMap, layer } = await setup();
    const map = await makeMap('Aerth');
    await layer(map.id, 'Borders');
    const data = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(data.atlas.layers.map((l) => l.name)).toEqual(['Borders']);
  });
});

describe('GM prep notes on map items', () => {
  it('are sent to the GM and co-GMs and never to players', async () => {
    const { api, w, player, coGm, makeMap, feature } = await setup();
    const map = await makeMap('Aerth');
    await api.patch(`${w}/maps/${map.id}`, { visibility: 'player' });
    const pin = await feature(map.id, {
      label: 'Old mill',
      notes: 'A ruined mill by the river.',
      gmNotes: 'The cult meets here. Trap on the cellar door.',
      visibility: 'player',
    });
    expect(pin.gmNotes).toBe('The cult meets here. Trap on the cellar door.');

    const listed = (await player.api.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      label: 'Old mill',
      notes: 'A ruined mill by the river.',
      gmNotes: '',
    });
    expect(JSON.stringify(listed)).not.toContain('cult');

    const mine = (await coGm.api.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>();
    expect(mine[0]!.gmNotes).toContain('cult');
  });

  it('can be edited, and a preview as a player hides them', async () => {
    const { api, w, makeMap, feature, cookie } = await setup();
    const map = await makeMap('Aerth');
    const pin = await feature(map.id, { label: 'Old mill', visibility: 'player' });
    await api.patch(`${w}/maps/${map.id}`, { visibility: 'player' });
    const patched = await api.patch(`${w}/maps/${map.id}/features/${pin.id}`, {
      gmNotes: 'Secret door.',
    });
    expect(patched.json<MapFeature>().gmNotes).toBe('Secret door.');

    const { apiClient } = await import('./helpers');
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    const seen = (await preview.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>();
    expect(seen[0]!.gmNotes).toBe('');
    expect((await api.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>()[0]!.gmNotes).toBe(
      'Secret door.',
    );
  });

  it('are limited in length', async () => {
    const { api, w, makeMap } = await setup();
    const map = await makeMap('Aerth');
    const res = await api.post(`${w}/maps/${map.id}/features`, {
      kind: 'pin',
      points: [[0.1, 0.1]],
      gmNotes: 'x'.repeat(5001),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('journeys, annotations and time-aware features', () => {
  it('keeps a journey’s stop dates, and moves them with added and removed stops', async () => {
    const { api, w, makeMap, feature } = await setup();
    const map = await makeMap('World');
    const trip = await feature(map.id, {
      kind: 'journey',
      points: [
        [0.1, 0.1],
        [0.3, 0.1],
        [0.5, 0.4],
      ],
      pointDays: [10, null, 40],
      label: 'The long march',
    });
    expect(trip.pointDays).toEqual([10, null, 40]);

    const added = await api.patch(`${w}/maps/${map.id}/features/${trip.id}`, {
      points: [
        [0.1, 0.1],
        [0.2, 0.15],
        [0.3, 0.1],
        [0.5, 0.4],
      ],
    });
    expect(added.json<MapFeature>().pointDays).toEqual([10, null, null, 40]);

    const dated = await api.patch(`${w}/maps/${map.id}/features/${trip.id}`, {
      pointDays: [10, 15, null, 40],
    });
    expect(dated.json<MapFeature>().pointDays).toEqual([10, 15, null, 40]);
    const wrongLength = await api.patch(`${w}/maps/${map.id}/features/${trip.id}`, {
      pointDays: [10, 15],
    });
    expect(wrongLength.statusCode).toBe(400);
  });

  it('refuses dated stops on anything but a journey, or the wrong number of them', async () => {
    const { api, w, makeMap } = await setup();
    const map = await makeMap('World');
    const post = (payload: object) => api.post(`${w}/maps/${map.id}/features`, payload);
    const path = [
      [0.1, 0.1],
      [0.5, 0.5],
    ];
    expect((await post({ kind: 'path', points: path, pointDays: [1, 2] })).statusCode).toBe(400);
    expect((await post({ kind: 'journey', points: path, pointDays: [1] })).statusCode).toBe(400);
    expect((await post({ kind: 'journey', points: [[0.5, 0.5]] })).statusCode).toBe(400);
  });

  it('draws arrows and circles with exactly two points', async () => {
    const { api, w, makeMap, feature } = await setup();
    const map = await makeMap('World');
    const two = [
      [0.2, 0.2],
      [0.4, 0.4],
    ];
    expect((await feature(map.id, { kind: 'arrow', points: two })).kind).toBe('arrow');
    expect((await feature(map.id, { kind: 'circle', points: two })).kind).toBe('circle');
    const three = [...two, [0.6, 0.6]];
    expect(
      (await api.post(`${w}/maps/${map.id}/features`, { kind: 'arrow', points: three })).statusCode,
    ).toBe(400);
    expect(
      (await api.post(`${w}/maps/${map.id}/features`, { kind: 'circle', points: [[0.5, 0.5]] }))
        .statusCode,
    ).toBe(400);
  });

  it('lists only the features that hold on the day asked about, for everyone', async () => {
    const { api, w, makeMap, feature, player } = await setup();
    const map = await makeMap('World');
    await api.patch(`${w}/maps/${map.id}`, { visibility: 'player' });
    const open = { visibility: 'player' };
    const always = await feature(map.id, { label: 'Always', ...open });
    const early = await feature(map.id, { label: 'Early', validToDay: 99, ...open });
    const late = await feature(map.id, { label: 'Late', validFromDay: 100, ...open });
    const window = await feature(map.id, {
      label: 'Window',
      validFromDay: 50,
      validToDay: 150,
      ...open,
    });
    const ids = async (client: typeof api, query = '') =>
      (await client.get(`${w}/maps/${map.id}/features${query}`))
        .json<MapFeature[]>()
        .map((f) => f.id)
        .sort();
    const sorted = (...list: MapFeature[]) => list.map((f) => f.id).sort();
    expect(await ids(api)).toEqual(sorted(always, early, late, window));
    expect(await ids(api, '?asOf=10')).toEqual(sorted(always, early));
    expect(await ids(api, '?asOf=99')).toEqual(sorted(always, early, window));
    expect(await ids(api, '?asOf=100')).toEqual(sorted(always, late, window));
    expect(await ids(player.api, '?asOf=200')).toEqual(sorted(always, late));

    const bad = await api.patch(`${w}/maps/${map.id}/features/${window.id}`, {
      validFromDay: 200,
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('node maps and importers', () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#264"/><circle cx="50" cy="50" r="20" fill="#fc0"/></svg>',
  );

  it('makes a blank canvas map in a chosen shape and colour, ready to tile', async () => {
    const { api, w } = await setup();
    const res = await api.post(`${w}/maps/blank`, { name: 'Pointcrawl', shape: 'wide' });
    expect(res.statusCode, res.body).toBe(201);
    const created = res.json<AtlasMap>();
    await tilingIdle();
    const map = (await api.get(`${w}/maps/${created.id}`)).json<AtlasMap>();
    expect(map).toMatchObject({ name: 'Pointcrawl', width: 2560, height: 1600, status: 'ready' });
    const tile = await api.get(`${w}/maps/${map.id}/tiles/0/0/0`);
    expect(tile.statusCode).toBe(200);
    expect(
      (await api.post(`${w}/maps/blank`, { name: 'Bad', background: 'not-a-colour' })).statusCode,
    ).toBe(400);
  });

  it('draws an uploaded SVG into a picture, for map generators that export SVG', async () => {
    const { w, post, api } = await setup();
    const res = await post(`${w}/maps`, { name: 'Generated' }, svg);
    expect(res.statusCode, res.body).toBe(201);
    await tilingIdle();
    const map = (await api.get(`${w}/maps/${res.json<AtlasMap>().id}`)).json<AtlasMap>();
    expect(map.status).toBe('ready');
    // A 2:1 drawing keeps its shape when drawn large.
    expect(Math.abs(map.width - map.height * 2)).toBeLessThanOrEqual(2);
    expect(map.width).toBeGreaterThan(1000);
    const bad = await post(`${w}/maps`, { name: 'Broken' }, Buffer.from('<svg>nope'));
    expect(bad.statusCode).toBe(400);
  });

  it('brings places, roads and areas in from GeoJSON, hidden until revealed', async () => {
    const { api, w, makeMap } = await setup();
    const map = await makeMap('Imported', 800, 800);
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Havenmouth' },
          geometry: { type: 'Point', coordinates: [10, 10] },
        },
        {
          type: 'Feature',
          properties: { name: 'Vael' },
          geometry: { type: 'Point', coordinates: [20, 30] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [10, 10],
              [20, 30],
            ],
          },
        },
        { type: 'Feature', properties: null, geometry: null },
      ],
    };
    const res = await api.post(`${w}/maps/${map.id}/import/geojson`, { geojson });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toEqual({ created: 3, skipped: 1 });
    const features = (await api.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>();
    expect(features.map((f) => [f.kind, f.label, f.visibility]).sort()).toEqual([
      ['path', '', 'gm'],
      ['pin', 'Havenmouth', 'gm'],
      ['pin', 'Vael', 'gm'],
    ]);
    const empty = await api.post(`${w}/maps/${map.id}/import/geojson`, {
      geojson: { type: 'FeatureCollection', features: [] },
    });
    expect(empty.statusCode).toBe(400);
  });

  it('keeps importing and blank maps to editors', async () => {
    const { w, player, makeMap } = await setup();
    const map = await makeMap('Closed');
    expect((await player.api.post(`${w}/maps/blank`, { name: 'x' })).statusCode).toBe(403);
    const geojson = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [1, 1] },
    };
    expect(
      (await player.api.post(`${w}/maps/${map.id}/import/geojson`, { geojson })).statusCode,
    ).toBe(403);
  });
});

describe('fog of war', () => {
  const square = [
    [0.1, 0.1],
    [0.5, 0.1],
    [0.5, 0.5],
    [0.1, 0.5],
  ];

  // WebP is lossy, so colours drift by a step or two.
  const expectNear = (actual: (number | undefined)[], expected: number[]) => {
    for (const [i, value] of expected.entries()) {
      expect(Math.abs((actual[i] ?? 0) - value)).toBeLessThanOrEqual(3);
    }
  };

  async function fogged() {
    const ctx = await setup();
    const { api, w, makeMap, feature } = ctx;
    const map = await makeMap('Wilds', 512, 512);
    await api.patch(`${w}/maps/${map.id}`, { visibility: 'player', fogEnabled: true });
    const seen = await feature(map.id, {
      label: 'Camp',
      points: [[0.3, 0.3]],
      visibility: 'player',
    });
    const unseen = await feature(map.id, {
      label: 'Dragon lair',
      points: [[0.8, 0.8]],
      visibility: 'player',
    });
    await feature(map.id, { kind: 'reveal', points: square, label: 'Start' });
    return { ...ctx, map, seen, unseen };
  }

  it('only sends players items inside revealed areas, and never the areas themselves', async () => {
    const { api, w, map, player, seen } = await fogged();
    const names = async (client: typeof api) =>
      (await client.get(`${w}/maps/${map.id}/features`)).json<MapFeature[]>().map((f) => f.label);
    expect((await names(api)).sort()).toEqual(['Camp', 'Dragon lair', 'Start']);
    expect(await names(player.api)).toEqual(['Camp']);

    const lists = (await player.api.get(`${w}/maps`)).json<AtlasMap[]>();
    expect(lists.find((m) => m.id === map.id)).toMatchObject({ fogEnabled: true, featureCount: 1 });
    // The Dragon lair does not turn up in search either.
    const found = await player.api.get(`${w}/atlas/search?q=dragon`);
    expect(found.json<unknown[]>()).toHaveLength(0);
    expect((await player.api.get(`${w}/atlas/search?q=camp`)).json<unknown[]>()).toHaveLength(1);
    expect(seen.id).toBeTruthy();
  });

  it('uncovers more as the GM reveals more', async () => {
    const { api, w, map, player, feature } = await fogged();
    await feature(map.id, {
      kind: 'reveal',
      points: [
        [0.6, 0.6],
        [0.95, 0.6],
        [0.95, 0.95],
        [0.6, 0.95],
      ],
    });
    const names = (await player.api.get(`${w}/maps/${map.id}/features`))
      .json<MapFeature[]>()
      .map((f) => f.label)
      .sort();
    expect(names).toEqual(['Camp', 'Dragon lair']);
    expect(api).toBeTruthy();
  });

  it('paints fog over unrevealed tiles for players but not for the GM', async () => {
    const { api, w, map, player } = await fogged();
    const pixel = async (res: { rawPayload: Buffer }, x: number, y: number) => {
      const { data, info } = await sharp(res.rawPayload)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // The 512 px map is two tiles across at its deepest zoom; the picture is green (#3a7a5a).
    const gm = await api.get(`${w}/maps/${map.id}/tiles/1/1/1`);
    const fog = await player.api.get(`${w}/maps/${map.id}/tiles/1/1/1`);
    expect(gm.statusCode).toBe(200);
    expectNear(await pixel(gm, 128, 128), [0x3a, 0x7a, 0x5a]);
    // Tile (1,1) lies wholly outside the revealed square (0.1 to 0.5 of the map).
    expectNear(await pixel(fog, 128, 128), [0x0f, 0x17, 0x2a]);
    expect(fog.headers['cache-control']).toContain('no-cache');
    // Tile (0,0) holds the revealed square: its middle shows the picture.
    const open = await player.api.get(`${w}/maps/${map.id}/tiles/1/0/0`);
    expectNear(await pixel(open, 100, 100), [0x3a, 0x7a, 0x5a]);
    expectNear(await pixel(open, 20, 20), [0x0f, 0x17, 0x2a]);
    // Tiles for the GM are cached for good as before.
    expect(gm.headers['cache-control']).toContain('immutable');
  });

  it('gives players a plain thumbnail, and turns off cleanly', async () => {
    const { api, w, map, player } = await fogged();
    const thumb = await player.api.get(`${w}/maps/${map.id}/thumbnail`);
    const gmThumb = await api.get(`${w}/maps/${map.id}/thumbnail`);
    expect(thumb.statusCode).toBe(200);
    expect(thumb.rawPayload.equals(gmThumb.rawPayload)).toBe(false);
    await api.patch(`${w}/maps/${map.id}`, { fogEnabled: false });
    const names = (await player.api.get(`${w}/maps/${map.id}/features`))
      .json<MapFeature[]>()
      .map((f) => f.label)
      .sort();
    expect(names).toEqual(['Camp', 'Dragon lair']);
  });

  it('keeps an area drawn on one map from revealing another', async () => {
    const { api, w, player, makeMap, feature } = await fogged();
    const other = await makeMap('Other', 512, 512);
    await api.patch(`${w}/maps/${other.id}`, { visibility: 'player', fogEnabled: true });
    await feature(other.id, { label: 'Elsewhere', points: [[0.3, 0.3]], visibility: 'player' });
    expect(
      (await player.api.get(`${w}/maps/${other.id}/features`)).json<MapFeature[]>(),
    ).toHaveLength(0);
  });
});
