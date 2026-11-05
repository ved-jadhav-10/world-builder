import { History, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  diffBlocks,
  hasChanges,
  type DiffBlock,
  type EntityRevisionContent,
  type RevisionSummary,
  type SceneRevisionContent,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  useCreateRevision,
  useDeleteRevision,
  useRestoreRevision,
  useRevision,
  useRevisions,
  type HistorySubject,
} from '@/api/revision-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/inputs';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { cn, timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

type Content = EntityRevisionContent | SceneRevisionContent;

const KIND_LABEL: Record<RevisionSummary['kind'], string> = {
  auto: 'Saved version',
  manual: 'Named version',
  restore: 'Restore',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Long runs of unchanged paragraphs fold into one line, keeping one for context each side. */
type Shown = { block: DiffBlock } | { folded: number };
function fold(blocks: DiffBlock[]): Shown[] {
  const out: Shown[] = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i]!.op !== 'same') {
      out.push({ block: blocks[i]! });
      i++;
      continue;
    }
    let end = i;
    while (end < blocks.length && blocks[end]!.op === 'same') end++;
    const before = i === 0 ? 0 : 1;
    const after = end === blocks.length ? 0 : 1;
    const hidden = end - i - before - after;
    if (hidden < 2) {
      for (let k = i; k < end; k++) out.push({ block: blocks[k]! });
    } else {
      for (let k = i; k < i + before; k++) out.push({ block: blocks[k]! });
      out.push({ folded: hidden });
      for (let k = end - after; k < end; k++) out.push({ block: blocks[k]! });
    }
    i = end;
  }
  return out;
}

