import { describe, expect, it } from 'vitest';
import {
  MAX_DICE_PER_TERM,
  MAX_DIE_SIDES,
  formatDiceResult,
  parseDice,
  rollDice,
  type Rand,
} from './dice';

/** A "random" source that hands out the given values (as die faces) in order, then repeats. */
const faces = (...values: number[]): Rand => {
  let i = 0;
  return (max) => {
    const value = values[i++ % values.length]!;
    return Math.min(value, max) - 1;
  };
};

const total = (expression: string, rand: Rand) => {
  const rolled = rollDice(expression, rand);
  if (!rolled.ok) throw new Error(rolled.error);
  return rolled.result.total;
};

describe('parseDice', () => {
  it('reads dice, constants and signs', () => {
    const parsed = parseDice('2d6 + 1d4 - 1');
    expect(parsed.ok && parsed.terms.map((t) => [t.kind, t.sign])).toEqual([
      ['dice', 1],
      ['dice', 1],
      ['constant', -1],
    ]);
  });

  it('accepts d without a count, d%, keep and explode, in any case', () => {
    for (const text of ['d20', 'D20', 'd%', '4d6kh3', '2D20KL1', '3d6!', '4d6kh3!', '5']) {
      expect(parseDice(text).ok, text).toBe(true);
    }
  });

  it('refuses nonsense with a message instead of throwing', () => {
    for (const text of [
      '',
      '   ',
      'hello',
      '2d',
      'd',
      '2d6+',
      '+',
      '2d6++3',
      '0d6',
      '1d1',
      '2d6kh3',
      '4d6kh0',
    ]) {
      const parsed = parseDice(text);
      expect(parsed.ok, text).toBe(false);
      if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(0);
    }
  });

  it('bounds the work a roll can ask for', () => {
    expect(parseDice(`${MAX_DICE_PER_TERM}d6`).ok).toBe(true);
    expect(parseDice(`${MAX_DICE_PER_TERM + 1}d6`).ok).toBe(false);
    expect(parseDice(`1d${MAX_DIE_SIDES}`).ok).toBe(true);
    expect(parseDice(`1d${MAX_DIE_SIDES + 1}`).ok).toBe(false);
    expect(parseDice(Array(11).fill('d6').join('+')).ok).toBe(false);
    expect(parseDice('99999999').ok).toBe(false);
  });
});

describe('rollDice', () => {
  it('adds the dice and the constants', () => {
    expect(total('2d6+3', faces(4, 2))).toBe(9);
    expect(total('d20', faces(17))).toBe(17);
    expect(total('1d8 + 1d4 - 1', faces(5, 3))).toBe(7);
    expect(total('-2', faces(1))).toBe(-2);
  });

  it('keeps the highest or lowest dice', () => {
    expect(total('4d6kh3', faces(6, 1, 4, 3))).toBe(13);
    expect(total('2d20kh1', faces(7, 15))).toBe(15);
    expect(total('2d20kl1', faces(7, 15))).toBe(7);
    const rolled = rollDice('4d6kh3', faces(6, 1, 4, 3));
    expect(rolled.ok && rolled.result.terms[0]!.dice.map((d) => d.kept)).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });

  it('treats d% as d100', () => {
    expect(total('d%', faces(100))).toBe(100);
  });

  it('explodes dice that roll their top face, and stops', () => {
    expect(total('2d6!', faces(6, 6, 3, 2))).toBe(6 + 6 + 3 + 2);
    // A die that always rolls its maximum would explode forever; it is cut off.
    const rolled = rollDice('1d2!', faces(2));
    expect(rolled.ok).toBe(true);
    if (rolled.ok) expect(rolled.result.terms[0]!.dice.length).toBeLessThanOrEqual(21);
  });

  it('stays within the range of a fair die over many rolls', () => {
    const rand: Rand = (max) => Math.floor(Math.random() * max);
    for (let i = 0; i < 500; i++) {
      const value = total('d6', rand);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });

  it('normalises how the expression is spelled', () => {
    const rolled = rollDice(' 2D6 + 3 ', faces(1));
    expect(rolled.ok && rolled.result.expression).toBe('2d6+3');
  });

  it('reports a bad expression rather than rolling', () => {
    expect(rollDice('wat', faces(1)).ok).toBe(false);
  });
});

describe('formatDiceResult', () => {
  it('shows each die, dropped dice in brackets, and the total', () => {
    const rolled = rollDice('4d6kh3+2', faces(6, 1, 4, 3));
    expect(rolled.ok && formatDiceResult(rolled.result)).toBe('[6, (1), 4, 3] +2 = 15');
  });

  it('shows subtraction', () => {
    const rolled = rollDice('d20-1', faces(10));
    expect(rolled.ok && formatDiceResult(rolled.result)).toBe('[10] -1 = 9');
  });
});
