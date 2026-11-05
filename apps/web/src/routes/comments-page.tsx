import { MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { COMMENT_STATUSES } from '@atlas/shared';
import { useCommentInbox } from '@/api/comment-queries';
import { EntityIcon } from '@/components/entity-icon';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn, timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

type Status = (typeof COMMENT_STATUSES)[number];

const STATUS_LABELS: Record<Status, string> = { open: 'Open', resolved: 'Resolved', all: 'All' };

/** Every thread in the world, with a link to the entry or scene it is about. */
export function CommentsPage() {
  const { world, base, typeById } = useWorld();
  const [status, setStatus] = useState<Status>('open');
  const { data, isPending } = useCommentInbox(world.id, status);
  const threads = data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Working together</p>
        <h1 className="font-serif text-3xl font-semibold">Comments</h1>
        <p className="mt-1 text-muted-foreground">
          Conversations about entries and scenes. Open one to read the whole thread and reply.
        </p>
      </div>

      <div role="group" aria-label="Show" className="flex gap-1">
        {COMMENT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              status === s ? 'border-primary bg-primary/10' : 'hover:bg-muted',
            )}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isPending ? (
        <PageSpinner />
      ) : threads.length === 0 ? (
        <EmptyState icon={<MessageSquare />} title="No comments here">
          <p>
            {status === 'open'
              ? 'Nothing is waiting for an answer. Comments are started from an entry or a scene.'
              : 'Nothing matches.'}
          </p>
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border">
          {threads.map(({ comment, replyCount, subject }) => {
            const type = subject.typeId ? typeById.get(subject.typeId) : undefined;
            const to =
              subject.kind === 'entity'
                ? `${base}/e/${subject.id}`
                : `${base}/manuscript/s/${subject.id}`;
            return (
              <li key={comment.id}>
                <Link to={to} className="block space-y-1 p-4 transition-colors hover:bg-muted/60">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {subject.kind === 'entity' ? (
                      <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} />
                    ) : (
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        Scene
                      </span>
                    )}
                    <span className="truncate">{subject.title}</span>
                    {comment.resolvedAt ? (
                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        Resolved
                      </span>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap text-sm">{comment.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {comment.author?.name ?? 'Someone'} · {timeAgo(comment.createdAt)}
                    {replyCount > 0
                      ? ` · ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
                      : ''}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { CommentsPage as Component };
