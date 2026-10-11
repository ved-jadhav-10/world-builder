import { Eye, X } from 'lucide-react';
import {
  AUDIENCE_LABELS,
  isPreviewAudience,
  PREVIEW_AUDIENCES,
  type PreviewAudience,
} from '@atlas/shared';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { useChangeView } from '@/lib/use-change-view';
import { useViewAs } from '@/lib/view-as';

/** For the GM: look at the world as a player, a reader or the public. */
export function ViewAsSwitcher() {
  const viewAs = useViewAs();
  const change = useChangeView();
  return (
    <div className="space-y-1">
      <label
        htmlFor="view-as"
        className="flex items-center gap-1.5 px-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        <Eye className="size-3!" /> View as
      </label>
      <NativeSelect
        id="view-as"
        className="h-8 text-[13px]"
        value={viewAs ?? 'gm'}
        onChange={(event) => {
          const value = event.target.value;
          change(isPreviewAudience(value) ? value : null);
        }}
      >
        <option value="gm">Myself, the GM</option>
        {PREVIEW_AUDIENCES.map((audience) => (
          <option key={audience} value={audience}>
            {AUDIENCE_LABELS[audience]}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** Shown on every page while previewing, so it is never unclear whose view this is. */
export function PreviewBanner({ audience }: { audience: PreviewAudience }) {
  const change = useChangeView();
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-full border border-primary/40 bg-accent px-4 py-2 text-sm text-accent-foreground shadow-lg">
        <Eye className="size-4 shrink-0" />
        <span>
          Previewing as <strong>{AUDIENCE_LABELS[audience].toLowerCase()}</strong>. You see only
          what they can see, and editing is off.
        </span>
        <Button size="sm" variant="outline" onClick={() => change(null)}>
          <X /> Back to GM view
        </Button>
      </div>
    </div>
  );
}
