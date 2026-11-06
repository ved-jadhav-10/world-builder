import { describe, expect, it } from 'vitest';
import { toWinAnsi } from './pdf-text';

describe('toWinAnsi', () => {
  it('keeps plain text, accents and typographic punctuation', () => {
    const text = 'Café – “quoted” … it’s 5€ • naïve Zoë';
    expect(toWinAnsi(text)).toBe(text);
  });

  it('turns letters outside the set into their plain form, and the rest into ?', () => {
    expect(toWinAnsi('Wrocław')).toBe('Wroclaw');
    expect(toWinAnsi('ō')).toBe('o');
    expect(toWinAnsi('東京')).toBe('??');
    expect(toWinAnsi('a → b')).toBe('a -> b');
  });

  it('drops invisible characters and normalises odd spaces', () => {
    expect(toWinAnsi('a​b﻿c')).toBe('abc');
    expect(toWinAnsi('a b')).toBe('a b');
    expect(toWinAnsi('line\nbreak')).toBe('line\nbreak');
  });
});
