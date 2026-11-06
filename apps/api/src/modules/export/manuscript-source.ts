import { eq } from 'drizzle-orm';
import type { ManuscriptNode, RichTextDoc } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { worlds } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { getSceneBodies, listTree } from '../manuscript/service';

export interface ManuscriptSource {
  worldName: string;
  /** Every node by its parent, in order. */
  children: Map<string | null, ManuscriptNode[]>;
  bodies: Map<string, RichTextDoc | null>;
  /** The books being exported: the one asked for, or all of them. */
  chosen: ManuscriptNode[];
}

/** What a manuscript export needs, in one place: the books to write out and their text. */
export async function loadManuscriptSource(
  db: DbOrTx,
  worldId: string,
  bookId?: string,
): Promise<ManuscriptSource> {
  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) throw notFound('World');
  const tree = await listTree(db, worldId);
  const bodies = await getSceneBodies(db, worldId);
  const children = new Map<string | null, ManuscriptNode[]>();
  for (const node of tree) {
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  const books = (children.get(null) ?? []).filter((n) => n.kind === 'book');
  const chosen = bookId ? books.filter((b) => b.id === bookId) : books;
  if (bookId && chosen.length === 0) throw notFound('Book');
  if (chosen.length === 0) throw badRequest('There is no manuscript to export yet.');
  return { worldName: world.name, children, bodies, chosen };
}
