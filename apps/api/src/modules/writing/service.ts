import { and, desc, eq, gte, sql } from 'drizzle-orm';
import {
  addDays,
  computeStreaks,
  manuscriptProgress,
  wordsInLast,
  type SprintCreateInput,
  type WritingDay,
  type WritingGoals,
  type WritingGoalsInput,
  type WritingSprint,
  type WritingStats,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { manuscriptNodes, writingDays, writingGoals, writingSprints } from '../../db/schema';

/** The history the page keeps: enough for a year-long heatmap and for the longest streak. */
const HISTORY_DAYS = 371;
const RECENT_SPRINTS = 10;

type GoalsRow = typeof writingGoals.$inferSelect;

async function getGoalsRow(db: DbOrTx, worldId: string, userId: string) {
  const [row] = await db
    .select()
    .from(writingGoals)
    .where(and(eq(writingGoals.worldId, worldId), eq(writingGoals.userId, userId)));
  return row;
}

/** Makes sure this person has a goals row, so their days keep being counted in one zone. */
async function ensureGoalsRow(
  db: DbOrTx,
  worldId: string,
  userId: string,
  timezone: string,
): Promise<GoalsRow> {
  await db.insert(writingGoals).values({ worldId, userId, timezone }).onConflictDoNothing();
  return (await getGoalsRow(db, worldId, userId))!;
}

const toGoals = (row: GoalsRow): WritingGoals => ({
  dailyWords: row.dailyWords,
  totalWords: row.totalWords,
  deadline: row.deadline,
});

/**
 * Today's date in a time zone, "YYYY-MM-DD". Worked out here rather than in Postgres: browsers
 * and Node accept the same zone names (aliases such as Asia/Calcutta included), while a database
 * built with a newer or older zone list may not.
 */
function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** A scene's word count as saved, so a save can tell how many words it added or removed. */
export async function sceneWordCount(
  db: DbOrTx,
  worldId: string,
  sceneId: string,
): Promise<number> {
  const [row] = await db
    .select({ wordCount: manuscriptNodes.wordCount })
    .from(manuscriptNodes)
    .where(and(eq(manuscriptNodes.id, sceneId), eq(manuscriptNodes.worldId, worldId)));
  return row?.wordCount ?? 0;
}

/** Adds `delta` words (negative for cut text) to today's total for this person. */
export async function recordWords(
  db: DbOrTx,
  worldId: string,
  userId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const goals = await ensureGoalsRow(db, worldId, userId, 'UTC');
  const day = todayIn(goals.timezone);
  await db
    .insert(writingDays)
    .values({ worldId, userId, day, words: delta })
    .onConflictDoUpdate({
      target: [writingDays.worldId, writingDays.userId, writingDays.day],
      set: { words: sql`${writingDays.words} + ${delta}` },
    });
}

export async function getWritingStats(
  db: DbOrTx,
  worldId: string,
  userId: string,
  options: { weeks: number; timezone?: string },
): Promise<WritingStats> {
  // The zone is fixed the first time someone opens this page (or writes), then only changes
  // when they say so, so travelling does not shuffle the days already counted.
  const goalsRow = await ensureGoalsRow(db, worldId, userId, options.timezone ?? 'UTC');
  const today = todayIn(goalsRow.timezone);
  const since = addDays(today, -(HISTORY_DAYS - 1));

  const [dayRows, [manuscript], sprintRows] = await Promise.all([
    db
      .select({ day: writingDays.day, words: writingDays.words })
      .from(writingDays)
      .where(
        and(
          eq(writingDays.worldId, worldId),
          eq(writingDays.userId, userId),
          gte(writingDays.day, since),
        ),
      )
      .orderBy(writingDays.day),
    db
      .select({ words: sql<number>`coalesce(sum(${manuscriptNodes.wordCount}), 0)::int` })
      .from(manuscriptNodes)
      .where(and(eq(manuscriptNodes.worldId, worldId), eq(manuscriptNodes.kind, 'scene'))),
    db
      .select()
      .from(writingSprints)
      .where(and(eq(writingSprints.worldId, worldId), eq(writingSprints.userId, userId)))
      .orderBy(desc(writingSprints.createdAt))
      .limit(RECENT_SPRINTS),
  ]);

  const days: WritingDay[] = dayRows;
  const goals = toGoals(goalsRow);
  const manuscriptWords = manuscript?.words ?? 0;
  const shownFrom = addDays(today, -(options.weeks * 7 + 6));
  return {
    today,
    timezone: goalsRow.timezone,
    goals,
    todayWords: days.find((d) => d.day === today)?.words ?? 0,
    weekWords: wordsInLast(days, today, 7),
    streaks: computeStreaks(days, goals.dailyWords, today),
    days: days.filter((d) => d.day >= shownFrom),
    manuscriptWords,
    progress: manuscriptProgress(manuscriptWords, goals, today),
    sprints: sprintRows.map((s): WritingSprint => ({
      id: s.id,
      minutes: s.minutes,
      words: s.words,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}

export async function updateWritingGoals(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: WritingGoalsInput,
): Promise<void> {
  await ensureGoalsRow(db, worldId, userId, input.timezone ?? 'UTC');
  const set: Partial<typeof writingGoals.$inferInsert> = {};
  if (input.dailyWords !== undefined) set.dailyWords = input.dailyWords;
  if (input.totalWords !== undefined) set.totalWords = input.totalWords;
  if (input.deadline !== undefined) set.deadline = input.deadline;
  if (input.timezone !== undefined) set.timezone = input.timezone;
  if (Object.keys(set).length === 0) return;
  await db
    .update(writingGoals)
    .set(set)
    .where(and(eq(writingGoals.worldId, worldId), eq(writingGoals.userId, userId)));
}

export async function addSprint(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: SprintCreateInput,
): Promise<WritingSprint> {
  const [row] = await db
    .insert(writingSprints)
    .values({ worldId, userId, minutes: input.minutes, words: input.words })
    .returning();
  return {
    id: row!.id,
    minutes: row!.minutes,
    words: row!.words,
    createdAt: row!.createdAt.toISOString(),
  };
}
