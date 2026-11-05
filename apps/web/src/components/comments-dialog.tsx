import { Check, CornerDownRight, MessageSquare, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  groupThreads,
  hasRole,
  MAX_COMMENT_LENGTH,
  openThreadCount,
  type Comment,
  type CommentThread,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
  type CommentSubject,
} from '@/api/comment-queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/inputs';
import { Spinner } from '@/components/ui/misc';
import { useSession } from '@/lib/auth-client';
import { cn, timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

/** A box for writing a comment or a reply. */
function Composer({
  placeholder,
  submitLabel,
  initial = '',
  busy,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  submitLabel: string;
  initial?: string;
  busy: boolean;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState(initial);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (body.trim()) onSubmit(body);
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea
        value={body}
        rows={3}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(event);
        }}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function CommentView({ comment }: { comment: Comment }) {
  const { world } = useWorld();
  const { data: session } = useSession();
  const update = useUpdateComment(world.id);
  const remove = useDeleteComment(world.id);
  const [editing, setEditing] = useState(false);
  const mine = comment.author?.id === session?.user.id;
  const canRemove = mine || hasRole(world.role, 'editor');

  if (editing) {
    return (
      <Composer
        placeholder="Edit your comment"
        submitLabel="Save"
        initial={comment.body}
        busy={update.isPending}
        autoFocus
        onCancel={() => setEditing(false)}
        onSubmit={(body) =>
          update.mutate(
            { id: comment.id, body },
            {
              onSuccess: () => setEditing(false),
              onError: (error) => toast.error(errorMessage(error)),
            },
          )
        }
      />
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.author?.name ?? 'Someone'}</span>
        <span>{timeAgo(comment.createdAt)}</span>
        {comment.editedAt ? <span>(edited)</span> : null}
        <span className="ml-auto flex items-center">
          {mine ? (
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil />
              <span className="sr-only">Edit comment</span>
            </Button>
          ) : null}
          {canRemove ? (
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(comment.id, {
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              <Trash2 />
              <span className="sr-only">Delete comment</span>
            </Button>
          ) : null}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
    </div>
  );
}

function ThreadView({ thread, subject }: { thread: CommentThread; subject: CommentSubject }) {
  const { world } = useWorld();
  const { data: session } = useSession();
  const create = useCreateComment(world.id, subject);
  const update = useUpdateComment(world.id);
  const [replying, setReplying] = useState(false);
  const { comment, replies } = thread;
  const resolved = comment.resolvedAt !== null;
  const canResolve = comment.author?.id === session?.user.id || hasRole(world.role, 'editor');

  return (
    <li
      className={cn('space-y-3 rounded-lg border p-3', resolved && 'bg-muted/40')}
      aria-label={`Thread by ${comment.author?.name ?? 'someone'}`}
    >
      <CommentView comment={comment} />
      {replies.length > 0 ? (
        <ul className="space-y-3 border-l-2 pl-3">
          {replies.map((reply) => (
            <li key={reply.id}>
              <CommentView comment={reply} />
            </li>
          ))}
        </ul>
      ) : null}
      {replying ? (
        <Composer
          placeholder="Write a reply"
          submitLabel="Reply"
          busy={create.isPending}
          autoFocus
          onCancel={() => setReplying(false)}
          onSubmit={(body) =>
            create.mutate(
              { body, parentId: comment.id },
              {
                onSuccess: () => setReplying(false),
                onError: (error) => toast.error(errorMessage(error)),
              },
            )
          }
        />
      ) : (
        <div className="flex items-center gap-1">
          {!resolved ? (
            <Button size="sm" variant="ghost" onClick={() => setReplying(true)}>
              <CornerDownRight /> Reply
            </Button>
          ) : (
            <span className="px-2 text-xs text-muted-foreground">
              Resolved {timeAgo(comment.resolvedAt!)}
            </span>
          )}
          {canResolve ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: comment.id, resolved: !resolved },
                  { onError: (error) => toast.error(errorMessage(error)) },
                )
              }
            >
              {resolved ? <RotateCcw /> : <Check />} {resolved ? 'Reopen' : 'Resolve'}
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}

/** A button showing how many threads are open, and the discussion about one entry or scene. */
export function CommentsDialog({
  subject,
  trigger,
}: {
  subject: CommentSubject;
  /** Receives the number of open threads, for a badge. */
  trigger: (openCount: number) => ReactNode;
}) {
  const { world } = useWorld();
  const { data, isPending } = useComments(world.id, subject);
  const create = useCreateComment(world.id, subject);
  const [showResolved, setShowResolved] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const threads = groupThreads(data ?? []);
  const open = threads.filter((t) => t.comment.resolvedAt === null);
  const resolved = threads.filter((t) => t.comment.resolvedAt !== null);

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger(openThreadCount(threads))}</DialogTrigger>
      <DialogContent
        title="Comments"
        description="A conversation about this page for you, your co-GMs and commenters. Players and readers never see it."
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {isPending ? (
            <Spinner />
          ) : threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No comments yet. Start the conversation.
            </p>
          ) : (
            <ul className="space-y-3">
              {open.map((thread) => (
                <ThreadView key={thread.comment.id} thread={thread} subject={subject} />
              ))}
            </ul>
          )}
          {!isPending && open.length === 0 && threads.length > 0 ? (
            <p className="text-sm text-muted-foreground">Every thread here is resolved.</p>
          ) : null}
          {resolved.length > 0 ? (
            <div className="space-y-3">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-expanded={showResolved}
                onClick={() => setShowResolved((v) => !v)}
              >
                {showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
              </Button>
              {showResolved ? (
                <ul className="space-y-3">
                  {resolved.map((thread) => (
                    <ThreadView key={thread.comment.id} thread={thread} subject={subject} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <Composer
            key={composerKey}
            placeholder="Add a comment"
            submitLabel="Comment"
            busy={create.isPending}
            onSubmit={(body) =>
              create.mutate(
                { body },
                {
                  onSuccess: () => setComposerKey((k) => k + 1),
                  onError: (error) => toast.error(errorMessage(error)),
                },
              )
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The usual trigger: a small text button with an open-thread count. */
export function CommentsButton({ subject }: { subject: CommentSubject }) {
  return (
    <CommentsDialog
      subject={subject}
      trigger={(count) => (
        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground">
          <MessageSquare className="size-3.5" /> Comments{count > 0 ? ` (${count})` : ''}
        </button>
      )}
    />
  );
}
