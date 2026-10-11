import { Plus, ScrollText } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { QUEST_STATUSES, type QuestStatus, type QuestSummary } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useQuests, useSetQuestStatus } from '@/api/gm-queries';
import { EntityIcon } from '@/components/entity-icon';
import { NewEntityDialog } from '@/components/new-entity-dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { VisibilityBadge } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

/** A quest with no status, or one that is not a known status, counts as not started. */
const statusOf = (quest: QuestSummary): QuestStatus =>
  (QUEST_STATUSES as readonly string[]).includes(quest.status)
    ? (quest.status as QuestStatus)
    : 'Not started';

const COLUMN_STYLE: Record<QuestStatus, string> = {
  'Not started': 'bg-slate-500',
  Ongoing: 'bg-amber-500',
  Completed: 'bg-emerald-500',
  Abandoned: 'bg-rose-400',
};

function QuestCard({
  quest,
  onMove,
}: {
  quest: QuestSummary;
  onMove: (status: QuestStatus) => void;
}) {
  const { base, canEdit, typeById } = useWorld();
  return (
    <li
      draggable={canEdit}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.setData('text/plain', quest.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(
        'space-y-2 rounded-lg border bg-card p-3 text-sm shadow-xs',
        canEdit && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start gap-2">
        <Link
          to={`${base}/e/${quest.id}`}
          className="min-w-0 flex-1 font-medium leading-snug hover:underline"
        >
          {quest.name}
        </Link>
        <VisibilityBadge visibility={quest.visibility} />
      </div>
      {quest.summary ? (
        <p className="line-clamp-3 text-[13px] text-muted-foreground">{quest.summary}</p>
      ) : null}
      {quest.links.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {quest.links.map((link) => {
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
                  <span className="text-muted-foreground">{link.label}</span> {link.other.name}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {canEdit ? (
        <NativeSelect
          aria-label={`Status of ${quest.name}`}
          className="h-8 text-[13px]"
          value={statusOf(quest)}
          onChange={(event) => onMove(event.target.value as QuestStatus)}
        >
          {QUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </li>
  );
}

/** The quest log: every quest in a column for where it stands. Drag a card, or use its menu. */
export function QuestsPage() {
  const { world, canEdit, typeByKey, base } = useWorld();
  const { data: quests, isPending } = useQuests(world.id);
  const setStatus = useSetQuestStatus(world.id);
  const [over, setOver] = useState<QuestStatus | null>(null);
  const questType = typeByKey.get('quest');

  if (isPending) return <PageSpinner />;

  const move = (id: string, status: QuestStatus) => {
    const quest = quests?.find((q) => q.id === id);
    if (!quest || statusOf(quest) === status) return;
    setStatus.mutate({ id, status }, { onError: (error) => toast.error(errorMessage(error)) });
  };

  if (!questType) {
    return (
      <EmptyState icon={<ScrollText />} title="No quest type">
        <p>
          This world has no Quest type. Add one in Manage types, with a Status field, to keep a
          quest log.
        </p>
        {canEdit ? (
          <Button asChild variant="outline" className="mt-4">
            <Link to={`${base}/settings/types`}>Manage types</Link>
          </Button>
        ) : null}
      </EmptyState>
    );
  }

  const newQuest = canEdit ? (
    <NewEntityDialog
      typeId={questType.id}
      trigger={
        <Button>
          <Plus /> New quest
        </Button>
      }
    />
  ) : null;

  if (!quests?.length) {
    return (
      <EmptyState icon={<ScrollText />} title="No quests yet">
        <p>
          Track what the party is chasing: where each quest stands, who gave it and where it leads.
          Quests are entries, so you can link them to characters and places and choose who can see
          each one.
        </p>
        {newQuest ? <div className="mt-4">{newQuest}</div> : null}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Quests</p>
          <h1 className="font-serif text-3xl font-semibold">Quest log</h1>
          <p className="mt-1 text-muted-foreground">
            {quests.length} {quests.length === 1 ? 'quest' : 'quests'}
          </p>
        </div>
        {newQuest}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {QUEST_STATUSES.map((status) => {
          const inColumn = quests.filter((q) => statusOf(q) === status);
          return (
            <section
              key={status}
              aria-label={status}
              onDragOver={(event) => {
                if (!canEdit) return;
                event.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((current) => (current === status ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                if (canEdit) move(event.dataTransfer.getData('text/plain'), status);
              }}
              className={cn(
                'min-h-32 space-y-3 rounded-xl border bg-muted/40 p-3 transition-colors',
                over === status && 'border-primary bg-accent/60',
              )}
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn('size-2.5 rounded-full', COLUMN_STYLE[status])} />
                {status}
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {inColumn.length}
                </span>
              </h2>
              <ul className="space-y-2">
                {inColumn.map((quest) => (
                  <QuestCard key={quest.id} quest={quest} onMove={(next) => move(quest.id, next)} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export { QuestsPage as Component };
