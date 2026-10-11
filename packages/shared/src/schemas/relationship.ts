import { z } from 'zod';
import { idSchema } from './common';

export const relationshipTypeCreateSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(60),
  inverseLabel: z.string().trim().min(1, 'Inverse label is required').max(60),
});
export type RelationshipTypeCreateInput = z.input<typeof relationshipTypeCreateSchema>;

export const relationshipCreateSchema = z
  .object({
    sourceId: idSchema,
    targetId: idSchema,
    typeId: idSchema,
    notes: z.string().trim().max(2000).default(''),
  })
  .refine((r) => r.sourceId !== r.targetId, {
    path: ['targetId'],
    message: 'An entity cannot be linked to itself',
  });
export type RelationshipCreateInput = z.input<typeof relationshipCreateSchema>;
