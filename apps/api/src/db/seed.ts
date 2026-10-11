/**
 * Creates a demo account with a small sample world. Safe to re-run: it does nothing
 * if the demo account already exists.
 *
 *   pnpm db:seed   ->  demo@atlas.local / demo-password
 */
import { eq } from 'drizzle-orm';
import {
  dateToDay,
  DEFAULT_CALENDAR,
  entityCreateSchema,
  progressionCreateSchema,
  worldCreateSchema,
  type RichTextDoc,
} from '@atlas/shared';
import { auth } from '../auth';
import { createEntity } from '../modules/entities/service';
import { listEntityTypes } from '../modules/entity-types/service';
import { createNode, saveSceneBody, updateNode } from '../modules/manuscript/service';
import { createProgression } from '../modules/progressions/service';
import {
  createRelationship,
  listRelationshipTypes,
  updateRelationship,
} from '../modules/relationships/service';
import { attachTag, createTag } from '../modules/tags/service';
import { createWorld } from '../modules/worlds/service';
import { db, sql } from './client';
import { user } from './schema';

const DEMO_EMAIL = 'demo@atlas.local';
const DEMO_PASSWORD = 'demo-password';

/** A day in the default calendar: `month` counts from 0 (Frostmoon). */
const day = (year: number, month: number, dayOfMonth: number) =>
  dateToDay(DEFAULT_CALENDAR, { year, month, day: dayOfMonth });

const doc = (...paragraphs: string[]): RichTextDoc => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

