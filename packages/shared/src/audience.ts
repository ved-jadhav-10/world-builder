import { VISIBILITIES, type Role, type Visibility } from './schemas/common';

/**
 * Who is looking. Everything in a world has a visibility, and each audience sees some of them.
 * The GM (the owner and editors) sees everything; players and readers are separate audiences,
 * each seeing what is public plus what was shared with them.
 */
export const AUDIENCES = ['gm', 'player', 'reader', 'public'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  gm: 'GM',
  player: 'A player',
  reader: 'A reader',
  public: 'The public',
};

const SEES: Record<Audience, readonly Visibility[]> = {
  gm: VISIBILITIES,
  player: ['public', 'player'],
  reader: ['public', 'reader'],
  public: ['public'],
};

/** The visibilities an audience can see. */
export const visibilitiesFor = (audience: Audience): readonly Visibility[] => SEES[audience];

export const canSee = (audience: Audience, visibility: Visibility): boolean =>
  SEES[audience].includes(visibility);

/** The audience a member of a world belongs to, from their role. */
export function audienceForRole(role: Role): Audience {
  switch (role) {
    case 'owner':
    case 'editor':
      return 'gm';
    case 'player':
      return 'player';
    case 'commenter':
    case 'reader':
      return 'reader';
  }
}

/** What a GM can preview. Sent as the `x-view-as` header; the API makes previews read-only. */
export const PREVIEW_AUDIENCES = ['player', 'reader', 'public'] as const;
export type PreviewAudience = (typeof PREVIEW_AUDIENCES)[number];
export const VIEW_AS_HEADER = 'x-view-as';

export const isPreviewAudience = (value: unknown): value is PreviewAudience =>
  typeof value === 'string' && (PREVIEW_AUDIENCES as readonly string[]).includes(value);
