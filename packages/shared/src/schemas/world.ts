import { z } from 'zod';

/** What a new world starts with: nothing but the built-in types, or the sample world's contents. */
export const WORLD_TEMPLATES = ['blank', 'sample'] as const;
export type WorldTemplate = (typeof WORLD_TEMPLATES)[number];

export const worldCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).default(''),
  template: z.enum(WORLD_TEMPLATES).default('blank'),
});
export type WorldCreateInput = z.input<typeof worldCreateSchema>;

export const worldUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120).optional(),
  description: z.string().trim().max(2000).optional(),
});
export type WorldUpdateInput = z.input<typeof worldUpdateSchema>;
