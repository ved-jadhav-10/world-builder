import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { Audience, SearchResult, searchQuerySchema } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities } from '../../db/schema';
import { visibleTo } from '../../lib/visibility';

/**
 * Turns free text into a prefix tsquery: "gild ee" -> "gild:* & ee:*".
 * Only letters and digits survive, so user input can't inject tsquery syntax.
 */
export function toPrefixQuery(text: string): string | null {
  const terms = text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return terms?.length ? terms.map((t) => `${t}:*`).join(' & ') : null;
}

export async function searchEntities(
  db: DbOrTx,
  worldId: string,
  query: z.output<typeof searchQuerySchema>,
  audience: Audience = 'gm',
): Promise<SearchResult[]> {
  const prefixQuery = toPrefixQuery(query.q);
  if (!prefixQuery) return [];
  const tsquery = sql`to_tsquery('simple', ${prefixQuery})`;

  const conditions: SQL[] = [
    eq(entities.worldId, worldId),
    isNull(entities.deletedAt),
    sql`${entities.searchVector} @@ ${tsquery}`,
  ];
  if (query.typeId) conditions.push(eq(entities.typeId, query.typeId));
  const visible = visibleTo(entities.visibility, audience);
  if (visible) conditions.push(visible);

  return db
    .select({
      id: entities.id,
      typeId: entities.typeId,
      name: entities.name,
      aliases: entities.aliases,
      summary: entities.summary,
    })
    .from(entities)
    .where(and(...conditions))
    .orderBy(
      // Names starting with the query, then any name-word match, before alias/body matches.
      desc(sql`starts_with(lower(${entities.name}), ${query.q.toLowerCase()})`),
      desc(sql`to_tsvector('simple', ${entities.name}) @@ ${tsquery}`),
      desc(sql`ts_rank(${entities.searchVector}, ${tsquery})`),
      sql`lower(${entities.name})`,
    )
    .limit(query.limit);
}
