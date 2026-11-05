import { and, asc, eq, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  FAMILY_LINK_KEYS,
  type Audience,
  type FamilyData,
  type FamilyParams,
  type GraphData,
  type GraphEdge,
  type GraphParams,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, relationships, relationshipTypes } from '../../db/schema';
import { notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';

/** The most links read when looking for the best-connected entries of a whole world. */
const WORLD_EDGE_SCAN = 5000;
/** A family tree stops growing here, whatever the generations asked for. */
const MAX_FAMILY_PEOPLE = 250;

interface EdgeFilter {
  where?: SQL | undefined;
  day?: number | undefined;
  limit?: number;
}

/**
 * Links between entries the audience can see, neither end trashed. A link to an entry the
 * audience cannot see is left out, so the picture never shows that something hidden exists.
 */
async function visibleEdges(
  db: DbOrTx,
  worldId: string,
  audience: Audience,
  { where, day, limit }: EdgeFilter = {},
): Promise<(GraphEdge & { key: string })[]> {
  const source = alias(entities, 'source');
  const target = alias(entities, 'target');
  const query = db
    .select({
      id: relationships.id,
      sourceId: relationships.sourceId,
      targetId: relationships.targetId,
      typeId: relationships.typeId,
      key: relationshipTypes.key,
      label: relationshipTypes.label,
      inverseLabel: relationshipTypes.inverseLabel,
      validFromDay: relationships.validFromDay,
      validToDay: relationships.validToDay,
    })
    .from(relationships)
    .innerJoin(relationshipTypes, eq(relationshipTypes.id, relationships.typeId))
    .innerJoin(source, eq(source.id, relationships.sourceId))
    .innerJoin(target, eq(target.id, relationships.targetId))
    .where(
      and(
        eq(relationships.worldId, worldId),
        isNull(relationships.deletedAt),
        isNull(source.deletedAt),
        isNull(target.deletedAt),
        visibleTo(source.visibility, audience),
        visibleTo(target.visibility, audience),
        day === undefined
          ? undefined
          : and(
              or(isNull(relationships.validFromDay), lte(relationships.validFromDay, day)),
              or(isNull(relationships.validToDay), gte(relationships.validToDay, day)),
            ),
        where,
      ),
    )
    .orderBy(asc(relationships.createdAt), asc(relationships.id));
  return limit ? query.limit(limit) : query;
}

async function nodeDetails(db: DbOrTx, worldId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: entities.id, name: entities.name, typeId: entities.typeId })
    .from(entities)
    .where(
      and(eq(entities.worldId, worldId), inArray(entities.id, ids), isNull(entities.deletedAt)),
    );
}

async function requireVisibleEntity(db: DbOrTx, worldId: string, id: string, audience: Audience) {
  const [row] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(
        eq(entities.id, id),
        eq(entities.worldId, worldId),
        isNull(entities.deletedAt),
        visibleTo(entities.visibility, audience),
      ),
    );
  if (!row) throw notFound('Entry');
}

const strip = ({ key: _key, ...edge }: GraphEdge & { key: string }): GraphEdge => edge;

/**
 * The relationship graph: the neighbourhood of one entry, to a depth, or (with no focus) the
 * best-connected entries of the world. Only links among the entries shown are returned.
 */
export async function getGraph(
  db: DbOrTx,
  worldId: string,
  audience: Audience,
  query: GraphParams,
): Promise<GraphData> {
  const { focus, depth, limit, day } = query;
  let ids: string[];
  let truncated = false;

  if (focus) {
    await requireVisibleEntity(db, worldId, focus, audience);
    const included = new Set<string>([focus]);
    let frontier = [focus];
    for (let step = 0; step < depth && frontier.length > 0; step++) {
      const edges = await visibleEdges(db, worldId, audience, {
        day,
        where: or(
          inArray(relationships.sourceId, frontier),
          inArray(relationships.targetId, frontier),
        ),
      });
      const next: string[] = [];
      for (const edge of edges) {
        for (const id of [edge.sourceId, edge.targetId]) {
          if (included.has(id)) continue;
          if (included.size >= limit) {
            truncated = true;
            continue;
          }
          included.add(id);
          next.push(id);
        }
      }
      frontier = next;
    }
    ids = [...included];
  } else {
    // Rank by how many links touch each entry, among the first links found.
    const edges = await visibleEdges(db, worldId, audience, { day, limit: WORLD_EDGE_SCAN });
    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
      degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
    }
    const ranked = [...degree.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    truncated = ranked.length > limit;
    ids = ranked.slice(0, limit).map(([id]) => id);
  }

  const edges =
    ids.length === 0
      ? []
      : await visibleEdges(db, worldId, audience, {
          day,
          where: and(inArray(relationships.sourceId, ids), inArray(relationships.targetId, ids)),
        });
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
    degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
  }
  const details = await nodeDetails(db, worldId, ids);
  const order = new Map(ids.map((id, i) => [id, i]));
  return {
    focusId: focus ?? null,
    nodes: details
      .map((row) => ({ ...row, degree: degree.get(row.id) ?? 0 }))
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!),
    edges: edges.map(strip),
    truncated,
  };
}

