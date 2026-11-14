import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AtlasMap,
  BoardSummary,
  EntityType,
  ManuscriptNode,
  MapFeature,
  RollTable,
  Todo,
  WikiHome,
  World,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { drawSampleMap } from '../src/db/sample-map';
import { tilingIdle } from '../src/modules/atlas/tiling';
import { signUp, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  // The sample's chart is cut into tiles in the background; let that finish before closing.
  await tilingIdle();
  await app.close();
});

describe('the sample world', () => {
  it('draws the same chart every time, with every place on it', () => {
    const first = drawSampleMap();
    expect(drawSampleMap().svg).toBe(first.svg);
    expect(first.svg.startsWith('<svg')).toBe(true);
    for (const [x, y] of [...Object.values(first.places), ...first.road, ...first.seaLane]) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(1);
    }
  });

  it('fills a new world when asked, and leaves a blank one empty', async () => {
    const user = await signUp(app);
    const blank = await user.api.post('/worlds', { name: 'Empty' });
    expect(blank.statusCode, blank.body).toBe(201);
    const counts = (await user.api.get(`/worlds/${blank.json<World>().id}/entity-types`)).json<
      EntityType[]
    >();
    expect(counts.reduce((sum, type) => sum + type.entityCount, 0)).toBe(0);

    const created = await user.api.post('/worlds', { name: 'Aerth', template: 'sample' });
    expect(created.statusCode, created.body).toBe(201);
    const world = created.json<World>();
    const w = `/worlds/${world.id}`;
    expect(world.description).toContain('archipelago');

    const types = (await user.api.get(`${w}/entity-types`)).json<EntityType[]>();
    const count = (key: string) => types.find((type) => type.key === key)!.entityCount;
    expect(count('character')).toBe(4);
    expect(count('location')).toBe(5);
    expect(count('quest')).toBe(2);
    expect(count('session')).toBe(1);

    const nodes = (await user.api.get(`${w}/manuscript`)).json<ManuscriptNode[]>();
    expect(nodes.filter((node) => node.kind === 'chapter')).toHaveLength(3);
    expect(nodes.filter((node) => node.kind === 'scene')).toHaveLength(4);
    // Names in the scenes were picked up as mentions, so the words were counted too.
    expect(nodes.find((node) => node.kind === 'book')!.wordCount).toBeGreaterThan(80);

    const maps = (await user.api.get(`${w}/maps`)).json<AtlasMap[]>();
    expect(maps).toHaveLength(1);
    const features = (await user.api.get(`${w}/maps/${maps[0]!.id}/features`)).json<MapFeature[]>();
    expect(features.map((feature) => feature.kind).sort()).toEqual([
      'journey',
      'label',
      'path',
      'pin',
      'pin',
      'pin',
      'pin',
      'pin',
    ]);
    await tilingIdle();
    const ready = (await user.api.get(`${w}/maps/${maps[0]!.id}`)).json<AtlasMap>();
    expect(ready.status).toBe('ready');

    expect((await user.api.get(`${w}/tables`)).json<RollTable[]>()).toHaveLength(1);
    expect((await user.api.get(`${w}/todos`)).json<Todo[]>()).toHaveLength(3);
    const boards = (await user.api.get(`${w}/boards`)).json<BoardSummary[]>();
    expect(boards).toMatchObject([{ name: 'The compass affair', itemCount: 11 }]);

    // The sample is also a worked example of the reader wiki.
    await user.api.patch(`${w}/wiki-settings`, { enabled: true });
    const read = async (chapter: string) =>
      (
        await app.inject({ method: 'GET', url: `/api/wiki/${world.slug}?chapter=${chapter}` })
      ).json<WikiHome>();
    const chapters = (await read('start')).chapters;
    expect(chapters).toHaveLength(3);
    const names = async (chapter: string) =>
      (await read(chapter)).entries.map((entry) => entry.name);
    expect(await names('start')).toContain('Mira Vey');
    expect(await names('start')).not.toContain('The Drowned King');
    expect(await names('start')).not.toContain('The Salt Prince');
    expect(await names(chapters[1]!.id)).toContain('Pilot-Captain Vey');
    expect(await names(chapters[1]!.id)).not.toContain('The Drowned King');
    expect(await names('end')).toContain('The Drowned King');
  });
});
