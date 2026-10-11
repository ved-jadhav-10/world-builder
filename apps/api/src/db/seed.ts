/**
 * Creates a demo account with a small sample world. Safe to re-run: it does nothing
 * if the demo account already exists.
 *
 *   pnpm db:seed   ->  demo@atlas.local / demo-password
 */
import { eq } from 'drizzle-orm';
import { entityCreateSchema, worldCreateSchema, type RichTextDoc } from '@atlas/shared';
import { auth } from '../auth';
import { createEntity } from '../modules/entities/service';
import { listEntityTypes } from '../modules/entity-types/service';
import { createRelationship, listRelationshipTypes } from '../modules/relationships/service';
import { attachTag, createTag } from '../modules/tags/service';
import { createWorld } from '../modules/worlds/service';
import { db, sql } from './client';
import { user } from './schema';

const DEMO_EMAIL = 'demo@atlas.local';
const DEMO_PASSWORD = 'demo-password';

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
    createEntity(db, world.id, demo.id, entityCreateSchema.parse({ typeId: types.get(type), ...input }));
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

  await link(vesh.id, 'located_in', kaldor.id);
  await link(eel.id, 'located_in', vesh.id);
  await link(mira.id, 'located_in', eel.id);
  await link(mira.id, 'member_of', guild.id);
  await link(mira.id, 'of_species', human.id);
  await link(mira.id, 'owns', compass.id);

  const mainCast = await createTag(db, world.id, { name: 'Main cast', color: '#e11d48' });
  await attachTag(db, world.id, mira.id, mainCast.id);

  console.info(`Seeded world "${world.name}". Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

try {
  await main();
} finally {
  await sql.end();
}
