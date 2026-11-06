import type { Combatant, InitiativeState } from './schemas/gm-screen';

/** Highest first; ties keep the order they were added in (the sort is stable). */
export function sortByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity));
}

/** Bring the pointer back inside the list after combatants are added or removed. */
function clampTurn(turn: number, length: number) {
  return length === 0 ? 0 : Math.min(Math.max(turn, 0), length - 1);
}

/** Move to the next combatant who is still up (HP above 0, or no HP tracked); a full lap is a new round. */
export function nextTurn(state: InitiativeState): InitiativeState {
  const { combatants } = state;
  if (combatants.length === 0) return state;
  let turn = clampTurn(state.turn, combatants.length);
  let round = state.round;
  for (let step = 0; step < combatants.length; step++) {
    turn += 1;
    if (turn >= combatants.length) {
      turn = 0;
      round += 1;
    }
    if (!isDown(combatants[turn]!)) return { ...state, turn, round };
  }
  // Everyone is down: still advance one place so the button does something.
  return { ...state, turn, round };
}

export function isDown(combatant: Combatant): boolean {
  return combatant.maxHp !== null && combatant.hp !== null && combatant.hp <= 0;
}

/** Apply damage (positive) or healing (negative); HP stays between 0 and max. */
export function applyDamage(combatant: Combatant, amount: number): Combatant {
  if (combatant.hp === null) return combatant;
  const max = combatant.maxHp ?? combatant.hp;
  return { ...combatant, hp: Math.min(max, Math.max(0, combatant.hp - amount)) };
}

/** Sort a fresh round: the turn goes back to the top and the round to 1. */
export function startCombat(state: InitiativeState): InitiativeState {
  return { combatants: sortByInitiative(state.combatants), round: 1, turn: 0 };
}

/** Add a combatant at its place in the order, keeping whoever's turn it is on their turn. */
export function insertCombatant(state: InitiativeState, added: Combatant): InitiativeState {
  const current = state.combatants[clampTurn(state.turn, state.combatants.length)];
  const combatants = sortByInitiative([...state.combatants, added]);
  const turn = current ? combatants.findIndex((c) => c.id === current.id) : 0;
  return { ...state, combatants, turn };
}

/** Remove a combatant; if it was their turn, the next one inherits it. */
export function removeCombatant(state: InitiativeState, id: string): InitiativeState {
  const index = state.combatants.findIndex((c) => c.id === id);
  if (index < 0) return state;
  const combatants = state.combatants.filter((c) => c.id !== id);
  const turn = index < state.turn ? state.turn - 1 : state.turn;
  return { ...state, combatants, turn: clampTurn(turn, combatants.length) };
}
