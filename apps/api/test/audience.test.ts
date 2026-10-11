import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AtlasMap,
  AtlasSearchResult,
  Entity,
  EntityMapLink,
  EntityRelationship,
  EntitySummary,
  EntityType,
  GalleryImage,
  ManuscriptNode,
  MapFeature,
  Page,
  Progression,
  QuestSummary,
  RelationshipType,
  SearchResult,
  Tag,
  TimelineData,
  Visibility,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { tilingIdle } from '../src/modules/atlas/tiling';
import {
  apiClient,
  joinWorld,
  multipartForm,
  signUp,
  signUpWithWorld,
  type TestApp,
} from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const png = (width = 400, height = 300) =>
  sharp({ create: { width, height, channels: 3, background: '#446688' } })
    .png()
    .toBuffer();

/**
 * One world with something at every visibility, then the same world read as the GM, a real
 * player, a real reader, a GM previewing each audience, and a stranger.
 */
async function build() {
  const gm = await signUpWithWorld(app);
  const { api, w, cookie, world } = gm;

  const entity = async (type: string, name: string, visibility: Visibility, extra: object = {}) => {
    const res = await api.post(`${w}/entities`, {
      typeId: gm.typeId(type),
      name,
      visibility,
      ...extra,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Entity>();
  };
  const king = await entity('character', 'Public King', 'public', { startDay: 100 });
  const ally = await entity('character', 'Player Ally', 'player', { startDay: 300 });
  const lore = await entity('lore_article', 'Reader Lore', 'reader');
  const secret = await entity('character', 'GM Secret', 'gm', { startDay: 200 });
  const hidden = await entity('location', 'Hidden Vault', 'hidden');

  const relTypes = (await api.get(`${w}/relationship-types`)).json<RelationshipType[]>();
  const allyOf = relTypes.find((t) => t.key === 'ally_of')!;
  for (const other of [secret, ally]) {
    await api.post(`${w}/relationships`, {
      sourceId: king.id,
      targetId: other.id,
      typeId: allyOf.id,
    });
  }

  const tag = async (name: string, entityId: string) => {
    const created = (await api.post(`${w}/tags`, { name, color: '#445566' })).json<Tag>();
    await api.put(`${w}/entities/${entityId}/tags/${created.id}`);
  };
  await tag('Open', king.id);
  await tag('Spoiler', secret.id);

  const node = async (kind: string, title: string, parentId: string | null = null) =>
    (await api.post(`${w}/manuscript/nodes`, { kind, title, parentId })).json<ManuscriptNode>();
  const book = await node('book', 'B');
  const chapter = await node('chapter', 'C', book.id);
  const scene = await node('scene', 'The secret scene', chapter.id);
  await api.patch(`${w}/manuscript/nodes/${scene.id}`, { inWorldDay: 150 });
  await api.put(`${w}/manuscript/scenes/${scene.id}/body`, {
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'GM Secret arrived.' }] }],
    },
  });

  // Maps: a hidden parent, a map for players inside it, a public one and one for readers.
  const upload = async (
    name: string,
    visibility: Visibility,
    parentId?: string,
    entityId?: string,
  ) => {
    const form = multipartForm(
      { name, visibility, ...(parentId ? { parentId } : {}), ...(entityId ? { entityId } : {}) },
      { name: 'm.png', type: 'image/png', data: await png() },
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api${w}/maps`,
      headers: { cookie, ...form.headers },
      payload: form.payload,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<AtlasMap>();
  };
  const vault = await upload('Vault Map', 'gm');
  const realm = await upload('Realm Map', 'player', vault.id, king.id);
  const town = await upload('Town Map', 'public');
  const readerMap = await upload('Reader Map', 'reader');
  await tilingIdle();

  const pin = async (mapId: string, body: object) => {
    const res = await api.post(`${w}/maps/${mapId}/features`, {
      kind: 'pin',
      points: [[0.5, 0.5]],
      ...body,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<MapFeature>();
  };
  await pin(realm.id, { label: 'Open pin', visibility: 'player' });
  await pin(realm.id, { label: 'Pin for the king', visibility: 'player', entityId: king.id });
  await pin(realm.id, { label: 'Pin for the secret', visibility: 'player', entityId: secret.id });
  await pin(realm.id, { label: 'GM only pin', visibility: 'gm' });
  await pin(realm.id, { label: 'Door to the vault', visibility: 'player', linkMapId: vault.id });

  const progress = async (entityId: string, payload: object) => {
    const res = await api.post(`${w}/entities/${entityId}/progressions`, payload);
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Progression>();
  };
  await progress(king.id, { title: 'Crowned', day: 50, visibility: 'player' });
  await progress(king.id, { title: 'Secretly cursed', day: 60 });
  await progress(king.id, { title: 'In the scene', sceneId: scene.id, visibility: 'player' });

  const addImage = async (fields: Record<string, string>) => {
    const form = multipartForm(fields, {
      name: 'p.png',
      type: 'image/png',
      data: await png(200, 200),
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api${w}/images`,
      headers: { cookie, ...form.headers },
      payload: form.payload,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<GalleryImage>();
  };
  const images = {
    kingPortrait: await addImage({ entityId: king.id, visibility: 'player', caption: 'The king' }),
    secretPortrait: await addImage({ entityId: secret.id, visibility: 'player' }),
    worldPublic: await addImage({ visibility: 'public', caption: 'Handout' }),
    worldGm: await addImage({ visibility: 'gm' }),
  };

  const quest = async (name: string, visibility: Visibility, status: string) =>
    (
      await api.post(`${w}/entities`, {
        typeId: gm.typeId('quest'),
        name,
        visibility,
        fields: { status },
      })
    ).json<Entity>();
  const questA = await quest('Open quest', 'player', 'Ongoing');
  await quest('GM quest', 'gm', 'Not started');
  const givenBy = relTypes.find((t) => t.key === 'given_by')!;
  for (const giver of [king, secret]) {
    await api.post(`${w}/relationships`, {
      sourceId: questA.id,
      targetId: giver.id,
      typeId: givenBy.id,
    });
  }

  const playerMember = await joinWorld(app, world.id, 'player');
  const readerMember = await joinWorld(app, world.id, 'reader');
  const preview = (audience: string) => apiClient(app, cookie, { 'x-view-as': audience });
  const stranger = await signUp(app);

  return {
    gm,
    w,
    scene,
    vault,
    realm,
    town,
    readerMap,
    entities: { king, ally, lore, secret, hidden, questA },
    images,
    playerMember,
    player: playerMember.api,
    reader: readerMember.api,
    previewPlayer: preview('player'),
    previewReader: preview('reader'),
    previewPublic: preview('public'),
    stranger: stranger.api,
  };
}
type World = Awaited<ReturnType<typeof build>>;
type Client = World['player'];

