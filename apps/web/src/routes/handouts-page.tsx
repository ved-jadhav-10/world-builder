import { Eye, EyeOff, Pencil, Plus, ScrollText, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { isRevealed, type Handout } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  handoutImageUrl,
  useCreateHandout,
  useDeleteHandout,
  useHandouts,
  useRemoveHandoutImage,
  useUpdateHandout,
  useUploadHandoutImage,
} from '@/api/handout-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/inputs';
import { Badge, EmptyState, PageSpinner } from '@/components/ui/misc';
import { timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

/** The form for a new handout, or for changing one: title, text, a picture, and whether to reveal. */
function HandoutForm({ handout, onClose }: { handout: Handout | null; onClose: () => void }) {
  const { world } = useWorld();
  const create = useCreateHandout(world.id);
  const update = useUpdateHandout(world.id);
  const upload = useUploadHandoutImage(world.id);
  const removeImage = useRemoveHandoutImage(world.id);
  const [title, setTitle] = useState(handout?.title ?? '');
  const [body, setBody] = useState(handout?.body ?? '');
  const [image, setImage] = useState<File | null>(null);
  const [reveal, setReveal] = useState(false);
  const [dropPicture, setDropPicture] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = handout
        ? await update.mutateAsync({ id: handout.id, title, body })
        : await create.mutateAsync({ title, body, visibility: reveal ? 'player' : 'gm' });
      if (image) await upload.mutateAsync({ id: saved.id, image });
      else if (dropPicture && handout?.hasImage) await removeImage.mutateAsync(saved.id);
      toast.success(
        handout ? 'Handout saved' : reveal ? 'Handout created and shown' : 'Handout created',
      );
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const showCurrent = handout?.hasImage && !dropPicture && !image;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="handout-title">Title</Label>
        <Input
          id="handout-title"
          value={title}
          maxLength={120}
          required
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          placeholder="A letter from the harbourmaster"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="handout-body">Text</Label>
        <Textarea
          id="handout-body"
          value={body}
          maxLength={10_000}
          rows={6}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What it says. Players read it as written."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="handout-image">Picture (optional)</Label>
        {showCurrent && handout ? (
          <div className="flex items-center gap-3">
            <img
              src={handoutImageUrl(world.id, handout, true)}
              alt=""
              className="h-16 rounded border object-cover"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setDropPicture(true)}>
              <X /> Remove picture
            </Button>
          </div>
        ) : null}
        <Input
          id="handout-image"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          onChange={(event) => setImage(event.target.files?.[0] ?? null)}
        />
      </div>
      {!handout ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reveal}
            onChange={(event) => setReveal(event.target.checked)}
            className="size-4 accent-primary"
          />
          Show it to the players straight away
        </label>
      ) : null}
      <DialogFooter className="mt-0">
        <Button type="submit" disabled={saving || !title.trim()}>
          {handout ? 'Save' : 'Create handout'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function HandoutViewer({ handout, onClose }: { handout: Handout; onClose: () => void }) {
  const { world } = useWorld();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={handout.title} className="max-w-2xl">
        <div className="space-y-4">
          {handout.hasImage ? (
            <img
              src={handoutImageUrl(world.id, handout)}
              alt={handout.title}
              className="mx-auto max-h-[60dvh] rounded-lg border object-contain"
            />
          ) : null}
          {handout.body ? (
            <p className="whitespace-pre-wrap font-serif text-base leading-relaxed">
              {handout.body}
            </p>
          ) : null}
          {!handout.hasImage && !handout.body ? (
            <p className="text-sm text-muted-foreground">There is nothing on this handout yet.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HandoutCard({
  handout,
  canEdit,
  onOpen,
  onEdit,
}: {
  handout: Handout;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const { world } = useWorld();
  const update = useUpdateHandout(world.id);
  const remove = useDeleteHandout(world.id);
  const revealed = isRevealed(handout.visibility);

  function toggle() {
    update.mutate(
      { id: handout.id, visibility: revealed ? 'gm' : 'player' },
      {
        onSuccess: () =>
          toast.success(revealed ? 'Hidden from the players' : 'Shown to the players'),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={onOpen}
        className="block text-left"
        aria-label={`Open ${handout.title}`}
      >
        {handout.hasImage ? (
          <img
            src={handoutImageUrl(world.id, handout, true)}
            alt=""
            loading="lazy"
            className="aspect-4/3 w-full object-cover"
          />
        ) : (
          <div className="flex aspect-4/3 items-center justify-center bg-muted p-4 text-sm text-muted-foreground">
            <p className="line-clamp-5 whitespace-pre-wrap font-serif">
              {handout.body || 'No text'}
            </p>
          </div>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-medium leading-snug">{handout.title}</h2>
          {canEdit ? (
            <Badge className={revealed ? 'bg-emerald-100 text-emerald-800' : ''}>
              {revealed ? 'Shown' : 'Hidden'}
            </Badge>
          ) : null}
        </div>
        {handout.revealedAt ? (
          <p className="text-xs text-muted-foreground">Shared {timeAgo(handout.revealedAt)}</p>
        ) : null}
        {canEdit ? (
          <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
            <Button
              size="sm"
              variant={revealed ? 'outline' : 'default'}
              onClick={toggle}
              disabled={update.isPending}
            >
              {revealed ? <EyeOff /> : <Eye />} {revealed ? 'Hide' : 'Show to players'}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={onEdit}>
              <Pencil />
              <span className="sr-only">Edit {handout.title}</span>
            </Button>
            <ConfirmDialog
              trigger={
                <Button size="icon-sm" variant="ghost" className="text-destructive">
                  <Trash2 />
                  <span className="sr-only">Delete {handout.title}</span>
                </Button>
              }
              title={`Delete “${handout.title}”?`}
              description="It and its picture are removed for good, and players lose it too."
              onConfirm={() => remove.mutateAsync(handout.id)}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function HandoutsPage() {
  const { world, canEdit } = useWorld();
  const { data, isPending } = useHandouts(world.id, { poll: canEdit ? undefined : 8000 });
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Handout | 'new' | null>(null);
  if (isPending) return <PageSpinner />;
  const handouts = data ?? [];
  const openId = params.get('open');
  const opened = handouts.find((h) => h.id === openId) ?? null;
  const close = () =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('open');
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Running the game</p>
          <h1 className="font-serif text-3xl font-semibold">Handouts</h1>
          <p className="mt-1 text-muted-foreground">
            {canEdit
              ? 'Letters, maps and pictures to hand to the players. Nothing is shown until you press Show.'
              : 'What the GM has shared with you. New ones appear here as soon as they are shown.'}
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setEditing('new')}>
            <Plus /> New handout
          </Button>
        ) : null}
      </div>

      {handouts.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title={canEdit ? 'No handouts yet' : 'Nothing shared yet'}
        >
          <p>
            {canEdit
              ? 'Make a handout with some text, a picture or both, then show it to the players when the moment comes.'
              : 'When the GM shares a letter or a picture, it will show up here.'}
          </p>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {handouts.map((handout) => (
            <HandoutCard
              key={handout.id}
              handout={handout}
              canEdit={canEdit}
              onOpen={() => setParams({ open: handout.id }, { replace: true })}
              onEdit={() => setEditing(handout)}
            />
          ))}
        </ul>
      )}

      {opened ? <HandoutViewer handout={opened} onClose={close} /> : null}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent
          title={editing === 'new' ? 'New handout' : 'Edit handout'}
          description="Some text, a picture, or both."
        >
          {editing !== null ? (
            <HandoutForm
              key={editing === 'new' ? 'new' : editing.id}
              handout={editing === 'new' ? null : editing}
              onClose={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { HandoutsPage as Component };
