import { ALLOWED_CHILD_KINDS, type NodeKind } from './schemas/manuscript';

export interface MovableNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
}

/** Where on a row something is dropped: above it, below it, or into it as a child. */
export type DropPosition = 'before' | 'inside' | 'after';

export interface NodePlacement {
  parentId: string | null;
  /** Position among the new siblings once the moved item is out of its old place. */
  index: number;
}

/**
 * Works out where dragging one manuscript item onto another would put it, or null when it
 * cannot go there (the nesting rules forbid it, it would sit inside itself, or it would stay
 * exactly where it is). `nodes` must list siblings in their reading order.
 */
export function resolveDrop(
  nodes: readonly MovableNode[],
  dragId: string,
  targetId: string,
  position: DropPosition,
): NodePlacement | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const drag = byId.get(dragId);
  const target = byId.get(targetId);
  if (!drag || !target || drag.id === target.id) return null;

  // Nothing goes inside itself, however deep.
  for (
    let at: MovableNode | undefined = target;
    at;
    at = at.parentId ? byId.get(at.parentId) : undefined
  ) {
    if (at.id === drag.id) return null;
  }

  const childrenOf = (parentId: string | null) =>
    nodes.filter((node) => node.parentId === parentId && node.id !== drag.id);

  let placement: NodePlacement;
  if (position === 'inside') {
    if (!ALLOWED_CHILD_KINDS[target.kind].includes(drag.kind)) return null;
    placement = { parentId: target.id, index: childrenOf(target.id).length };
  } else {
    const parent = target.parentId ? byId.get(target.parentId) : undefined;
    if (target.parentId && !parent) return null;
    if (!ALLOWED_CHILD_KINDS[parent?.kind ?? 'root'].includes(drag.kind)) return null;
    const siblings = childrenOf(target.parentId);
    const at = siblings.findIndex((node) => node.id === target.id);
    placement = { parentId: target.parentId, index: position === 'before' ? at : at + 1 };
  }

  // Dropping an item where it already sits is not a move.
  if (placement.parentId === drag.parentId) {
    const current = childrenOf(drag.parentId);
    const before = nodes.filter((node) => node.parentId === drag.parentId);
    const currentIndex = before.findIndex((node) => node.id === drag.id);
    if (placement.index === currentIndex && placement.index <= current.length) return null;
  }
  return placement;
}
