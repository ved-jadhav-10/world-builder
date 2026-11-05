import { hasRole } from '@atlas/shared';
import { useWorld } from '@/lib/world-context';

/** Whether this person can see and write comments: the owner, co-GMs and commenters, not in a preview. */
export function useCanComment(): boolean {
  const { world, previewing } = useWorld();
  return hasRole(world.role, 'commenter') && !previewing;
}
