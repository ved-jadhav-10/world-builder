import { formatDiceResult, parseDice, rollTerms, type DiceResult, type Rand } from './dice';
import {
  MAX_CHAIN_DEPTH,
  MAX_ROW_TEXT,
  MAX_ROW_WEIGHT,
  MAX_TABLE_ROWS,
  type TableRowInput,
} from './schemas/tables';

/**
 * Rollable tables. A row has a weight; rolling picks a position from 1 to the total weight, so
 * a table of weights 3, 3, 4 is a d10 where 1-3, 4-6 and 7-10 pick the rows. Row text can hold
 * `[[2d6]]` to roll dice in place, and `{{Other table}}` to roll another table and splice in
 * its result.
 */

export interface TableLike {
  id: string;
  name: string;
  rows: { weight: number; text: string }[];
}

export interface RowRange {
  from: number;
  to: number;
}

/** The roll values each row answers to, as inclusive ranges. */
export function rowRanges(rows: { weight: number }[]): RowRange[] {
  let next = 1;
  return rows.map((row) => {
    const range = { from: next, to: next + row.weight - 1 };
    next += row.weight;
    return range;
  });
}

export const totalWeight = (rows: { weight: number }[]): number =>
  rows.reduce((sum, row) => sum + row.weight, 0);

export const formatRange = (range: RowRange): string =>
  range.from === range.to ? String(range.from) : `${range.from}-${range.to}`;

/** What happened to one `[[…]]` or `{{…}}` inside a row. */
export type InlineRoll =
  | { kind: 'dice'; source: string; dice: DiceResult }
  | { kind: 'table'; source: string; result: TableRollResult }
  | { kind: 'missing'; source: string; reason: string };

export interface TableRollResult {
  tableId: string;
  tableName: string;
  /** The position rolled, 1 to the table's total weight. */
  roll: number;
  total: number;
  rowIndex: number;
  range: RowRange;
  /** The row as written. */
  text: string;
  /** The row with its inline rolls filled in. */
  result: string;
  inline: InlineRoll[];
}

export type TableRollOutcome = { ok: true; result: TableRollResult } | { ok: false; error: string };

const INLINE = /\[\[([^\]]*)\]\]|\{\{([^}]*)\}\}/g;

const normaliseName = (name: string) => name.trim().toLowerCase();

/**
 * Rolls a table. `find` looks other tables up by name for chaining; it should return only
 * tables the roller may use. A chain that loops back or goes too deep stays as plain text.
 */
export function rollTable(
  table: TableLike,
  rand: Rand,
  find: (name: string) => TableLike | undefined = () => undefined,
  path: string[] = [],
): TableRollOutcome {
  const total = totalWeight(table.rows);
  if (table.rows.length === 0 || total < 1) {
    return { ok: false, error: `“${table.name}” has no rows to roll` };
  }
  const roll = rand(total) + 1;
  const ranges = rowRanges(table.rows);
  const rowIndex = ranges.findIndex((range) => roll >= range.from && roll <= range.to);
  const row = table.rows[rowIndex]!;
  const here = [...path, table.id];

  const inline: InlineRoll[] = [];
  const result = row.text.replace(
    INLINE,
    (match, dice: string | undefined, name: string | undefined) => {
      if (dice !== undefined) {
        const parsed = parseDice(dice);
        if (!parsed.ok) {
          inline.push({ kind: 'missing', source: match, reason: parsed.error });
          return match;
        }
        const rolled = rollTerms(parsed.terms, rand);
        inline.push({ kind: 'dice', source: match, dice: rolled });
        return String(rolled.total);
      }
      const other = find(name ?? '');
      if (!other) {
        inline.push({
          kind: 'missing',
          source: match,
          reason: `No table called “${(name ?? '').trim()}”`,
        });
        return match;
      }
      if (here.includes(other.id) || here.length >= MAX_CHAIN_DEPTH) {
        inline.push({ kind: 'missing', source: match, reason: 'Tables chain back to themselves' });
        return match;
      }
      const nested = rollTable(other, rand, find, here);
      if (!nested.ok) {
        inline.push({ kind: 'missing', source: match, reason: nested.error });
        return match;
      }
      inline.push({ kind: 'table', source: match, result: nested.result });
      return nested.result.result;
    },
  );

  return {
    ok: true,
    result: {
      tableId: table.id,
      tableName: table.name,
      roll,
      total,
      rowIndex,
      range: ranges[rowIndex]!,
      text: row.text,
      result,
      inline,
    },
  };
}

