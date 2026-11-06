import { useMemo } from 'react';
import { useEntityRelationships, useRelationshipTypes } from '@/api/queries';
import type { LinkWords } from '@/lib/progression-text';
import { useWorld } from '@/lib/world-context';

/** Words for the links of one entry, so a change to a link reads as "friend of Dov: ends". */
export function useLinkWords(entityId: string): LinkWords {
  const { world } = useWorld();
  const { data: links } = useEntityRelationships(world.id, entityId);
  const { data: types } = useRelationshipTypes(world.id);
  return useMemo(() => {
    const byId = new Map((links ?? []).map((l) => [l.id, `${l.label} ${l.other.name}`]));
    const labels = new Map((types ?? []).map((t) => [t.id, t.label]));
    return {
      link: (id) => byId.get(id) ?? null,
      typeLabel: (id) => labels.get(id) ?? null,
    };
  }, [links, types]);
}
