import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  insertCombatant,
  nextTurn,
  removeCombatant,
  sortByInitiative,
  startCombat,
} from './initiative';
import type { Combatant, InitiativeState } from './schemas/gm-screen';

const who = (
  id: string,
  initiative: number | null,
  hp: number | null = null,
  maxHp = hp,
): Combatant => ({
  id,
  name: id,
  initiative,
  hp,
  maxHp,
  conditions: [],
  entityId: null,
});

describe('initiative', () => {
  it('sorts high to low, unrolled last, ties in the order added', () => {
    const sorted = sortByInitiative([who('a', 10), who('b', null), who('c', 15), who('d', 10)]);
    expect(sorted.map((c) => c.id)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('starts a fight sorted at round 1', () => {
    const state = startCombat({ combatants: [who('a', 3), who('b', 9)], round: 4, turn: 1 });
    expect(state.combatants.map((c) => c.id)).toEqual(['b', 'a']);
    expect([state.round, state.turn]).toEqual([1, 0]);
  });

  it('advances, wraps into a new round and skips the fallen', () => {
    let state: InitiativeState = {
      combatants: [who('a', 20, 5), who('b', 15, 0, 8), who('c', 10, 4)],
      round: 1,
      turn: 0,
    };
    state = nextTurn(state);
    expect([state.turn, state.round]).toEqual([2, 1]);
    state = nextTurn(state);
    expect([state.turn, state.round]).toEqual([0, 2]);
  });

  it('still moves when everyone is down, and ignores an empty list', () => {
    const down = { combatants: [who('a', 5, 0, 5)], round: 1, turn: 0 };
    expect(nextTurn(down).round).toBe(2);
    const empty = { combatants: [], round: 1, turn: 0 };
    expect(nextTurn(empty)).toBe(empty);
  });

  it('keeps HP between 0 and max', () => {
    expect(applyDamage(who('a', 1, 10), 4).hp).toBe(6);
    expect(applyDamage(who('a', 1, 10), 99).hp).toBe(0);
    expect(applyDamage({ ...who('a', 1, 5, 10) }, -99).hp).toBe(10);
    expect(applyDamage(who('a', 1), 3).hp).toBeNull();
  });

  it('inserts without stealing the turn, and removal hands it on', () => {
    const state: InitiativeState = {
      combatants: [who('a', 20), who('b', 10), who('c', 5)],
      round: 2,
      turn: 1,
    };
    const added = insertCombatant(state, who('z', 30));
    expect(added.combatants[added.turn]!.id).toBe('b');
    const removedBefore = removeCombatant(state, 'a');
    expect(removedBefore.combatants[removedBefore.turn]!.id).toBe('b');
    const removedCurrent = removeCombatant(state, 'b');
    expect(removedCurrent.combatants[removedCurrent.turn]!.id).toBe('c');
    const removedLast = removeCombatant({ ...state, turn: 2 }, 'c');
    expect(removedLast.turn).toBe(1);
  });
});
