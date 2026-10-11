import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Ellipsis,
  FolderInput,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  ALLOWED_CHILD_KINDS,
  NODE_KIND_LABELS,
  type ManuscriptNode,
  type NodeKind,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useCreateNode, useDeleteNode, useMoveNode, useUpdateNode } from '@/api/manuscript-queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/inputs';
import { Spinner } from '@/components/ui/misc';
import {
  ancestorTitles,
  formatWords,
  KIND_ICONS,
  useManuscriptTree,
  type ManuscriptTree,
} from '@/lib/manuscript-tree';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

function countDescendants(tree: ManuscriptTree, id: string): number {
  return tree.childrenOf(id).reduce((sum, child) => sum + 1 + countDescendants(tree, child.id), 0);
}

function defaultTitle(tree: ManuscriptTree, kind: NodeKind, parentId: string | null): string {
  if (kind === 'scene') return 'Untitled scene';
  if (kind === 'book') return 'Untitled book';
  const n = tree.childrenOf(parentId).filter((c) => c.kind === kind).length + 1;
  return `${NODE_KIND_LABELS[kind]} ${n}`;
}

export function Binder({ onNavigate }: { onNavigate?: () => void }) {
  const { world, base, canEdit } = useWorld();
  const { tree, isPending } = useManuscriptTree();
  const createNode = useCreateNode(world.id);
  const updateNode = useUpdateNode(world.id);
  const moveNode = useMoveNode(world.id);
  const deleteNode = useDeleteNode(world.id);
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ManuscriptNode | null>(null);
  const [moving, setMoving] = useState<ManuscriptNode | null>(null);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function create(kind: NodeKind, parentId: string | null) {
    try {
      const node = await createNode.mutateAsync({
        kind,
        parentId,
        title: defaultTitle(tree, kind, parentId),
      });
      if (parentId) setCollapsed((prev) => new Set([...prev].filter((id) => id !== parentId)));
      if (kind === 'scene') {
        onNavigate?.();
        void navigate(`${base}/manuscript/s/${node.id}`);
      } else {
        setRenamingId(node.id);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function rename(node: ManuscriptNode, title: string) {
    setRenamingId(null);
    const trimmed = title.trim();
    if (!trimmed || trimmed === node.title) return;
    updateNode.mutate(
      { id: node.id, title: trimmed },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
  }

  function shift(node: ManuscriptNode, delta: number) {
    const siblings = tree.childrenOf(node.parentId);
    const index = siblings.findIndex((s) => s.id === node.id) + delta;
    if (index < 0 || index >= siblings.length) return;
    moveNode.mutate(
      { id: node.id, parentId: node.parentId, index },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
  }

  const renderNode = (node: ManuscriptNode, depth: number) => {
    const Icon = KIND_ICONS[node.kind];
    const kids = tree.childrenOf(node.id);
    const isOpen = !collapsed.has(node.id);
    const siblings = tree.childrenOf(node.parentId);
    const position = siblings.findIndex((s) => s.id === node.id);
    const childKinds = ALLOWED_CHILD_KINDS[node.kind];
    const rowClass =
      'group flex items-center gap-1.5 rounded-md pr-1 text-sm transition-colors hover:bg-muted';

    const label =
      renamingId === node.id ? (
        <form
          className="min-w-0 flex-1 py-0.5"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            rename(node, String(new FormData(e.currentTarget).get('title')));
          }}
        >
          <Input
            name="title"
            defaultValue={node.title}
            autoFocus
            maxLength={200}
            className="h-7 px-2 text-sm"
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => rename(node, e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
          />
        </form>
      ) : node.kind === 'scene' ? (
        <NavLink
          to={`${base}/manuscript/s/${node.id}`}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn('min-w-0 flex-1 truncate py-1.5', isActive && 'font-semibold text-primary')
          }
        >
          {node.title}
        </NavLink>
      ) : (
        <button
          type="button"
          onClick={() => toggle(node.id)}
          onDoubleClick={() => canEdit && setRenamingId(node.id)}
          className={cn(
            'min-w-0 flex-1 truncate py-1.5 text-left',
            node.kind === 'book' && 'font-semibold',
          )}
        >
          {node.title}
        </button>
      );

    return (
      <li key={node.id}>
        <div className={rowClass} style={{ paddingLeft: depth * 14 + 4 }}>
          {node.kind !== 'scene' ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-label={isOpen ? `Collapse ${node.title}` : `Expand ${node.title}`}
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <ChevronRight
                className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')}
              />
            </button>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          {label}
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground group-hover:hidden group-focus-within:hidden">
            {formatWords(node.wordCount)}
          </span>
          {canEdit && renamingId !== node.id ? (
            <div className="hidden shrink-0 items-center group-hover:flex group-focus-within:flex has-[[data-state=open]]:flex">
              {childKinds.length === 1 ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6"
                  title={`Add ${NODE_KIND_LABELS[childKinds[0]!].toLowerCase()}`}
                  onClick={() => create(childKinds[0]!, node.id)}
                >
                  <Plus />
                  <span className="sr-only">
                    Add {NODE_KIND_LABELS[childKinds[0]!].toLowerCase()}
                  </span>
                </Button>
              ) : childKinds.length > 1 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="size-6" title="Add">
                      <Plus />
                      <span className="sr-only">Add inside {node.title}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {childKinds.map((kind) => (
                      <DropdownMenuItem key={kind} onSelect={() => create(kind, node.id)}>
                        <Plus /> {NODE_KIND_LABELS[kind]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="size-6" title="More">
                    <Ellipsis />
                    <span className="sr-only">More actions for {node.title}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setRenamingId(node.id)}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={position <= 0} onSelect={() => shift(node, -1)}>
                    <ArrowUp /> Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={position >= siblings.length - 1}
                    onSelect={() => shift(node, 1)}
                  >
                    <ArrowDown /> Move down
                  </DropdownMenuItem>
                  {node.kind !== 'book' ? (
                    <DropdownMenuItem onSelect={() => setMoving(node)}>
                      <FolderInput /> Move to…
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setDeleting(node)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
        {kids.length && isOpen ? <ul>{kids.map((kid) => renderNode(kid, depth + 1))}</ul> : null}
      </li>
    );
  };

  const books = tree.childrenOf(null);

  return (
    <nav aria-label="Manuscript contents" className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Contents
        </h2>
        {canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => create('book', null)}
          >
            <Plus /> Book
          </Button>
        ) : null}
      </div>
      {isPending ? (
        <Spinner />
      ) : books.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No books yet.</p>
      ) : (
        <ul>{books.map((book) => renderNode(book, 0))}</ul>
      )}

      <DeleteNodeDialog
        node={deleting}
        descendants={deleting ? countDescendants(tree, deleting.id) : 0}
        onClose={() => setDeleting(null)}
        onConfirm={async (node) => {
          try {
            await deleteNode.mutateAsync(node.id);
            toast.success(`“${node.title}” deleted`);
            setDeleting(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
      <MoveNodeDialog
        node={moving}
        tree={tree}
        onClose={() => setMoving(null)}
        onMove={(node, parentId) =>
          moveNode.mutate(
            { id: node.id, parentId, index: Number.MAX_SAFE_INTEGER },
            {
              onSuccess: () => setMoving(null),
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
    </nav>
  );
}

function DeleteNodeDialog({
  node,
  descendants,
  onClose,
  onConfirm,
}: {
  node: ManuscriptNode | null;
  descendants: number;
  onClose: () => void;
  onConfirm: (node: ManuscriptNode) => void;
}) {
  return (
    <Dialog open={Boolean(node)} onOpenChange={(open) => !open && onClose()}>
      {node ? (
        <DialogContent
          title={`Delete “${node.title}”?`}
          description={
            descendants
              ? `This also deletes the ${descendants} item${descendants === 1 ? '' : 's'} inside it, including their text. This can't be undone.`
              : "This can't be undone."
          }
        >
          <DialogFooter className="mt-0">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => onConfirm(node)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function MoveNodeDialog({
  node,
  tree,
  onClose,
  onMove,
}: {
  node: ManuscriptNode | null;
  tree: ManuscriptTree;
  onClose: () => void;
  onMove: (node: ManuscriptNode, parentId: string) => void;
}) {
  const targets = node
    ? tree.nodes.filter(
        (candidate) =>
          candidate.id !== node.parentId && ALLOWED_CHILD_KINDS[candidate.kind].includes(node.kind),
      )
    : [];

  return (
    <Dialog open={Boolean(node)} onOpenChange={(open) => !open && onClose()}>
      {node ? (
        <DialogContent
          title={`Move “${node.title}”`}
          description="It goes to the end of the place you pick."
        >
          {targets.length ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onMove(node, String(new FormData(e.currentTarget).get('parentId')));
              }}
            >
              <NativeSelect name="parentId" aria-label="Destination" defaultValue={targets[0]?.id}>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {[...ancestorTitles(tree, target), target.title].join(' › ')}
                  </option>
                ))}
              </NativeSelect>
              <DialogFooter>
                <Button type="submit">Move</Button>
              </DialogFooter>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              There's nowhere else this {NODE_KIND_LABELS[node.kind].toLowerCase()} can go yet.
            </p>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
