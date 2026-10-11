import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { usePurgeEntity, useRestoreEntity, useTrash } from '@/api/queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityIcon } from '@/components/entity-icon';
import { Button } from '@/components/ui/button';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

export function TrashPage() {
  const { world, typeById } = useWorld();
  const { data: items, isPending } = useTrash(world.id);
  const restore = useRestoreEntity(world.id);
  const purge = usePurgeEntity(world.id);

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Trash</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Deleted entries stay here until you restore them or delete them forever.
      </p>
      <div className="mt-6">
        {isPending ? (
          <PageSpinner />
        ) : !items?.length ? (
          <EmptyState icon={<Trash2 />} title="Trash is empty" />
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {items.map((item) => {
              const type = typeById.get(item.typeId);
              return (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {type?.name} · deleted {timeAgo(item.deletedAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(item.id, {
                        onSuccess: () => toast.success(`${item.name} restored`),
                        onError: (error) => toast.error(errorMessage(error)),
                      })
                    }
                  >
                    <RotateCcw /> Restore
                  </Button>
                  <ConfirmDialog
                    title={`Delete “${item.name}” forever?`}
                    description="Its relationships and tags go with it. This can't be undone."
                    confirmLabel="Delete forever"
                    onConfirm={() =>
                      purge
                        .mutateAsync(item.id)
                        .catch((error: unknown) => toast.error(errorMessage(error)))
                    }
                    trigger={
                      <Button variant="ghost" size="sm" className="text-destructive">
                        Delete forever
                      </Button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