function DiffView({ blocks }: { blocks: DiffBlock[] }) {
  const shown = useMemo(() => fold(blocks), [blocks]);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {shown.map((item, index) =>
        'folded' in item ? (
          <p key={index} className="text-xs italic text-muted-foreground">
            … {item.folded} unchanged {item.folded === 1 ? 'paragraph' : 'paragraphs'}
          </p>
        ) : (
          <p key={index} className={cn(item.block.op === 'same' && 'text-muted-foreground')}>
            {item.block.parts.map((part, i) =>
              part.op === 'add' ? (
                <ins
                  key={i}
                  className="rounded-sm bg-emerald-100 text-emerald-900 no-underline dark:bg-emerald-950 dark:text-emerald-200"
                >
                  {part.text}
                </ins>
              ) : part.op === 'del' ? (
                <del
                  key={i}
                  className="rounded-sm bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200"
                >
                  {part.text}
                </del>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </p>
        ),
      )}
    </div>
  );
}

/**
 * The "History" button and its dialog: the saved versions of an entry or a scene, a comparison
 * of any one with what is there now, naming a version, and bringing an old one back.
 */
export function HistoryDialog({
  subject,
  id,
  trigger,
  prepare,
  currentBlocks,
  blocksOf,
  onRestored,
  note,
}: {
  subject: HistorySubject;
  id: string;
  trigger: ReactNode;
  /** Runs when the dialog opens, e.g. to save pending text so it is in the list. */
  prepare?: () => Promise<unknown> | void;
  /** The text as it is now, as paragraphs. Called each time the dialog opens. */
  currentBlocks: () => string[];
  /** A version's content as paragraphs. */
  blocksOf: (content: Content) => string[];
  /** Called after a version is restored, with the entry or scene as it now reads. */
  onRestored: (restored: unknown) => void;
  /** A line shown under the title, such as a warning about unsaved edits. */
  note?: ReactNode;
}) {
  const { world } = useWorld();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const list = useRevisions(world.id, subject, id, open && ready);
  const create = useCreateRevision(world.id, subject, id);
  const remove = useDeleteRevision(world.id, subject, id);
  const restore = useRestoreRevision(world.id, subject, id);

  const versions = list.data ?? [];
  const selectedId = picked ?? versions[0]?.id ?? null;
  const selected = versions.find((v) => v.id === selectedId);
  const detail = useRevision(world.id, subject, id, selectedId);

  const blocks = useMemo(
    () => (detail.data ? diffBlocks(now, blocksOf(detail.data.content)) : null),
    [detail.data, now, blocksOf],
  );

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setReady(false);
      setPicked(null);
      return;
    }
    try {
      await prepare?.();
    } catch {
      // The list still opens; the page already says if saving failed.
    }
    setNow(currentBlocks());
    setReady(true);
  }

  async function saveNamed(event: FormEvent) {
    event.preventDefault();
    const name = label.trim();
    if (!name) return;
    try {
      const made = await create.mutateAsync(name);
      setLabel('');
      setPicked(made.id);
      toast.success('Version saved');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function doRestore() {
    if (!selected) return;
    try {
      const restored = await restore.mutateAsync(selected.id);
      toast.success('Version restored');
      onRestored(restored);
      void onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void onOpenChange(next)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title="Version history"
        description="Earlier versions are kept as you write. Pick one to compare it with what you have now."
        className="max-w-4xl"
      >
        {note ? <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">{note}</p> : null}
        <form onSubmit={saveNamed} className="mb-4 flex gap-2">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Name this version, e.g. “Before the rewrite”"
            aria-label="Name for a new version"
            maxLength={80}
          />
          <Button type="submit" variant="outline" disabled={!label.trim() || create.isPending}>
            <Save /> Keep this version
          </Button>
        </form>

        {!ready || list.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : versions.length === 0 ? (
          <EmptyState icon={<History />} title="No earlier versions yet">
            <p>
              Versions appear here once you make a change. You can also keep one yourself above.
            </p>
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-[250px_minmax(0,1fr)]">
            <ul
              aria-label="Versions"
              className="max-h-[50dvh] space-y-1 overflow-y-auto pr-1 md:max-h-[55dvh]"
            >
              {versions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(version.id)}
                    aria-current={version.id === selectedId}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left text-sm',
                      version.id === selectedId
                        ? 'border-primary bg-accent'
                        : 'border-transparent hover:bg-muted',
                    )}
                  >
                    <span className="block font-medium">
                      {version.label || KIND_LABEL[version.kind]}
                    </span>
                    <span
                      className="block text-xs text-muted-foreground"
                      title={when(version.createdAt)}
                    >
                      {timeAgo(version.createdAt)} · {version.author ?? 'earlier text'} ·{' '}
                      {version.words.toLocaleString()} {version.words === 1 ? 'word' : 'words'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <section aria-label="Comparison" className="min-w-0 space-y-3">
              {selected ? (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{selected.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {KIND_LABEL[selected.kind]}, {when(selected.createdAt)}
                      {selected.author ? ` by ${selected.author}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" className="text-destructive">
                          <Trash2 /> Delete
                        </Button>
                      }
                      title="Delete this version?"
                      description="It is removed from the history. What you have now is not affected."
                      onConfirm={async () => {
                        await remove.mutateAsync(selected.id);
                        setPicked(null);
                      }}
                    />
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" disabled={restore.isPending}>
                          <RotateCcw /> Restore this version
                        </Button>
                      }
                      title="Restore this version?"
                      description="What you have now is kept as a version first, so you can come back to it."
                      confirmLabel="Restore"
                      destructive={false}
                      onConfirm={doRestore}
                    />
                  </div>
                </div>
              ) : null}

              <div className="max-h-[45dvh] overflow-y-auto rounded-lg border bg-card p-4">
                {detail.isPending || !blocks ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
                ) : hasChanges(blocks) ? (
                  <>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Compared with what you have now:{' '}
                      <ins className="rounded-sm bg-emerald-100 px-1 text-emerald-900 no-underline dark:bg-emerald-950 dark:text-emerald-200">
                        green
                      </ins>{' '}
                      comes back,{' '}
                      <del className="rounded-sm bg-rose-100 px-1 text-rose-900 dark:bg-rose-950 dark:text-rose-200">
                        struck through
                      </del>{' '}
                      goes away.
                    </p>
                    <DiffView blocks={blocks} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This version reads the same as what you have now.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