const names = (items: { name: string }[]) => items.map((i) => i.name).sort();

describe('who sees which entries', () => {
  it('shows the GM everything, a player and a reader only their own', async () => {
    const t = await build();
    const list = async (api: Client) =>
      names((await api.get(`${t.w}/entities?limit=100`)).json<Page<EntitySummary>>().items);
    expect(await list(t.gm.api)).toEqual(
      [
        'GM Secret',
        'GM quest',
        'Hidden Vault',
        'Open quest',
        'Player Ally',
        'Public King',
        'Reader Lore',
      ].sort(),
    );
    // A real player and a GM previewing as a player see exactly the same thing.
    const forPlayers = ['Open quest', 'Player Ally', 'Public King'];
    expect(await list(t.player)).toEqual(forPlayers);
    expect(await list(t.previewPlayer)).toEqual(forPlayers);
    const forReaders = ['Public King', 'Reader Lore'];
    expect(await list(t.reader)).toEqual(forReaders);
    expect(await list(t.previewReader)).toEqual(forReaders);
    expect(await list(t.previewPublic)).toEqual(['Public King']);
  });

  it('answers 404 for an entry the audience cannot see, as if it did not exist', async () => {
    const t = await build();
    const { secret, hidden, lore, king, ally } = t.entities;
    for (const api of [t.player, t.previewPlayer]) {
      for (const e of [secret, hidden, lore]) {
        expect((await api.get(`${t.w}/entities/${e.id}`)).statusCode, e.name).toBe(404);
      }
      for (const e of [king, ally]) {
        expect((await api.get(`${t.w}/entities/${e.id}`)).statusCode, e.name).toBe(200);
      }
    }
    expect((await t.reader.get(`${t.w}/entities/${lore.id}`)).statusCode).toBe(200);
    expect((await t.reader.get(`${t.w}/entities/${ally.id}`)).statusCode).toBe(404);
  });

  it('finds only visible entries by search, and counts only those in the type list', async () => {
    const t = await build();
    for (const api of [t.player, t.previewPlayer]) {
      expect((await api.get(`${t.w}/search?q=secret`)).json<SearchResult[]>()).toEqual([]);
      const king = (await api.get(`${t.w}/search?q=king`)).json<SearchResult[]>();
      expect(king.map((r) => r.name)).toEqual(['Public King']);
      const types = (await api.get(`${t.w}/entity-types`)).json<EntityType[]>();
      expect(types.reduce((sum, type) => sum + type.entityCount, 0)).toBe(3);
    }
    const gmTypes = (await t.gm.api.get(`${t.w}/entity-types`)).json<EntityType[]>();
    expect(gmTypes.reduce((sum, type) => sum + type.entityCount, 0)).toBe(7);
  });

  it('leaves out links to hidden entries, and tags that only mark them', async () => {
    const t = await build();
    const { king, secret } = t.entities;
    const linked = async (api: Client) =>
      (await api.get(`${t.w}/entities/${king.id}/relationships`))
        .json<EntityRelationship[]>()
        .map((l) => l.other.name)
        .sort();
    expect(await linked(t.gm.api)).toEqual(['GM Secret', 'Open quest', 'Player Ally']);
    for (const api of [t.player, t.previewPlayer]) {
      expect(await linked(api)).toEqual(['Open quest', 'Player Ally']);
      expect((await api.get(`${t.w}/entities/${secret.id}/relationships`)).statusCode).toBe(404);
      const tags = (await api.get(`${t.w}/tags`)).json<Tag[]>();
      expect(tags.map((tag) => tag.name)).toEqual(['Open']);
    }
    const gmTags = (await t.gm.api.get(`${t.w}/tags`)).json<Tag[]>();
    expect(gmTags.map((tag) => tag.name).sort()).toEqual(['Open', 'Spoiler']);
  });
});

