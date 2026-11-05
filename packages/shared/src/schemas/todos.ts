import { z } from 'zod';
import { idSchema } from './common';

export const MAX_TODOS = 500;

const titleSchema = z.string().trim().min(1, 'Write what needs doing').max(200);
const notesSchema = z.string().trim().max(2_000);

export const todoCreateSchema = z.object({
  title: titleSchema,
  notes: notesSchema.default(''),
  /** An entry this task is about, if any. */
  entityId: idSchema.nullable().default(null),
});
export type TodoCreateInput = z.input<typeof todoCreateSchema>;

export const todoUpdateSchema = z.object({
  title: titleSchema.optional(),
  notes: notesSchema.optional(),
  done: z.boolean().optional(),
  entityId: idSchema.nullable().optional(),
});
export type TodoUpdateInput = z.input<typeof todoUpdateSchema>;

export const todoParamsSchema = z.object({ worldId: idSchema, id: idSchema });
