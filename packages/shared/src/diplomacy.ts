import { MAX_DIPLOMACY_SCORE, MIN_DIPLOMACY_SCORE } from './schemas/diplomacy';

/** The word for a score, from open war to a sworn alliance. */
export function diplomacyLabel(score: number): string {
  if (score <= -75) return 'At war';
  if (score <= -40) return 'Hostile';
  if (score <= -10) return 'Tense';
  if (score < 10) return 'Neutral';
  if (score < 40) return 'Friendly';
  if (score < 75) return 'Close';
  return 'Allied';
}

export const clampDiplomacy = (score: number) =>
  Math.min(MAX_DIPLOMACY_SCORE, Math.max(MIN_DIPLOMACY_SCORE, Math.round(score)));

/** An entry's average standing with the rest of the web, or null if it has no scores. */
export function averageStanding(
  entryId: string,
  scores: readonly { a: { id: string }; b: { id: string }; score: number }[],
): number | null {
  const mine = scores.filter((s) => s.a.id === entryId || s.b.id === entryId);
  if (mine.length === 0) return null;
  return Math.round(mine.reduce((sum, s) => sum + s.score, 0) / mine.length);
}
