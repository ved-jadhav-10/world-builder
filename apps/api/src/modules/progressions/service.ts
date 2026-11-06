import { and, asc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { z } from 'zod';
import {
  fieldValuesFor,
  buildFieldValuesSchema,
  type Audience,
  type Progression,
  type ProgressionChanges,
  type progressionCreateSchema,
  type progressionUpdateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { manuscriptNodes, progressions, relationships, relationshipTypes } from '../../db/schema';
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

/** A link change must name a live link of this entry's, and a kind of link from this world. */
async function checkLinkChanges(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  list: NonNullable<ProgressionChanges['relationships']>,
) {
  if (list.length === 0) return;
  const linkIds = [...new Set(list.map((c) => c.relationshipId))];
  const found = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(
      and(
        eq(relationships.worldId, worldId),
        inArray(relationships.id, linkIds),
        isNull(relationships.deletedAt),
        or(eq(relationships.sourceId, entityId), eq(relationships.targetId, entityId)),
      ),
    );
  if (found.length !== linkIds.length) throw notFound('Relationship');
  const typeIds = [...new Set(list.flatMap((c) => (c.typeId ? [c.typeId] : [])))];
  if (typeIds.length > 0) {
    const types = await db
      .select({ id: relationshipTypes.id })
      .from(relationshipTypes)
      .where(and(eq(relationshipTypes.worldId, worldId), inArray(relationshipTypes.id, typeIds)));
    if (types.length !== typeIds.length) throw notFound('Relationship type');
  }
}

/**
 * Field changes are checked against the entry's type, like the entry's own fields. Unlike
 * those, a null is kept: it means "no longer has this".
 */
async function cleanChanges(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  typeId: string,
  changes: ProgressionChanges,
): Promise<ProgressionChanges> {
  const type = await getEntityTypeRow(db, worldId, typeId);
  await checkLinkChanges(db, worldId, entityId, changes.relationships ?? []);
  return {
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.aliases !== undefined ? { aliases: [...new Set(changes.aliases)] } : {}),
    ...(changes.relationships?.length ? { relationships: changes.relationships } : {}),
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
  const entity = await getEntityRow(db, worldId, entityId, audience);
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
  const list = rows.map(toProgression);
  if (audience === 'gm') return list;
  // A change to a GM-only field would give the field away, so it is left out for everyone else.
  const { fieldSchema } = await getEntityTypeRow(db, worldId, entity.typeId);
  return list.map((item) =>
    item.changes.fields
      ? {
          ...item,
          changes: {
            ...item.changes,
            fields: fieldValuesFor(fieldSchema, item.changes.fields, audience),
          },
        }
      : item,
  );
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
      changes: await cleanChanges(db, worldId, entityId, entity.typeId, input.changes),
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
          existing.entityId,
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
