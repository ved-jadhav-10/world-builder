import { and, asc, count, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  DEFAULT_CALENDAR,
  MAX_EXTRA_CALENDARS,
  type Calendar,
  type calendarUpdateSchema,
  type ExtraCalendar,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { calendars, extraCalendars, worlds } from '../../db/schema';
import { conflict, notFound } from '../../errors';

const DEFAULT_NAME = 'Default calendar';

async function getToday(db: DbOrTx, worldId: string): Promise<number | null> {
  const [row] = await db
    .select({ today: worlds.currentDay })
    .from(worlds)
    .where(eq(worlds.id, worldId));
  return row?.today ?? null;
}

/** The world's calendar, or the default one until it saves a calendar of its own. */
export async function getCalendar(db: DbOrTx, worldId: string): Promise<Calendar> {
  const [row] = await db.select().from(calendars).where(eq(calendars.worldId, worldId));
  const today = await getToday(db, worldId);
  if (!row) {
    return {
      name: DEFAULT_NAME,
      definition: DEFAULT_CALENDAR,
      isDefault: true,
      updatedAt: null,
      today,
    };
  }
  return {
    name: row.name,
    definition: row.definition,
    isDefault: false,
    updatedAt: row.updatedAt.toISOString(),
    today,
  };
}

/** The calendar the world saved, or null if it still uses the default one (for the export). */
export async function getSavedCalendar(
  db: DbOrTx,
  worldId: string,
): Promise<Pick<Calendar, 'name' | 'definition'> | null> {
  const calendar = await getCalendar(db, worldId);
  return calendar.isDefault ? null : { name: calendar.name, definition: calendar.definition };
}

/**
 * Saves the calendar. Dates are stored as day counts, so changing month lengths or leap rules
 * moves where existing dates fall in the calendar, but never reorders them.
 */
export async function saveCalendar(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof calendarUpdateSchema>,
): Promise<Calendar> {
  await db
    .insert(calendars)
    .values({ worldId, name: input.name, definition: input.definition })
    .onConflictDoUpdate({
      target: calendars.worldId,
      set: { name: input.name, definition: input.definition },
    });
  return getCalendar(db, worldId);
}

/** Sets or clears the world's "today". */
export async function setToday(db: DbOrTx, worldId: string, day: number | null): Promise<Calendar> {
  await db.update(worlds).set({ currentDay: day }).where(eq(worlds.id, worldId));
  return getCalendar(db, worldId);
}

// ---- Further calendars ---------------------------------------------------------------------

type ExtraRow = typeof extraCalendars.$inferSelect;

const toExtra = (row: ExtraRow): ExtraCalendar => ({
  id: row.id,
  name: row.name,
  definition: row.definition,
  updatedAt: row.updatedAt.toISOString(),
});

export async function listExtraCalendars(db: DbOrTx, worldId: string): Promise<ExtraCalendar[]> {
  const rows = await db
    .select()
    .from(extraCalendars)
    .where(eq(extraCalendars.worldId, worldId))
    .orderBy(asc(extraCalendars.createdAt), asc(extraCalendars.id));
  return rows.map(toExtra);
}

export async function createExtraCalendar(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof calendarUpdateSchema>,
): Promise<ExtraCalendar> {
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(extraCalendars)
    .where(eq(extraCalendars.worldId, worldId));
  if (total >= MAX_EXTRA_CALENDARS) {
    throw conflict(`A world keeps up to ${MAX_EXTRA_CALENDARS} further calendars.`);
  }
  const [row] = await db
    .insert(extraCalendars)
    .values({ worldId, name: input.name, definition: input.definition })
    .returning();
  return toExtra(row!);
}

export async function updateExtraCalendar(
  db: DbOrTx,
  worldId: string,
  id: string,
  input: z.output<typeof calendarUpdateSchema>,
): Promise<ExtraCalendar> {
  const [row] = await db
    .update(extraCalendars)
    .set({ name: input.name, definition: input.definition })
    .where(and(eq(extraCalendars.id, id), eq(extraCalendars.worldId, worldId)))
    .returning();
  if (!row) throw notFound('Calendar');
  return toExtra(row);
}

export async function deleteExtraCalendar(db: DbOrTx, worldId: string, id: string): Promise<void> {
  const removed = await db
    .delete(extraCalendars)
    .where(and(eq(extraCalendars.id, id), eq(extraCalendars.worldId, worldId)))
    .returning({ id: extraCalendars.id });
  if (removed.length === 0) throw notFound('Calendar');
}
