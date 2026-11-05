import { describe, expect, it } from 'vitest';
import type { Rand } from './dice';
import { MAX_CHAIN_DEPTH, MAX_TABLE_ROWS } from './schemas/tables';
import {
  formatRange,
  parseTableText,
  rollTable,
  rowRanges,
  tableFinder,
  totalWeight,
  type TableLike,
} from './tables';

/** Hands out the given values as zero-based picks, in order, then repeats. */
const picks = (...values: number[]): Rand => {
  let i = 0;
  return (max) => Math.min(values[i++ % values.length]!, max - 1);
};

const table = (id: string, name: string, ...rows: [number, string][]): TableLike => ({
  id,
  name,
  rows: rows.map(([weight, text]) => ({ weight, text })),
});

const weather = table('w', 'Weather', [3, 'Rain'], [3, 'Fog'], [4, 'Clear']);

describe('ranges', () => {
  it('turns weights into a die', () => {
    const ranges = rowRanges(weather.rows);
    expect(ranges.map(formatRange)).toEqual(['1-3', '4-6', '7-10']);
    expect(totalWeight(weather.rows)).toBe(10);
  });

  it('shows a single value without a dash', () => {
    expect(rowRanges([{ weight: 1 }, { weight: 2 }]).map(formatRange)).toEqual(['1', '2-3']);
  });
});

describe('rollTable', () => {
  it('picks the row whose range holds the roll', () => {
    const at = (zeroBased: number) => {
      const out = rollTable(weather, picks(zeroBased));
      if (!out.ok) throw new Error(out.error);
      return out.result;
    };
    expect(at(0)).toMatchObject({ roll: 1, text: 'Rain', rowIndex: 0, total: 10 });
    expect(at(2).text).toBe('Rain');
    expect(at(3).text).toBe('Fog');
    expect(at(6)).toMatchObject({ roll: 7, text: 'Clear', range: { from: 7, to: 10 } });
    expect(at(9).text).toBe('Clear');
  });

  it('is weighted: heavier rows come up more often', () => {
    const counts: Record<string, number> = {};
    const rand: Rand = (max) => Math.floor(Math.random() * max);
    for (let i = 0; i < 4000; i++) {
      const out = rollTable(weather, rand);
      if (out.ok) counts[out.result.text] = (counts[out.result.text] ?? 0) + 1;
    }
    expect(counts.Clear!).toBeGreaterThan(counts.Rain!);
    expect(counts.Rain! + counts.Fog! + counts.Clear!).toBe(4000);
  });

  it('refuses a table with no rows', () => {
    const out = rollTable(table('e', 'Empty'), picks(0));
    expect(out.ok).toBe(false);
  });

  it('rolls dice written inside a row', () => {
    const loot = table('l', 'Loot', [1, 'A purse with [[2d6]] gp']);
    const out = rollTable(loot, picks(0, 3, 4));
    expect(out.ok && out.result.result).toBe('A purse with 9 gp');
    expect(out.ok && out.result.inline).toHaveLength(1);
  });

  it('chains to another table by name, ignoring case and spaces', () => {
    const encounter = table('e', 'Encounter', [1, 'Bandits in {{ weather }}']);
    const find = tableFinder([weather, encounter]);
    const out = rollTable(encounter, picks(0, 4), find);
    expect(out.ok && out.result.result).toBe('Bandits in Fog');
    const inline = out.ok ? out.result.inline[0] : null;
    expect(inline?.kind).toBe('table');
  });

  it('leaves a missing chain or bad dice as written, and says why', () => {
    const odd = table('o', 'Odd', [1, '{{Nowhere}} and [[wat]]']);
    const out = rollTable(odd, picks(0), tableFinder([odd]));
    expect(out.ok && out.result.result).toBe('{{Nowhere}} and [[wat]]');
    expect(out.ok && out.result.inline.map((i) => i.kind)).toEqual(['missing', 'missing']);
  });

  it('does not loop when tables chain back to themselves', () => {
    const a = table('a', 'A', [1, 'a then {{B}}']);
    const b = table('b', 'B', [1, 'b then {{A}}']);
    const out = rollTable(a, picks(0), tableFinder([a, b]));
    expect(out.ok && out.result.result).toBe('a then b then {{A}}');
  });

  it('stops chaining at a fixed depth', () => {
    const links = Array.from({ length: MAX_CHAIN_DEPTH + 3 }, (_, i) =>
      table(`t${i}`, `T${i}`, [1, `${i}{{T${i + 1}}}`]),
    );
    const out = rollTable(links[0]!, picks(0), tableFinder(links));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.result.length).toBeLessThan(40);
  });
});

describe('parseTableText', () => {
  it('reads ranges, using their width as the weight', () => {
    const { rows, notes } = parseTableText('1-3,Rain\n4-6,Fog\n7,Clear');
    expect(rows).toEqual([
      { weight: 3, text: 'Rain' },
      { weight: 3, text: 'Fog' },
      { weight: 1, text: 'Clear' },
    ]);
    expect(notes).toEqual([]);
  });

  it('reads plain lines as weight 1', () => {
    expect(parseTableText('Rain\nFog\n\nClear').rows.map((r) => r.weight)).toEqual([1, 1, 1]);
  });

  it('keeps commas inside text and honours quotes and tabs', () => {
    expect(parseTableText('Rain, heavy\n"1-2","A ""quoted"", row"').rows).toEqual([
      { weight: 1, text: 'Rain, heavy' },
      { weight: 2, text: 'A "quoted", row' },
    ]);
    expect(parseTableText('1-2\tRain\n3\tFog').rows).toEqual([
      { weight: 2, text: 'Rain' },
      { weight: 1, text: 'Fog' },
    ]);
  });

  it('skips a header row, and reads a weight column when the header says weight', () => {
    expect(
      parseTableText('d100,Result\n1-50,Common\n51-100,Rare').rows.map((r) => r.weight),
    ).toEqual([50, 50]);
    expect(parseTableText('weight,text\n5,Common\n1,Rare').rows.map((r) => r.weight)).toEqual([
      5, 1,
    ]);
  });

  it('reports what it had to change', () => {
    const { rows, notes } = parseTableText('9-2,Backwards\n3,');
    expect(rows).toEqual([{ weight: 1, text: 'Backwards' }]);
    expect(notes).toHaveLength(2);
  });

  it('caps the row count', () => {
    const many = Array.from({ length: MAX_TABLE_ROWS + 5 }, (_, i) => `Row ${i}`).join('\n');
    const { rows, notes } = parseTableText(many);
    expect(rows).toHaveLength(MAX_TABLE_ROWS);
    expect(notes.join(' ')).toContain('first');
  });

  it('gives nothing for empty input', () => {
    expect(parseTableText('  \n\n')).toEqual({ rows: [], notes: [] });
  });
});
