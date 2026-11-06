import { Pause, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { PLAYBACK_SPEEDS, usePlayback } from '@/lib/use-playback';
import { useDates } from '@/lib/use-dates';

/**
 * Plays a stretch of history: a play button, a slider over the days from `from` to `to`, and
 * the date it is at. Dragging the slider pauses; playing from the end starts again.
 */
export function PlaybackBar({
  from,
  to,
  value,
  onChange,
  onClose,
}: {
  from: number;
  to: number;
  value: number | null;
  onChange: (day: number) => void;
  /** Leaves playback (and whatever date was set by it). */
  onClose?: () => void;
}) {
  const dates = useDates();
  const { playing, toggle, pause, speed, setSpeed } = usePlayback({ from, to, value, onChange });
  const day = value === null ? from : Math.min(to, Math.max(from, value));

  return (
    <div
      role="group"
      aria-label="Playback"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow backdrop-blur"
    >
      <Button type="button" size="sm" onClick={toggle} aria-pressed={playing}>
        {playing ? <Pause /> : <Play />}
        {playing ? 'Pause' : 'Play'}
      </Button>
      <input
        type="range"
        aria-label="Date"
        className="min-w-40 flex-1"
        min={from}
        max={Math.max(to, from + 1)}
        step={1}
        value={day}
        onChange={(event) => {
          pause();
          onChange(Number(event.target.value));
        }}
      />
      <span className="min-w-36 text-sm tabular-nums" aria-live="off">
        {dates.date(day)}
      </span>
      <NativeSelect
        aria-label="Speed"
        className="h-8 w-auto text-[13px]"
        value={speed}
        onChange={(event) => setSpeed(Number(event.target.value))}
      >
        {PLAYBACK_SPEEDS.map((rate) => (
          <option key={rate} value={rate}>
            {rate}×
          </option>
        ))}
      </NativeSelect>
      {onClose ? (
        <Button type="button" size="icon-sm" variant="ghost" onClick={onClose}>
          <X />
          <span className="sr-only">Stop playback</span>
        </Button>
      ) : null}
    </div>
  );
}
