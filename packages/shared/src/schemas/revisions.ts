import { z } from 'zod';
import { idSchema } from './common';

/**
 * Where a saved version came from: `auto` is kept while someone writes, `manual` is a version
 * the author named, `restore` is what the text was just before an older version was brought back.
 */
export const REVISION_KINDS = ['auto', 'manual', 'restore'] as const;
export type RevisionKind = (typeof REVISION_KINDS)[number];

/** Edits within this many minutes of a version's first save are folded into it. */
export const REVISION_WINDOW_MINUTES = 10;
/** Older automatic versions beyond this many per entry or scene are dropped. */
export const MAX_AUTO_REVISIONS = 60;
/** Named versions per entry or scene; delete one to make room for another. */
export const MAX_NAMED_REVISIONS = 100;
/** Copies taken just before a restore; the oldest are dropped beyond this. */
export const MAX_RESTORE_COPIES = 30;

export const revisionCreateSchema = z.object({
  label: z.string().trim().min(1, 'Give the version a name').max(80),
});
export type RevisionCreateInput = z.input<typeof revisionCreateSchema>;

export const revisionParamsSchema = z.object({
  worldId: idSchema,
  id: idSchema,
  revisionId: idSchema,
});
