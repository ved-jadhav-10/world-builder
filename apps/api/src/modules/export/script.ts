import { inArray } from 'drizzle-orm';
import {
  richTextToBlocks,
  safeName,
  toComicScript,
  toFountain,
  type ManuscriptNode,
  type ScriptBook,
  type ScriptInput,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities } from '../../db/schema';
import { badRequest } from '../../errors';
import { loadManuscriptSource } from './manuscript-source';

export type ScriptKind = 'screenplay' | 'comic';

/** The manuscript laid out as a screenplay (Fountain) or a comic script: a scaffold to adapt. */
export async function buildScriptExport(
  db: DbOrTx,
  worldId: string,
  options: { kind: ScriptKind; bookId?: string; author: string },
): Promise<{ filename: string; data: string; contentType: string }> {
  const { worldName, children, bodies, chosen } = await loadManuscriptSource(
    db,
    worldId,
    options.bookId,
  );

  // Scenes name a place and a viewpoint by entry; one lookup gives the names.
  const wanted = new Set<string>();
  const scenesOf = (node: ManuscriptNode): ManuscriptNode[] =>
    (children.get(node.id) ?? []).flatMap((kid) => (kid.kind === 'scene' ? [kid] : scenesOf(kid)));
  for (const book of chosen) {
    for (const scene of scenesOf(book)) {
      if (scene.locationId) wanted.add(scene.locationId);
      if (scene.povId) wanted.add(scene.povId);
    }
  }
  const names = new Map<string, string>();
  if (wanted.size > 0) {
    const rows = await db
      .select({ id: entities.id, name: entities.name })
      .from(entities)
      .where(inArray(entities.id, [...wanted]));
    for (const row of rows) names.set(row.id, row.name);
  }

  const books: ScriptBook[] = chosen.map((book) => {
    // Chapters (and parts) hold scenes; scenes straight under a book go in a chapter of their own.
    const groups: { title: string; node: ManuscriptNode }[] = [];
    const walk = (node: ManuscriptNode) => {
      for (const kid of children.get(node.id) ?? []) {
        if (kid.kind === 'chapter') groups.push({ title: kid.title, node: kid });
        else if (kid.kind === 'part') walk(kid);
      }
    };
    walk(book);
    const looseScenes = (children.get(book.id) ?? []).filter((kid) => kid.kind === 'scene');
    if (looseScenes.length > 0) groups.unshift({ title: book.title, node: book });
    return {
      title: book.title,
      chapters: groups.map(({ title, node }) => ({
        title,
        scenes: (children.get(node.id) ?? [])
          .filter((kid) => kid.kind === 'scene')
          .map((scene) => ({
            title: scene.title,
            summary: scene.summary,
            location: scene.locationId ? (names.get(scene.locationId) ?? null) : null,
            date: scene.inWorldDate,
            pov: scene.povId ? (names.get(scene.povId) ?? null) : null,
            blocks: richTextToBlocks(bodies.get(scene.id) ?? null),
          })),
      })),
    };
  });
  if (!books.some((b) => b.chapters.some((c) => c.scenes.some((s) => s.blocks.length > 0)))) {
    throw badRequest('The manuscript has no text yet. Write a scene first.');
  }

  const input: ScriptInput = {
    title: chosen.length === 1 ? chosen[0]!.title : worldName,
    author: options.author.trim() || 'Author',
    books,
  };
  const base = safeName(input.title, 'manuscript');
  return options.kind === 'screenplay'
    ? { filename: `${base}.fountain`, data: toFountain(input), contentType: 'text/plain' }
    : {
        filename: `${base}-comic-script.txt`,
        data: toComicScript(input),
        contentType: 'text/plain',
      };
}
