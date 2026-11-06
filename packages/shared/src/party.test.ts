import { describe, expect, it } from 'vitest';
import { awardDowntime, awardXp, groupByHolder } from './party';
import type { LootItem, PartyMember } from './schemas/gm-screen';

const member = (id: string, xp = 0, downtime = 0): PartyMember => ({ id, name: id, xp, downtime });
const item = (name: string, holder = ''): LootItem => ({
  id: name,
  name,
  qty: 1,
  value: '',
  holder,
});

describe('awardXp', () => {
  const party = [member('a', 100), member('b', 50), member('c', 0)];

  it('gives each the full amount', () => {
    expect(awardXp(party, 25, 'each').map((m) => m.xp)).toEqual([125, 75, 25]);
  });

  it('splits evenly and hands the remainder to the first, losing nothing', () => {
    const out = awardXp(party, 100, 'split');
    expect(out.map((m) => m.xp)).toEqual([134, 83, 33]);
    expect(out.reduce((sum, m) => sum + m.xp, 0)).toBe(150 + 100);
  });

  it('only touches the chosen members', () => {
    expect(awardXp(party, 30, 'each', ['b']).map((m) => m.xp)).toEqual([100, 80, 0]);
  });

  it('never goes below zero, and ignores nothing to do', () => {
    expect(awardXp(party, -60, 'each').map((m) => m.xp)).toEqual([40, 0, 0]);
    expect(awardXp(party, 0, 'each')).toBe(party);
    expect(awardXp([], 10, 'each')).toEqual([]);
    expect(awardXp(party, 10, 'each', ['nobody'])).toBe(party);
  });

  it('splits a loss without losing points either', () => {
    const out = awardXp([member('a', 10), member('b', 10)], -5, 'split');
    expect(out.map((m) => m.xp)).toEqual([7, 8]);
  });
});

describe('downtime and loot', () => {
  it('adds and spends downtime within bounds', () => {
    expect(awardDowntime([member('a', 0, 3)], 5)[0]!.downtime).toBe(8);
    expect(awardDowntime([member('a', 0, 3)], -9)[0]!.downtime).toBe(0);
  });

  it('groups loot by who carries it', () => {
    const groups = groupByHolder([item('Rope'), item('Sword', 'Mira'), item('Map', ' ')]);
    expect([...groups.keys()]).toEqual(['Party', 'Mira']);
    expect(groups.get('Party')!.map((i) => i.name)).toEqual(['Rope', 'Map']);
  });
});
