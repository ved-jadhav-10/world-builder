import { readFile } from 'node:fs/promises';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  isRevealed,
  type Audience,
  type Handout,
  type handoutCreateSchema,
  type handoutUpdateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { handouts } from '../../db/schema';
import { notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';
import { fullPath, removeImageFiles, thumbPath } from '../gallery/files';
import { storeImage } from '../gallery/processing';

type Row = typeof handouts.$inferSelect;

function toHandout(row: Row): Handout {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    visibility: row.visibility,
    revealedAt: row.revealedAt?.toISOString() ?? null,
    hasImage: row.imageWidth !== null,
    imageWidth: row.imageWidth,
    imageHeight: row.imageHeight,
    imageVersion: row.imageVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getRow(
  db: DbOrTx,
  worldId: string,
  id: string,
  audience: Audience = 'gm',
): Promise<Row> {
  const [row] = await db
    .select()
    .from(handouts)
    .where(
      and(
        eq(handouts.id, id),
        eq(handouts.worldId, worldId),
        visibleTo(handouts.visibility, audience),
      ),
    );
  if (!row) throw notFound('Handout');
  return row;
}

/** The handouts an audience can see, the most recently revealed (or made) first. */
export async function listHandouts(
  db: DbOrTx,
  worldId: string,
  audience: Audience = 'gm',
): Promise<Handout[]> {
  const rows = await db
    .select()
    .from(handouts)
    .where(and(eq(handouts.worldId, worldId), visibleTo(handouts.visibility, audience)))
    .orderBy(desc(sql`coalesce(${handouts.revealedAt}, ${handouts.createdAt})`), desc(handouts.id));
  return rows.map(toHandout);
}

export async function getHandout(
  db: DbOrTx,
  worldId: string,
  id: string,
  audience: Audience = 'gm',
): Promise<Handout> {
  return toHandout(await getRow(db, worldId, id, audience));
}

export async function createHandout(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: z.output<typeof handoutCreateSchema>,
): Promise<Handout> {
  const [row] = await db
    .insert(handouts)
    .values({
      worldId,
      title: input.title,
      body: input.body,
      visibility: input.visibility,
      revealedAt: isRevealed(input.visibility) ? new Date() : null,
      createdBy: userId,
    })
    .returning();
  return toHandout(row!);
}

export async function updateHandout(
  db: DbOrTx,
  worldId: string,
  id: string,
  input: z.output<typeof handoutUpdateSchema>,
): Promise<Handout> {
  const existing = await getRow(db, worldId, id);
  const set: Partial<typeof handouts.$inferInsert> = {};
  if (input.title !== undefined) set.title = input.title;
  if (input.body !== undefined) set.body = input.body;
  if (input.visibility !== undefined) {
    set.visibility = input.visibility;
    if (!isRevealed(input.visibility)) set.revealedAt = null;
    // Showing it again after hiding it counts as a new reveal, so players are told again.
    else if (!existing.revealedAt || !isRevealed(existing.visibility)) set.revealedAt = new Date();
  }
  if (Object.keys(set).length === 0) return toHandout(existing);
  const [row] = await db.update(handouts).set(set).where(eq(handouts.id, id)).returning();
  return toHandout(row!);
}

export async function deleteHandout(db: DbOrTx, worldId: string, id: string): Promise<void> {
  const existing = await getRow(db, worldId, id);
  await db.delete(handouts).where(eq(handouts.id, existing.id));
  await removeImageFiles(worldId, existing.id);
}

/** Stores (or replaces) the handout's picture; the picture is checked and re-encoded as WebP. */
export async function setHandoutImage(
  db: DbOrTx,
  worldId: string,
  id: string,
  sourcePath: string,
): Promise<Handout> {
  const existing = await getRow(db, worldId, id);
  const stored = await storeImage(sourcePath, worldId, existing.id);
  const [row] = await db
    .update(handouts)
    .set({
      imageWidth: stored.width,
      imageHeight: stored.height,
      imageVersion: sql`${handouts.imageVersion} + 1`,
    })
    .where(eq(handouts.id, existing.id))
    .returning();
  return toHandout(row!);
}

export async function removeHandoutImage(
  db: DbOrTx,
  worldId: string,
  id: string,
): Promise<Handout> {
  const existing = await getRow(db, worldId, id);
  await removeImageFiles(worldId, existing.id);
  const [row] = await db
    .update(handouts)
    .set({
      imageWidth: null,
      imageHeight: null,
      imageVersion: sql`${handouts.imageVersion} + 1`,
    })
    .where(eq(handouts.id, existing.id))
    .returning();
  return toHandout(row!);
}

export async function readHandoutImage(
  db: DbOrTx,
  worldId: string,
  id: string,
  which: 'full' | 'thumb',
  audience: Audience,
): Promise<Buffer> {
  const row = await getRow(db, worldId, id, audience);
  if (row.imageWidth === null) throw notFound('Picture');
  try {
    return await readFile(which === 'full' ? fullPath(worldId, id) : thumbPath(worldId, id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw notFound('Picture');
    throw error;
  }
}

/** Every handout, for the world export. */
export async function listAllHandouts(db: DbOrTx, worldId: string): Promise<Handout[]> {
  return listHandouts(db, worldId, 'gm');
}
