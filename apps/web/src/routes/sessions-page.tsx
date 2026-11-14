import { NotebookPen, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { SessionSummary } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useCreateSession, useSessions } from '@/api/gm-queries';
import { EntityIcon } from '@/components/entity-icon';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { VisibilityBadge } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

function SessionCard({ session }: { session: SessionSummary }) {
  const { base, typeById } = useWorld();
  const played = session.status === 'Played';
  return (
    <li className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {session.number !== null ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold tabular-nums">
            {session.number}
          </span>
        ) : null}
        <Link
          to={`${base}/e/${session.id}`}
          className="min-w-0 flex-1 font-serif text-lg font-semibold leading-snug hover:underline"
        >
          {session.name}
        </Link>
        <Badge className={cn(played ? 'text-emerald-700' : 'text-muted-foreground')}>
          {played ? 'Played' : 'Planned'}
        </Badge>
        <VisibilityBadge visibility={session.visibility} />
      </div>
      {session.playedOn ? (
        <p className="text-sm text-muted-foreground">Played on {session.playedOn}</p>
      ) : null}
      {session.summary ? <p className="text-sm">{session.summary}</p> : null}
      {session.links.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {session.links.map((link) => {
            const type = typeById.get(link.other.typeId);
            return (
              <li key={`${link.label}-${link.other.id}`}>
                <Link
                  to={`${base}/e/${link.other.id}`}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                >
                  <EntityIcon
                    icon={type?.icon ?? 'file-text'}
                    color={type?.color}
                    className="size-3"
                  />
                  {link.other.name}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/** Session notes: every session, newest first, with what it features. Each is an entry. */
export function SessionsPage() {
  const { world, canEdit, audience, base, typeByKey } = useWorld();
  const isGm = canEdit && audience === 'gm';
  const navigate = useNavigate();
  const { data: sessions, isPending } = useSessions(world.id);
  const create = useCreateSession(world.id);

  if (isPending) return <PageSpinner />;

  if (!typeByKey.get('session')) {
    return (
      <EmptyState icon={<NotebookPen />} title="No session type">
        <p>This world has no Session type. Add one in Manage types to keep session notes.</p>
        {canEdit ? (
          <Button asChild variant="outline" className="mt-4">
            <Link to={`${base}/settings/types`}>Manage types</Link>
          </Button>
        ) : null}
      </EmptyState>
    );
  }

  const start = () =>
    create.mutate(
      {},
      {
        onSuccess: (entry) => navigate(`${base}/e/${entry.id}`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  const startButton = isGm ? (
    <Button onClick={start} disabled={create.isPending}>
      <Plus /> New session
    </Button>
  ) : null;

  if (!sessions?.length) {
    return (
      <EmptyState icon={<NotebookPen />} title="No sessions yet">
        <p>
          {isGm
            ? 'Keep prep and notes for each session: what you plan, what happened, and the threads to pick up next time. A session is an entry, so you can link the characters, places and quests it features and choose whether the players see the recap.'
            : 'Recaps the GM shares with you appear here.'}
        </p>
        {startButton ? <div className="mt-4">{startButton}</div> : null}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Game tools</p>
          <h1 className="font-serif text-3xl font-semibold">Sessions</h1>
          <p className="mt-1 text-muted-foreground">
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}, newest first
          </p>
        </div>
        {startButton}
      </div>
      <ul className="max-w-3xl space-y-3">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </ul>
    </div>
  );
}

export { SessionsPage as Component };
