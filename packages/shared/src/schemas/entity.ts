import { z } from 'zod';
import { idSchema, visibilitySchema } from './common';

/** A TipTap/ProseMirror document. Node contents are re-validated by the editor schema on render. */
export const richTextDocSchema = z.looseObject({
  type: z.literal('doc'),
  content: z.array(z.unknown()).optional(),
});
export type RichTextDoc = z.infer<typeof richTextDocSchema>;

const nameSchema = z.string().trim().min(1, 'Name is required').max(200);
const aliasesSchema = z.array(z.string().trim().min(1).max(200)).max(50);

export const entityCreateSchema = z.object({
  typeId: idSchema,
  name: nameSchema,
  aliases: aliasesSchema.default([]),
  summary: z.string().trim().max(2000).default(''),
  /** Validated against the entity type's field schema on the server. */
  fields: z.record(z.string(), z.unknown()).default({}),
  body: richTextDocSchema.nullable().default(null),
  visibility: visibilitySchema.default('gm'),
});
export type EntityCreateInput = z.input<typeof entityCreateSchema>;

export const entityUpdateSchema = z.object({
  name: nameSchema.optional(),
  aliases: aliasesSchema.optional(),
  summary: z.string().trim().max(2000).optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  body: richTextDocSchema.nullable().optional(),
  visibility: visibilitySchema.optional(),
});
export type EntityUpdateInput = z.input<typeof entityUpdateSchema>;

export const ENTITY_SORTS = ['name', 'updated'] as const;
export type EntitySort = (typeof ENTITY_SORTS)[number];

export const entityListQuerySchema = z.object({
  typeId: idSchema.optional(),
  tagId: idSchema.optional(),
  sort: z.enum(ENTITY_SORTS).default('name'),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type EntityListQuery = z.input<typeof entityListQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  typeId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.input<typeof searchQuerySchema>;