/** A lookup by name (case-insensitive) over some tables, for `rollTable`'s chaining. */
export function tableFinder(tables: TableLike[]): (name: string) => TableLike | undefined {
  const byName = new Map<string, TableLike>();
  for (const table of tables) {
    const key = normaliseName(table.name);
    if (!byName.has(key)) byName.set(key, table);
  }
  return (name) => byName.get(normaliseName(name));
}

/** A one-line account of a roll, for the log. */
export function describeTableRoll(result: TableRollResult): string {
  return `${result.tableName}: ${result.result}`;
}

export function describeDiceRoll(result: DiceResult): string {
  return `${result.expression} → ${formatDiceResult(result)}`;
}

// ---- Importing ---------------------------------------------------------------------------------

export interface TableImport {
  rows: TableRowInput[];
  /** Lines that were skipped or changed, for showing to the person importing. */
  notes: string[];
}

/** Splits one line of comma- or tab-separated values, with "quoted, fields" and "" escapes. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

const RANGE_CELL = /^(\d+)\s*[-–—]\s*(\d+)$|^(\d+)$/;
const HEADER_CELL = /^(d\d+|d%|roll|range|weight|result|text)$/i;

/**
 * Reads rows pasted from a spreadsheet or file. Each line is either `range,text` (`1-3,Rain`,
 * `4,Fog`: a range's width is the row's weight, a single number weighs 1), `weight,text` when
 * the header says `weight`, or just the text (weight 1). Commas or tabs both work.
 */
export function parseTableText(input: string): TableImport {
  const lines = input.split(/\r?\n/).filter((line) => line.trim() !== '');
  const notes: string[] = [];
  if (lines.length === 0) return { rows: [], notes };
  const delimiter = lines.some((line) => line.includes('\t')) ? '\t' : ',';

  let weightColumn = false;
  const first = splitLine(lines[0]!, delimiter);
  if (first.length > 1 && HEADER_CELL.test(first[0]!) && !RANGE_CELL.test(first[0]!)) {
    weightColumn = /^weight$/i.test(first[0]!);
    lines.shift();
  }

  const rows: TableRowInput[] = [];
  lines.forEach((line, index) => {
    const cells = splitLine(line, delimiter);
    let weight = 1;
    let text = cells.join(delimiter === '\t' ? '\t' : ', ');
    const match = cells.length > 1 ? RANGE_CELL.exec(cells[0]!) : null;
    if (match) {
      text = cells.slice(1).join(delimiter === '\t' ? '\t' : ', ');
      if (match[3] !== undefined) weight = weightColumn ? Number(match[3]) : 1;
      else {
        const from = Number(match[1]);
        const to = Number(match[2]);
        weight = to >= from ? to - from + 1 : 1;
        if (to < from) notes.push(`Line ${index + 1}: the range runs backwards, so it counts as 1`);
      }
    }
    text = text.trim();
    if (!text) {
      notes.push(`Line ${index + 1}: no text, skipped`);
      return;
    }
    if (weight < 1) {
      notes.push(`Line ${index + 1}: a weight of 0 counts as 1`);
      weight = 1;
    }
    if (weight > MAX_ROW_WEIGHT) {
      notes.push(`Line ${index + 1}: the weight was cut to ${MAX_ROW_WEIGHT}`);
      weight = MAX_ROW_WEIGHT;
    }
    if (text.length > MAX_ROW_TEXT) {
      notes.push(`Line ${index + 1}: the text was cut to ${MAX_ROW_TEXT} characters`);
      text = text.slice(0, MAX_ROW_TEXT);
    }
    rows.push({ weight, text });
  });
  if (rows.length > MAX_TABLE_ROWS) {
    notes.push(`Only the first ${MAX_TABLE_ROWS} rows were kept`);
    rows.length = MAX_TABLE_ROWS;
  }
  return { rows, notes };
}
