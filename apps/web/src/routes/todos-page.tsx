import { Link2, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { MAX_TODOS, type Todo } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  useClearDoneTodos,
  useCreateTodo,
  useDeleteTodo,
  useTodos,
  useUpdateTodo,
} from '@/api/todo-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker, type PickedEntity } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

/** A small chip showing the entry a task is about; it links to the entry. */
function EntryChip({ todo }: { todo: Todo }) {
  const { typeById, base } = useWorld();
  if (!todo.entity) return null;
  const type = typeById.get(todo.entity.typeId);
  return (
    <Link
      to={`${base}/e/${todo.entity.id}`}
      className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
    >
      <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} className="size-3.5" />
      <span className="truncate">{todo.entity.name}</span>
    </Link>
  );
}

/** Pick the entry a task is about, or clear it. */
function EntryField({
  value,
  onChange,
}: {
  value: PickedEntity | null;
  onChange: (entity: PickedEntity | null) => void;
}) {
  const { typeById } = useWorld();
  const type = value ? typeById.get(value.typeId) : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EntityPicker
        onSelect={onChange}
        trigger={
          <Button type="button" variant="outline" size="sm">
            <Link2 /> {value ? 'Change entry' : 'About an entry'}
          </Button>
        }
      />
      {value ? (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
          <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} className="size-3.5" />
          <span className="truncate">{value.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-full p-0.5 hover:bg-muted"
          >
            <X className="size-3" />
            <span className="sr-only">Unlink {value.name}</span>
          </button>
        </span>
      ) : null}
    </div>
  );
}

function AddTodo() {
  const { world } = useWorld();
  const create = useCreateTodo(world.id);
  const [title, setTitle] = useState('');
  const [entry, setEntry] = useState<PickedEntity | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title, entityId: entry?.id ?? null },
      {
        onSuccess: () => {
          setTitle('');
          setEntry(null);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex gap-2">
        <Input
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Something to do: describe the harbour, redraw the north coast…"
          aria-label="New to-do"
        />
        <Button type="submit" disabled={create.isPending || !title.trim()}>
          <Plus /> Add
        </Button>
      </div>
      <EntryField value={entry} onChange={setEntry} />
    </form>
  );
}

function EditTodo({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const { world } = useWorld();
  const update = useUpdateTodo(world.id);
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes);
  const [entry, setEntry] = useState<PickedEntity | null>(todo.entity);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      { id: todo.id, title, notes, entityId: entry?.id ?? null },
      {
        onSuccess: onClose,
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="todo-title">To-do</Label>
        <Input
          id="todo-title"
          value={title}
          maxLength={200}
          required
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="todo-notes">Notes</Label>
        <Textarea
          id="todo-notes"
          value={notes}
          maxLength={2000}
          rows={4}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <EntryField value={entry} onChange={setEntry} />
      <DialogFooter className="mt-0">
        <Button type="submit" disabled={update.isPending || !title.trim()}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

function TodoRow({ todo, canEdit, onEdit }: { todo: Todo; canEdit: boolean; onEdit: () => void }) {
  const { world } = useWorld();
  const update = useUpdateTodo(world.id);
  const remove = useDeleteTodo(world.id);
  return (
    <li className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60">
      <input
        type="checkbox"
        checked={todo.done}
        disabled={!canEdit || update.isPending}
        onChange={() =>
          update.mutate(
            { id: todo.id, done: !todo.done },
            { onError: (error) => toast.error(errorMessage(error)) },
          )
        }
        aria-label={`${todo.done ? 'Reopen' : 'Finish'} ${todo.title}`}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={todo.done ? 'text-muted-foreground line-through' : 'font-medium'}>
          {todo.title}
        </p>
        {todo.notes ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{todo.notes}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <EntryChip todo={todo} />
          {todo.doneAt ? (
            <span className="text-xs text-muted-foreground">Done {timeAgo(todo.doneAt)}</span>
          ) : null}
        </div>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center">
          <Button size="icon-sm" variant="ghost" onClick={onEdit}>
            <Pencil />
            <span className="sr-only">Edit {todo.title}</span>
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-destructive"
            onClick={() =>
              remove.mutate(todo.id, { onError: (error) => toast.error(errorMessage(error)) })
            }
          >
            <Trash2 />
            <span className="sr-only">Delete {todo.title}</span>
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function TodosPage() {
  const { world, canEdit } = useWorld();
  const { data, isPending } = useTodos(world.id);
  const clear = useClearDoneTodos(world.id);
  const [editing, setEditing] = useState<Todo | null>(null);
  if (isPending) return <PageSpinner />;
  const todos = data ?? [];
  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Writing and building</p>
        <h1 className="font-serif text-3xl font-semibold">To-do</h1>
        <p className="mt-1 text-muted-foreground">
          Things left to write, draw or decide. A task can point at an entry, so it is one click
          from the thing it is about. Only you and your editors see this list.
        </p>
      </div>

      {canEdit ? <AddTodo /> : null}

      {todos.length === 0 ? (
        <EmptyState icon={<ListChecks />} title="Nothing to do">
          <p>Add a task above to keep track of what the world still needs.</p>
        </EmptyState>
      ) : (
        <>
          <section aria-label="Open to-dos" className="space-y-1">
            <h2 className="px-3 text-sm font-medium text-muted-foreground">Open ({open.length})</h2>
            {open.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">All done. Nice.</p>
            ) : (
              <ul>
                {open.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    canEdit={canEdit}
                    onEdit={() => setEditing(todo)}
                  />
                ))}
              </ul>
            )}
          </section>

          {done.length > 0 ? (
            <section aria-label="Finished to-dos" className="space-y-1">
              <div className="flex items-center justify-between gap-2 px-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Finished ({done.length})
                </h2>
                {canEdit ? (
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="ghost">
                        Clear finished
                      </Button>
                    }
                    title="Clear finished to-dos?"
                    confirmLabel="Clear"
                    description={`${done.length} finished ${done.length === 1 ? 'task is' : 'tasks are'} removed for good.`}
                    onConfirm={() => clear.mutateAsync()}
                  />
                ) : null}
              </div>
              <ul>
                {done.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    canEdit={canEdit}
                    onEdit={() => setEditing(todo)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {todos.length >= MAX_TODOS ? (
            <p className="text-sm text-muted-foreground">
              This world is at its limit of {MAX_TODOS} to-dos. Clear some finished ones.
            </p>
          ) : null}
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent title="Edit to-do">
          {editing ? (
            <EditTodo key={editing.id} todo={editing} onClose={() => setEditing(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { TodosPage as Component };