describe('the manuscript and timeline', () => {
  it('keeps the manuscript to the GM view', async () => {
    const t = await build();
    for (const api of [t.player, t.reader, t.previewPlayer, t.previewPublic]) {
      for (const url of ['/manuscript', `/manuscript/scenes/${t.scene.id}`, '/mention-index']) {
        expect((await api.get(`${t.w}${url}`)).statusCode, url).toBe(403);
      }
      // Appearances are empty rather than an error, and still don't reveal hidden entries.
      expect((await api.get(`${t.w}/entities/${t.entities.king.id}/appearances`)).json()).toEqual(
        [],
      );
      expect(
        (await api.get(`${t.w}/entities/${t.entities.secret.id}/appearances`)).statusCode,
      ).toBe(404);
    }
    expect((await t.gm.api.get(`${t.w}/manuscript`)).statusCode).toBe(200);
  });

  it('lists only visible dated entries and no scenes', async () => {
    const t = await build();
    const asGm = (await t.gm.api.get(`${t.w}/timeline`)).json<TimelineData>();
    expect(names(asGm.entities)).toEqual(['GM Secret', 'Player Ally', 'Public King']);
    expect(asGm.scenes).toHaveLength(1);
    for (const api of [t.player, t.previewPlayer]) {
      const view = (await api.get(`${t.w}/timeline`)).json<TimelineData>();
      expect(names(view.entities)).toEqual(['Player Ally', 'Public King']);
      expect(view.scenes).toEqual([]);
    }
  });
});

