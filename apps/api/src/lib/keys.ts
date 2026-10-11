import { randomBytes } from 'node:crypto';
import { slugify } from '@atlas/shared';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomSuffix(length = 4): string {
  return Array.from(randomBytes(length), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

/**
 * Picks a snake_case key from a display name that isn't in `taken`
 * ("Lore Article" -> "lore_article", then "lore_article_2", ...).
 */
export function uniqueKey(name: string, taken: ReadonlySet<string>, fallback: string): string {
  const base = slugify(name, '_', 40) || fallback;
  const key = /^[a-z]/.test(base) ? base : `${fallback}_${base}`;
  if (!taken.has(key)) return key;
  for (let n = 2; ; n++) {
    const candidate = `${key}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
