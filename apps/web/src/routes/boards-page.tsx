import { Images, Plus, StickyNote, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { BOARD_KINDS, type BoardKind, type BoardSummary } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useBoards, useCreateBoard } from '@/api/board-queries';
import { imageUrl } from '@/api/gm-queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { FieldError, Input, Label } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn, timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const KINDS: Record<BoardKind, { name: string; summary: string }> = {
  canvas: {
    name: 'Canvas',
    summary:
      'Entry cards, notes and arrows on an open table: a conspiracy, a heist, who knows what.',
  },
  mood: {
    name: 'Mood board',
    summary: 'Pictures, colours and music for the feel of a place, a people or a whole book.',
  },
};

function NewBoardDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const { world } = useWorld();
  const create = useCreateBoard(world.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BoardKind>('canvas');
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    create.mutate(
      { name, kind },
      {
        onSuccess: (board) => {
          setOpen(false);
          setName('');
          onCreated(board.id);
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New board
        </Button>
      </DialogTrigger>
      <DialogContent title="New board" className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="board-name">Name</Label>
            <Input
              id="board-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="The conspiracy"
              aria-invalid={Boolean(error)}
            />
            <FieldError message={error} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-muted-foreground">Kind</legend>
            {BOARD_KINDS.map((key) => (
              <label
                key={key}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50',
                  kind === key && 'border-primary bg-accent/50',
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={key}
                  checked={kind === key}
                  onChange={() => setKind(key)}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="font-medium">{KINDS[key].name}</span>
                  <span className="block text-muted-foreground">{KINDS[key].summary}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-[13px] text-muted-foreground">
            Both kinds hold the same things. The kind only sets how the board starts out.
          </p>
          <DialogFooter className="mt-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              Create board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Up to four of the board's pictures as a small mosaic, or its kind's mark when it has none. */
function Preview({ board }: { board: BoardSummary }) {
  const { world } = useWorld();
  const ids = board.previewImageIds;
  if (ids.length === 0) {
    return (
      <div className="board-dots flex aspect-[16/9] items-center justify-center rounded-md border bg-background text-muted-foreground/60">
        {board.kind === 'mood' ? <Images className="size-7" /> : <StickyNote className="size-7" />}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'grid aspect-[16/9] gap-0.5 overflow-hidden rounded-md border bg-border',
        ids.length > 1 && 'grid-cols-2',
        ids.length > 2 && 'grid-rows-2',
      )}
    >
      {ids.map((id, index) => (
        <img
          key={id}
          src={imageUrl(world.id, id, 'thumbnail')}
          alt=""
          loading="lazy"
          className={cn(
            'size-full min-h-0 object-cover',
            ids.length === 3 && index === 0 && 'row-span-2',
          )}
        />
      ))}
    </div>
  );
}

export function Component() {
  const { world, base, canEdit } = useWorld();
  const navigate = useNavigate();
  const { data: boards, isPending } = useBoards(world.id);
  if (isPending) return <PageSpinner />;

  const newBoard = canEdit ? (
    <NewBoardDialog onCreated={(id) => navigate(`${base}/boards/${id}`)} />
  ) : null;

  if (!boards?.length) {
    return (
      <EmptyState icon={<StickyNote />} title="No boards yet">
        {canEdit ? (
          <>
            <p>
              A board is an open table. Lay out entries from the Codex as cards, add notes and
              pictures, group them in frames and draw arrows between them. Or gather pictures,
              colours and music into a mood board.
            </p>
            <div className="mt-4">{newBoard}</div>
          </>
        ) : (
          <p>Boards your GM shows to the players will appear here.</p>
        )}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Explore</p>
          <h1 className="font-serif text-3xl font-semibold">Boards</h1>
          <p className="mt-1 text-muted-foreground">
            {boards.length} {boards.length === 1 ? 'board' : 'boards'}
          </p>
        </div>
        {newBoard}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {boards.map((board) => (
          <li key={board.id}>
            <Link
              to={`${base}/boards/${board.id}`}
              className="group block space-y-3 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/30"
            >
              <Preview board={board} />
              <div className="px-1 pb-1">
                <h2 className="truncate font-serif text-xl font-semibold">{board.name}</h2>
                <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
                  <span>{KINDS[board.kind].name}</span>
                  <span aria-hidden>·</span>
                  <span>
                    {board.itemCount} {board.itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{timeAgo(board.updatedAt)}</span>
                  {board.shared && canEdit ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Users className="size-3.5" /> Shown to players
                    </span>
                  ) : null}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
