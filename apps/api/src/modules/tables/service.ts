import { randomInt } from 'node:crypto';
import { and, asc, count, desc, eq, notInArray, sql } from 'drizzle-orm';
import {
  ROLL_LOG_LIMIT,
  describeDiceRoll,
  describeTableRoll,
  parseDice,
  rollTable,
  rollTerms,
  tableFinder,
  type Audience,
  type DiceRollInput,
  type RollLogEntry,
  type RollTable,
  type RollTableCreateInput,
  type RollTableSummary,
  type RollTableUpdateInput,
  type TableLike,
  type TableRollInput,
} from '@atlas/shared';
import { rollTableCreateSchema, rollTableUpdateSchema } from '@atlas/shared';
import type { Db, DbOrTx } from '../../db/client';
import { rollTableRows, rollTables, rolls, user } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';

type TableRow = typeof rollTables.$inferSelect;

const toSummary = (row: TableRow, rowCount: number): RollTableSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  visibility: row.visibility,
  rowCount,
  updatedAt: row.updatedAt.toISOString(),
});

export async function listTables(
  db: DbOrTx,
  worldId: string,
  audience: Audience,
): Promise<RollTableSummary[]> {
  const rows = await db
    .select({ table: rollTables, rowCount: count(rollTableRows.id) })
    .from(rollTables)
    .leftJoin(rollTableRows, eq(rollTableRows.tableId, rollTables.id))
    .where(and(eq(rollTables.worldId, worldId), visibleTo(rollTables.visibility, audience)))
    .groupBy(rollTables.id)
    .orderBy(asc(sql`lower(${rollTables.name})`));
  return rows.map(({ table, rowCount }) => toSummary(table, rowCount));
}

async function loadRows(db: DbOrTx, tableId: string) {
  return db
    .select({ id: rollTableRows.id, weight: rollTableRows.weight, text: rollTableRows.text })
    .from(rollTableRows)
    .where(eq(rollTableRows.tableId, tableId))
    .orderBy(asc(rollTableRows.sortOrder));
}

/** A hidden table answers like a missing one. */
export async function getTable(
  db: DbOrTx,
  worldId: string,
  tableId: string,
  audience: Audience,
): Promise<RollTable> {
  const [table] = await db
    .select()
    .from(rollTables)
    .where(
      and(
        eq(rollTables.id, tableId),
        eq(rollTables.worldId, worldId),
        visibleTo(rollTables.visibility, audience),
      ),
    );
  if (!table) throw notFound('Table');
  const rows = await loadRows(db, table.id);
  return {
    ...toSummary(table, rows.length),
    rows,
    createdAt: table.createdAt.toISOString(),
  };
}

const rowValues = (tableId: string, rows: { weight: number; text: string }[]) =>
  rows.map((row, index) => ({ tableId, sortOrder: index, weight: row.weight, text: row.text }));

export async function createTable(
  db: Db,
  worldId: string,
  userId: string,
  input: RollTableCreateInput,
): Promise<RollTable> {
  const data = rollTableCreateSchema.parse(input);
  const id = await db.transaction(async (tx) => {
    const [table] = await tx
      .insert(rollTables)
      .values({
        worldId,
        name: data.name,
        description: data.description,
        visibility: data.visibility,
        createdBy: userId,
      })
      .returning({ id: rollTables.id });
    if (data.rows.length) await tx.insert(rollTableRows).values(rowValues(table!.id, data.rows));
    return table!.id;
  });
  return getTable(db, worldId, id, 'gm');
}

export async function updateTable(
  db: Db,
  worldId: string,
  tableId: string,
  input: RollTableUpdateInput,
): Promise<RollTable> {
  const data = rollTableUpdateSchema.parse(input);
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: rollTables.id })
      .from(rollTables)
      .where(and(eq(rollTables.id, tableId), eq(rollTables.worldId, worldId)))
      // Two saves at once would otherwise interleave their row replacements.
      .for('update');
    if (!existing) throw notFound('Table');
    const { rows, ...fields } = data;
    await tx
      .update(rollTables)
      // `updatedAt` only moves on its own when a column changes, and a rows-only save has none.
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(rollTables.id, tableId));
    if (rows) {
      await tx.delete(rollTableRows).where(eq(rollTableRows.tableId, tableId));
      if (rows.length) await tx.insert(rollTableRows).values(rowValues(tableId, rows));
    }
  });
  return getTable(db, worldId, tableId, 'gm');
}

export async function deleteTable(db: DbOrTx, worldId: string, tableId: string): Promise<void> {
  const deleted = await db
    .delete(rollTables)
    .where(and(eq(rollTables.id, tableId), eq(rollTables.worldId, worldId)))
    .returning({ id: rollTables.id });
  if (deleted.length === 0) throw notFound('Table');
}

