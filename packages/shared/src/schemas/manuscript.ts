import { z } from 'zod';
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
