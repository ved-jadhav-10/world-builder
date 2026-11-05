import { describe, expect, it } from 'vitest';
import { analyzeWords, tokenize, wordsOfNames } from './word-check';

describe('tokenize', () => {
  it('lower-cases and keeps inner apostrophes, straight or curly', () => {
    expect(tokenize('Don’t stop, Mira — it\'s "fine".')).toEqual([
      "don't",
      'stop',
      'mira',
      "it's",
      'fine',
    ]);
  });

  it('finds words in other scripts and numbers, and nothing in punctuation', () => {
    expect(tokenize('Café déjà vu 1999 !!!')).toEqual(['café', 'déjà', 'vu', '1999']);
    expect(tokenize('— … ?')).toEqual([]);
  });
});

describe('analyzeWords', () => {
  it('handles an empty text', () => {
    const result = analyzeWords('');
    expect(result).toMatchObject({
      totalWords: 0,
      uniqueWords: 0,
      sentences: 0,
      avgSentenceWords: 0,
      topWords: [],
      crutchWords: [],
      closeRepeats: [],
    });
    expect(result.adverbs).toEqual({ total: 0, perThousand: 0, top: [] });
  });

  it('lists the most used meaningful words, leaving out small words and rare ones', () => {
    const text =
      'The lantern swung. The lantern glowed and the lantern died. A harbour, a harbour.';
    const result = analyzeWords(text, { minCount: 2 });
    expect(result.topWords.map((w) => w.word)).toEqual(['lantern', 'harbour']);
    expect(result.topWords[0]).toMatchObject({
      count: 3,
      perThousand: 214.3, // 3 of 14 words
    });
  });

  it('only lists words used at least the minimum number of times', () => {
    const text = 'ship ship sail sail sail anchor';
    expect(analyzeWords(text).topWords.map((w) => w.word)).toEqual(['sail']);
    expect(analyzeWords(text, { minCount: 2 }).topWords.map((w) => w.word)).toEqual([
      'sail',
      'ship',
    ]);
  });

  it('leaves out ignored words, such as the names of characters', () => {
    const text = 'Mira ran. Mira hid. Mira wept. Ardel burned. Ardel fell. Ardel slept.';
    const ignore = wordsOfNames(['Mira Vael', 'Ardel']);
    const result = analyzeWords(text, { ignore, minCount: 2 });
    expect(result.topWords).toEqual([]);
    expect(analyzeWords(text, { minCount: 2 }).topWords.map((w) => w.word)).toEqual([
      'ardel',
      'mira',
    ]);
  });

  it('counts crutch words', () => {
    const text = 'She just wanted it. He was really just tired, very very tired.';
    const result = analyzeWords(text);
    expect(result.crutchWords).toEqual([
      expect.objectContaining({ word: 'just', count: 2 }),
      expect.objectContaining({ word: 'very', count: 2 }),
      expect.objectContaining({ word: 'really', count: 1 }),
    ]);
  });

  it('counts adverbs, without words that only look like them', () => {
    const text = 'She walked slowly and spoke quietly. Slowly, the family came early, only once.';
    const result = analyzeWords(text);
    expect(result.adverbs.total).toBe(3);
    expect(result.adverbs.top.map((w) => w.word)).toEqual(['slowly', 'quietly']);
  });

  it('counts the words the writer asked to watch, including ones not found', () => {
    const result = analyzeWords('The Sun rose. Sun everywhere.', { watch: ['sun', 'Moon, sun'] });
    expect(result.watched.map((w) => [w.word, w.count])).toEqual([
      ['sun', 2],
      ['moon', 0],
    ]);
  });

  it('finds words repeated close together, and not far apart', () => {
    const near = 'The bright lantern hung beside another bright lantern in the hall.';
    expect(analyzeWords(near).closeRepeats).toEqual([
      { word: 'bright', count: 1 },
      { word: 'lantern', count: 1 },
    ]);
    const far = `lantern ${'and then more '.repeat(10)} lantern`;
    expect(analyzeWords(far).closeRepeats).toEqual([]);
  });

  it('measures sentences', () => {
    const long = Array.from({ length: 45 }, () => 'word').join(' ');
    const result = analyzeWords(`One two three. Four five six seven! ${long}. Eight?`);
    expect(result.sentences).toBe(4);
    expect(result.longSentences).toBe(1);
    expect(result.avgSentenceWords).toBe(Math.round(((3 + 4 + 45 + 1) / 4) * 10) / 10);
  });

  it('gives the same answer for the same text', () => {
    const text = 'alpha beta alpha beta gamma gamma gamma delta';
    expect(analyzeWords(text, { minCount: 2 })).toEqual(analyzeWords(text, { minCount: 2 }));
  });
});
