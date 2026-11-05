import { z } from 'zod';
import { idSchema, visibilitySchema, type Visibility } from './common';

export const MAX_HANDOUT_BYTES = 25 * 1024 * 1024;

const titleSchema = z.string().trim().min(1, 'Give the handout a title').max(120);
const bodySchema = z.string().trim().max(10_000);

export const handoutCreateSchema = z.object({
  title: titleSchema,
  /** Plain text shown beside or under the picture: a letter, a riddle, a rumour. */
  body: bodySchema.default(''),
  /** New handouts are the GM's until revealed. */
  visibility: visibilitySchema.default('gm'),
});
export type HandoutCreateInput = z.input<typeof handoutCreateSchema>;

export const handoutUpdateSchema = z.object({
  title: titleSchema.optional(),
  body: bodySchema.optional(),
  visibility: visibilitySchema.optional(),
});
export type HandoutUpdateInput = z.input<typeof handoutUpdateSchema>;

export const handoutParamsSchema = z.object({ worldId: idSchema, id: idSchema });

/** Whether a handout has been shown to anyone besides the GM. */
export const isRevealed = (visibility: Visibility): boolean =>
  visibility !== 'gm' && visibility !== 'hidden';