/** Every table with its rows, for exports. */
export async function listAllTables(db: DbOrTx, worldId: string): Promise<RollTable[]> {
  const tables = await db
    .select()
    .from(rollTables)
    .where(eq(rollTables.worldId, worldId))
    .orderBy(asc(sql`lower(${rollTables.name})`));
  const rows = await db
    .select({
      tableId: rollTableRows.tableId,
      id: rollTableRows.id,
      weight: rollTableRows.weight,
      text: rollTableRows.text,
    })
    .from(rollTableRows)
    .innerJoin(rollTables, eq(rollTables.id, rollTableRows.tableId))
    .where(eq(rollTables.worldId, worldId))
    .orderBy(asc(rollTableRows.sortOrder));
  return tables.map((table) => {
    const mine = rows.filter((row) => row.tableId === table.id);
    return {
      ...toSummary(table, mine.length),
      rows: mine.map(({ id, weight, text }) => ({ id, weight, text })),
      createdAt: table.createdAt.toISOString(),
    };
  });
}

// ---- Rolling and the log -----------------------------------------------------------------------

const rand = (maxExclusive: number) => randomInt(maxExclusive);

async function record(
  db: DbOrTx,
  worldId: string,
  userId: string,
  entry: {
    kind: 'dice' | 'table';
    label: string;
    summary: string;
    detail: unknown;
    visibility: 'gm' | 'player';
  },
): Promise<RollLogEntry> {
  const [row] = await db
    .insert(rolls)
    .values({ worldId, userId, ...entry })
    .returning();
  // Keep the newest rolls only; the log is a table-side aid, not a record to keep forever.
  const keep = db
    .select({ id: rolls.id })
    .from(rolls)
    .where(eq(rolls.worldId, worldId))
    .orderBy(desc(rolls.createdAt), desc(rolls.id))
    .limit(ROLL_LOG_LIMIT);
  await db.delete(rolls).where(and(eq(rolls.worldId, worldId), notInArray(rolls.id, keep)));
  const [who] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, userId));
  return toLogEntry(row!, who ?? null);
}

type RollRow = typeof rolls.$inferSelect;
const toLogEntry = (row: RollRow, who: { id: string; name: string } | null): RollLogEntry =>
  ({
    id: row.id,
    kind: row.kind,
    visibility: row.visibility as 'gm' | 'player',
    label: row.label,
    summary: row.summary,
    detail: row.detail,
    rolledBy: who,
    createdAt: row.createdAt.toISOString(),
  }) as RollLogEntry;

export async function rollDiceExpression(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: DiceRollInput,
): Promise<RollLogEntry> {
  const parsed = parseDice(input.expression);
  if (!parsed.ok) throw badRequest(parsed.error);
  const detail = rollTerms(parsed.terms, rand);
  detail.expression = input.expression.replace(/\s+/g, '').toLowerCase();
  return record(db, worldId, userId, {
    kind: 'dice',
    label: detail.expression,
    summary: describeDiceRoll(detail),
    detail,
    visibility: input.visibility ?? 'gm',
  });
}

export async function rollTableById(
  db: DbOrTx,
  worldId: string,
  userId: string,
  tableId: string,
  input: TableRollInput,
): Promise<RollLogEntry> {
  // Rolling is for the GM, who can use every table, so chained ones are found among them all.
  const all = await db.select().from(rollTables).where(eq(rollTables.worldId, worldId));
  const target = all.find((table) => table.id === tableId);
  if (!target) throw notFound('Table');
  const rows = await db
    .select({
      tableId: rollTableRows.tableId,
      weight: rollTableRows.weight,
      text: rollTableRows.text,
    })
    .from(rollTableRows)
    .innerJoin(rollTables, eq(rollTables.id, rollTableRows.tableId))
    .where(eq(rollTables.worldId, worldId))
    .orderBy(asc(rollTableRows.tableId), asc(rollTableRows.sortOrder));
  const byTable = new Map<string, { weight: number; text: string }[]>();
  for (const row of rows) {
    const list = byTable.get(row.tableId) ?? [];
    list.push({ weight: row.weight, text: row.text });
    byTable.set(row.tableId, list);
  }
  const likes: TableLike[] = all.map((table) => ({
    id: table.id,
    name: table.name,
    rows: byTable.get(table.id) ?? [],
  }));
  const outcome = rollTable(
    likes.find((t) => t.id === tableId)!,
    rand,
    tableFinder(likes),
  );
  if (!outcome.ok) throw badRequest(outcome.error);
  return record(db, worldId, userId, {
    kind: 'table',
    label: target.name,
    summary: describeTableRoll(outcome.result),
    detail: outcome.result,
    visibility: (input.visibility ?? 'gm') as 'gm' | 'player',
  });
}

export async function listRolls(
  db: DbOrTx,
  worldId: string,
  audience: Audience,
  limit: number,
): Promise<RollLogEntry[]> {
  const rows = await db
    .select({ roll: rolls, who: { id: user.id, name: user.name } })
    .from(rolls)
    .leftJoin(user, eq(user.id, rolls.userId))
    .where(and(eq(rolls.worldId, worldId), visibleTo(rolls.visibility, audience)))
    .orderBy(desc(rolls.createdAt), desc(rolls.id))
    .limit(limit);
  return rows.map(({ roll, who }) => toLogEntry(roll, who?.id ? who : null));
}

export async function clearRolls(db: DbOrTx, worldId: string): Promise<void> {
  await db.delete(rolls).where(eq(rolls.worldId, worldId));
}
