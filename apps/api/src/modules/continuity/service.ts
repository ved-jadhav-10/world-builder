import { and, eq, isNull } from 'drizzle-orm';
import {
  checkContinuity,
  yearLength,
  type ContinuityEntity,
  type ContinuityFinding,
  type ContinuityReport,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import {
  continuityDismissals,
  entities,
  entityTypes,
  manuscriptNodes,
  relationships,
  relationshipTypes,
  sceneMentions,
} from '../../db/schema';
import { getCalendar } from '../calendar/service';

/** Characters are the ones whose impossible dates are errors; places and things only get a note. */
const PERSON_TYPE_KEY = 'character';

/**
 * Runs the continuity rules over a world. It reads everything, including what is hidden from
 * players, because it is the author's tool: the route that serves it is for the GM's view only.
 */
export async function getContinuityReport(db: DbOrTx, worldId: string): Promise<ContinuityReport> {
  const [types, entityRows, sceneRows, mentionRows, linkRows, dismissals, calendar] =
    await Promise.all([
      db
        .select({ id: entityTypes.id, key: entityTypes.key })
        .from(entityTypes)
        .where(eq(entityTypes.worldId, worldId)),
      db
        .select({
          id: entities.id,
          name: entities.name,
          typeId: entities.typeId,
          startDay: entities.startDay,
          endDay: entities.endDay,
        })
        .from(entities)
        .where(and(eq(entities.worldId, worldId), isNull(entities.deletedAt))),
      db
        .select({
          id: manuscriptNodes.id,
          title: manuscriptNodes.title,
          povId: manuscriptNodes.povId,
          locationId: manuscriptNodes.locationId,
          day: manuscriptNodes.inWorldDay,
        })
        .from(manuscriptNodes)
        .where(and(eq(manuscriptNodes.worldId, worldId), eq(manuscriptNodes.kind, 'scene'))),
      db
        .select({ sceneId: sceneMentions.sceneId, entityId: sceneMentions.entityId })
        .from(sceneMentions)
        .innerJoin(manuscriptNodes, eq(manuscriptNodes.id, sceneMentions.sceneId))
        .where(eq(manuscriptNodes.worldId, worldId)),
      db
        .select({
          id: relationships.id,
          sourceId: relationships.sourceId,
          targetId: relationships.targetId,
          type: relationshipTypes.key,
          label: relationshipTypes.label,
          fromDay: relationships.validFromDay,
          toDay: relationships.validToDay,
        })
        .from(relationships)
        .innerJoin(relationshipTypes, eq(relationshipTypes.id, relationships.typeId))
        .where(and(eq(relationships.worldId, worldId), isNull(relationships.deletedAt))),
      db
        .select({ key: continuityDismissals.key })
        .from(continuityDismissals)
        .where(eq(continuityDismissals.worldId, worldId)),
      getCalendar(db, worldId),
    ]);

  const personTypes = new Set(types.filter((t) => t.key === PERSON_TYPE_KEY).map((t) => t.id));
  const checkable: ContinuityEntity[] = entityRows.map((e) => ({
    id: e.id,
    name: e.name,
    kind: personTypes.has(e.typeId) ? 'person' : 'other',
    startDay: e.startDay,
    endDay: e.endDay,
  }));

  const all = checkContinuity({
    entities: checkable,
    scenes: sceneRows,
    mentions: mentionRows,
    links: linkRows,
    daysPerYear: yearLength(calendar.definition, 0),
  });
  const dismissedKeys = new Set(dismissals.map((d) => d.key));
  const findings: ContinuityFinding[] = [];
  const dismissed: ContinuityFinding[] = [];
  for (const finding of all) (dismissedKeys.has(finding.key) ? dismissed : findings).push(finding);

  // Names for just what the findings mention.
  const entityIds = new Set<string>();
  const sceneIds = new Set<string>();
  const linkIds = new Set<string>();
  for (const f of all) {
    f.entityIds.forEach((id) => entityIds.add(id));
    f.sceneIds.forEach((id) => sceneIds.add(id));
    f.linkIds.forEach((id) => linkIds.add(id));
  }
  return {
    findings,
    dismissed,
    entities: entityRows
      .filter((e) => entityIds.has(e.id))
      .map(({ id, name, typeId }) => ({ id, name, typeId })),
    scenes: sceneRows.filter((s) => sceneIds.has(s.id)).map(({ id, title }) => ({ id, title })),
    linkLabels: Object.fromEntries(
      linkRows.filter((l) => linkIds.has(l.id)).map((l) => [l.id, l.label]),
    ),
    checked: { entries: entityRows.length, scenes: sceneRows.length, links: linkRows.length },
  };
}

export async function dismissFinding(
  db: DbOrTx,
  worldId: string,
  userId: string,
  key: string,
): Promise<void> {
  await db
    .insert(continuityDismissals)
    .values({ worldId, key, dismissedBy: userId })
    .onConflictDoNothing();
}

export async function restoreFinding(db: DbOrTx, worldId: string, key: string): Promise<void> {
  await db
    .delete(continuityDismissals)
    .where(and(eq(continuityDismissals.worldId, worldId), eq(continuityDismissals.key, key)));
}
