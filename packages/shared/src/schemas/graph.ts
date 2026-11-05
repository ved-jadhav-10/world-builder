import { z } from 'zod';
import { idSchema } from './common';
import { MAX_FAMILY_GENERATIONS } from '../family';

export const MAX_GRAPH_NODES = 300;

/** The relationships that make up a family; the type keys the built-in types are seeded with. */
export const FAMILY_LINK_KEYS = {
  parent: 'parent_of',
  spouse: 'spouse_of',
  sibling: 'sibling_of',
} as const;

export const graphQuerySchema = z.object({
  /** Show the neighbourhood of this entry. Left out, the most connected entries are shown. */
  focus: idSchema.optional(),
  /** How many links out from the focus to follow. */
  depth: z.coerce.number().int().min(1).max(3).default(2),
  limit: z.coerce.number().int().min(5).max(MAX_GRAPH_NODES).default(120),
  /** Only links that hold on this in-world day. */
  day: z.coerce.number().int().optional(),
});
/** What the server works with, after the defaults and number parsing. */
export type GraphParams = z.output<typeof graphQuerySchema>;

export const familyQuerySchema = z.object({
  up: z.coerce.number().int().min(0).max(MAX_FAMILY_GENERATIONS).default(3),
  down: z.coerce.number().int().min(0).max(MAX_FAMILY_GENERATIONS).default(3),
});
export type FamilyParams = z.output<typeof familyQuerySchema>;
