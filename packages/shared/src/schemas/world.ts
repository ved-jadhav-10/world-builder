import { z } from 'zod';

export const worldCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).default(''),
});
export type WorldCreateInput = z.input<typeof worldCreateSchema>;

export const worldUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120).optional(),
  description: z.string().trim().max(2000).optional(),
});
export type WorldUpdateInput = z.input<typeof worldUpdateSchema>;
