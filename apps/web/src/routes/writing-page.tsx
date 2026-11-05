import { Flame, Play, Square, Target, Timer } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  heatmapWeeks,
  type WritingCell,
  type WritingGoalsInput,
  type WritingStats,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { fetchWritingStats, useSaveGoals, useWritingStats } from '@/api/writing-queries';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { clearSprint, clock, startSprint, useSprint } from '@/lib/sprint';
import { cn, timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const HEATMAP_WEEKS = 26;
const SPRINT_CHOICES = [10, 15, 25, 45];

const LEVEL_CLASS = [
  'bg-muted',
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-300 dark:bg-emerald-700',
  'bg-emerald-500',
  'bg-emerald-700 dark:bg-emerald-400',
];

const number = (n: number) => n.toLocaleString();

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Bar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className="h-2.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width]"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function Heatmap({ stats }: { stats: WritingStats }) {
  const weeks = useMemo(
    () => heatmapWeeks(stats.days, stats.goals.dailyWords, stats.today, HEATMAP_WEEKS),
    [stats],
  );
  const describe = (cell: WritingCell) => {
    const date = new Date(`${cell.day}T00:00:00Z`).toLocaleDateString(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    });
    return `${date}: ${cell.words > 0 ? number(cell.words) : 'no'} words`;
  };
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <div className="grid grid-rows-7 gap-1 pr-1 text-[10px] leading-3 text-muted-foreground">
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((label, i) => (
            <span key={i} className="flex h-3 items-center">
              {label}
            </span>
          ))}
        </div>
        <div
          role="img"
          aria-label="Words written each day, by week"
          className="grid grid-flow-col grid-rows-7 gap-1"
        >
          {weeks.flat().map((cell) => (
            <div
              key={cell.day}
              title={cell.blank ? undefined : describe(cell)}
              data-level={cell.blank ? undefined : cell.level}
              className={cn(
                'size-3 rounded-[3px]',
                cell.blank ? 'bg-transparent' : LEVEL_CLASS[cell.level],
                cell.day === stats.today && 'ring-1 ring-foreground/60',
              )}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        Less
        {LEVEL_CLASS.map((cls, i) => (
          <span key={i} className={cn('size-3 rounded-[3px]', cls)} />
        ))}
        More
      </div>
    </div>
  );
}

function GoalsForm({ stats }: { stats: WritingStats }) {
  const { world } = useWorld();
  const save = useSaveGoals(world.id);
  const [daily, setDaily] = useState(stats.goals.dailyWords?.toString() ?? '');
  const [total, setTotal] = useState(stats.goals.totalWords?.toString() ?? '');
  const [deadline, setDeadline] = useState(stats.goals.deadline ?? '');

  const parse = (text: string): number | null | 'bad' => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const value = Number(trimmed.replace(/[,\s]/g, ''));
    return Number.isInteger(value) && value > 0 ? value : 'bad';
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const dailyWords = parse(daily);
    const totalWords = parse(total);
    if (dailyWords === 'bad' || totalWords === 'bad') {
      toast.error('Goals are whole numbers above zero. Leave a box empty for no goal.');
      return;
    }
    const input: WritingGoalsInput = { dailyWords, totalWords, deadline: deadline || null };
    try {
      await save.mutateAsync(input);
      toast.success('Goals saved');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="goal-daily">Words a day</Label>
        <Input
          id="goal-daily"
          inputMode="numeric"
          value={daily}
          onChange={(event) => setDaily(event.target.value)}
          placeholder="e.g. 500"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="goal-total">Manuscript target</Label>
        <Input
          id="goal-total"
          inputMode="numeric"
          value={total}
          onChange={(event) => setTotal(event.target.value)}
          placeholder="e.g. 80,000"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="goal-deadline">Finish by</Label>
        <Input
          id="goal-deadline"
          type="date"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Days are counted in {stats.timezone}. Words you cut count against the day.
        </p>
        <Button type="submit" disabled={save.isPending}>
          Save goals
        </Button>
      </div>
    </form>
  );
}

function SprintCard({ stats }: { stats: WritingStats }) {
  const { world } = useWorld();
  const { sprint, remainingMs } = useSprint(world.id);
  const [minutes, setMinutes] = useState(25);
  const [starting, setStarting] = useState(false);
  const live = useWritingStats(world.id, { watch: sprint !== null });

  async function begin() {
    setStarting(true);
    try {
      // Start from the figure on the server, so words saved a moment ago are not counted.
      const fresh = await fetchWritingStats(world.id);
      startSprint({
        worldId: world.id,
        minutes,
        endsAt: Date.now() + minutes * 60_000,
        startWords: fresh.todayWords,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setStarting(false);
    }
  }

  if (sprint) {
    const written = Math.max(0, (live.data?.todayWords ?? stats.todayWords) - sprint.startWords);
    return (
      <div className="space-y-3">
        <p className="text-4xl font-semibold tabular-nums" aria-live="off">
          {clock(remainingMs)}
        </p>
        <p className="text-sm text-muted-foreground">
          {number(written)} {written === 1 ? 'word' : 'words'} so far in this {sprint.minutes}
          -minute sprint. Write in any scene; it counts when it saves.
        </p>
        <Button variant="outline" onClick={clearSprint}>
          <Square /> Stop without saving
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Sprint length" className="flex flex-wrap gap-2">
        {SPRINT_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={minutes === choice}
            onClick={() => setMinutes(choice)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              minutes === choice ? 'border-primary bg-accent font-medium' : 'hover:bg-muted',
            )}
          >
            {choice} min
          </button>
        ))}
      </div>
      <Button onClick={() => void begin()} disabled={starting}>
        <Play /> Start a sprint
      </Button>
      {stats.sprints.length > 0 ? (
        <ul aria-label="Recent sprints" className="space-y-1 border-t pt-3 text-sm">
          {stats.sprints.slice(0, 5).map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span>
                {number(s.words)} {s.words === 1 ? 'word' : 'words'} in {s.minutes} min
              </span>
              <span className="text-muted-foreground">{timeAgo(s.createdAt)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function WritingPage() {
  const { world } = useWorld();
  const query = useWritingStats(world.id);
  if (query.isPending) return <PageSpinner />;
  if (query.isError || !query.data) {
    return (
      <EmptyState icon={<Target />} title="Writing goals are for the GM">
        <p>
          {query.error ? errorMessage(query.error) : 'Switch back to your own view to use them.'}
        </p>
      </EmptyState>
    );
  }
  const stats = query.data;
  const { goals, progress, streaks } = stats;
  const daily = goals.dailyWords;
  const dailyPercent = daily ? Math.max(0, (stats.todayWords / daily) * 100) : 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Writing</p>
        <h1 className="font-serif text-3xl font-semibold">Goals and streaks</h1>
        <p className="mt-1 text-muted-foreground">
          Words are counted as your scenes save, and only your own.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Today">
          <p className="text-4xl font-semibold tabular-nums">
            {number(Math.max(0, stats.todayWords))}
            {daily ? (
              <span className="text-lg font-normal text-muted-foreground"> / {number(daily)}</span>
            ) : null}
          </p>
          {daily ? (
            <Bar percent={dailyPercent} label="Progress towards today's goal" />
          ) : (
            <p className="text-sm text-muted-foreground">Set a daily goal below to see progress.</p>
          )}
          <p className="text-sm text-muted-foreground">
            {number(stats.weekWords)} words in the last seven days.
          </p>
        </Card>

        <Card title="Streak">
          <p className="flex items-center gap-2 text-4xl font-semibold tabular-nums">
            <Flame
              className={cn(
                'size-8',
                streaks.current > 0 ? 'text-orange-500' : 'text-muted-foreground',
              )}
            />
            {streaks.current}
            <span className="text-lg font-normal text-muted-foreground">
              {streaks.current === 1 ? 'day' : 'days'}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Longest: {streaks.longest} {streaks.longest === 1 ? 'day' : 'days'}.{' '}
            {daily
              ? `A day counts when you reach ${number(daily)} words.`
              : 'A day counts when you write anything.'}
          </p>
        </Card>
      </div>

      <Card title="Manuscript">
        {progress ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-2xl font-semibold tabular-nums">
                {number(progress.words)}
                <span className="text-base font-normal text-muted-foreground">
                  {' '}
                  of {number(progress.target)} words
                </span>
              </p>
              <p className="text-sm tabular-nums text-muted-foreground">{progress.percent}%</p>
            </div>
            <Bar percent={progress.percent} label="Progress towards the manuscript target" />
            {progress.daysLeft === null ? null : progress.daysLeft === 0 ? (
              <p className="text-sm text-muted-foreground">The deadline has passed.</p>
            ) : progress.perDayNeeded === 0 ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                Target reached, with {progress.daysLeft} {progress.daysLeft === 1 ? 'day' : 'days'}{' '}
                to spare.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {progress.daysLeft > 730
                  ? 'The deadline is more than two years away.'
                  : `${number(progress.perDayNeeded ?? 0)} ${progress.perDayNeeded === 1 ? 'word' : 'words'} a day for ${progress.daysLeft} ${progress.daysLeft === 1 ? 'day' : 'days'} finishes on time.`}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            The manuscript has {number(stats.manuscriptWords)} words. Set a target below to track
            progress, and a date to see the pace you need.
          </p>
        )}
      </Card>

      <Card title="The last six months">
        <Heatmap stats={stats} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Goals">
          <GoalsForm
            key={`${goals.dailyWords}:${goals.totalWords}:${goals.deadline}`}
            stats={stats}
          />
        </Card>
        <Card title="Timed sprint">
          <SprintCard stats={stats} />
        </Card>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Timer className="size-3.5" /> A sprint keeps running while you move around the world.
      </p>
    </div>
  );
}

export { WritingPage as Component };
