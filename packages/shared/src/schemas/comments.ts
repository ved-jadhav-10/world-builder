import { z } from 'zod';
import { idSchema } from './common';

export const MAX_COMMENT_LENGTH = 4_000;
/** Comments and replies together, on one entry or scene. */
export const MAX_COMMENTS_PER_SUBJECT = 500;

const bodySchema = z.string().trim().min(1, 'Write something first').max(MAX_COMMENT_LENGTH);

export const commentCreateSchema = z.object({
  body: bodySchema,
  /** The comment being answered. Threads are one level deep, so it must itself start a thread. */
  parentId: idSchema.nullable().default(null),
});
export type CommentCreateInput = z.input<typeof commentCreateSchema>;

export const commentUpdateSchema = z
  .object({
    body: bodySchema.optional(),
    /** Marks a whole thread as dealt with, or opens it again. Only for the comment that starts one. */
    resolved: z.boolean().optional(),
  })
  .refine((value) => value.body !== undefined || value.resolved !== undefined, {
    message: 'Nothing to change',
  });
export type CommentUpdateInput = z.input<typeof commentUpdateSchema>;

export const commentParamsSchema = z.object({ worldId: idSchema, id: idSchema });

export const COMMENT_STATUSES = ['open', 'resolved', 'all'] as const;
export const commentInboxQuerySchema = z.object({
  status: z.enum(COMMENT_STATUSES).default('open'),
});
