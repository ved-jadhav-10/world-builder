import type { AtlasMap } from '@atlas/shared';

/** The maps from the top level down to `id`, ending with that map. Empty if it isn't found. */
export function mapPath(maps: AtlasMap[], id: string): AtlasMap[] {
  const byId = new Map(maps.map((m) => [m.id, m]));
  const path: AtlasMap[] = [];
  const seen = new Set<string>();
  for (let current = byId.get(id); current && !seen.has(current.id);) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export const childMaps = (maps: AtlasMap[], parentId: string | null) =>
  maps.filter((m) => m.parentId === parentId);

/** Every map inside `id`, at any depth. */
export function descendantIds(maps: AtlasMap[], id: string): Set<string> {
  const found = new Set<string>();
  const visit = (parentId: string) => {
    for (const child of childMaps(maps, parentId)) {
      if (!found.has(child.id)) {
        found.add(child.id);
        visit(child.id);
      }
    }
  };
  visit(id);
  return found;
}
