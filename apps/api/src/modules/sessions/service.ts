import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  SESSION_NUMBER_FIELD,
  SESSION_PLAYED_ON_FIELD,
  SESSION_STATUS_FIELD,
  SESSION_TYPE_KEY,
  entityCreateSchema,
  type Audience,
  type Entity,
  type SessionCreateInput,
  type SessionSummary,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, entityTypes } from '../../db/schema';
import { badRequest } from '../../errors';
import { loadEntryLinks } from '../../lib/entry-links';
import { visibleTo } from '../../lib/visibility';
import { createEntity } from '../entities/service';

async function sessionTypeId(db: DbOrTx, worldId: string): Promise<string | null> {
  const [type] = await db
    .select({ id: entityTypes.id })
    .from(entityTypes)
    .where(and(eq(entityTypes.worldId, worldId), eq(entityTypes.key, SESSION_TYPE_KEY)));
  return type?.id ?? null;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Every session the audience can see, newest first, with what each features. Sessions are
 * ordinary entries of the built-in "session" type, so visibility, search, tags, dates and
 * relationships all work as usual; a recap shared with the players is just a visible entry.
 */
export async function listSessions(
  db: DbOrTx,
  worldId: string,
  audience: Audience = 'gm',
): Promise<SessionSummary[]> {
  const typeId = await sessionTypeId(db, worldId);
  if (!typeId) return [];
  const rows = await db
    .select({
      id: entities.id,
      name: entities.name,
      summary: entities.summary,
      fields: entities.fields,
      visibility: entities.visibility,
      updatedAt: entities.updatedAt,
    })
    .from(entities)
    .where(
      and(
        eq(entities.worldId, worldId),
        eq(entities.typeId, typeId),
        isNull(entities.deletedAt),
        visibleTo(entities.visibility, audience),
      ),
    );
  const links = await loadEntryLinks(
    db,
    worldId,
    rows.map((row) => row.id),
    audience,
  );
  const sessions = rows.map((row): SessionSummary => {
    const number = row.fields[SESSION_NUMBER_FIELD];
    return {
      id: row.id,
      name: row.name,
      summary: row.summary,
      number: typeof number === 'number' ? number : null,
      status: text(row.fields[SESSION_STATUS_FIELD]),
      playedOn: text(row.fields[SESSION_PLAYED_ON_FIELD]),
      visibility: row.visibility,
      updatedAt: row.updatedAt.toISOString(),
      links: links.get(row.id) ?? [],
    };
  });
  // Highest number first; sessions without one come last, most recently edited first.
  return sessions.sort(
    (a, b) =>
      (b.number ?? -Infinity) - (a.number ?? -Infinity) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** Starts the next session: the next number after the highest one, planned, GM-only unless asked. */
export async function createSession(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: SessionCreateInput,
): Promise<Entity> {
  const typeId = await sessionTypeId(db, worldId);
  if (!typeId) {
    throw badRequest(
      'This world has no Session type. Add one in Manage types to keep session notes.',
    );
  }
  // Every session in the world counts, whoever can see it, so numbers never repeat.
  const [top] = await db
    .select({
      highest: sql<string | null>`max((${entities.fields}->>${SESSION_NUMBER_FIELD})::numeric)`,
    })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), eq(entities.typeId, typeId)));
  const number = Math.floor(Number(top?.highest ?? 0)) + 1;
  return createEntity(
    db,
    worldId,
    userId,
    entityCreateSchema.parse({
      typeId,
      name: input.name ?? `Session ${number}`,
      visibility: input.visibility ?? 'gm',
      fields: { [SESSION_NUMBER_FIELD]: number, [SESSION_STATUS_FIELD]: 'Planned' },
    }),
  );
}
