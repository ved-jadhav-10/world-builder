import { Bookmark, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { EntitySort, SavedFilter, Visibility } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
} from '@/api/template-queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/inputs';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

export interface ListFilters {
  tagId: string;
  visibility: Visibility | '';
  sort: EntitySort;
}

const DEFAULT_FILTERS: ListFilters = { tagId: '', visibility: '', sort: 'name' };

const same = (a: ListFilters, b: ListFilters) =>
  a.tagId === b.tagId && a.visibility === b.visibility && a.sort === b.sort;

const toFilters = (saved: SavedFilter): ListFilters => ({
  tagId: saved.tagId ?? '',
  visibility: saved.visibility ?? '',
  sort: saved.sort,
});

/** The person's saved filters for a type as chips, and a way to keep the current view. */
export function SavedFiltersBar({
  typeId,
  current,
  onApply,
}: {
  typeId: string;
  current: ListFilters;
  onApply: (filters: ListFilters) => void;
}) {
  const { world } = useWorld();
  const { data: saved = [] } = useSavedFilters(world.id, typeId);
  const create = useCreateSavedFilter(world.id);
  const remove = useDeleteSavedFilter(world.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const canSave =
    !same(current, DEFAULT_FILTERS) && !saved.some((s) => same(toFilters(s), current));
  if (saved.length === 0 && !canSave) return null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      {
        name,
        typeId,
        tagId: current.tagId || null,
        visibility: current.visibility || null,
        sort: current.sort,
      },
      {
        onSuccess: () => {
          toast.success('Filter saved');
          setOpen(false);
          setName('');
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Saved filters" role="group">
      {saved.map((filter) => {
        const active = same(toFilters(filter), current);
        return (
          <span
            key={filter.id}
            className={cn(
              'inline-flex items-center rounded-full border text-sm',
              active ? 'border-primary bg-primary/10' : 'hover:bg-muted',
            )}
          >
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onApply(active ? DEFAULT_FILTERS : toFilters(filter))}
              className="rounded-l-full py-0.5 pl-3 pr-1.5"
            >
              {filter.name}
            </button>
            <button
              type="button"
              onClick={() =>
                remove.mutate(filter.id, {
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
              className="rounded-r-full py-0.5 pl-0.5 pr-2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
              <span className="sr-only">Delete saved filter {filter.name}</span>
            </button>
          </span>
        );
      })}
      {canSave ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Bookmark /> Save this view
            </Button>
          </DialogTrigger>
          <DialogContent
            title="Save this view"
            description="Keeps the current tag, visibility and sort so you can come back to them in one click. Only you see your saved filters."
          >
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="filter-name">Name</Label>
                <Input
                  id="filter-name"
                  value={name}
                  maxLength={80}
                  required
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <DialogFooter className="mt-0">
                <Button type="submit" disabled={create.isPending || !name.trim()}>
                  Save filter
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
