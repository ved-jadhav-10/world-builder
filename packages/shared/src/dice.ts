/**
 * Dice expressions: `2d6+3`, `d20`, `4d6kh3`, `2d20kl1` (disadvantage), `d%`, `3d6!` (exploding),
 * and sums of those with constants (`1d8 + 1d4 - 1`). Parsing and rolling are pure; the random
 * source is passed in, so the API can use a secure one and the tests a fixed one.
 */

export const MAX_DICE_PER_TERM = 100;
export const MAX_DIE_SIDES = 1000;
export const MAX_DICE_TERMS = 10;
/** An exploding die stops adding dice after this many extra rolls, so `d2!` can never run away. */
const MAX_EXPLOSIONS = 20;

/** Returns a whole number from 0 up to, and not including, `maxExclusive`. */
export type Rand = (maxExclusive: number) => number;

export type DiceTerm =
  | {
      kind: 'dice';
      sign: 1 | -1;
      count: number;
      sides: number;
      keep: Keep | null;
      explode: boolean;
    }
  | { kind: 'constant'; sign: 1 | -1; value: number };
export type Keep = { mode: 'highest' | 'lowest'; count: number };

export type DiceParse = { ok: true; terms: DiceTerm[] } | { ok: false; error: string };

export type RolledDie = { value: number; kept: boolean };
export type TermResult =
  | { kind: 'dice'; label: string; sign: 1 | -1; dice: RolledDie[]; subtotal: number }
  | { kind: 'constant'; label: string; sign: 1 | -1; dice: []; subtotal: number };
export type DiceResult = { expression: string; terms: TermResult[]; total: number };

const DICE_TERM = /^(\d*)d(%|\d+)(?:(kh|kl)(\d*))?(!)?$/i;
const CONSTANT_TERM = /^\d+$/;

/** Reads an expression into terms. Never throws; the error says what to fix. */
export function parseDice(input: string): DiceParse {
  const text = input.replace(/\s+/g, '');
  if (!text) return { ok: false, error: 'Type a roll, such as 2d6+3' };
  if (!/^[0-9dDkKhHlL%!+-]+$/.test(text)) {
    return { ok: false, error: 'Use only digits, d, kh, kl, !, + and -' };
  }
  // Split on + and -, keeping each term's sign.
  const pieces = text.match(/[+-]?[^+-]+/g);
  if (!pieces || pieces.join('') !== text) {
    return { ok: false, error: 'Each + or - needs a number or dice after it' };
  }
  if (pieces.length > MAX_DICE_TERMS) {
    return { ok: false, error: `Use at most ${MAX_DICE_TERMS} terms` };
  }
  const terms: DiceTerm[] = [];
  for (const piece of pieces) {
    const sign = piece.startsWith('-') ? -1 : 1;
    const body = piece.replace(/^[+-]/, '');
    if (CONSTANT_TERM.test(body)) {
      const value = Number(body);
      if (value > 1_000_000) return { ok: false, error: 'That number is too large' };
      terms.push({ kind: 'constant', sign, value });
      continue;
    }
    const match = DICE_TERM.exec(body);
    if (!match) return { ok: false, error: `“${body}” is not a roll` };
    const count = match[1] === '' ? 1 : Number(match[1]);
    const sides = match[2] === '%' ? 100 : Number(match[2]);
    if (count < 1) return { ok: false, error: 'Roll at least one die' };
    if (count > MAX_DICE_PER_TERM) {
      return { ok: false, error: `Roll at most ${MAX_DICE_PER_TERM} dice at once` };
    }
    if (sides < 2) return { ok: false, error: 'A die needs at least 2 sides' };
    if (sides > MAX_DIE_SIDES) {
      return { ok: false, error: `A die can have at most ${MAX_DIE_SIDES} sides` };
    }
    let keep: Keep | null = null;
    if (match[3]) {
      const keepCount = match[4] === '' ? 1 : Number(match[4]);
      if (keepCount < 1 || keepCount > count) {
        return { ok: false, error: `Keep between 1 and ${count} dice in “${body}”` };
      }
      keep = { mode: match[3].toLowerCase() === 'kh' ? 'highest' : 'lowest', count: keepCount };
    }
    terms.push({ kind: 'dice', sign, count, sides, keep, explode: match[5] === '!' });
  }
  return { ok: true, terms };
}

const termLabel = (term: DiceTerm): string => {
  if (term.kind === 'constant') return String(term.value);
  const keep = term.keep ? `${term.keep.mode === 'highest' ? 'kh' : 'kl'}${term.keep.count}` : '';
  return `${term.count}d${term.sides}${keep}${term.explode ? '!' : ''}`;
};

/** Rolls parsed terms. */
export function rollTerms(terms: DiceTerm[], rand: Rand): DiceResult {
  let total = 0;
  const results: TermResult[] = terms.map((term) => {
    if (term.kind === 'constant') {
      total += term.sign * term.value;
      return {
        kind: 'constant',
        label: termLabel(term),
        sign: term.sign,
        dice: [],
        subtotal: term.value,
      };
    }
    const values: number[] = [];
    let explosions = 0;
    for (let i = 0; i < term.count; i++) {
      let value = rand(term.sides) + 1;
      values.push(value);
      while (term.explode && value === term.sides && explosions < MAX_EXPLOSIONS) {
        explosions++;
        value = rand(term.sides) + 1;
        values.push(value);
      }
    }
    // Dice kept are the highest or lowest; ties keep the earlier die.
    const kept = new Set<number>(values.map((_, i) => i));
    if (term.keep) {
      const order = values
        .map((value, index) => ({ value, index }))
        .sort((a, b) =>
          term.keep!.mode === 'highest'
            ? b.value - a.value || a.index - b.index
            : a.value - b.value || a.index - b.index,
        );
      kept.clear();
      for (const { index } of order.slice(0, term.keep.count)) kept.add(index);
    }
    const dice = values.map((value, index) => ({ value, kept: kept.has(index) }));
    const subtotal = dice.reduce((sum, die) => sum + (die.kept ? die.value : 0), 0);
    total += term.sign * subtotal;
    return { kind: 'dice', label: termLabel(term), sign: term.sign, dice, subtotal };
  });
  return { expression: terms.map(termLabel).join(' '), terms: results, total };
}

/** Parses and rolls in one step. */
export function rollDice(
  expression: string,
  rand: Rand,
): { ok: true; result: DiceResult } | { ok: false; error: string } {
  const parsed = parseDice(expression);
  if (!parsed.ok) return parsed;
  const result = rollTerms(parsed.terms, rand);
  return { ok: true, result: { ...result, expression: normaliseExpression(expression) } };
}

/** `2D6 + 3` and `2d6+3` are the same roll; keep one spelling in the log. */
export function normaliseExpression(expression: string): string {
  return expression.replace(/\s+/g, '').toLowerCase();
}

/** The roll as a line of text: `2d6+3 → [4, 2] + 3 = 9`. */
export function formatDiceResult(result: DiceResult): string {
  const parts = result.terms.map((term, index) => {
    const sign = term.sign === -1 ? '-' : index === 0 ? '' : '+';
    if (term.kind === 'constant') return `${sign}${term.label}`;
    const dice = term.dice.map((die) => (die.kept ? String(die.value) : `(${die.value})`));
    return `${sign}[${dice.join(', ')}]`;
  });
  return `${parts.join(' ')} = ${result.total}`;
}

/** Something that looks like a roll, for finding `[[2d6]]` in table text. */
export const isDiceExpression = (text: string): boolean => parseDice(text).ok;
