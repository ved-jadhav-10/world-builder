import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import {
  MAX_DIPLOMACY_SCORES,
  type Audience,
  type DiplomacyScore,
  type diplomacySetSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { diplomacyScores, entities } from '../../db/schema';
import { conflict, notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';

const low = alias(entities, 'low');
const high = alias(entities, 'high');

function select(db: DbOrTx) {
  return db
    .select({
      row: diplomacyScores,
      lowName: low.name,
      lowTypeId: low.typeId,
      highName: high.name,
      highTypeId: high.typeId,
    })
    .from(diplomacyScores)
    .innerJoin(low, eq(low.id, diplomacyScores.lowId))
    .innerJoin(high, eq(high.id, diplomacyScores.highId));
}

type Row = Awaited<ReturnType<typeof select>>[number];

function toScore({ row, lowName, lowTypeId, highName, highTypeId }: Row): DiplomacyScore {
  return {
    id: row.id,
    a: { id: row.lowId, name: lowName, typeId: lowTypeId },
    b: { id: row.highId, name: highName, typeId: highTypeId },
    score: row.score,
    notes: row.notes,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Standings between entries the audience can see. A standing set to a narrower visibility, or
 * touching an entry they cannot see, is left out so it never hints that something is hidden.
 */
export async function listDiplomacy(
  db: DbOrTx,
  worldId: string,
  audience: Audience = 'gm',
): Promise<DiplomacyScore[]> {
  const rows = await select(db)
    .where(
      and(
        eq(diplomacyScores.worldId, worldId),
        isNull(low.deletedAt),
        isNull(high.deletedAt),
        visibleTo(diplomacyScores.visibility, audience),
        visibleTo(low.visibility, audience),
        visibleTo(high.visibility, audience),
      ),
    )
    .orderBy(asc(diplomacyScores.createdAt), asc(diplomacyScores.id));
  return rows.map(toScore);
}

async function checkEntry(db: DbOrTx, worldId: string, id: string) {
  const [found] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.worldId, worldId), isNull(entities.deletedAt)));
  if (!found) throw notFound('Entry');
}

/** Sets the standing between two entries, replacing any earlier one. */
export async function setDiplomacy(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof diplomacySetSchema>,
): Promise<DiplomacyScore> {
  const a = input.aId.toLowerCase();
  const b = input.bId.toLowerCase();
  await checkEntry(db, worldId, a);
  await checkEntry(db, worldId, b);
  const [lowId, highId] = a < b ? [a, b] : [b, a];

  const [existing] = await db
    .select({ id: diplomacyScores.id })
    .from(diplomacyScores)
    .where(and(eq(diplomacyScores.lowId, lowId), eq(diplomacyScores.highId, highId)));
  if (!existing) {
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(diplomacyScores)
      .where(eq(diplomacyScores.worldId, worldId));
    if (total >= MAX_DIPLOMACY_SCORES) {
      throw conflict(`A world holds up to ${MAX_DIPLOMACY_SCORES} standings.`);
    }
  }
  const values = { score: input.score, notes: input.notes, visibility: input.visibility };
  const [saved] = existing
    ? await db
        .update(diplomacyScores)
        .set(values)
        .where(eq(diplomacyScores.id, existing.id))
        .returning({ id: diplomacyScores.id })
    : await db
        .insert(diplomacyScores)
        .values({ worldId, lowId, highId, ...values })
        .returning({ id: diplomacyScores.id });
  const [row] = await select(db).where(eq(diplomacyScores.id, saved!.id));
  return toScore(row!);
}

export async function deleteDiplomacy(db: DbOrTx, worldId: string, id: string): Promise<void> {
  const removed = await db
    .delete(diplomacyScores)
    .where(and(eq(diplomacyScores.id, id), eq(diplomacyScores.worldId, worldId)))
    .returning({ id: diplomacyScores.id });
  if (removed.length === 0) throw notFound('Standing');
}
