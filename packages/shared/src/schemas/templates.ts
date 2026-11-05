import { z } from 'zod';
import { ENTITY_SORTS } from './entity';
import { idSchema, visibilitySchema } from './common';

/** How many entry templates a world keeps, and saved filters one person keeps per world. */
export const MAX_ENTRY_TEMPLATES = 50;
export const MAX_SAVED_FILTERS = 30;

const nameSchema = z.string().trim().min(1, 'Give it a name').max(80);

/** A template is made from an existing entry: its summary, fields, text and visibility. */
export const entryTemplateCreateSchema = z.object({
  entityId: idSchema,
  name: nameSchema,
});
export type EntryTemplateCreateInput = z.input<typeof entryTemplateCreateSchema>;

export const entryTemplateUpdateSchema = z.object({ name: nameSchema });
export type EntryTemplateUpdateInput = z.input<typeof entryTemplateUpdateSchema>;

export const entryTemplateParamsSchema = z.object({ worldId: idSchema, id: idSchema });

export const entryTemplateListQuerySchema = z.object({ typeId: idSchema.optional() });

/** A named combination of the filters on a type's list. */
export const savedFilterCreateSchema = z.object({
  name: nameSchema,
  typeId: idSchema,
  tagId: idSchema.nullable().default(null),
  visibility: visibilitySchema.nullable().default(null),
  sort: z.enum(ENTITY_SORTS).default('name'),
});
export type SavedFilterCreateInput = z.input<typeof savedFilterCreateSchema>;

export const savedFilterParamsSchema = z.object({ worldId: idSchema, id: idSchema });

export const savedFilterListQuerySchema = z.object({ typeId: idSchema.optional() });
