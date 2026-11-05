import { Tag as TagIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { BulkEntityInput, Visibility } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useBulkEntities, useTags } from '@/api/queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { VisibilitySelect } from '@/lib/visibility';
import { VISIBILITY_LABELS } from '@/lib/visibility-labels';
import { useWorld } from '@/lib/world-context';

const noun = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'entry' : 'entries'}`;

/**
 * The bar shown while entries are picked in a list: change who can see them, add or remove a tag,
 * or move them to the Trash, all at once.
 */
export function BulkBar({
  ids,
  onDone,
}: {
  ids: string[];
  /** Called after a change has gone through, to clear the selection. */
  onDone: () => void;
}) {
  const { world } = useWorld();
  const { data: tags = [] } = useTags(world.id);
  const bulk = useBulkEntities(world.id);
  const [visibility, setVisibility] = useState<Visibility>('player');
  const [tagId, setTagId] = useState('');

  async function run(input: BulkEntityInput, done: (updated: number) => string) {
    try {
      const result = await bulk.mutateAsync(input);
      toast.success(done(result.updated));
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const disabled = ids.length === 0 || bulk.isPending;
  const tagName = tags.find((t) => t.id === tagId)?.name ?? '';
  return (
    <div
      role="toolbar"
      aria-label="Bulk edit"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2"
    >
      <span className="text-sm font-medium" aria-live="polite">
        {ids.length === 0 ? 'Pick entries to change' : `${noun(ids.length)} selected`}
      </span>

      <div className="flex items-center gap-1.5">
        <VisibilitySelect
          aria-label="Who can see them"
          className="w-auto"
          value={visibility}
          onChange={setVisibility}
          disabled={disabled}
        />
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" disabled={disabled}>
              Set visibility
            </Button>
          }
          title={`Change who can see ${noun(ids.length)}?`}
          description={`They will be visible to: ${VISIBILITY_LABELS[visibility]}.`}
          confirmLabel="Change"
          destructive={false}
          onConfirm={() =>
            run(
              { action: 'visibility', ids, visibility },
              (n) => `${noun(n)} now visible to ${VISIBILITY_LABELS[visibility]}`,
            )
          }
        />
      </div>

      {tags.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <NativeSelect
            aria-label="Tag"
            className="w-auto"
            value={tagId}
            onChange={(event) => setTagId(event.target.value)}
            disabled={disabled}
          >
            <option value="">Choose a tag…</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !tagId}
            onClick={() =>
              void run({ action: 'add_tag', ids, tagId }, (n) => `Tagged ${noun(n)} “${tagName}”`)
            }
          >
            <TagIcon /> Add
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !tagId}
            onClick={() =>
              void run(
                { action: 'remove_tag', ids, tagId },
                (n) => `Removed “${tagName}” from ${noun(n)}`,
              )
            }
          >
            Remove
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        trigger={
          <Button
            variant="outline"
            size="sm"
            className="ml-auto text-destructive"
            disabled={disabled}
          >
            <Trash2 /> Move to Trash
          </Button>
        }
        title={`Move ${noun(ids.length)} to Trash?`}
        description="They can be restored from the Trash page."
        confirmLabel="Move to Trash"
        onConfirm={() => run({ action: 'trash', ids }, (n) => `${noun(n)} moved to Trash`)}
      />
    </div>
  );
}