describe('maps and pins', () => {
  it('lists only maps shared with the audience, without leaking hidden parents or entries', async () => {
    const t = await build();
    const asGm = (await t.gm.api.get(`${t.w}/maps`)).json<AtlasMap[]>();
    expect(names(asGm)).toEqual(['Reader Map', 'Realm Map', 'Town Map', 'Vault Map']);
    expect(asGm.find((m) => m.name === 'Realm Map')?.parentId).toBe(t.vault.id);
    for (const api of [t.player, t.previewPlayer]) {
      const maps = (await api.get(`${t.w}/maps`)).json<AtlasMap[]>();
      expect(names(maps)).toEqual(['Realm Map', 'Town Map']);
      const realm = maps.find((m) => m.name === 'Realm Map')!;
      // Its parent (the Vault Map) is hidden, so it reads as a top-level map.
      expect(realm.parentId).toBeNull();
      // Pins: the open one, the king's and the door. The secret's and the GM's are not counted.
      expect(realm.featureCount).toBe(3);
      expect(realm.entity?.name).toBe('Public King');
    }
    expect(names((await t.reader.get(`${t.w}/maps`)).json<AtlasMap[]>())).toEqual([
      'Reader Map',
      'Town Map',
    ]);
  });

  it('answers 404 for a hidden map and its tiles, thumbnail and pins', async () => {
    const t = await build();
    for (const api of [t.player, t.previewPlayer]) {
      for (const suffix of ['', '/tiles/0/0/0', '/thumbnail', '/features']) {
        expect(
          (await api.get(`${t.w}/maps/${t.vault.id}${suffix}`)).statusCode,
          `vault${suffix}`,
        ).toBe(404);
        expect(
          (await api.get(`${t.w}/maps/${t.readerMap.id}${suffix}`)).statusCode,
          `reader${suffix}`,
        ).toBe(404);
      }
      expect((await api.get(`${t.w}/maps/${t.realm.id}/tiles/0/0/0`)).statusCode).toBe(200);
      expect((await api.get(`${t.w}/maps/${t.realm.id}/thumbnail`)).statusCode).toBe(200);
    }
    expect((await t.gm.api.get(`${t.w}/maps/${t.vault.id}/tiles/0/0/0`)).statusCode).toBe(200);
  });

  it('shows pins shared with the audience and strips links to maps it cannot open', async () => {
    const t = await build();
    const asGm = (await t.gm.api.get(`${t.w}/maps/${t.realm.id}/features`)).json<MapFeature[]>();
    expect(asGm).toHaveLength(5);
    // The GM's own view keeps the link.
    expect(asGm.find((p) => p.label === 'Door to the vault')?.linkMapId).toBe(t.vault.id);
    for (const api of [t.player, t.previewPlayer]) {
      const pins = (await api.get(`${t.w}/maps/${t.realm.id}/features`)).json<MapFeature[]>();
      expect(pins.map((p) => p.label).sort()).toEqual([
        'Door to the vault',
        'Open pin',
        'Pin for the king',
      ]);
      // The door would otherwise point at the hidden Vault Map.
      expect(pins.find((p) => p.label === 'Door to the vault')?.linkMapId).toBeNull();
      expect(pins.find((p) => p.label === 'Pin for the king')?.entity?.name).toBe('Public King');
      expect(pins.every((p) => p.visibility === 'player')).toBe(true);
    }
  });

  it('hides pins of a hidden entry, even if the pin itself is shared', async () => {
    const t = await build();
    const secretLinks = (api: Client) => api.get(`${t.w}/entities/${t.entities.secret.id}/maps`);
    expect((await secretLinks(t.player)).statusCode).toBe(404);
    expect((await secretLinks(t.gm.api)).json<EntityMapLink[]>()).toHaveLength(1);
    const king = (await t.player.get(`${t.w}/entities/${t.entities.king.id}/maps`)).json<
      EntityMapLink[]
    >();
    // The Realm Map shows the king, and so does one of its pins.
    expect(king.map((l) => [l.mapName, l.featureId === null])).toEqual([
      ['Realm Map', true],
      ['Realm Map', false],
    ]);
  });

  it('searches only what the audience can see', async () => {
    const t = await build();
    const found = async (api: Client, q: string) =>
      (await api.get(`${t.w}/atlas/search?q=${encodeURIComponent(q)}`))
        .json<AtlasSearchResult[]>()
        .map((r) => r.label)
        .sort();
    expect(await found(t.gm.api, 'vault')).toEqual(['Door to the vault', 'Vault Map']);
    for (const api of [t.player, t.previewPlayer]) {
      // The pin is shared with players; the map it is named after is not.
      expect(await found(api, 'vault')).toEqual(['Door to the vault']);
      expect(await found(api, 'secret')).toEqual([]);
      expect(await found(api, 'GM only')).toEqual([]);
    }
  });
});

