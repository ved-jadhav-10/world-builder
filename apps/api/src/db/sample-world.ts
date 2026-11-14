/*
 * The sample world, Aerth: a small, finished corner of a setting that shows every part of the app
 * working together. It fills a world that already exists (so it serves both `pnpm db:seed` and
 * "start from the sample" when someone makes a new world).
 *
 * What it is built to show:
 *  - entries of most types, linked, with a mix of public, player-only and GM-only;
 *  - a chart drawn here (sample-map.ts) with pins that open entries, a road, a sea lane and a
 *    GM-only note;
 *  - a calendar, dates, and changes over time by date and by scene;
 *  - a three-chapter manuscript whose scenes mention the entries;
 *  - quests, a session, a rumour table and a to-do list for the table;
 *  - a reader wiki's worth of public entries, one of them held back until the last chapter.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  boardDocSchema,
  dateToDay,
  DEFAULT_CALENDAR,
  entityCreateSchema,
  featureCreateSchema,
  mapCreateSchema,
  progressionCreateSchema,
  todoCreateSchema,
  type RichTextDoc,
} from '@atlas/shared';
import { uploadsDir } from '../lib/storage';
import sharp from '../lib/sharp';
import { createFeature, createMap } from '../modules/atlas/service';
import type { TilingLog } from '../modules/atlas/tiling';
import { createEntity, updateEntity } from '../modules/entities/service';
import { listEntityTypes } from '../modules/entity-types/service';
import { createNode, saveSceneBody, updateNode } from '../modules/manuscript/service';
import { createProgression } from '../modules/progressions/service';
import {
  createRelationship,
  listRelationshipTypes,
  updateRelationship,
} from '../modules/relationships/service';
import { createSession } from '../modules/sessions/service';
import { createTable } from '../modules/tables/service';
import { attachTag, createTag } from '../modules/tags/service';
import { createBoard } from '../modules/boards/service';
import { createTodo } from '../modules/todos/service';
import type { Db } from './client';
import { drawSampleMap } from './sample-map';

export const SAMPLE_WORLD = {
  name: 'Aerth',
  description: 'A storm-wracked archipelago of guild cities and drowned gods.',
};

/** A day in the default calendar: `month` counts from 0 (Frostmoon). */
const day = (year: number, month: number, dayOfMonth: number) =>
  dateToDay(DEFAULT_CALENDAR, { year, month, day: dayOfMonth });

const doc = (...paragraphs: string[]): RichTextDoc => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

/** A paragraph only the GM sees, inside an article. */
const withSecret = (open: string[], secret: string): RichTextDoc => ({
  type: 'doc',
  content: [
    ...open.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
    {
      type: 'secretBlock',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: secret }] }],
    },
  ],
});

