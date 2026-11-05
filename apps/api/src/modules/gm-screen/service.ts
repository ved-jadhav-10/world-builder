import { and, eq, inArray, isNull } from 'drizzle-orm';
import { gmScreenSchema, type GmScreen, type GmScreenInput, type GmWidget } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, gmScreens } from '../../db/schema';
import { summaryColumns, toSummary } from '../entities/service';

/** What a GM sees the first time: dice, the latest session and a scratchpad. */
const starterWidgets = (): GmWidget[] => [
  { id: 'starter-dice', type: 'dice', title: '' },
  { id: 'starter-session', type: 'session', title: '' },
  { id: 'starter-notes', type: 'notes', title: '', text: '' },
];

/** The entries the pinned-entries widgets point to, minus any that were trashed since. */
async function resolveEntries(db: DbOrTx, worldId: string, widgets: GmWidget[]) {
  const ids = [
    ...new Set(widgets.flatMap((widget) => (widget.type === 'entries' ? widget.entityIds : []))),
  ];
  if (ids.length === 0) return [];
  const rows = await db
    .select(summaryColumns)
    .from(entities)
    .where(
      and(eq(entities.worldId, worldId), inArray(entities.id, ids), isNull(entities.deletedAt)),
    );
  return rows.map(toSummary);
}

export async function getGmScreen(db: DbOrTx, worldId: string, userId: string): Promise<GmScreen> {
  const [row] = await db
    .select({ widgets: gmScreens.widgets })
    .from(gmScreens)
    .where(and(eq(gmScreens.worldId, worldId), eq(gmScreens.userId, userId)));
  const widgets = row?.widgets ?? starterWidgets();
  return { widgets, entries: await resolveEntries(db, worldId, widgets) };
}

export async function saveGmScreen(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: GmScreenInput,
): Promise<GmScreen> {
  const { widgets } = gmScreenSchema.parse(input);
  await db
    .insert(gmScreens)
    .values({ worldId, userId, widgets })
    .onConflictDoUpdate({
      target: [gmScreens.worldId, gmScreens.userId],
      set: { widgets, updatedAt: new Date() },
    });
  return { widgets, entries: await resolveEntries(db, worldId, widgets) };
}