describe('progressions, pictures and quests', () => {
  it('gives other audiences only the dated changes shared with them', async () => {
    const t = await build();
    const titles = async (api: Client) =>
      (await api.get(`${t.w}/entities/${t.entities.king.id}/progressions`))
        .json<Progression[]>()
        .map((p) => p.title)
        .sort();
    expect(await titles(t.gm.api)).toEqual(['Crowned', 'In the scene', 'Secretly cursed']);
    for (const api of [t.player, t.previewPlayer]) {
      // "Secretly cursed" is GM-only, and "In the scene" points into the manuscript.
      expect(await titles(api)).toEqual(['Crowned']);
      expect(
        (await api.get(`${t.w}/entities/${t.entities.secret.id}/progressions`)).statusCode,
      ).toBe(404);
    }
  });

  it('serves a picture only to audiences that can see it and the entry it belongs to', async () => {
    const t = await build();
    const { images, entities } = t;
    const file = async (api: Client, id: string) =>
      (await api.get(`${t.w}/images/${id}/file`)).statusCode;
    expect(await file(t.gm.api, images.worldGm.id)).toBe(200);
    for (const api of [t.player, t.previewPlayer]) {
      expect(await file(api, images.kingPortrait.id)).toBe(200);
      expect(await file(api, images.worldPublic.id)).toBe(200);
      expect(await file(api, images.worldGm.id)).toBe(404); // not shared
      expect(await file(api, images.secretPortrait.id)).toBe(404); // shared, but its entry is hidden
      expect(
        (await api.get(`${t.w}/images/${images.secretPortrait.id}/thumbnail`)).statusCode,
      ).toBe(404);
      expect((await api.get(`${t.w}/images?entityId=${entities.secret.id}`)).statusCode).toBe(404);
      const world = (await api.get(`${t.w}/images?scope=world`)).json<GalleryImage[]>();
      expect(world.map((i) => i.id)).toEqual([images.worldPublic.id]);
      const all = (await api.get(`${t.w}/images`)).json<GalleryImage[]>();
      expect(all.map((i) => i.caption).sort()).toEqual(['Handout', 'The king']);
    }
  });

  it('lists quests with the links the audience can see', async () => {
    const t = await build();
    const asGm = (await t.gm.api.get(`${t.w}/quests`)).json<QuestSummary[]>();
    expect(names(asGm)).toEqual(['GM quest', 'Open quest']);
    const open = asGm.find((q) => q.name === 'Open quest')!;
    expect(open.links.map((l) => l.other.name).sort()).toEqual(['GM Secret', 'Public King']);
    for (const api of [t.player, t.previewPlayer]) {
      const quests = (await api.get(`${t.w}/quests`)).json<QuestSummary[]>();
      expect(quests.map((q) => q.name)).toEqual(['Open quest']);
      expect(quests[0]!.links.map((l) => l.other.name)).toEqual(['Public King']);
      expect(quests[0]!.links[0]!.label).toBe('given by');
    }
    expect((await t.reader.get(`${t.w}/quests`)).json<QuestSummary[]>()).toEqual([]);
  });
});

