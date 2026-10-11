import { useQueryClient } from '@tanstack/react-query';
import type { PreviewAudience } from '@atlas/shared';
import { setViewAs } from '@/lib/view-as';

/** Switches the whole app to what another audience sees. Everything is fetched again for it. */
export function useChangeView() {
  const qc = useQueryClient();
  return (next: PreviewAudience | null) => {
    setViewAs(next);
    // What is on screen belongs to the old audience; forget it so nothing leaks into the new view.
    void qc.resetQueries();
  };
}