/**
 * A person's family: ancestors up a number of generations, descendants down a number, and the
 * spouses and siblings of everyone found. Only "parent of", "spouse of" and "sibling of" count.
 */
export async function getFamily(
  db: DbOrTx,
  worldId: string,
  audience: Audience,
  focusId: string,
  query: FamilyParams,
): Promise<FamilyData> {
  await requireVisibleEntity(db, worldId, focusId, audience);
  const types = await db
    .select({ id: relationshipTypes.id, key: relationshipTypes.key })
    .from(relationshipTypes)
    .where(
      and(
        eq(relationshipTypes.worldId, worldId),
        inArray(relationshipTypes.key, Object.values(FAMILY_LINK_KEYS)),
      ),
    );
  const typeIds = (key: string) => types.filter((t) => t.key === key).map((t) => t.id);
  const parentTypes = typeIds(FAMILY_LINK_KEYS.parent);
  const sideTypes = [...typeIds(FAMILY_LINK_KEYS.spouse), ...typeIds(FAMILY_LINK_KEYS.sibling)];
  const familyTypes = [...parentTypes, ...sideTypes];

  const people = new Set<string>([focusId]);
  const walk = async (direction: 'up' | 'down', generations: number) => {
    let frontier = [focusId];
    for (let step = 0; step < generations && frontier.length > 0 && parentTypes.length; step++) {
      const edges = await visibleEdges(db, worldId, audience, {
        where: and(
          inArray(relationships.typeId, parentTypes),
          direction === 'up'
            ? inArray(relationships.targetId, frontier)
            : inArray(relationships.sourceId, frontier),
        ),
      });
      const next: string[] = [];
      for (const edge of edges) {
        const other = direction === 'up' ? edge.sourceId : edge.targetId;
        if (people.has(other) || people.size >= MAX_FAMILY_PEOPLE) continue;
        people.add(other);
        next.push(other);
      }
      frontier = next;
    }
  };
  await walk('up', query.up);
  await walk('down', query.down);

  // Spouses and siblings of everyone found, one step, without following their own lines.
  if (sideTypes.length) {
    const current = [...people];
    const edges = await visibleEdges(db, worldId, audience, {
      where: and(
        inArray(relationships.typeId, sideTypes),
        or(inArray(relationships.sourceId, current), inArray(relationships.targetId, current)),
      ),
    });
    for (const edge of edges) {
      for (const id of [edge.sourceId, edge.targetId]) {
        if (!people.has(id) && people.size < MAX_FAMILY_PEOPLE) people.add(id);
      }
    }
  }

  const ids = [...people];
  const edges = familyTypes.length
    ? await visibleEdges(db, worldId, audience, {
        where: and(
          inArray(relationships.typeId, familyTypes),
          inArray(relationships.sourceId, ids),
          inArray(relationships.targetId, ids),
        ),
      })
    : [];
  const details = await nodeDetails(db, worldId, ids);
  return {
    focusId,
    people: details.sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1)),
    parentOf: edges
      .filter((e) => e.key === FAMILY_LINK_KEYS.parent)
      .map((e) => ({ parentId: e.sourceId, childId: e.targetId })),
    spouses: edges
      .filter((e) => e.key === FAMILY_LINK_KEYS.spouse)
      .map((e): [string, string] => [e.sourceId, e.targetId]),
    siblings: edges
      .filter((e) => e.key === FAMILY_LINK_KEYS.sibling)
      .map((e): [string, string] => [e.sourceId, e.targetId]),
  };
}
