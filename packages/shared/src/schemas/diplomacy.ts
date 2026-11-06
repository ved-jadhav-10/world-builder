import { z } from 'zod';
import { idSchema, visibilitySchema } from './common';

export const MIN_DIPLOMACY_SCORE = -100;
export const MAX_DIPLOMACY_SCORE = 100;
export const MAX_DIPLOMACY_SCORES = 2_000;

/** How two entries stand with each other. The pair has no direction: A and B is B and A. */
export const diplomacySetSchema = z
  .object({
    aId: idSchema,
    bId: idSchema,
    score: z.number().int().min(MIN_DIPLOMACY_SCORE).max(MAX_DIPLOMACY_SCORE),
    notes: z.string().trim().max(1_000).default(''),
    visibility: visibilitySchema.default('gm'),
  })
  .refine((d) => d.aId !== d.bId, {
    path: ['bId'],
    message: 'Pick two different entries',
  });
export type DiplomacySetInput = z.input<typeof diplomacySetSchema>;

export const diplomacyParamsSchema = z.object({ worldId: idSchema, id: idSchema });
