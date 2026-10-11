import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { DEFAULT_CALENDAR, type Calendar, type calendarUpdateSchema } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { calendars } from '../../db/schema';

const DEFAULT_NAME = 'Default calendar';

/** The world's calendar, or the default one until it saves a calendar of its own. */
export async function getCalendar(db: DbOrTx, worldId: string): Promise<Calendar> {
  const [row] = await db.select().from(calendars).where(eq(calendars.worldId, worldId));
  if (!row) {
    return { name: DEFAULT_NAME, definition: DEFAULT_CALENDAR, isDefault: true, updatedAt: null };
  }
  return {
    name: row.name,
    definition: row.definition,
    isDefault: false,
    updatedAt: row.updatedAt.toISOString(),
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
