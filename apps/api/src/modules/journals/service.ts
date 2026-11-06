import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import type { Audience, Journal, PlayerJournal } from '@atlas/shared';
import { user } from '../../db/auth-schema';
import type { DbOrTx } from '../../db/client';
import { entities, entityJournals } from '../../db/schema';
import { notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';

/** The entry must be live and something this audience may see, or the notes are not theirs to keep. */
async function assertEntry(db: DbOrTx, worldId: string, entityId: string, audience: Audience) {
  const [found] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(
        eq(entities.id, entityId),
        eq(entities.worldId, worldId),
        isNull(entities.deletedAt),
        visibleTo(entities.visibility, audience),
      ),
    );
  if (!found) throw notFound('Entry');
}

export async function getJournal(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  userId: string,
  audience: Audience,
): Promise<Journal> {
  await assertEntry(db, worldId, entityId, audience);
  const [row] = await db
    .select({ body: entityJournals.body, updatedAt: entityJournals.updatedAt })
    .from(entityJournals)
    .where(and(eq(entityJournals.entityId, entityId), eq(entityJournals.userId, userId)));
  return row
    ? { body: row.body, updatedAt: row.updatedAt.toISOString() }
    : { body: '', updatedAt: null };
}

/** Saves the notes; writing nothing removes them. */
export async function saveJournal(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  userId: string,
  audience: Audience,
  body: string,
): Promise<Journal> {
  await assertEntry(db, worldId, entityId, audience);
  if (body.trim() === '') {
    await db
      .delete(entityJournals)
      .where(and(eq(entityJournals.entityId, entityId), eq(entityJournals.userId, userId)));
    return { body: '', updatedAt: null };
  }
  const [row] = await db
    .insert(entityJournals)
    .values({ entityId, userId, worldId, body })
    .onConflictDoUpdate({
      target: [entityJournals.entityId, entityJournals.userId],
      set: { body, updatedAt: new Date() },
    })
    .returning({ updatedAt: entityJournals.updatedAt });
  return { body, updatedAt: row!.updatedAt.toISOString() };
}

/** Everyone else's notes on an entry, for the GM (their own are in `getJournal`). */
export async function listJournals(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  exceptUserId: string,
): Promise<PlayerJournal[]> {
  const rows = await db
    .select({
      body: entityJournals.body,
      updatedAt: entityJournals.updatedAt,
      authorId: user.id,
      authorName: user.name,
    })
    .from(entityJournals)
    .innerJoin(user, eq(user.id, entityJournals.userId))
    .where(
      and(
        eq(entityJournals.entityId, entityId),
        eq(entityJournals.worldId, worldId),
        ne(entityJournals.userId, exceptUserId),
      ),
    )
    .orderBy(asc(user.name));
  return rows.map((row) => ({
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
    author: { id: row.authorId, name: row.authorName },
  }));
}
