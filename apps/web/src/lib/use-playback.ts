import { useCallback, useEffect, useRef, useState } from 'react';

/** How many seconds playing the whole span takes at normal speed. */
export const SECONDS_PER_SPAN = 24;

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;

/**
 * Moves a day forward over time, to play a stretch of history. `value` is the current day (null
 * before it starts); `onChange` is told each whole day it reaches. It stops at `to`.
 */
export function usePlayback({
  from,
  to,
  value,
  onChange,
}: {
  from: number;
  to: number;
  value: number | null;
  onChange: (day: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  // The newest props, read from the animation loop without restarting it.
  const latest = useRef({ from, to, value, onChange, speed });
  useEffect(() => {
    latest.current = { from, to, value, onChange, speed };
  });

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    // Days are whole numbers but time between frames is not, so the fraction is carried here.
    let position = latest.current.value ?? latest.current.from;
    if (position >= latest.current.to) position = latest.current.from;
    let shown = Math.round(position);
    latest.current.onChange(shown);

    const tick = (now: number) => {
      const { from: start, to: end, speed: rate, onChange: change } = latest.current;
      const span = Math.max(1, end - start);
      position += ((now - last) / 1000) * (span / SECONDS_PER_SPAN) * rate;
      last = now;
      if (position >= end) {
        change(end);
        setPlaying(false);
        return;
      }
      const day = Math.round(position);
      if (day !== shown) {
        shown = day;
        change(day);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = useCallback(() => setPlaying((on) => !on), []);
  const pause = useCallback(() => setPlaying(false), []);
  return { playing, toggle, pause, speed, setSpeed };
}
