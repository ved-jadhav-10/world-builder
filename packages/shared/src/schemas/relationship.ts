import { z } from 'zod';
import { dayNumberSchema } from './calendar';
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

/** When a link holds, in in-world day numbers. An open end means "still true" / "always was". */
export const relationshipUpdateSchema = z
  .object({
    notes: z.string().trim().max(2000).optional(),
    validFromDay: dayNumberSchema.nullable().optional(),
    validToDay: dayNumberSchema.nullable().optional(),
  })
  .refine((r) => r.validFromDay == null || r.validToDay == null || r.validToDay >= r.validFromDay, {
    path: ['validToDay'],
    message: 'The end cannot come before the start',
  });
export type RelationshipUpdateInput = z.input<typeof relationshipUpdateSchema>;