export async function fillSampleWorld(
  db: Db,
  worldId: string,
  userId: string,
  log: TilingLog,
): Promise<void> {
  const types = new Map((await listEntityTypes(db, worldId)).map((t) => [t.key, t.id]));
  const relTypes = new Map((await listRelationshipTypes(db, worldId)).map((t) => [t.key, t.id]));
  const add = (type: string, input: Record<string, unknown>) =>
    createEntity(
      db,
      worldId,
      userId,
      entityCreateSchema.parse({ typeId: types.get(type), ...input }),
    );
  const link = (sourceId: string, key: string, targetId: string) =>
    createRelationship(db, worldId, { sourceId, targetId, typeId: relTypes.get(key)!, notes: '' });
  const change = (entityId: string, input: Record<string, unknown>) =>
    createProgression(db, worldId, entityId, progressionCreateSchema.parse(input));

  /* Places */
  const kaldor = await add('location', {
    name: 'Kaldor',
    visibility: 'public',
    summary: 'The largest island of the Shattered Reach.',
    fields: { location_type: 'Region', climate: 'Cold, wet, wind-scoured' },
    body: doc(
      'Kaldor is a long, high-backed island. Its ridge keeps the worst of the western weather off the harbours of the eastern shore, which is why every town worth the name sits there.',
    ),
  });
  const vesh = await add('location', {
    name: 'Vesh',
    visibility: 'public',
    aliases: ['The Salt City'],
    summary: 'A harbour city built on the bones of a sunken temple.',
    fields: { location_type: 'City', population: '~40,000' },
    body: withSecret(
      [
        'Vesh climbs from its quays in terraces of grey stone. At low tide the old temple steps show green under the water of the inner harbour, and the pilots steer by them.',
      ],
      'The temple is not ruined. It is closed. The Guild pays to keep it that way.',
    ),
  });
  const eel = await add('location', {
    name: 'The Gilded Eel',
    visibility: 'public',
    summary: 'A smugglers’ tavern in Vesh’s Old Quarter.',
    fields: {
      location_type: 'Building',
      wares: [
        { name: 'Black ale', price: '2 cp', stock: null, description: '' },
        { name: 'Eel pie', price: '4 cp', stock: 12, description: 'Until it runs out' },
        { name: 'A quiet table', price: '1 sp', stock: 2, description: 'No questions' },
      ],
    },
    body: doc('Low ceilings, brass lanterns and a trapdoor nobody admits to.'),
  });
  const saltmere = await add('location', {
    name: 'Saltmere',
    visibility: 'public',
    summary: 'A village of salt pans and stubborn people on Kaldor’s south shore.',
    fields: { location_type: 'Settlement', population: '~600' },
  });
  const lampRock = await add('location', {
    name: 'Lamp Rock',
    visibility: 'public',
    summary: 'A bare islet east of Vesh, crowned by a lamp tower older than the city.',
    fields: { location_type: 'Landmark' },
  });

  /* People and powers */
  const guild = await add('faction', {
    name: 'The Tide Guild',
    visibility: 'public',
    summary: 'Pilots and smugglers who know every channel of the Reach.',
    fields: { faction_type: 'Guild', motto: 'The sea keeps our secrets.' },
  });
  const human = await add('species', {
    name: 'Human',
    visibility: 'public',
    fields: { lifespan: '~70 years' },
  });
  const mira = await add('character', {
    name: 'Mira Vey',
    visibility: 'public',
    aliases: ['Mira', 'The Barkeep'],
    summary: 'Owner of the Gilded Eel and a former Tide Guild pilot.',
    fields: { age: '41', life_status: 'Alive', personality: 'Dry, watchful, generous to a fault.' },
    startDay: day(273, 2, 9),
    body: withSecret(
      [
        'Mira ran contraband through the Drowned Channels for twenty years before buying the Eel.',
        'She still keeps a pilot’s chart of the harbour under the bar.',
      ],
      'The chart shows a channel into the closed temple. She has never sold it.',
    ),
  });
  const odo = await add('character', {
    name: 'Odo Karr',
    visibility: 'public',
    aliases: ['The Harbourmaster'],
    summary: 'Harbourmaster of Vesh, and the last official the Guild has not bought.',
    fields: { age: '58', life_status: 'Alive', personality: 'Patient, exact, tired.' },
    startDay: day(256, 7, 2),
  });
  const prince = await add('character', {
    name: 'The Salt Prince',
    summary: 'The Guild’s hidden patron. Nobody has seen his face twice.',
    fields: { life_status: 'Unknown' },
  });
  const compass = await add('item', {
    name: 'Drowned Compass',
    visibility: 'player',
    summary: 'Points toward whatever its holder fears losing most.',
    fields: { item_type: 'Artifact', rarity: 'Unique' },
  });
  const riots = await add('event', {
    name: 'The Lantern Riots',
    visibility: 'public',
    summary: 'Three nights of unrest in Vesh after the Guild raised harbour fees.',
    startDay: day(311, 9, 14),
    endDay: day(311, 9, 17),
  });

  /* Quests */
  const compassQuest = await add('quest', {
    name: 'Recover the Drowned Compass',
    visibility: 'player',
    summary: 'Mira’s compass was taken from the Eel. Find who has it before the tide turns.',
    fields: {
      status: 'Ongoing',
      objectives: 'Ask around the Old Quarter.\nFind out who bought it.',
      reward: 'The compass, and an old debt repaid',
    },
  });
  const princeQuest = await add('quest', {
    name: 'Who is the Salt Prince?',
    summary: 'The Guild’s hidden patron. The players have not heard the name yet.',
    fields: { status: 'Not started' },
  });

  /* Links */
  await link(vesh.id, 'located_in', kaldor.id);
  await link(saltmere.id, 'located_in', kaldor.id);
  await link(eel.id, 'located_in', vesh.id);
  await link(mira.id, 'located_in', eel.id);
  await link(odo.id, 'located_in', vesh.id);
  const membership = await link(mira.id, 'member_of', guild.id);
  // She flew for the Guild for fifteen years, then left it behind.
  await updateRelationship(db, worldId, membership.id, {
    validFromDay: day(291, 0, 1),
    validToDay: day(306, 4, 20),
  });
  await link(mira.id, 'took_part_in', riots.id);
  await link(mira.id, 'of_species', human.id);
  await link(odo.id, 'of_species', human.id);
  await link(mira.id, 'owns', compass.id);
  await link(odo.id, 'enemy_of', guild.id);
  await link(prince.id, 'member_of', guild.id);
  await link(compassQuest.id, 'given_by', mira.id);
  await link(compassQuest.id, 'located_in', vesh.id);
  await link(princeQuest.id, 'located_in', vesh.id);

  /* Changes by date: view Mira "as of" a year to see them take effect. */
  await change(mira.id, {
    title: 'Joins the Tide Guild',
    day: day(291, 0, 1),
    visibility: 'player',
    changes: {
      summary: 'A reckless young pilot of the Tide Guild.',
      fields: { age: '18', personality: 'Reckless, proud, hungry for the open sea.' },
    },
  });
  await change(mira.id, {
    title: 'Buys the Gilded Eel',
    visibility: 'player',
    note: 'Spent her last pilot’s purse on the tavern, and never flew again.',
    day: day(306, 4, 20),
    changes: {
      summary: 'Owner of the Gilded Eel and a former Tide Guild pilot.',
      fields: { age: '33', personality: 'Dry, watchful, generous to a fault.' },
    },
  });
  await change(mira.id, {
    title: 'Secretly owes the Salt Prince',
    day: day(310, 6, 2),
    changes: { fields: { goals: 'Settle the debt before the Prince comes calling.' } },
  });

  const mainCast = await createTag(db, worldId, { name: 'Main cast', color: '#b3361f' });
  await attachTag(db, worldId, mira.id, mainCast.id);
  await attachTag(db, worldId, odo.id, mainCast.id);

  /* The manuscript: three short chapters that mention the entries by name. */
  const book = await createNode(db, worldId, {
    kind: 'book',
    parentId: null,
    title: 'The Salt Road',
  });
  const scene = async (
    chapterId: string,
    title: string,
    details: Parameters<typeof updateNode>[3],
    ...paragraphs: string[]
  ) => {
    const node = await createNode(db, worldId, { kind: 'scene', parentId: chapterId, title });
    await updateNode(db, worldId, node.id, details);
    await saveSceneBody(db, worldId, node.id, doc(...paragraphs));
    return node;
  };
  const lowTide = await createNode(db, worldId, {
    kind: 'chapter',
    parentId: book.id,
    title: 'Low Tide',
  });
  await scene(
    lowTide.id,
    'At the docks',
    { povId: mira.id, locationId: vesh.id, inWorldDate: 'before dawn', inWorldDay: day(314, 9, 3) },
    'Fog rolled off the harbour as Mira counted the ships of the Tide Guild riding at anchor.',
    'Vesh was quiet before dawn. Too quiet, she thought, and turned the Drowned Compass over in her pocket.',
  );
  await scene(
    lowTide.id,
    'Closing time',
    { povId: mira.id, locationId: eel.id, inWorldDay: day(314, 9, 3) },
    'The last drinker left the Gilded Eel at midnight. The barkeep bolted the door and lifted the trapdoor.',
  );
  const price = await createNode(db, worldId, {
    kind: 'chapter',
    parentId: book.id,
    title: 'The Guild’s Price',
  });
  const oath = await scene(
    price.id,
    'The oath',
    { povId: mira.id, locationId: vesh.id, inWorldDay: day(314, 9, 11) },
    'They made her say the words on the quay, where everyone could hear. Odo Karr watched from the harbour office and did not look away.',
    'When it was done the Tide Guild had a pilot-captain again, and Mira had a debt she could count in tides.',
  );
  const lamp = await createNode(db, worldId, {
    kind: 'chapter',
    parentId: book.id,
    title: 'What the Lamp Hides',
  });
  const descent = await scene(
    lamp.id,
    'Under Lamp Rock',
    { povId: mira.id, locationId: lampRock.id, inWorldDay: day(314, 10, 2) },
    'The stair went down further than Lamp Rock was tall. At the bottom the water was warm, and something in it was breathing.',
  );

  /* Changes by scene, public: these are what the reader wiki unfolds chapter by chapter. */
  await change(mira.id, {
    title: 'Sworn back to the Guild',
    sceneId: oath.id,
    visibility: 'public',
    changes: {
      name: 'Pilot-Captain Vey',
      aliases: ['Mira', 'Mira Vey'],
      summary: 'Pilot-captain of the Tide Guild again, and not by choice.',
    },
  });
  await change(odo.id, {
    title: 'Turned out of office',
    sceneId: oath.id,
    visibility: 'public',
    changes: {
      summary: 'Once Harbourmaster of Vesh; the Guild holds the office now.',
      aliases: [],
    },
  });
  await change(lampRock.id, {
    title: 'The stair is found',
    sceneId: descent.id,
    visibility: 'public',
    changes: { summary: 'An islet whose lamp tower stands over a stair into the sea.' },
  });
  // Held back: readers of the wiki do not meet him until they have finished the last chapter.
  const king = await add('character', {
    name: 'The Drowned King',
    visibility: 'public',
    summary: 'What sleeps under Lamp Rock. The lamp was built to keep him sleeping.',
    fields: { life_status: 'Unknown' },
  });
  await updateEntity(db, worldId, king.id, { revealNodeId: lamp.id });
  await link(king.id, 'located_in', lampRock.id);

  /* The table */
  await createTable(db, worldId, userId, {
    name: 'Rumours at the Gilded Eel',
    description: 'What a round of drinks buys you.',
    visibility: 'player',
    rows: [
      { weight: 2, text: 'The Guild has raised the pilot fee again. Third time this year.' },
      { weight: 2, text: 'Odo Karr sleeps in the harbour office with a crossbow.' },
      {
        weight: 1,
        text: 'Someone is buying old charts of the inner harbour, and paying in salt-silver.',
      },
      {
        weight: 1,
        text: 'The lamp on Lamp Rock went out for one night last month. Nobody will say who relit it.',
      },
      { weight: 1, text: 'A Saltmere boat came back with its nets full of temple stone.' },
      { weight: 1, text: 'Mira has not opened the trapdoor in a week.' },
    ],
  });
  await createSession(db, worldId, userId, { name: 'Session 1: Low Tide', visibility: 'player' });
  for (const [title, entityId] of [
    ['Decide what the Salt Prince wants from Mira', prince.id],
    ['Draw the temple under Vesh', vesh.id],
    ['Name three Guild pilots', guild.id],
  ] as const) {
    await createTodo(db, worldId, userId, todoCreateSchema.parse({ title, entityId }));
  }

  /* A board: who is tied to whom over the compass, with the GM's own guess kept back. */
  await createBoard(db, worldId, userId, {
    name: 'The compass affair',
    kind: 'canvas',
    doc: boardDocSchema.parse({
      items: [
        { id: 'f-harbour', type: 'frame', title: 'In Vesh', x: -40, y: 60, w: 700, h: 400 },
        {
          id: 't-title',
          type: 'note',
          color: 'plain',
          size: 'lg',
          x: -40,
          y: -60,
          w: 520,
          h: 56,
          text: 'Who wants the compass?',
        },
        { id: 'e-mira', type: 'entry', entityId: mira.id, x: 0, y: 110, w: 290, h: 120 },
        { id: 'e-odo', type: 'entry', entityId: odo.id, x: 340, y: 110, w: 290, h: 120 },
        { id: 'e-guild', type: 'entry', entityId: guild.id, x: 340, y: 300, w: 290, h: 120 },
        { id: 'e-compass', type: 'entry', entityId: compass.id, x: 760, y: 200, w: 290, h: 120 },
        {
          id: 'e-prince',
          type: 'entry',
          entityId: prince.id,
          x: 0,
          y: 300,
          w: 290,
          h: 120,
          gmOnly: true,
        },
        {
          id: 'n-open',
          type: 'note',
          color: 'vellum',
          x: 780,
          y: 380,
          w: 220,
          h: 150,
          text: 'Open question: who told the Guild where the compass went down?',
        },
        {
          id: 'n-truth',
          type: 'note',
          color: 'rose',
          x: 760,
          y: 0,
          w: 240,
          h: 150,
          gmOnly: true,
          text: 'The Prince does not want the compass. He wants what Mira fears losing.',
        },
        {
          id: 's-sea',
          type: 'swatch',
          color: '#2f5d62',
          label: 'Harbour at dusk',
          x: 1100,
          y: 200,
          w: 96,
          h: 116,
        },
        {
          id: 's-lamp',
          type: 'swatch',
          color: '#c98b3a',
          label: 'Lamp light',
          x: 1210,
          y: 200,
          w: 96,
          h: 116,
        },
      ],
      links: [
        { id: 'l1', from: 'e-mira', to: 'e-guild', label: 'once piloted for' },
        { id: 'l2', from: 'e-guild', to: 'e-compass', label: 'is hunting' },
        { id: 'l3', from: 'e-odo', to: 'e-compass', label: 'logged its loss' },
        { id: 'l4', from: 'e-prince', to: 'e-guild', label: 'pays' },
        { id: 'l5', from: 'n-truth', to: 'e-compass' },
      ],
    }),
  });

  /* The chart */
  const chart = drawSampleMap();
  const directory = uploadsDir();
  await mkdir(directory, { recursive: true });
  const path = join(directory, randomUUID());
  await sharp(Buffer.from(chart.svg)).png().toFile(path);
  let mapId: string;
  try {
    const map = await createMap(
      db,
      worldId,
      mapCreateSchema.parse({
        name: 'The Shattered Reach',
        description: 'Kaldor and its waters. Drawn for the sample world.',
        entityId: kaldor.id,
        visibility: 'public',
      }),
      { path, width: chart.width, height: chart.height },
      log,
    );
    mapId = map.id;
  } finally {
    // After a successful create the file has moved, so this only cleans up failures.
    await rm(path, { force: true });
  }
  const feature = (input: Record<string, unknown>) =>
    createFeature(db, worldId, mapId, featureCreateSchema.parse(input));
  await feature({
    kind: 'pin',
    points: [chart.places.vesh],
    entityId: vesh.id,
    visibility: 'public',
    size: 'lg',
  });
  await feature({
    kind: 'pin',
    points: [chart.places.eel],
    entityId: eel.id,
    visibility: 'public',
    size: 'sm',
    minZoom: 2,
  });
  await feature({
    kind: 'pin',
    points: [chart.places.saltmere],
    entityId: saltmere.id,
    visibility: 'public',
  });
  await feature({
    kind: 'pin',
    points: [chart.places.lampRock],
    entityId: lampRock.id,
    visibility: 'public',
  });
  await feature({
    kind: 'pin',
    points: [chart.places.wreck],
    label: 'The Heron, sunk',
    notes: 'A Guild cutter went down here in the riots.',
    gmNotes: 'Her strongbox is still aboard: the Prince’s ledger is in it.',
    icon: 'anchor',
  });
  await feature({
    kind: 'label',
    points: [chart.places.kaldorPeak],
    label: 'The Backbone',
    visibility: 'public',
  });
  await feature({
    kind: 'path',
    points: chart.road,
    label: 'The Salt Road',
    notes: 'Two days on foot from Vesh to Saltmere.',
    visibility: 'public',
    lineStyle: 'dashed',
  });
  await feature({
    kind: 'journey',
    points: chart.seaLane,
    label: 'Mira’s crossing to Lamp Rock',
    pointDays: [day(314, 10, 1), null, null, day(314, 10, 2)],
    visibility: 'player',
  });
}
