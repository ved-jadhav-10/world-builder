import type { Visibility } from '@atlas/shared';

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  gm: 'GM only',
  player: 'Players',
  reader: 'Readers',
  public: 'Public',
  hidden: 'Hidden',
};

export const VISIBILITY_HINTS: Record<Visibility, string> = {
  gm: 'Only you, as the GM, see this.',
  player: 'Your players see this.',
  reader: 'Readers of your story see this.',
  public: 'Everyone sees this.',
  hidden: 'Kept out of every view but yours, until you reveal it.',
};
