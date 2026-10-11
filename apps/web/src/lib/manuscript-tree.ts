import { BookMarked, FileText, Layers, ScrollText, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { ManuscriptNode, NodeKind } from '@atlas/shared';
import { useManuscript } from '@/api/manuscript-queries';
import { useWorld } from '@/lib/world-context';

export const KIND_ICONS: Record<NodeKind, LucideIcon> = {
  book: BookMarked,
  part: Layers,
  chapter: ScrollText,
  scene: FileText,
};

export const formatWords = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export interface ManuscriptTree {
  nodes: ManuscriptNode[];
  byId: Map<string, ManuscriptNode>;
  childrenOf: (parentId: string | null) => ManuscriptNode[];
}

export function buildTree(nodes: ManuscriptNode[]): ManuscriptTree {
  const children = new Map<string | null, ManuscriptNode[]>();
  for (const node of nodes)
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  return {
    nodes,
    byId: new Map(nodes.map((n) => [n.id, n])),
    childrenOf: (parentId) => children.get(parentId) ?? [],
  };
}

export function useManuscriptTree() {
  const { world } = useWorld();
  const query = useManuscript(world.id);
  const tree = useMemo(() => buildTree(query.data ?? []), [query.data]);
  return { ...query, tree };
}

/** "Book › Part › Chapter" for a node, excluding the node itself. */
export function ancestorTitles(tree: ManuscriptTree, node: ManuscriptNode): string[] {
  const titles: string[] = [];
  for (let id = node.parentId; id; id = tree.byId.get(id)?.parentId ?? null) {
    const parent = tree.byId.get(id);
    if (parent) titles.unshift(parent.title);
  }
  return titles;
}
