import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { z } from 'zod';
import {
  buildFieldValuesSchema,
  type Audience,
  type Progression,
  type ProgressionChanges,
  type progressionCreateSchema,
  type progressionUpdateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { manuscriptNodes, progressions } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';
import { getEntityRow } from '../entities/service';
import { getEntityTypeRow } from '../entity-types/service';

type ProgressionRow = typeof progressions.$inferSelect;

function toProgression(row: ProgressionRow): Progression {
  return {
    id: row.id,
    entityId: row.entityId,
    title: row.title,
    note: row.note,
    sceneId: row.sceneId,
    day: row.day,
    changes: row.changes,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getProgressionRow(
  db: DbOrTx,
  worldId: string,
  progressionId: string,
): Promise<ProgressionRow> {
  const [row] = await db
    .select()
    .from(progressions)
    .where(and(eq(progressions.id, progressionId), eq(progressions.worldId, worldId)));
  if (!row) throw notFound('Progression');
  return row;
}

async function assertScene(db: DbOrTx, worldId: string, sceneId: string) {
  const [row] = await db
    .select({ id: manuscriptNodes.id })
    .from(manuscriptNodes)
    .where(
      and(
        eq(manuscriptNodes.id, sceneId),
        eq(manuscriptNodes.worldId, worldId),
        eq(manuscriptNodes.kind, 'scene'),
      ),
    );
  if (!row) throw notFound('Scene');
}

/**
 * Field changes are checked against the entry's type, like the entry's own fields. Unlike
 * those, a null is kept: it means "no longer has this".
 */
async function cleanChanges(
  db: DbOrTx,
  worldId: string,
  typeId: string,
  changes: ProgressionChanges,
): Promise<ProgressionChanges> {
  const type = await getEntityTypeRow(db, worldId, typeId);
  return {
    ...(changes.fields
      ? { fields: buildFieldValuesSchema(type.fieldSchema).parse(changes.fields) }
      : {}),
    ...(changes.summary !== undefined ? { summary: changes.summary } : {}),
  };
}

/**
 * An entry's progressions. Other audiences only get the ones shared with them, and only those set
 * on an in-world day: a scene anchor would point into the author's manuscript.
 */
export async function listProgressions(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  audience: Audience = 'gm',
): Promise<Progression[]> {
  await getEntityRow(db, worldId, entityId, audience);
  const rows = await db
    .select()
    .from(progressions)
    .where(
      and(
        eq(progressions.worldId, worldId),
        eq(progressions.entityId, entityId),
        visibleTo(progressions.visibility, audience),
        audience === 'gm' ? undefined : isNotNull(progressions.day),
      ),
    )
    .orderBy(asc(progressions.createdAt));
  return rows.map(toProgression);
}

/** Every progression in the world, for the export. */
export async function listWorldProgressions(db: DbOrTx, worldId: string): Promise<Progression[]> {
  const rows = await db
    .select()
    .from(progressions)
    .where(eq(progressions.worldId, worldId))
    .orderBy(asc(progressions.createdAt));
  return rows.map(toProgression);
}

export async function createProgression(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  input: z.output<typeof progressionCreateSchema>,
): Promise<Progression> {
  const entity = await getEntityRow(db, worldId, entityId);
  if (input.sceneId) await assertScene(db, worldId, input.sceneId);
  const [row] = await db
    .insert(progressions)
    .values({
      worldId,
      entityId,
      title: input.title,
      note: input.note,
      sceneId: input.sceneId,
      day: input.day,
      visibility: input.visibility,
      changes: await cleanChanges(db, worldId, entity.typeId, input.changes),
    })
    .returning();
  return toProgression(row!);
}

export async function updateProgression(
  db: DbOrTx,
  worldId: string,
  progressionId: string,
  input: z.output<typeof progressionUpdateSchema>,
): Promise<Progression> {
  const existing = await getProgressionRow(db, worldId, progressionId);
  // Moving it to another place in the story must still leave exactly one anchor.
  if (input.sceneId !== undefined || input.day !== undefined) {
    const sceneId = input.sceneId === undefined ? existing.sceneId : input.sceneId;
    const day = input.day === undefined ? existing.day : input.day;
    if ((sceneId === null) === (day === null)) {
      throw badRequest('Place it at a scene or at a date, not both and not neither');
    }
    if (sceneId) await assertScene(db, worldId, sceneId);
  }
  const changes =
    input.changes === undefined
      ? undefined
      : await cleanChanges(
          db,
          worldId,
          (await getEntityRow(db, worldId, existing.entityId)).typeId,
          input.changes,
        );
  const [row] = await db
    .update(progressions)
    .set({ ...input, ...(changes ? { changes } : {}) })
    .where(eq(progressions.id, existing.id))
    .returning();
  return toProgression(row!);
}

export async function deleteProgression(
  db: DbOrTx,
  worldId: string,
  progressionId: string,
): Promise<void> {
  const existing = await getProgressionRow(db, worldId, progressionId);
  await db.delete(progressions).where(eq(progressions.id, existing.id));
}
