import { useSyncExternalStore } from 'react';

/** A timed writing sprint in progress. It lives outside React so it survives page changes. */
export interface Sprint {
  worldId: string;
  /** When it ends, in milliseconds since 1970. */
  endsAt: number;
  minutes: number;
  /** Words written today when it began, to tell how many the sprint added. */
  startWords: number;
}

const STORAGE_KEY = 'atlas.sprint';

function read(): Sprint | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Sprint>;
    return typeof value.worldId === 'string' &&
      typeof value.endsAt === 'number' &&
      typeof value.minutes === 'number' &&
      typeof value.startWords === 'number'
      ? (value as Sprint)
      : null;
  } catch {
    return null;
  }
}

let current: Sprint | null = read();
const listeners = new Set<() => void>();

function set(next: Sprint | null) {
  current = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Without storage the sprint still runs; it just won't survive a reload.
  }
  for (const listener of listeners) listener();
}

export const startSprint = (sprint: Sprint) => set(sprint);
export const clearSprint = () => set(null);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const secondNow = () => Math.floor(Date.now() / 1000) * 1000;
const subscribeNever = () => () => undefined;
function subscribeToSeconds(listener: () => void) {
  const timer = window.setInterval(listener, 1000);
  return () => window.clearInterval(timer);
}

/** The sprint running in this browser and how long it has left (zero once it is over). */
export function useSprint(worldId: string) {
  const stored = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const sprint = stored && stored.worldId === worldId ? stored : null;
  // Re-read the time once a second, but only while a sprint is on screen.
  const now = useSyncExternalStore(
    sprint ? subscribeToSeconds : subscribeNever,
    secondNow,
    secondNow,
  );
  return { sprint, remainingMs: sprint ? Math.max(0, sprint.endsAt - now) : 0 };
}

/** "12:05" for a number of milliseconds. */
export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
