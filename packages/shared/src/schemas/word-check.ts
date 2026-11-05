import { z } from 'zod';
import { idSchema } from './common';

/** What a word check covers, and the words the writer wants counted whatever they are. */
export const wordCheckQuerySchema = z.object({
  /** A book, part, chapter or scene; leave out for the whole manuscript. */
  nodeId: idSchema.optional(),
  /** Words to count, separated by commas. */
  watch: z.string().trim().max(400).default(''),
});
export type WordCheckQuery = z.input<typeof wordCheckQuerySchema>;
