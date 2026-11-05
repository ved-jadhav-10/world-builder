import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ROLL_LOG_LIMIT,
  type DiceResult,
  type RollLogEntry,
  type RollTable,
  type RollTableSummary,
  type TableRollResult,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { rolls } from '../src/db/schema';
import { apiClient, joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const player = await joinWorld(app, ctx.world.id, 'player');
  const reader = await joinWorld(app, ctx.world.id, 'reader');
  const coGm = await joinWorld(app, ctx.world.id, 'editor');
  const table = async (name: string, rows: [number, string][], extra: object = {}) => {
    const res = await ctx.api.post(`${ctx.w}/tables`, {
      name,
      rows: rows.map(([weight, text]) => ({ weight, text })),
      ...extra,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<RollTable>();
  };
  return { ...ctx, player, reader, coGm, table };
}

describe('tables', () => {
  it('creates, reads, edits and deletes a table, keeping the rows in order', async () => {
    const { api, w, table } = await setup();
    const made = await table('Weather', [
      [3, 'Rain'],
      [3, 'Fog'],
      [4, 'Clear'],
    ]);
    expect(made.rows.map((r) => r.text)).toEqual(['Rain', 'Fog', 'Clear']);
    expect(made.rowCount).toBe(3);
    expect(made.visibility).toBe('gm');

    const list = (await api.get(`${w}/tables`)).json<RollTableSummary[]>();
    expect(list.map((t) => [t.name, t.rowCount])).toEqual([['Weather', 3]]);

    const edited = await api.patch(`${w}/tables/${made.id}`, {
      name: 'Skies',
      rows: [
        { weight: 1, text: 'Storm' },
        { weight: 9, text: 'Calm' },
      ],
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json<RollTable>().rows.map((r) => [r.weight, r.text])).toEqual([
      [1, 'Storm'],
      [9, 'Calm'],
    ]);

    // Editing only the name leaves the rows alone.
    const renamed = (
      await api.patch(`${w}/tables/${made.id}`, { name: 'Weather' })
    ).json<RollTable>();
    expect(renamed.rows).toHaveLength(2);

    expect((await api.delete(`${w}/tables/${made.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/tables/${made.id}`)).statusCode).toBe(404);
    expect((await api.delete(`${w}/tables/${made.id}`)).statusCode).toBe(404);
  });

  it('rejects bad input', async () => {
    const { api, w, table } = await setup();
    const bad = async (body: object) => (await api.post(`${w}/tables`, body)).statusCode;
    expect(await bad({ name: '' })).toBe(400);
    expect(await bad({ name: 'T', rows: [{ weight: 0, text: 'x' }] })).toBe(400);
    expect(await bad({ name: 'T', rows: [{ weight: 1.5, text: 'x' }] })).toBe(400);
    expect(await bad({ name: 'T', rows: [{ weight: 1, text: '  ' }] })).toBe(400);
    expect(
      await bad({ name: 'T', rows: Array.from({ length: 501 }, () => ({ weight: 1, text: 'x' })) }),
    ).toBe(400);
    await table('Loot', [[1, 'Gold']]);
    // Names are unique per world, whatever the case, because tables chain to each other by name.
    expect(await bad({ name: 'loot' })).toBe(409);
  });

  it('lets only the GM write; players and readers can only look at what is shared', async () => {
    const { api, w, table, player, reader, coGm } = await setup();
    const secret = await table('Secret plots', [[1, 'The duke did it']]);
    const shared = await table('Rumours', [[1, 'The well is poisoned']], { visibility: 'player' });

    const names = async (a: typeof api) =>
      (await a.get(`${w}/tables`)).json<RollTableSummary[]>().map((t) => t.name);
    expect(await names(api)).toEqual(['Rumours', 'Secret plots']);
    expect(await names(coGm.api)).toEqual(['Rumours', 'Secret plots']);
    expect(await names(player.api)).toEqual(['Rumours']);
    expect(await names(reader.api)).toEqual([]);

    // A hidden table is indistinguishable from a missing one.
    expect((await player.api.get(`${w}/tables/${secret.id}`)).statusCode).toBe(404);
    expect((await player.api.get(`${w}/tables/${shared.id}`)).statusCode).toBe(200);
    expect((await reader.api.get(`${w}/tables/${shared.id}`)).statusCode).toBe(404);

    for (const other of [player.api, reader.api]) {
      expect((await other.post(`${w}/tables`, { name: 'Mine' })).statusCode).toBe(403);
      expect((await other.patch(`${w}/tables/${shared.id}`, { name: 'Mine' })).statusCode).toBe(
        403,
      );
      expect((await other.delete(`${w}/tables/${shared.id}`)).statusCode).toBe(403);
      expect((await other.post(`${w}/tables/${shared.id}/roll`, {})).statusCode).toBe(403);
      expect((await other.post(`${w}/dice/roll`, { expression: 'd20' })).statusCode).toBe(403);
    }
    // A co-GM can write.
    expect((await coGm.api.post(`${w}/tables`, { name: 'Co-GM table' })).statusCode).toBe(201);
  });

  it('is private to its world', async () => {
    const mine = await setup();
    const other = await signUpWithWorld(app, 'Elsewhere');
    const made = await mine.table('Mine', [[1, 'x']]);
    expect((await other.api.get(`${mine.w}/tables`)).statusCode).toBe(404);
    expect((await other.api.get(`${other.w}/tables/${made.id}`)).statusCode).toBe(404);
    expect((await other.api.post(`${other.w}/tables/${made.id}/roll`, {})).statusCode).toBe(404);
    expect(
      (await other.api.patch(`${other.w}/tables/${made.id}`, { name: 'Taken' })).statusCode,
    ).toBe(404);
    expect((await other.api.delete(`${other.w}/tables/${made.id}`)).statusCode).toBe(404);
  });

  it('includes tables in the JSON export, for editors only', async () => {
    const { api, w, table, player } = await setup();
    await table('Weather', [[2, 'Rain']]);
    const data = (await api.get(`${w}/export`)).json<{ rollTables: RollTable[] }>();
    expect(data.rollTables.map((t) => [t.name, t.rows.map((r) => r.text)])).toEqual([
      ['Weather', ['Rain']],
    ]);
    expect((await player.api.get(`${w}/export`)).statusCode).toBe(403);
  });

  it('shows a GM previewing as a player only what the player sees, and blocks writes', async () => {
    const { api, w, cookie, table } = await setup();
    await table('GM only', [[1, 'x']]);
    await table('Shared', [[1, 'y']], { visibility: 'player' });
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect(
      (await preview.get(`${w}/tables`)).json<RollTableSummary[]>().map((t) => t.name),
    ).toEqual(['Shared']);
    expect((await preview.post(`${w}/dice/roll`, { expression: 'd20' })).statusCode).toBe(403);
    expect((await api.get(`${w}/tables`)).json<RollTableSummary[]>()).toHaveLength(2);
  });
});

describe('dice', () => {
  it('rolls an expression and logs it', async () => {
    const { api, w } = await setup();
    const res = await api.post(`${w}/dice/roll`, { expression: ' 2D6 + 3 ' });
    expect(res.statusCode, res.body).toBe(200);
    const entry = res.json<RollLogEntry>();
    expect(entry).toMatchObject({ kind: 'dice', label: '2d6+3', visibility: 'gm' });
    const detail = entry.detail as DiceResult;
    expect(detail.terms[0]!.dice).toHaveLength(2);
    expect(detail.total).toBeGreaterThanOrEqual(5);
    expect(detail.total).toBeLessThanOrEqual(15);
    expect(entry.summary).toContain(`= ${detail.total}`);
    expect(entry.rolledBy?.name).toBe('Test User');

    const log = (await api.get(`${w}/rolls`)).json<RollLogEntry[]>();
    expect(log.map((r) => r.id)).toEqual([entry.id]);
  });

  it('refuses a bad or oversized expression with a reason', async () => {
    const { api, w } = await setup();
    for (const expression of ['hello', '2d', '101d6', '1d1001', 'd20 +']) {
      const res = await api.post(`${w}/dice/roll`, { expression });
      expect(res.statusCode, expression).toBe(400);
      expect(res.json<{ message: string }>().message.length).toBeGreaterThan(0);
    }
    expect((await api.get(`${w}/rolls`)).json<RollLogEntry[]>()).toHaveLength(0);
  });

  it('keeps the dice within range over many rolls', async () => {
    const { api, w } = await setup();
    for (let i = 0; i < 25; i++) {
      const entry = (await api.post(`${w}/dice/roll`, { expression: 'd6' })).json<RollLogEntry>();
      const total = (entry.detail as DiceResult).total;
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(6);
    }
  });
});

describe('rolling tables', () => {
  it('rolls a row, with dice and chained tables filled in', async () => {
    const { api, w, table } = await setup();
    await table('Weather', [[1, 'Fog']]);
    const encounter = await table('Encounter', [
      [1, 'Bandits carrying [[1d4+10]] gp in {{weather}}'],
    ]);
    const res = await api.post(`${w}/tables/${encounter.id}/roll`, {});
    expect(res.statusCode, res.body).toBe(200);
    const entry = res.json<RollLogEntry>();
    const detail = entry.detail as TableRollResult;
    expect(entry.kind).toBe('table');
    expect(detail.result).toMatch(/^Bandits carrying 1[1-4] gp in Fog$/);
    expect(detail.inline.map((i) => i.kind)).toEqual(['dice', 'table']);
    expect(entry.summary).toBe(`Encounter: ${detail.result}`);
  });

  it('only ever picks rows that exist, and favours heavy rows', async () => {
    const { api, w, table } = await setup();
    const t = await table('Odds', [
      [1, 'rare'],
      [30, 'common'],
    ]);
    const seen: Record<string, number> = {};
    for (let i = 0; i < 40; i++) {
      const entry = (await api.post(`${w}/tables/${t.id}/roll`, {})).json<RollLogEntry>();
      const text = (entry.detail as TableRollResult).text;
      seen[text] = (seen[text] ?? 0) + 1;
    }
    expect(Object.keys(seen).every((k) => k === 'rare' || k === 'common')).toBe(true);
    expect(seen.common ?? 0).toBeGreaterThan(seen.rare ?? 0);
  });

  it('cannot roll an empty table', async () => {
    const { api, w, table } = await setup();
    const empty = await table('Empty', []);
    const res = await api.post(`${w}/tables/${empty.id}/roll`, {});
    expect(res.statusCode).toBe(400);
    expect(res.json<{ message: string }>().message).toContain('no rows');
  });

  it('survives tables that chain into each other', async () => {
    const { api, w, table } = await setup();
    const a = await table('A', [[1, 'a {{B}}']]);
    await table('B', [[1, 'b {{A}}']]);
    const res = await api.post(`${w}/tables/${a.id}/roll`, {});
    expect(res.statusCode).toBe(200);
    expect((res.json<RollLogEntry>().detail as TableRollResult).result).toBe('a b {{A}}');
  });
});

describe('the roll log', () => {
  it('is newest first, and shows players only what the GM shared', async () => {
    const { api, w, player, reader, table } = await setup();
    const t = await table('Loot', [[1, 'Gold']]);
    await api.post(`${w}/dice/roll`, { expression: 'd20' });
    await api.post(`${w}/dice/roll`, { expression: 'd8', visibility: 'player' });
    await api.post(`${w}/tables/${t.id}/roll`, { visibility: 'player' });
    await api.post(`${w}/dice/roll`, { expression: 'd4' });

    const labels = async (a: typeof api) =>
      (await a.get(`${w}/rolls`)).json<RollLogEntry[]>().map((r) => r.label);
    expect(await labels(api)).toEqual(['d4', 'Loot', 'd8', 'd20']);
    expect(await labels(player.api)).toEqual(['Loot', 'd8']);
    expect(await labels(reader.api)).toEqual([]);
    expect((await api.get(`${w}/rolls?limit=2`)).json<RollLogEntry[]>()).toHaveLength(2);
    expect((await api.get(`${w}/rolls?limit=0`)).statusCode).toBe(400);
  });

  it('keeps only the newest rolls', async () => {
    const { api, w, world } = await setup();
    await db.insert(rolls).values(
      Array.from({ length: ROLL_LOG_LIMIT }, (_, i) => ({
        worldId: world.id,
        kind: 'dice',
        label: `old${i}`,
        summary: 's',
        detail: {},
        createdAt: new Date(Date.now() - 1_000_000 + i),
      })),
    );
    await api.post(`${w}/dice/roll`, { expression: 'd6' });
    const stored = await db
      .select({ label: rolls.label })
      .from(rolls)
      .where(eq(rolls.worldId, world.id));
    expect(stored).toHaveLength(ROLL_LOG_LIMIT);
    expect(stored.some((r) => r.label === 'old0')).toBe(false);
    expect(stored.some((r) => r.label === 'd6')).toBe(true);
    const log = (await api.get(`${w}/rolls?limit=200`)).json<RollLogEntry[]>();
    expect(log[0]!.label).toBe('d6');
  });

  it('can be cleared by a GM, but not by anyone else', async () => {
    const { api, w, player } = await setup();
    await api.post(`${w}/dice/roll`, { expression: 'd6', visibility: 'player' });
    expect((await player.api.delete(`${w}/rolls`)).statusCode).toBe(403);
    expect((await api.delete(`${w}/rolls`)).statusCode).toBe(204);
    expect((await api.get(`${w}/rolls`)).json<RollLogEntry[]>()).toEqual([]);
  });

  it('is private to its world', async () => {
    const mine = await setup();
    const other = await signUpWithWorld(app, 'Elsewhere');
    await mine.api.post(`${mine.w}/dice/roll`, { expression: 'd6' });
    expect((await other.api.get(`${mine.w}/rolls`)).statusCode).toBe(404);
    expect((await other.api.get(`${other.w}/rolls`)).json<RollLogEntry[]>()).toEqual([]);
  });
});
