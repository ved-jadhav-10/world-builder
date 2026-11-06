import { useEffect, useEffectEvent, useRef } from 'react';
import { useNavigate } from 'react-router';
import { isTypingTarget, resolveGo, type ShortcutContext } from '@/lib/shortcuts';

/** How long after "g" the next key still counts as the second half of the shortcut. */
const SEQUENCE_MS = 1200;

/**
 * Listens for the world's keyboard shortcuts: "g" then a letter goes to a page, "/" searches
 * and "?" shows the list. Nothing fires while typing in a field or an open dialog.
 */
export function useWorldShortcuts(
  ctx: ShortcutContext,
  actions: { onSearch: () => void; onHelp: () => void },
) {
  const navigate = useNavigate();
  const waiting = useRef<number | null>(null);

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const clear = () => {
      if (waiting.current !== null) window.clearTimeout(waiting.current);
      waiting.current = null;
    };

    if (waiting.current !== null) {
      clear();
      const path = resolveGo(event.key, ctx);
      if (path) {
        event.preventDefault();
        void navigate(path);
      }
      return;
    }
    if (event.key === 'g') {
      waiting.current = window.setTimeout(() => (waiting.current = null), SEQUENCE_MS);
    } else if (event.key === '/') {
      event.preventDefault();
      actions.onSearch();
    } else if (event.key === '?') {
      event.preventDefault();
      actions.onHelp();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
