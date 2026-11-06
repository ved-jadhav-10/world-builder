import { z } from 'zod';
import { idSchema, visibilitySchema } from './common';
import { dayNumberSchema } from './calendar';

export const relationshipChangeSchema = z.object({
  relationshipId: idSchema,
  /** The link becomes another kind (friend to rival). */
  typeId: idSchema.optional(),
  /** The link is over from here on. */
  ended: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type RelationshipChange = z.infer<typeof relationshipChangeSchema>;

/**
 * What a progression changes on its entry. Field values replace the entry's own; `null` clears
 * one (say, a title lost in a coup). A summary replaces the entry's summary.
 */
export const progressionChangesSchema = z.object({
  fields: z.record(z.string(), z.unknown()).optional(),
  summary: z.string().trim().max(2000).optional(),
  /** A new name from here on (a title taken, a name changed at marriage). */
  name: z.string().trim().min(1).max(200).optional(),
  /** The full list of other names from here on; it replaces the entry's own. */
  aliases: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  /** What happens to a link of this entry's: it ends, becomes another kind, or gets new notes. */
  relationships: z.array(relationshipChangeSchema).max(50).optional(),
});
export type ProgressionChanges = z.infer<typeof progressionChangesSchema>;

const titleSchema = z.string().trim().min(1, 'A title is required').max(120);
const noteSchema = z.string().trim().max(5000);

export const progressionCreateSchema = z
  .object({
    title: titleSchema,
    note: noteSchema.default(''),
    /** The scene it happens in (reading order) or the in-world day: exactly one. */
    sceneId: idSchema.nullable().default(null),
    day: dayNumberSchema.nullable().default(null),
    changes: progressionChangesSchema.default({}),
    /** Who can see this change in an entry's history. Hidden from players until revealed. */
    visibility: visibilitySchema.default('gm'),
  })
  .refine((p) => (p.sceneId === null) !== (p.day === null), {
    path: ['sceneId'],
    message: 'Place it at a scene or at a date, not both and not neither',
  });
export type ProgressionCreateInput = z.input<typeof progressionCreateSchema>;

export const progressionUpdateSchema = z.object({
  title: titleSchema.optional(),
  note: noteSchema.optional(),
  sceneId: idSchema.nullable().optional(),
  day: dayNumberSchema.nullable().optional(),
  changes: progressionChangesSchema.optional(),
  visibility: visibilitySchema.optional(),
});
export type ProgressionUpdateInput = z.input<typeof progressionUpdateSchema>;
