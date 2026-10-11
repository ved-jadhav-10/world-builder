import { createContext, useContext } from 'react';
import {
  audienceForRole,
  hasRole,
  type Audience,
  type CalendarDef,
  type EntityType,
  type PreviewAudience,
  type World,
} from '@atlas/shared';

export interface WorldContextValue {
  world: World;
  types: EntityType[];
  typeById: Map<string, EntityType>;
  typeByKey: Map<string, EntityType>;
  /** The world's calendar, for turning day numbers into dates. */
  calendar: CalendarDef;
  /** Who is looking: the GM, or a player or reader (really, or as a GM previewing). */
  audience: Audience;
  /** True while a GM previews another audience; nothing can be changed then. */
  previewing: boolean;
  canEdit: boolean;
  /** Base path for links inside this world, e.g. "/w/aerth". */
  base: string;
}

export const WorldContext = createContext<WorldContextValue | null>(null);

export function useWorld(): WorldContextValue {
  const value = useContext(WorldContext);
  if (!value) throw new Error('useWorld must be used inside a world route');
  return value;
}

export function buildWorldContext(
  world: World,
  types: EntityType[],
  calendar: CalendarDef,
  viewAs: PreviewAudience | null = null,
): WorldContextValue {
  // Only a GM can preview; for anyone else a stale choice is ignored (the server ignores it too).
  const previewing = viewAs !== null && hasRole(world.role, 'editor');
  return {
    world,
    types,
    typeById: new Map(types.map((t) => [t.id, t])),
    typeByKey: new Map(types.map((t) => [t.key, t])),
    calendar,
    audience: previewing ? viewAs : audienceForRole(world.role),
    previewing,
    canEdit: hasRole(world.role, 'editor') && !previewing,
    base: `/w/${world.slug}`,
  };
}
