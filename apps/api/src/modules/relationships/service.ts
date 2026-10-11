import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  Audience,
  EntityRelationship,
  relationshipCreateSchema,
  relationshipUpdateSchema,
  RelationshipType,
  relationshipTypeCreateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, relationships, relationshipTypes } from '../../db/schema';
import { badRequest, conflict, notFound } from '../../errors';
import { uniqueKey } from '../../lib/keys';
import { visibleTo } from '../../lib/visibility';
import { getEntityRow } from '../entities/service';

type RelationshipTypeRow = typeof relationshipTypes.$inferSelect;

function toRelationshipType(row: RelationshipTypeRow): RelationshipType {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    inverseLabel: row.inverseLabel,
    isBuiltin: row.isBuiltin,
  };
}

export async function listRelationshipTypes(
  db: DbOrTx,
  worldId: string,
): Promise<RelationshipType[]> {
  const rows = await db
    .select()
    .from(relationshipTypes)
    .where(eq(relationshipTypes.worldId, worldId))
    .orderBy(asc(relationshipTypes.label));
  return rows.map(toRelationshipType);
}

export async function createRelationshipType(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof relationshipTypeCreateSchema>,
): Promise<RelationshipType> {
  const existing = await db
    .select({ key: relationshipTypes.key })
    .from(relationshipTypes)
    .where(eq(relationshipTypes.worldId, worldId));
  const [row] = await db
    .insert(relationshipTypes)
    .values({
      ...input,
      worldId,
      key: uniqueKey(input.label, new Set(existing.map((e) => e.key)), 'link'),
    })
    .returning();
  return toRelationshipType(row!);
}

export async function deleteRelationshipType(
  db: DbOrTx,
  worldId: string,
  typeId: string,
): Promise<void> {
  const [type] = await db
    .select({ id: relationshipTypes.id })
    .from(relationshipTypes)
    .where(and(eq(relationshipTypes.id, typeId), eq(relationshipTypes.worldId, worldId)));
  if (!type) throw notFound('Relationship type');
  const [used] = await db
    .select({ n: count() })
    .from(relationships)
    .where(eq(relationships.typeId, typeId));
  if ((used?.n ?? 0) > 0) throw conflict('This relationship type is still in use');
  await db.delete(relationshipTypes).where(eq(relationshipTypes.id, typeId));
}

/** Both directions of an entity's links; incoming ones read with the inverse label. */
export async function listEntityRelationships(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  audience: Audience = 'gm',
): Promise<EntityRelationship[]> {
  await getEntityRow(db, worldId, entityId, audience);

  const query = (direction: 'outgoing' | 'incoming') => {
    const self = direction === 'outgoing' ? relationships.sourceId : relationships.targetId;
    const other = direction === 'outgoing' ? relationships.targetId : relationships.sourceId;
    return db
      .select({
        id: relationships.id,
        typeId: relationships.typeId,
        notes: relationships.notes,
        validFromDay: relationships.validFromDay,
        validToDay: relationships.validToDay,
        label: direction === 'outgoing' ? relationshipTypes.label : relationshipTypes.inverseLabel,
        otherId: entities.id,
        otherName: entities.name,
        otherTypeId: entities.typeId,
      })
      .from(relationships)
      .innerJoin(relationshipTypes, eq(relationshipTypes.id, relationships.typeId))
      .innerJoin(entities, eq(entities.id, other))
      .where(
        and(
          eq(self, entityId),
          eq(relationships.worldId, worldId),
          isNull(relationships.deletedAt),
          isNull(entities.deletedAt),
          // The entry at the other end is hidden from this audience, so the link is too.
          visibleTo(entities.visibility, audience),
        ),
      );
  };

  const [outgoing, incoming] = await Promise.all([query('outgoing'), query('incoming')]);
  const toDto =
    (direction: EntityRelationship['direction']) =>
    (r: Awaited<ReturnType<typeof query>>[number]): EntityRelationship => ({
      id: r.id,
      direction,
      typeId: r.typeId,
      label: r.label,
      notes: r.notes,
      validFromDay: r.validFromDay,
      validToDay: r.validToDay,
      other: { id: r.otherId, name: r.otherName, typeId: r.otherTypeId },
    });

  return [...outgoing.map(toDto('outgoing')), ...incoming.map(toDto('incoming'))].sort(
    (a, b) => a.label.localeCompare(b.label) || a.other.name.localeCompare(b.other.name),
  );
}

export async function createRelationship(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof relationshipCreateSchema>,
): Promise<EntityRelationship> {
  const endpoints = await db
    .select({ id: entities.id, name: entities.name, typeId: entities.typeId })
    .from(entities)
    .where(
      and(
        inArray(entities.id, [input.sourceId, input.targetId]),
        eq(entities.worldId, worldId),
        isNull(entities.deletedAt),
      ),
    );
  const target = endpoints.find((e) => e.id === input.targetId);
  if (endpoints.length !== 2 || !target) throw notFound('Entity');

  const [type] = await db
    .select()
    .from(relationshipTypes)
    .where(and(eq(relationshipTypes.id, input.typeId), eq(relationshipTypes.worldId, worldId)));
  if (!type) throw badRequest('Unknown relationship type');

  const [duplicate] = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(
      and(
        eq(relationships.sourceId, input.sourceId),
        eq(relationships.targetId, input.targetId),
        eq(relationships.typeId, input.typeId),
        isNull(relationships.deletedAt),
      ),
    );
  if (duplicate) throw conflict('These entities are already linked that way');

  const [row] = await db
    .insert(relationships)
    .values({ ...input, worldId })
    .returning();
  return {
    id: row!.id,
    direction: 'outgoing',
    typeId: type.id,
    label: type.label,
    notes: row!.notes,
    validFromDay: row!.validFromDay,
    validToDay: row!.validToDay,
    other: target,
  };
}

/** Sets a link's notes and the period it holds for. Returns the new values. */
export async function updateRelationship(
  db: DbOrTx,
  worldId: string,
  relationshipId: string,
  input: z.output<typeof relationshipUpdateSchema>,
): Promise<{ id: string; notes: string; validFromDay: number | null; validToDay: number | null }> {
  const [existing] = await db
    .select()
    .from(relationships)
    .where(
      and(
        eq(relationships.id, relationshipId),
        eq(relationships.worldId, worldId),
        isNull(relationships.deletedAt),
      ),
    );
  if (!existing) throw notFound('Relationship');
  // The schema checks the order of dates sent together; check against the stored one too.
  const from = input.validFromDay === undefined ? existing.validFromDay : input.validFromDay;
  const to = input.validToDay === undefined ? existing.validToDay : input.validToDay;
  if (from !== null && to !== null && to < from) {
    throw badRequest('The end cannot come before the start');
  }
  const [row] = await db
    .update(relationships)
    .set(input)
    .where(eq(relationships.id, existing.id))
    .returning();
  return {
    id: row!.id,
    notes: row!.notes,
    validFromDay: row!.validFromDay,
    validToDay: row!.validToDay,
  };
}

export async function deleteRelationship(
  db: DbOrTx,
  worldId: string,
  relationshipId: string,
): Promise<void> {
  const [row] = await db
    .update(relationships)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(relationships.id, relationshipId),
        eq(relationships.worldId, worldId),
        isNull(relationships.deletedAt),
      ),
    )
    .returning({ id: relationships.id });
  if (!row) throw notFound('Relationship');
}