async function main() {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, DEMO_EMAIL));
  if (existing) {
    console.info(`Demo account already exists (${DEMO_EMAIL}); nothing to do.`);
    return;
  }

  const { user: demo } = await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Demo Writer' },
  });
  const world = await createWorld(
    db,
    demo.id,
    worldCreateSchema.parse({
      name: 'Aerth',
      description: 'A storm-wracked archipelago of guild cities and drowned gods.',
    }),
  );

  const types = new Map((await listEntityTypes(db, world.id)).map((t) => [t.key, t.id]));
  const relTypes = new Map((await listRelationshipTypes(db, world.id)).map((t) => [t.key, t.id]));
  const add = (type: string, input: Record<string, unknown>) =>
    createEntity(
      db,
      world.id,
      demo.id,
      entityCreateSchema.parse({ typeId: types.get(type), ...input }),
    );
  const link = (sourceId: string, key: string, targetId: string) =>
    createRelationship(db, world.id, { sourceId, targetId, typeId: relTypes.get(key)!, notes: '' });

  const kaldor = await add('location', {
    name: 'Kaldor',
    summary: 'The largest island of the Shattered Reach.',
    fields: { location_type: 'Region', climate: 'Cold, wet, wind-scoured' },
  });
  const vesh = await add('location', {
    name: 'Vesh',
    aliases: ['The Salt City'],
    summary: 'A harbour city built on the bones of a sunken temple.',
    fields: { location_type: 'City', population: '~40,000' },
  });
  const eel = await add('location', {
    name: 'The Gilded Eel',
    summary: 'A smugglers’ tavern in Vesh’s Old Quarter.',
    fields: { location_type: 'Building' },
    body: doc('Low ceilings, brass lanterns and a trapdoor nobody admits to.'),
  });
  const guild = await add('faction', {
    name: 'The Tide Guild',
    summary: 'Pilots and smugglers who know every channel of the Reach.',
    fields: { faction_type: 'Guild', motto: 'The sea keeps our secrets.' },
  });
  const human = await add('species', { name: 'Human', fields: { lifespan: '~70 years' } });
  const mira = await add('character', {
    name: 'Mira Vey',
    aliases: ['Mira', 'The Barkeep'],
    summary: 'Owner of the Gilded Eel and a former Tide Guild pilot.',
    fields: { age: '41', life_status: 'Alive', personality: 'Dry, watchful, generous to a fault.' },
    startDay: day(273, 2, 9),
    body: doc(
      'Mira ran contraband through the Drowned Channels for twenty years before buying the Eel.',
      'She still keeps a pilot’s chart of the harbour under the bar.',
    ),
  });
  const compass = await add('item', {
    name: 'Drowned Compass',
    summary: 'Points toward whatever its holder fears losing most.',
    fields: { item_type: 'Artifact', rarity: 'Unique' },
  });

  const riots = await add('event', {
    name: 'The Lantern Riots',
    summary: 'Three nights of unrest in Vesh after the Guild raised harbour fees.',
    startDay: day(311, 9, 14),
    endDay: day(311, 9, 17),
  });

  await link(vesh.id, 'located_in', kaldor.id);
  await link(eel.id, 'located_in', vesh.id);
  await link(mira.id, 'located_in', eel.id);
  const membership = await link(mira.id, 'member_of', guild.id);
  // She flew for the Guild for fifteen years, then left it behind.
  await updateRelationship(db, world.id, membership.id, {
    validFromDay: day(291, 0, 1),
    validToDay: day(306, 4, 20),
  });
  await link(mira.id, 'took_part_in', riots.id);
  await link(mira.id, 'of_species', human.id);
  await link(mira.id, 'owns', compass.id);

  // Changes over time: view Mira "as of" a year, or a scene, to see them take effect.
  await createProgression(
    db,
    world.id,
    mira.id,
    progressionCreateSchema.parse({
      title: 'Joins the Tide Guild',
      day: day(291, 0, 1),
      changes: {
        summary: 'A reckless young pilot of the Tide Guild.',
        fields: { age: '18', personality: 'Reckless, proud, hungry for the open sea.' },
      },
    }),
  );
  await createProgression(
    db,
    world.id,
    mira.id,
    progressionCreateSchema.parse({
      title: 'Buys the Gilded Eel',
      note: 'Spent her last pilot’s purse on the tavern, and never flew again.',
      day: day(306, 4, 20),
      changes: {
        summary: 'Owner of the Gilded Eel and a former Tide Guild pilot.',
        fields: { age: '33', personality: 'Dry, watchful, generous to a fault.' },
      },
    }),
  );

  const mainCast = await createTag(db, world.id, { name: 'Main cast', color: '#e11d48' });
  await attachTag(db, world.id, mira.id, mainCast.id);

  // A short manuscript, so the Manuscript view and "appears in" lists have something to show.
  const book = await createNode(db, world.id, {
    kind: 'book',
    parentId: null,
    title: 'The Salt Road',
  });
  const chapter = await createNode(db, world.id, {
    kind: 'chapter',
    parentId: book.id,
    title: 'Low Tide',
  });
  const docks = await createNode(db, world.id, {
    kind: 'scene',
    parentId: chapter.id,
    title: 'At the docks',
  });
  await updateNode(db, world.id, docks.id, {
    povId: mira.id,
    locationId: vesh.id,
    inWorldDate: 'before dawn',
    inWorldDay: day(314, 9, 3),
  });
  await saveSceneBody(
    db,
    world.id,
    docks.id,
    doc(
      'Fog rolled off the harbour as Mira counted the ships of the Tide Guild riding at anchor.',
      'Vesh was quiet before dawn. Too quiet, she thought, and turned the Drowned Compass over in her pocket.',
    ),
  );
  const tavern = await createNode(db, world.id, {
    kind: 'scene',
    parentId: chapter.id,
    title: 'Closing time',
  });
  await updateNode(db, world.id, tavern.id, {
    povId: mira.id,
    locationId: eel.id,
    inWorldDay: day(314, 9, 3),
  });
  await saveSceneBody(
    db,
    world.id,
    tavern.id,
    doc(
      'The last drinker left the Gilded Eel at midnight. The barkeep bolted the door and lifted the trapdoor.',
    ),
  );

  console.info(`Seeded world "${world.name}". Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

try {
  await main();
} finally {
  await sql.end();
}