describe('previews are read-only, and other members cannot change anything', () => {
  it('refuses every kind of change while previewing', async () => {
    const t = await build();
    const { king, questA } = t.entities;
    for (const api of [t.previewPlayer, t.previewReader, t.previewPublic]) {
      const attempts = [
        api.post(`${t.w}/entities`, { typeId: king.typeId, name: 'Nope' }),
        api.patch(`${t.w}/entities/${king.id}`, { name: 'Changed' }),
        api.delete(`${t.w}/entities/${king.id}`),
        api.patch(`${t.w}/maps/${t.realm.id}`, { name: 'Changed' }),
        api.put(`${t.w}/calendar`, {
          name: 'X',
          definition: { months: [{ name: 'M', days: 5 }], weekdays: ['A'] },
        }),
        api.post(`${t.w}/entities/${king.id}/progressions`, { title: 'X', day: 1 }),
        api.patch(`${t.w}/quests/${questA.id}/status`, { status: 'Completed' }),
        api.delete(`${t.w}/images/${t.images.kingPortrait.id}`),
        api.get(`${t.w}/export`),
      ];
      for (const res of await Promise.all(attempts)) expect(res.statusCode, res.body).toBe(403);
    }
    // Nothing happened.
    expect((await t.gm.api.get(`${t.w}/entities/${king.id}`)).json<Entity>().name).toBe(
      'Public King',
    );
  });

  it('refuses a real player or reader the same changes, the export and the trash', async () => {
    const t = await build();
    for (const api of [t.player, t.reader]) {
      const { king } = t.entities;
      expect((await api.patch(`${t.w}/entities/${king.id}`, { name: 'Changed' })).statusCode).toBe(
        403,
      );
      expect(
        (await api.post(`${t.w}/entities`, { typeId: king.typeId, name: 'Nope' })).statusCode,
      ).toBe(403);
      expect((await api.get(`${t.w}/export`)).statusCode).toBe(403);
      expect((await api.get(`${t.w}/trash`)).statusCode).toBe(403);
    }
  });

  it('does not let a player widen their view by sending the preview header', async () => {
    const t = await build();
    // A real player sending `x-view-as` (even `gm`) still sees only their own audience.
    for (const header of ['gm', 'public', 'reader', 'player']) {
      const api = apiClient(app, t.playerMember.cookie, { 'x-view-as': header });
      const items = (await api.get(`${t.w}/entities?limit=100`)).json<Page<EntitySummary>>().items;
      expect(names(items), header).toEqual(['Open quest', 'Player Ally', 'Public King']);
    }
  });

  it('rejects an unknown view, and treats "gm" as the normal view', async () => {
    const t = await build();
    const bad = await apiClient(app, t.gm.cookie, { 'x-view-as': 'admin' }).get(`${t.w}/entities`);
    expect(bad.statusCode).toBe(400);
    const gm = await apiClient(app, t.gm.cookie, { 'x-view-as': 'gm' }).get(
      `${t.w}/entities?limit=100`,
    );
    expect(gm.json<Page<EntitySummary>>().items).toHaveLength(7);
  });

  it('keeps strangers out of every audience', async () => {
    const t = await build();
    for (const url of ['/entities', '/maps', '/quests', '/images', '/timeline', '/tags']) {
      expect((await t.stranger.get(`${t.w}${url}`)).statusCode, url).toBe(404);
    }
  });
});
