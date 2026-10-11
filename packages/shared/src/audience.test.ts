import { describe, expect, it } from 'vitest';
import {
  AUDIENCES,
  audienceForRole,
  canSee,
  isPreviewAudience,
  visibilitiesFor,
  type Audience,
} from './audience';
import { ROLES, VISIBILITIES, type Visibility } from './schemas/common';

describe('what each audience can see', () => {
  // The whole table, written out so a change to the rules has to change a test.
  const table: Record<Audience, Visibility[]> = {
    gm: ['public', 'reader', 'player', 'gm', 'hidden'],
    player: ['public', 'player'],
    reader: ['public', 'reader'],
    public: ['public'],
  };

  it.each(AUDIENCES)('%s sees exactly its own levels', (audience) => {
    for (const visibility of VISIBILITIES) {
      expect(canSee(audience, visibility), `${audience} / ${visibility}`).toBe(
        table[audience].includes(visibility),
      );
    }
    expect([...visibilitiesFor(audience)].sort()).toEqual([...table[audience]].sort());
  });

  it('keeps GM-only and hidden things from everyone but the GM', () => {
    for (const audience of AUDIENCES.filter((a) => a !== 'gm')) {
      expect(canSee(audience, 'gm')).toBe(false);
      expect(canSee(audience, 'hidden')).toBe(false);
    }
  });

  it('keeps players and readers apart, with the public seeing the least', () => {
    expect(canSee('player', 'reader')).toBe(false);
    expect(canSee('reader', 'player')).toBe(false);
    expect(visibilitiesFor('public')).toHaveLength(1);
  });
});

describe('audiences for roles', () => {
  it('maps every role', () => {
    expect(Object.fromEntries(ROLES.map((r) => [r, audienceForRole(r)]))).toEqual({
      owner: 'gm',
      editor: 'gm',
      commenter: 'reader',
      reader: 'reader',
      player: 'player',
    });
  });

  it('only lets a GM preview audiences other than GM', () => {
    expect(isPreviewAudience('player')).toBe(true);
    expect(isPreviewAudience('public')).toBe(true);
    expect(isPreviewAudience('gm')).toBe(false);
    expect(isPreviewAudience('admin')).toBe(false);
    expect(isPreviewAudience(undefined)).toBe(false);
  });
});
