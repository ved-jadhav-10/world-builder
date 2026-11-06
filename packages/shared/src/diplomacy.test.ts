import { describe, expect, it } from 'vitest';
import { averageStanding, clampDiplomacy, diplomacyLabel } from './diplomacy';

describe('diplomacy', () => {
  it('names the whole range', () => {
    const labels = [-100, -75, -74, -40, -10, 0, 9, 10, 39, 40, 74, 75, 100].map(diplomacyLabel);
    expect(labels).toEqual([
      'At war',
      'At war',
      'Hostile',
      'Hostile',
      'Tense',
      'Neutral',
      'Neutral',
      'Friendly',
      'Friendly',
      'Close',
      'Close',
      'Allied',
      'Allied',
    ]);
  });

  it('keeps scores in range', () => {
    expect(clampDiplomacy(250)).toBe(100);
    expect(clampDiplomacy(-250.4)).toBe(-100);
    expect(clampDiplomacy(12.6)).toBe(13);
  });

  it('averages the scores an entry is in, either side', () => {
    const scores = [
      { a: { id: 'x' }, b: { id: 'y' }, score: 50 },
      { a: { id: 'z' }, b: { id: 'x' }, score: -20 },
      { a: { id: 'y' }, b: { id: 'z' }, score: 90 },
    ];
    expect(averageStanding('x', scores)).toBe(15);
    expect(averageStanding('q', scores)).toBeNull();
  });
});
