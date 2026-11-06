import { z } from 'zod';
import { dayNumberSchema } from './calendar';
import { idSchema } from './common';
import { richTextDocSchema } from './entity';

/** Book > (part >) chapter > scene. */
export const NODE_KINDS = ['book', 'part', 'chapter', 'scene'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  book: 'Book',
  part: 'Part',
  chapter: 'Chapter',
  scene: 'Scene',
};

/** Which kinds may sit directly under each kind (null = top level). */
export const ALLOWED_CHILD_KINDS: Record<NodeKind | 'root', readonly NodeKind[]> = {
  root: ['book'],
  book: ['part', 'chapter'],
  part: ['chapter'],
  chapter: ['scene'],
  scene: [],
};

const titleSchema = z.string().trim().min(1, 'Title is required').max(200);

export const nodeCreateSchema = z.object({
  kind: z.enum(NODE_KINDS),
  parentId: idSchema.nullable().default(null),
  title: titleSchema,
});
export type NodeCreateInput = z.input<typeof nodeCreateSchema>;

export const nodeUpdateSchema = z.object({
  title: titleSchema.optional(),
  summary: z.string().trim().max(2000).optional(),
  /** Scenes only. */
  povId: idSchema.nullable().optional(),
  locationId: idSchema.nullable().optional(),
  inWorldDate: z.string().trim().max(100).optional(),
  /** The scene's date as a day number in the world's calendar. */
  inWorldDay: dayNumberSchema.nullable().optional(),
});
export type NodeUpdateInput = z.input<typeof nodeUpdateSchema>;

export const nodeMoveSchema = z.object({
  parentId: idSchema.nullable(),
  /** Position among the new siblings; clamped to the end. */
  index: z.number().int().min(0),
});
export type NodeMoveInput = z.input<typeof nodeMoveSchema>;

export const sceneBodySchema = z.object({
  body: richTextDocSchema.nullable(),
});
export type SceneBodyInput = z.input<typeof sceneBodySchema>;

/** What to put in a Word export of the manuscript. */
export const MANUSCRIPT_FORMATS = ['manuscript', 'clean'] as const;
export const MANUSCRIPT_PAPERS = ['letter', 'a4'] as const;

/** The manuscript as a script: a screenplay (Fountain) or a comic script. */
export const scriptExportQuerySchema = z.object({
  kind: z.enum(['screenplay', 'comic']).default('screenplay'),
  bookId: idSchema.optional(),
  author: z.string().trim().max(100).optional(),
});

export const manuscriptExportQuerySchema = z.object({
  /** One book; every book when left out. */
  bookId: idSchema.optional(),
  /** `manuscript` is the standard submission format; `clean` is a comfortable reading layout. */
  format: z.enum(MANUSCRIPT_FORMATS).default('manuscript'),
  paper: z.enum(MANUSCRIPT_PAPERS).default('letter'),
  /** Printed on the title page and in the header; the signed-in name when left out. */
  author: z.string().trim().max(100).optional(),
});
export type ManuscriptExportQuery = z.output<typeof manuscriptExportQuerySchema>;

/** The EPUB export takes the book and the author name; layout and paper are Word's concerns. */
export const epubExportQuerySchema = manuscriptExportQuerySchema.pick({
  bookId: true,
  author: true,
});
