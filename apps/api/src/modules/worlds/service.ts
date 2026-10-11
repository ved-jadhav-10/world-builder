import { and, desc, eq, isNull } from 'drizzle-orm';
import { slugify, type Role, type World, type worldCreateSchema, type worldUpdateSchema } from '@atlas/shared';
import type { z } from 'zod';
import type { DbOrTx } from '../../db/client';
import { entityTypes, relationshipTypes, worldMembers, worlds } from '../../db/schema';
import { BUILTIN_ENTITY_TYPES, BUILTIN_RELATIONSHIP_TYPES } from '../../db/seed-definitions';
import { notFound } from '../../errors';
import { randomSuffix } from '../../lib/keys';

type WorldRow = typeof worlds.$inferSelect;

function toWorld(row: WorldRow, role: Role): World {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    role,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listWorlds(db: DbOrTx, userId: string): Promise<World[]> {
  const rows = await db
    .select({ world: worlds, role: worldMembers.role })
    .from(worldMembers)
    .innerJoin(worlds, eq(worlds.id, worldMembers.worldId))
    .where(and(eq(worldMembers.userId, userId), isNull(worlds.deletedAt)))
    .orderBy(desc(worlds.updatedAt));
  return rows.map((r) => toWorld(r.world, r.role));
}

export async function getWorldBySlug(db: DbOrTx, userId: string, slug: string): Promise<World> {
  const [row] = await db
    .select({ world: worlds, role: worldMembers.role })
    .from(worlds)
    .innerJoin(worldMembers, and(eq(worldMembers.worldId, worlds.id), eq(worldMembers.userId, userId)))
    .where(and(eq(worlds.slug, slug), isNull(worlds.deletedAt)));
  if (!row) throw notFound('World');
  return toWorld(row.world, row.role);
}

export async function getWorld(db: DbOrTx, worldId: string, role: Role): Promise<World> {
  const [row] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!row) throw notFound('World');
  return toWorld(row, role);
}

async function uniqueSlug(db: DbOrTx, name: string): Promise<string> {
  const base = slugify(name) || 'world';
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const [taken] = await db.select({ id: worlds.id }).from(worlds).where(eq(worlds.slug, candidate));
    if (!taken) return candidate;
  }
  return `${base}-${randomSuffix(8)}`;
}

/** Creates a world, makes the creator its owner and copies in the built-in types. */
export async function createWorld(
  db: DbOrTx,
  userId: string,
  input: z.output<typeof worldCreateSchema>,
): Promise<World> {
  return db.transaction(async (tx) => {
    const [world] = await tx
      .insert(worlds)
      .values({
        ownerId: userId,
        name: input.name,
        description: input.description,
        slug: await uniqueSlug(tx, input.name),
      })
      .returning();
    if (!world) throw new Error('World insert returned no row');

    await tx.insert(worldMembers).values({ worldId: world.id, userId, role: 'owner' });
    await tx.insert(entityTypes).values(
      BUILTIN_ENTITY_TYPES.map((type, i) => ({
        ...type,
        worldId: world.id,
        isBuiltin: true,
        sortOrder: i,
      })),
    );
    await tx.insert(relationshipTypes).values(
      BUILTIN_RELATIONSHIP_TYPES.map((type) => ({ ...type, worldId: world.id, isBuiltin: true })),
    );
    return toWorld(world, 'owner');
  });
}

export async function updateWorld(
  db: DbOrTx,
  worldId: string,
  role: Role,
  input: z.output<typeof worldUpdateSchema>,
): Promise<World> {
  const [row] = await db.update(worlds).set(input).where(eq(worlds.id, worldId)).returning();
  if (!row) throw notFound('World');
  return toWorld(row, role);
}

export async function softDeleteWorld(db: DbOrTx, worldId: string): Promise<void> {
  await db.update(worlds).set({ deletedAt: new Date() }).where(eq(worlds.id, worldId));
}
