import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { fetchWritingStats, useAddSprint, writingKey } from '@/api/writing-queries';
import { clearSprint, useSprint } from '@/lib/sprint';
import { useWorld } from '@/lib/world-context';

/**
 * Mounted once for the GM, wherever they are in the world: when a sprint's time is up it counts
 * the words written since it began, saves the result and says so. If the tab was closed, the
 * sprint is finished the next time the world is opened.
 */
export function SprintRunner() {
  const { world } = useWorld();
  const qc = useQueryClient();
  const addSprint = useAddSprint(world.id);
  const { sprint, remainingMs } = useSprint(world.id);
  const finishing = useRef(false);
  const over = sprint !== null && remainingMs <= 0;

  useEffect(() => {
    if (!sprint || !over || finishing.current) return;
    finishing.current = true;
    void (async () => {
      try {
        const stats = await fetchWritingStats(world.id);
        const words = Math.max(0, stats.todayWords - sprint.startWords);
        await addSprint.mutateAsync({ minutes: sprint.minutes, words });
        toast.success(
          `Sprint finished: ${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} in ${sprint.minutes} minutes`,
        );
      } catch (error) {
        toast.error(`Could not save the sprint: ${errorMessage(error)}`);
      } finally {
        clearSprint();
        void qc.invalidateQueries({ queryKey: writingKey(world.id) });
        finishing.current = false;
      }
    })();
  }, [sprint, over, world.id, addSprint, qc]);

  return null;
}
