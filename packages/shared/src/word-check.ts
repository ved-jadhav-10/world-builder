export interface WordCount {
  word: string;
  count: number;
  /** How often per 1,000 words of the text. */
  perThousand: number;
}

export interface WordCheck {
  totalWords: number;
  uniqueWords: number;
  sentences: number;
  /** Mean words per sentence, one decimal. */
  avgSentenceWords: number;
  /** Sentences of more than LONG_SENTENCE_WORDS words. */
  longSentences: number;
  /** The most used words that carry meaning (no "the" or "and", no names), most used first. */
  topWords: WordCount[];
  /** Words that often weaken prose, as used here, most used first. */
  crutchWords: WordCount[];
  adverbs: { total: number; perThousand: number; top: WordCount[] };
  /** The words the writer asked to watch, in the order asked, including those not found. */
  watched: WordCount[];
  /** Words used again within a few words of themselves, most often first. */
  closeRepeats: { word: string; count: number }[];
}

export const LONG_SENTENCE_WORDS = 40;
/** Two uses this close together (in words) count as a close repeat. */
export const CLOSE_REPEAT_WINDOW = 15;
export const MAX_WATCHED_WORDS = 30;

const STOP_WORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being ' +
    'below between both but by can could did do does doing down during each few for from further had has ' +
    'have having he her here hers herself him himself his how i if in into is it its itself me more most ' +
    'my myself no nor not of off on once only or other our ours ourselves out over own same she should so ' +
    'some such than that the their theirs them themselves then there these they this those through to too ' +
    'under until up us was we were what when where which while who whom why will with would you your ' +
    "yours yourself yourselves said say says don't didn't it's i'm i'd i'll i've he's she's they're " +
    "we're you're can't couldn't won't wouldn't isn't wasn't there's that's what's let's one two"
  ).split(' '),
);

/** Words that tend to soften or pad a sentence. Whether they hurt is the writer's call. */
export const CRUTCH_WORDS: readonly string[] = [
  'just',
  'really',
  'very',
  'quite',
  'actually',
  'simply',
  'basically',
  'literally',
  'definitely',
  'totally',
  'completely',
  'absolutely',
  'suddenly',
  'seemed',
  'seems',
  'felt',
  'began',
  'started',
  'almost',
  'rather',
  'somewhat',
  'perhaps',
  'maybe',
  'probably',
  'finally',
  'slightly',
  'nearly',
  'merely',
  'certainly',
  'somehow',
  'anyway',
  'stuff',
  'thing',
  'things',
];
const CRUTCHES = new Set(CRUTCH_WORDS);

/** Words that end in "ly" without being the adverbs a writer is trying to count. */
const NOT_ADVERBS = new Set(
  (
    'only family early lonely friendly holy ugly silly lovely belly bully jelly rely reply supply apply ' +
    'fly july italy assembly anomaly butterfly monopoly lily ally rally tally sally molly polly billy ' +
    'willy wily curly surly burly jolly folly dolly holly oily daily likely unlikely lively deadly ' +
    'elderly orderly costly kingly queenly motherly fatherly brotherly sisterly cowardly scholarly ' +
    'heavenly worldly ghastly ghostly gentlemanly ladylike'
  ).split(' '),
);

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

/** Lower-case words, with curly apostrophes made straight so "don’t" and "don't" match. */
export function tokenize(text: string): string[] {
  return (text.match(WORD_PATTERN) ?? []).map((word) => word.toLowerCase().replace(/’/g, "'"));
}

const perThousand = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 10_000) / 10;

const rank = (counts: Map<string, number>, total: number, limit: number): WordCount[] =>
  [...counts]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count, perThousand: perThousand(count, total) }));

const isAdverb = (word: string) =>
  word.length > 3 && word.endsWith('ly') && !NOT_ADVERBS.has(word) && !CRUTCHES.has(word);

/** Words from names and aliases, lower-cased, so a character's name is not an "overused word". */
export function wordsOfNames(names: readonly string[]): Set<string> {
  return new Set(names.flatMap((name) => tokenize(name)));
}

export interface WordCheckOptions {
  /** Words to leave out of the most-used and repeat lists, such as the names of characters. */
  ignore?: ReadonlySet<string>;
  /** Words to count whatever they are. */
  watch?: readonly string[];
  /** How many of the most used words to return. */
  topLimit?: number;
  /** A word must appear at least this often to be a "most used" word. */
  minCount?: number;
}

/** Counts the words of a text and picks out the habits a writer may want to look at. */
export function analyzeWords(text: string, options: WordCheckOptions = {}): WordCheck {
  const { ignore = new Set<string>(), topLimit = 25, minCount = 3 } = options;
  const tokens = tokenize(text);
  const total = tokens.length;

  const counts = new Map<string, number>();
  for (const word of tokens) counts.set(word, (counts.get(word) ?? 0) + 1);

  const meaningful = new Map<string, number>();
  const crutches = new Map<string, number>();
  const adverbs = new Map<string, number>();
  let adverbTotal = 0;
  for (const [word, count] of counts) {
    if (CRUTCHES.has(word)) crutches.set(word, count);
    if (isAdverb(word)) {
      adverbs.set(word, count);
      adverbTotal += count;
    }
    if (!STOP_WORDS.has(word) && !ignore.has(word) && word.length > 2 && count >= minCount) {
      meaningful.set(word, count);
    }
  }

  // Close repeats: the same word again within a few words, ignoring small and ignored words.
  const lastSeen = new Map<string, number>();
  const repeats = new Map<string, number>();
  tokens.forEach((word, index) => {
    if (word.length < 4 || STOP_WORDS.has(word) || ignore.has(word)) return;
    const last = lastSeen.get(word);
    if (last !== undefined && index - last <= CLOSE_REPEAT_WINDOW) {
      repeats.set(word, (repeats.get(word) ?? 0) + 1);
    }
    lastSeen.set(word, index);
  });

  const sentences = text
    .split(/(?<=[.!?…])["'”’)]*\s+/u)
    .map((sentence) => tokenize(sentence).length)
    .filter((length) => length > 0);
  const sentenceWords = sentences.reduce((sum, length) => sum + length, 0);

  const watch = [...new Set((options.watch ?? []).flatMap((entry) => tokenize(entry)))].slice(
    0,
    MAX_WATCHED_WORDS,
  );

  return {
    totalWords: total,
    uniqueWords: counts.size,
    sentences: sentences.length,
    avgSentenceWords:
      sentences.length === 0 ? 0 : Math.round((sentenceWords / sentences.length) * 10) / 10,
    longSentences: sentences.filter((length) => length > LONG_SENTENCE_WORDS).length,
    topWords: rank(meaningful, total, topLimit),
    crutchWords: rank(crutches, total, CRUTCH_WORDS.length),
    adverbs: {
      total: adverbTotal,
      perThousand: perThousand(adverbTotal, total),
      top: rank(adverbs, total, 10),
    },
    watched: watch.map((word) => ({
      word,
      count: counts.get(word) ?? 0,
      perThousand: perThousand(counts.get(word) ?? 0, total),
    })),
    closeRepeats: [...repeats]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 15)
      .map(([word, count]) => ({ word, count })),
  };
}
