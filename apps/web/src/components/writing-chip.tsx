import { Target, Timer } from 'lucide-react';
import { Link } from 'react-router';
import { useWritingStats } from '@/api/writing-queries';
import { clock, useSprint } from '@/lib/sprint';
import { useWorld } from '@/lib/world-context';

/**
 * A small status in the scene toolbar: the sprint's clock and words so far while one is running,
 * otherwise today's words against the daily goal (shown only when a goal is set).
 */
export function WritingChip() {
  const { world, base } = useWorld();
  const { sprint, remainingMs } = useSprint(world.id);
  const stats = useWritingStats(world.id, { watch: sprint !== null });
  const data = stats.data;
  if (!data) return null;

  if (sprint) {
    const written = Math.max(0, data.todayWords - sprint.startWords);
    return (
      <Link
        to={`${base}/writing`}
        className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs tabular-nums hover:bg-muted"
        title="Writing sprint in progress"
      >
        <Timer className="size-3.5" />
        <span aria-label="Time left in the sprint">{clock(remainingMs)}</span>
        <span className="text-muted-foreground">+{written.toLocaleString()}</span>
      </Link>
    );
  }
  const goal = data.goals.dailyWords;
  if (!goal) return null;
  const done = data.todayWords >= goal;
  return (
    <Link
      to={`${base}/writing`}
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs tabular-nums hover:bg-muted"
      title="Today's words against your daily goal"
    >
      <Target className={done ? 'size-3.5 text-emerald-600' : 'size-3.5'} />
      Today {Math.max(0, data.todayWords).toLocaleString()} / {goal.toLocaleString()}
    </Link>
  );
}
