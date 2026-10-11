import { createContext, useContext } from 'react';
import { hasRole, type EntityType, type World } from '@atlas/shared';

export interface WorldContextValue {
  world: World;
  types: EntityType[];
  typeById: Map<string, EntityType>;
  typeByKey: Map<string, EntityType>;
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

export function buildWorldContext(world: World, types: EntityType[]): WorldContextValue {
  return {
    world,
    types,
    typeById: new Map(types.map((t) => [t.id, t])),
    typeByKey: new Map(types.map((t) => [t.key, t])),
    canEdit: hasRole(world.role, 'editor'),
    base: `/w/${world.slug}`,
  };
}
