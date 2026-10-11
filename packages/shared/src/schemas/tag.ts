import { z } from 'zod';
import { colorSchema } from './common';

export const tagCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50),
  color: colorSchema.default('#64748b'),
});
export type TagCreateInput = z.input<typeof tagCreateSchema>;

export const tagUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50).optional(),
  color: colorSchema.optional(),
});
export type TagUpdateInput = z.input<typeof tagUpdateSchema>;
