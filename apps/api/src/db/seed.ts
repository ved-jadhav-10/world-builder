/**
 * Creates a demo account with a small sample world. Safe to re-run: it does nothing
 * if the demo account already exists.
 *
 *   pnpm db:seed   ->  demo@atlas.local / demo-password   (the GM and owner)
 *                      player@atlas.local / demo-password (a player in the same world)
 *                      reader@atlas.local / demo-password (a reader in the same world)
 */
import { eq } from 'drizzle-orm';
import { worldCreateSchema } from '@atlas/shared';
import { auth } from '../auth';
import { tilingIdle } from '../modules/atlas/tiling';
import { createWorld } from '../modules/worlds/service';
import { db, sql } from './client';
import { fillSampleWorld, SAMPLE_WORLD } from './sample-world';
import { user, worldMembers, worlds } from './schema';

const DEMO_EMAIL = 'demo@atlas.local';
const DEMO_PASSWORD = 'demo-password';
/** Real members of the demo world, to see what an invited player or reader gets. */
const DEMO_GUESTS = [
  { email: 'player@atlas.local', name: 'Demo Player', role: 'player' },
  { email: 'reader@atlas.local', name: 'Demo Reader', role: 'reader' },
] as const;

async function main() {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, DEMO_EMAIL));
  if (existing) {
    console.info(`Demo account already exists (${DEMO_EMAIL}); nothing to do.`);
    return;
  }

  const { user: demo } = await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Demo Writer' },
  });
  const world = await createWorld(db, demo.id, worldCreateSchema.parse(SAMPLE_WORLD));
  await fillSampleWorld(db, world.id, demo.id, {
    error: (details, message) => console.error(message, details),
  });
  // The chart is cut into tiles in the background; wait, since this script exits when done.
  await tilingIdle();
  // Open the reader wiki, so /wiki/<address> has something to show straight away.
  await db
    .update(worlds)
    .set({
      wikiEnabled: true,
      wikiIntro:
        'A companion to The Salt Road. Tell it how far you have read, and it will keep the rest to itself.',
    })
    .where(eq(worlds.id, world.id));

  for (const guest of DEMO_GUESTS) {
    const { user: member } = await auth.api.signUpEmail({
      body: { email: guest.email, password: DEMO_PASSWORD, name: guest.name },
    });
    await db
      .insert(worldMembers)
      .values({ worldId: world.id, userId: member.id, role: guest.role });
  }

  console.info(
    `Seeded world "${world.name}". Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD} (the GM), or as ` +
      DEMO_GUESTS.map((g) => g.email).join(' or ') +
      ' to see it as a player or reader.',
  );
}

try {
  await main();
} finally {
  await sql.end();
}
