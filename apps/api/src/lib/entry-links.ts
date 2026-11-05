import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Audience, EntryLink } from '@atlas/shared';
import type { DbOrTx } from '../db/client';
import { entities, relationships, relationshipTypes } from '../db/schema';
import { visibleTo } from './visibility';

/**
 * What each of the given entries is linked to, in both directions, by entry. Entries the
 * audience cannot see (or that are in the trash) are left out, so a link never leaks one.
 */
export async function loadEntryLinks(
  db: DbOrTx,
  worldId: string,
  ids: string[],
  audience: Audience,
): Promise<Map<string, EntryLink[]>> {
  const byEntry = new Map<string, EntryLink[]>();
  if (ids.length === 0) return byEntry;
  const other = alias(entities, 'other');
  const links = await db
    .select({
      sourceId: relationships.sourceId,
      targetId: relationships.targetId,
      label: relationshipTypes.label,
      inverseLabel: relationshipTypes.inverseLabel,
      otherId: other.id,
      otherName: other.name,
      otherTypeId: other.typeId,
    })
    .from(relationships)
    .innerJoin(relationshipTypes, eq(relationshipTypes.id, relationships.typeId))
    .innerJoin(
      other,
      or(
        and(inArray(relationships.sourceId, ids), eq(other.id, relationships.targetId)),
        and(inArray(relationships.targetId, ids), eq(other.id, relationships.sourceId)),
      ),
    )
    .where(
      and(
        eq(relationships.worldId, worldId),
        isNull(relationships.deletedAt),
        isNull(other.deletedAt),
        visibleTo(other.visibility, audience),
      ),
    )
    .orderBy(asc(other.name));

  for (const link of links) {
    const outgoing = ids.includes(link.sourceId);
    const entryId = outgoing ? link.sourceId : link.targetId;
    byEntry.set(entryId, [
      ...(byEntry.get(entryId) ?? []),
      {
        label: outgoing ? link.label : link.inverseLabel,
        other: { id: link.otherId, name: link.otherName, typeId: link.otherTypeId },
      },
    ]);
  }
  return byEntry;
}
