import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ClipboardList,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  PLOT_TEMPLATES,
  PLOT_TEMPLATE_KEYS,
  cardsInCell,
  type PlotBoard,
  type PlotTemplateKey,
} from '@atlas/shared';
import { ApiError, errorMessage } from '@/api/client';
import { useManuscript } from '@/api/manuscript-queries';
import {
  useCreatePlotBoard,
  useDeletePlotBoard,
  usePlotActions,
  usePlotBoard,
  usePlotBoards,
} from '@/api/plot-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { FieldError, Input, Label, NativeSelect, Textarea } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const SWATCHES = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#64748b',
];

// ---- The list of boards ------------------------------------------------------------------------

function NewBoardDialog({ onCreated }: { onCreated: (board: PlotBoard) => void }) {
  const { world } = useWorld();
  const create = useCreatePlotBoard(world.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<PlotTemplateKey>('three_act');
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    create.mutate(
      { name, template },
      {
        onSuccess: (board) => {
          setOpen(false);
          setName('');
          onCreated(board);
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New plot board
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New plot board"
        description="Pick a structure to start from. Its beats become the columns, and you can change them at any time."
        className="max-w-xl"
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="board-name">Name</Label>
            <Input
              id="board-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Book one"
              aria-invalid={Boolean(error)}
            />
            <FieldError message={error} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-muted-foreground">Structure</legend>
            {PLOT_TEMPLATE_KEYS.map((key) => (
              <label
                key={key}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50',
                  template === key && 'border-primary bg-accent/50',
                )}
              >
                <input
                  type="radio"
                  name="template"
                  value={key}
                  checked={template === key}
                  onChange={() => setTemplate(key)}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="font-medium">{PLOT_TEMPLATES[key].name}</span>{' '}
                  <span className="text-muted-foreground">
                    ({PLOT_TEMPLATES[key].beats.length}{' '}
                    {PLOT_TEMPLATES[key].beats.length === 1 ? 'beat' : 'beats'})
                  </span>
                  <span className="block text-muted-foreground">{PLOT_TEMPLATES[key].summary}</span>
                </span>
              </label>
            ))}
          </fieldset>
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

export function PlotIndexPage() {
  const { world, base } = useWorld();
  const navigate = useNavigate();
  const { data: boards, isPending, isError } = usePlotBoards(world.id);
  if (isPending) return <PageSpinner />;
  if (isError) {
    return (
      <EmptyState icon={<ClipboardList />} title="Plot boards are for the GM">
        <p>Switch back to your own view to use them.</p>
      </EmptyState>
    );
  }

  const newBoard = <NewBoardDialog onCreated={(board) => navigate(`${base}/plot/${board.id}`)} />;
  if (!boards?.length) {
    return (
      <EmptyState icon={<ClipboardList />} title="No plot boards yet">
        <p>
          Lay out a story as a grid: the beats of a structure such as the three acts or the hero’s
          journey across the top, a row for each storyline, and a card wherever something happens.
          Cards can point at the scenes you have written.
        </p>
        <div className="mt-4">{newBoard}</div>
      </EmptyState>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Writing</p>
          <h1 className="font-serif text-3xl font-semibold">Plot boards</h1>
          <p className="mt-1 text-muted-foreground">
            {boards.length} {boards.length === 1 ? 'board' : 'boards'}
          </p>
        </div>
        {newBoard}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {boards.map((board) => (
          <li key={board.id}>
            <Link
              to={`${base}/plot/${board.id}`}
              className="block space-y-1 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <h2 className="truncate font-serif text-lg font-semibold">{board.name}</h2>
              <p className="text-sm text-muted-foreground">
                {PLOT_TEMPLATES[board.templateKey as PlotTemplateKey]?.name ?? 'Custom structure'}
              </p>
              <p className="text-xs text-muted-foreground">
                {board.beatCount} beats · {board.threadCount}{' '}
                {board.threadCount === 1 ? 'storyline' : 'storylines'} · {board.cardCount}{' '}
                {board.cardCount === 1 ? 'card' : 'cards'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Editing a card, a beat or a storyline -------------------------------------------------------

type Editing =
  | { kind: 'card'; id: string }
  | { kind: 'new-card'; beatId: string; threadId: string }
  | { kind: 'beat'; id: string }
  | { kind: 'new-beat' }
  | { kind: 'thread'; id: string }
  | { kind: 'new-thread' };

type Actions = ReturnType<typeof usePlotActions>;

function Swatches({
  value,
  onChange,
  allowNone,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colour">
      {allowNone ? (
        <button
          type="button"
          aria-label="No colour"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={cn(
            'size-7 rounded-full border bg-card text-xs text-muted-foreground',
            value === null && 'ring-2 ring-ring',
          )}
        >
          –
        </button>
      ) : null}
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Colour ${color}`}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          className={cn(
            'size-7 rounded-full border-2 border-card',
            value === color && 'ring-2 ring-ring',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function CardDialog({
  board,
  actions,
  editing,
  onClose,
}: {
  board: PlotBoard;
  actions: Actions;
  editing: Extract<Editing, { kind: 'card' | 'new-card' }>;
  onClose: () => void;
}) {
  const { base } = useWorld();
  const { world } = useWorld();
  const { data: nodes } = useManuscript(world.id);
  const existing = editing.kind === 'card' ? board.cards.find((c) => c.id === editing.id) : null;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [text, setText] = useState(existing?.text ?? '');
  const [color, setColor] = useState<string | null>(existing?.color ?? null);
  const [sceneId, setSceneId] = useState<string | null>(existing?.sceneId ?? null);
  const [beatId, setBeatId] = useState(
    existing?.beatId ?? (editing.kind === 'new-card' ? editing.beatId : ''),
  );
  const [threadId, setThreadId] = useState(
    existing?.threadId ?? (editing.kind === 'new-card' ? editing.threadId : ''),
  );
  const [error, setError] = useState<string>();

  const scenes = useMemo(() => {
    const byId = new Map((nodes ?? []).map((n) => [n.id, n]));
    const label = (id: string): string => {
      const node = byId.get(id);
      if (!node) return '';
      const parent = node.parentId ? label(node.parentId) : '';
      return parent ? `${parent} › ${node.title}` : node.title;
    };
    return (nodes ?? [])
      .filter((n) => n.kind === 'scene')
      .map((n) => ({ id: n.id, label: label(n.id) }));
  }, [nodes]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : errorMessage(e));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    try {
      if (editing.kind === 'new-card') {
        await actions.addCard.mutateAsync({ beatId, threadId, title, text, color, sceneId });
      } else {
        await actions.updateCard.mutateAsync({ id: editing.id, title, text, color, sceneId });
        // Changing where it sits is a move, to the end of the new cell.
        if (existing && (existing.beatId !== beatId || existing.threadId !== threadId)) {
          await actions.moveCard.mutateAsync({
            id: editing.id,
            beatId,
            threadId,
            index: cardsInCell(board, beatId, threadId).length,
          });
        }
      }
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={editing.kind === 'new-card' ? 'New card' : 'Edit card'}
        description="A card is one thing that happens: a scene, a turn, a reveal."
        className="max-w-lg"
      >
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="card-title">Title</Label>
            <Input
              id="card-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              aria-invalid={Boolean(error)}
            />
            <FieldError message={error} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-text">Notes</Label>
            <Textarea
              id="card-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={5000}
              className="min-h-24"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="card-beat">Beat</Label>
              <NativeSelect
                id="card-beat"
                value={beatId}
                onChange={(event) => setBeatId(event.target.value)}
              >
                {board.beats.map((beat) => (
                  <option key={beat.id} value={beat.id}>
                    {beat.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-thread">Storyline</Label>
              <NativeSelect
                id="card-thread"
                value={threadId}
                onChange={(event) => setThreadId(event.target.value)}
              >
                {board.threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-scene">Scene</Label>
            <NativeSelect
              id="card-scene"
              value={sceneId ?? ''}
              onChange={(event) => setSceneId(event.target.value || null)}
            >
              <option value="">Not written yet</option>
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.label}
                </option>
              ))}
            </NativeSelect>
            {sceneId ? (
              <Link
                to={`${base}/manuscript/s/${sceneId}`}
                className="inline-flex items-center gap-1 text-xs underline"
              >
                <Link2 className="size-3" /> Open the scene
              </Link>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <Swatches value={color} onChange={setColor} allowNone />
          </div>
          <DialogFooter className="mt-0">
            {existing ? (
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={async () => {
                  try {
                    await actions.deleteCard.mutateAsync(existing.id);
                    onClose();
                  } catch (e) {
                    fail(e);
                  }
                }}
              >
                <Trash2 /> Delete card
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || !beatId || !threadId}>
              {existing ? 'Save' : 'Add card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BeatDialog({
  board,
  actions,
  editing,
  onClose,
}: {
  board: PlotBoard;
  actions: Actions;
  editing: Extract<Editing, { kind: 'beat' | 'new-beat' }>;
  onClose: () => void;
}) {
  const index = editing.kind === 'beat' ? board.beats.findIndex((b) => b.id === editing.id) : -1;
  const beat = index >= 0 ? board.beats[index]! : null;
  const [title, setTitle] = useState(beat?.title ?? '');
  const [description, setDescription] = useState(beat?.description ?? '');
  const [error, setError] = useState<string>();
  const inBeat = beat ? board.cards.filter((c) => c.beatId === beat.id).length : 0;

  const run = async (work: () => Promise<unknown>, close = true) => {
    setError(undefined);
    try {
      await work();
      if (close) onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const move = (by: -1 | 1) => {
    const ids = board.beats.map((b) => b.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    return run(() => actions.reorder.mutateAsync({ beatIds: ids }), false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={beat ? 'Edit beat' : 'New beat'}
        description="A beat is a column: a moment or stage of the story."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              beat
                ? actions.updateBeat.mutateAsync({ id: beat.id, title, description })
                : actions.addBeat.mutateAsync({ title, description }),
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="beat-title">Title</Label>
            <Input
              id="beat-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="beat-description">What it is for</Label>
            <Textarea
              id="beat-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              className="min-h-20"
            />
          </div>
          <FieldError message={error} />
          <DialogFooter className="mt-0 flex-wrap">
            {beat ? (
              <>
                <Button variant="outline" size="sm" disabled={index === 0} onClick={() => move(-1)}>
                  <ArrowLeft /> Earlier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={index === board.beats.length - 1}
                  onClick={() => move(1)}
                >
                  Later <ArrowRight />
                </Button>
                <ConfirmDialog
                  title={`Delete “${beat.title}”?`}
                  description={
                    inBeat > 0
                      ? `Its ${inBeat} ${inBeat === 1 ? 'card goes' : 'cards go'} with it.`
                      : 'The column is removed.'
                  }
                  onConfirm={() => run(() => actions.deleteBeat.mutateAsync(beat.id))}
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mr-auto"
                      disabled={board.beats.length <= 1}
                    >
                      <Trash2 /> Delete
                    </Button>
                  }
                />
              </>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              {beat ? 'Save' : 'Add beat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ThreadDialog({
  board,
  actions,
  editing,
  onClose,
}: {
  board: PlotBoard;
  actions: Actions;
  editing: Extract<Editing, { kind: 'thread' | 'new-thread' }>;
  onClose: () => void;
}) {
  const index =
    editing.kind === 'thread' ? board.threads.findIndex((t) => t.id === editing.id) : -1;
  const thread = index >= 0 ? board.threads[index]! : null;
  const [name, setName] = useState(thread?.name ?? '');
  const [color, setColor] = useState(
    thread?.color ?? SWATCHES[board.threads.length % SWATCHES.length]!,
  );
  const [error, setError] = useState<string>();
  const inThread = thread ? board.cards.filter((c) => c.threadId === thread.id).length : 0;

  const run = async (work: () => Promise<unknown>, close = true) => {
    setError(undefined);
    try {
      await work();
      if (close) onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const move = (by: -1 | 1) => {
    const ids = board.threads.map((t) => t.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    return run(() => actions.reorder.mutateAsync({ threadIds: ids }), false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={thread ? 'Edit storyline' : 'New storyline'}
        description="A storyline is a row: a plot thread that runs through the story, such as a romance or a mystery."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              thread
                ? actions.updateThread.mutateAsync({ id: thread.id, name, color })
                : actions.addThread.mutateAsync({ name, color }),
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="thread-name">Name</Label>
            <Input
              id="thread-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <Swatches value={color} onChange={(c) => setColor(c ?? color)} />
          </div>
          <FieldError message={error} />
          <DialogFooter className="mt-0 flex-wrap">
            {thread ? (
              <>
                <Button variant="outline" size="sm" disabled={index === 0} onClick={() => move(-1)}>
                  <ArrowUp /> Up
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={index === board.threads.length - 1}
                  onClick={() => move(1)}
                >
                  Down <ArrowDown />
                </Button>
                <ConfirmDialog
                  title={`Delete “${thread.name}”?`}
                  description={
                    inThread > 0
                      ? `Its ${inThread} ${inThread === 1 ? 'card goes' : 'cards go'} with it.`
                      : 'The row is removed.'
                  }
                  onConfirm={() => run(() => actions.deleteThread.mutateAsync(thread.id))}
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mr-auto"
                      disabled={board.threads.length <= 1}
                    >
                      <Trash2 /> Delete
                    </Button>
                  }
                />
              </>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {thread ? 'Save' : 'Add storyline'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- The board ---------------------------------------------------------------------------------

function Board({ board }: { board: PlotBoard }) {
  const { world, base } = useWorld();
  const navigate = useNavigate();
  const actions = usePlotActions(world.id, board.id);
  const remove = useDeletePlotBoard(world.id);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [name, setName] = useState(board.name);

  const dropOn = (event: DragEvent, beatId: string, threadId: string, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    setOver(null);
    const id = event.dataTransfer.getData('text/plain');
    if (!board.cards.some((c) => c.id === id)) return;
    actions.moveCard.mutate(
      { id, beatId, threadId, index },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
  };

  const columns = `10rem repeat(${board.beats.length}, minmax(15rem, 1fr))`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link to={`${base}/plot`} className="text-sm text-muted-foreground hover:text-foreground">
            ← All plot boards
          </Link>
          <input
            aria-label="Board name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              const next = name.trim();
              if (!next) setName(board.name);
              else if (next !== board.name) {
                actions.rename.mutate(
                  { name: next },
                  { onError: (e) => toast.error(errorMessage(e)) },
                );
              }
            }}
            className="block w-full min-w-0 bg-transparent font-serif text-3xl font-semibold outline-none"
          />
          <p className="text-sm text-muted-foreground">
            {PLOT_TEMPLATES[board.templateKey as PlotTemplateKey]?.name ?? 'Custom structure'} ·{' '}
            {board.cards.length} {board.cards.length === 1 ? 'card' : 'cards'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing({ kind: 'new-beat' })}>
            <Plus /> Beat
          </Button>
          <Button variant="outline" onClick={() => setEditing({ kind: 'new-thread' })}>
            <Plus /> Storyline
          </Button>
          <ConfirmDialog
            title={`Delete “${board.name}”?`}
            description={`The board and its ${board.cards.length} ${board.cards.length === 1 ? 'card' : 'cards'} are removed. Your scenes are not touched.`}
            onConfirm={() =>
              remove.mutateAsync(board.id).then(
                () => navigate(`${base}/plot`),
                (e) => toast.error(errorMessage(e)),
              )
            }
            trigger={
              <Button variant="ghost">
                <Trash2 /> Delete board
              </Button>
            }
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <div
          className="grid min-w-max"
          style={{ gridTemplateColumns: columns }}
          role="grid"
          aria-label={board.name}
        >
          <div className="sticky left-0 z-10 border-b bg-muted/60 p-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Storyline
          </div>
          {board.beats.map((beat) => (
            <button
              key={beat.id}
              type="button"
              onClick={() => setEditing({ kind: 'beat', id: beat.id })}
              title={beat.description || 'Edit this beat'}
              className="border-b border-l bg-muted/60 p-2 text-left hover:bg-muted"
            >
              <span className="block text-sm font-semibold">{beat.title}</span>
              {beat.description ? (
                <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                  {beat.description}
                </span>
              ) : null}
            </button>
          ))}

          {board.threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              board={board}
              thread={thread}
              over={over}
              setOver={setOver}
              dropOn={dropOn}
              onEditThread={() => setEditing({ kind: 'thread', id: thread.id })}
              onAddCard={(beatId) => setEditing({ kind: 'new-card', beatId, threadId: thread.id })}
              onOpenCard={(id) => setEditing({ kind: 'card', id })}
            />
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Drag a card to another cell to move it, or open it to change its beat and storyline. Click a
        beat or storyline to rename, reorder or delete it.
      </p>

      {editing && (editing.kind === 'card' || editing.kind === 'new-card') ? (
        <CardDialog
          key={editing.kind === 'card' ? editing.id : 'new'}
          board={board}
          actions={actions}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing && (editing.kind === 'beat' || editing.kind === 'new-beat') ? (
        <BeatDialog
          key={editing.kind === 'beat' ? editing.id : 'new'}
          board={board}
          actions={actions}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing && (editing.kind === 'thread' || editing.kind === 'new-thread') ? (
        <ThreadDialog
          key={editing.kind === 'thread' ? editing.id : 'new'}
          board={board}
          actions={actions}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ThreadRow({
  board,
  thread,
  over,
  setOver,
  dropOn,
  onEditThread,
  onAddCard,
  onOpenCard,
}: {
  board: PlotBoard;
  thread: PlotBoard['threads'][number];
  over: string | null;
  setOver: (key: string | null) => void;
  dropOn: (event: DragEvent, beatId: string, threadId: string, index: number) => void;
  onEditThread: () => void;
  onAddCard: (beatId: string) => void;
  onOpenCard: (id: string) => void;
}) {
  const { base } = useWorld();
  return (
    <>
      <button
        type="button"
        onClick={onEditThread}
        title="Edit this storyline"
        className="sticky left-0 z-10 flex items-start gap-2 border-t bg-card p-2 text-left hover:bg-muted/60"
      >
        <span
          className="mt-1 h-4 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: thread.color }}
        />
        <span className="text-sm font-semibold">{thread.name}</span>
      </button>
      {board.beats.map((beat) => {
        const key = `${beat.id}:${thread.id}`;
        const cards = cardsInCell(board, beat.id, thread.id);
        return (
          <div
            key={key}
            role="gridcell"
            aria-label={`${thread.name}, ${beat.title}`}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(key);
            }}
            onDragLeave={() => setOver(over === key ? null : over)}
            onDrop={(event) => dropOn(event, beat.id, thread.id, cards.length)}
            className={cn(
              'min-h-24 space-y-2 border-l border-t p-2 transition-colors',
              over === key && 'bg-accent/60',
            )}
          >
            {cards.map((card, index) => (
              <article
                key={card.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', card.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOver(key);
                }}
                onDrop={(event) => dropOn(event, beat.id, thread.id, index)}
                className="cursor-grab rounded-lg border border-l-4 bg-card p-2 text-sm shadow-xs active:cursor-grabbing"
                style={{ borderLeftColor: card.color ?? thread.color }}
              >
                <button
                  type="button"
                  onClick={() => onOpenCard(card.id)}
                  className="block w-full text-left font-medium leading-snug hover:underline"
                >
                  {card.title}
                </button>
                {card.text ? (
                  <p className="mt-1 line-clamp-3 text-[13px] text-muted-foreground">{card.text}</p>
                ) : null}
                {card.sceneId ? (
                  <Link
                    to={`${base}/manuscript/s/${card.sceneId}`}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    <Link2 className="size-3" /> Scene
                  </Link>
                ) : null}
              </article>
            ))}
            <button
              type="button"
              aria-label={`Add a card to ${thread.name}, ${beat.title}`}
              onClick={() => onAddCard(beat.id)}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <Plus className="size-3" /> Card
            </button>
          </div>
        );
      })}
    </>
  );
}

export function PlotBoardPage() {
  const { world, base } = useWorld();
  const { boardId = '' } = useParams();
  const { data: board, isPending, isError } = usePlotBoard(world.id, boardId);
  if (isPending) return <PageSpinner />;
  if (isError || !board) {
    return (
      <EmptyState icon={<ClipboardList />} title="Plot board not found">
        <p>It may have been deleted, or it is not available in this view.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={`${base}/plot`}>All plot boards</Link>
        </Button>
      </EmptyState>
    );
  }
  // A different board (or a reload that changes the name) starts the editor afresh.
  return <Board key={`${board.id}`} board={board} />;
}
