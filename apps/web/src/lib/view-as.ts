import { useSyncExternalStore } from 'react';
import { isPreviewAudience, type PreviewAudience } from '@atlas/shared';

/*
 * The GM can look at a world as a player, a reader or the public. The choice lives for the
 * browser tab, and every API call carries it (see api/client.ts); the server does the filtering
 * and makes previews read-only, so this can't be used to see more than you are allowed to.
 */

const KEY = 'atlas.viewAs';
const listeners = new Set<() => void>();

function read(): PreviewAudience | null {
  try {
    const stored = sessionStorage.getItem(KEY);
    return isPreviewAudience(stored) ? stored : null;
  } catch {
    return null; // Storage can be blocked; previewing then lasts until the page reloads.
  }
}

let current = read();

export const getViewAs = () => current;

export function setViewAs(next: PreviewAudience | null) {
  current = next;
  try {
    if (next) sessionStorage.setItem(KEY, next);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Not remembered across reloads; the choice still applies now.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useViewAs = () => useSyncExternalStore(subscribe, getViewAs, () => null);
