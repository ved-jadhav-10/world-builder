/*
 * Comparing two versions of a piece of writing, for the version history. Text is a list of
 * blocks (paragraphs). Blocks are matched first; a removed block next to an added one is then
 * compared word by word, so a changed sentence shows as a few words rather than a whole
 * paragraph swapped out.
 */

export type DiffOp = 'same' | 'add' | 'del';

export interface DiffPart {
  op: DiffOp;
  text: string;
}

export interface DiffBlock {
  /** `change` is a paragraph present in both versions with edits inside; see `parts`. */
  op: DiffOp | 'change';
  parts: DiffPart[];
}

/** Longest common subsequence of two lists, as the matched index pairs in order. */
function commonPairs<T>(a: readonly T[], b: readonly T[]): [number, number][] {
  // Lines that start or end the same need no table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);

  const n = endA - start;
  const m = endB - start;
  if (n > 0 && m > 0) {
    // Row-major table of lengths of the longest common tail.
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] =
          a[start + i] === b[start + j]
            ? table[(i + 1) * width + j + 1]! + 1
            : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        pairs.push([start + i, start + j]);
        i++;
        j++;
      } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
        i++;
      } else {
        j++;
      }
    }
  }
  for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}

/** Past this many words on one side of a paragraph, the paragraph is shown replaced instead. */
const MAX_WORD_DIFF_TOKENS = 1500;

// Whitespace, words (with inner apostrophes and hyphens) and single punctuation marks, so a
// full stop after a word does not make the word look changed.
const tokens = (text: string) =>
  text.match(/\s+|[\p{L}\p{N}_]+(?:['’-][\p{L}\p{N}_]+)*|[^\s\p{L}\p{N}_]/gu) ?? [];

/** A word-by-word comparison of two strings; neighbouring parts of the same kind are merged. */
export function diffWords(before: string, after: string): DiffPart[] {
  if (before === after) return before ? [{ op: 'same', text: before }] : [];
  const a = tokens(before);
  const b = tokens(after);
  const parts: DiffPart[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.op === op) last.text += text;
    else parts.push({ op, text });
  };
  if (a.length > MAX_WORD_DIFF_TOKENS || b.length > MAX_WORD_DIFF_TOKENS) {
    if (before) push('del', before);
    if (after) push('add', after);
    return parts;
  }
  let i = 0;
  let j = 0;
  for (const [pi, pj] of commonPairs(a, b)) {
    while (i < pi) push('del', a[i++]!);
    while (j < pj) push('add', b[j++]!);
    push('same', a[i]!);
    i++;
    j++;
  }
  while (i < a.length) push('del', a[i++]!);
  while (j < b.length) push('add', b[j++]!);
  return parts;
}

/** Compares two lists of paragraphs. Applying the result to `before` gives `after`. */
export function diffBlocks(before: readonly string[], after: readonly string[]): DiffBlock[] {
  const out: DiffBlock[] = [];
  let i = 0;
  let j = 0;
  const flush = (endI: number, endJ: number) => {
    // A run of removed paragraphs beside a run of added ones: pair them off in order.
    const removed = before.slice(i, endI);
    const added = after.slice(j, endJ);
    const paired = Math.min(removed.length, added.length);
    for (let k = 0; k < paired; k++) {
      const parts = diffWords(removed[k]!, added[k]!);
      const kept = parts.filter((p) => p.op === 'same').reduce((n, p) => n + p.text.length, 0);
      const longest = Math.max(removed[k]!.length, added[k]!.length);
      // Barely anything in common means a different paragraph, not an edited one.
      if (longest > 0 && kept / longest >= 0.3) out.push({ op: 'change', parts });
      else {
        out.push({ op: 'del', parts: [{ op: 'del', text: removed[k]! }] });
        out.push({ op: 'add', parts: [{ op: 'add', text: added[k]! }] });
      }
    }
    for (const text of removed.slice(paired)) out.push({ op: 'del', parts: [{ op: 'del', text }] });
    for (const text of added.slice(paired)) out.push({ op: 'add', parts: [{ op: 'add', text }] });
  };
  for (const [pi, pj] of commonPairs(before, after)) {
    flush(pi, pj);
    out.push({ op: 'same', parts: [{ op: 'same', text: before[pi]! }] });
    i = pi + 1;
    j = pj + 1;
  }
  flush(before.length, after.length);
  return out;
}

/** True when the two versions differ at all. */
export const hasChanges = (blocks: readonly DiffBlock[]) => blocks.some((b) => b.op !== 'same');
