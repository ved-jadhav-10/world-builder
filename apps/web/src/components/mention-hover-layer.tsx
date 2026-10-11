import { PanelRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { MentionIndexEntry } from '@atlas/shared';
import { EntityIcon } from '@/components/entity-icon';
import { useWorld } from '@/lib/world-context';

interface HoverState {
  entityId: string;
  top: number;
  left: number;
}

const mentionAt = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLElement>('[data-entity-id]') : null;

/**
 * Shows a preview card when the pointer rests on a highlighted name in the prose.
 * Ctrl/Cmd+click on a name opens it in the Codex panel straight away.
 */
export function MentionHoverLayer({
  index,
  onOpen,
  children,
}: {
  index: Map<string, MentionIndexEntry>;
  onOpen: (entityId: string) => void;
  children: ReactNode;
}) {
  const { typeById } = useWorld();
  const [hover, setHover] = useState<HoverState | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);

  const cancelHide = () => window.clearTimeout(hideTimer.current);
  const scheduleHide = () => {
    window.clearTimeout(showTimer.current);
    hideTimer.current = window.setTimeout(() => setHover(null), 200);
  };

  useEffect(() => {
    if (!hover) return;
    const close = () => setHover(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [hover]);

  useEffect(
    () => () => {
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const entry = hover ? index.get(hover.entityId) : undefined;
  const type = entry ? typeById.get(entry.typeId) : undefined;

  return (
    <div
      onMouseOver={(event) => {
        const el = mentionAt(event.target);
        if (!el?.dataset.entityId) return;
        cancelHide();
        window.clearTimeout(showTimer.current);
        const entityId = el.dataset.entityId;
        showTimer.current = window.setTimeout(() => {
          const rect = el.getBoundingClientRect();
          setHover({
            entityId,
            top: rect.bottom + 6,
            left: Math.min(rect.left, window.innerWidth - 300),
          });
        }, 250);
      }}
      onMouseOut={(event) => {
        if (mentionAt(event.target)) scheduleHide();
      }}
      onPointerUp={(event) => {
        // Touch screens have no hover: a tap on a name shows its card.
        const el = mentionAt(event.target);
        if (event.pointerType !== 'touch' || !el?.dataset.entityId) return;
        const rect = el.getBoundingClientRect();
        setHover({
          entityId: el.dataset.entityId,
          top: rect.bottom + 6,
          left: Math.min(rect.left, window.innerWidth - 300),
        });
      }}
      onClick={(event) => {
        const el = mentionAt(event.target);
        if (el?.dataset.entityId && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onOpen(el.dataset.entityId);
        }
      }}
    >
      {children}
      {hover && entry
        ? createPortal(
            <div
              role="tooltip"
              onMouseEnter={cancelHide}
              onMouseLeave={scheduleHide}
              className="fixed z-50 w-72 rounded-lg border bg-card p-3 text-sm shadow-xl"
              style={{ top: hover.top, left: Math.max(8, hover.left) }}
            >
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <EntityIcon
                  icon={type?.icon ?? 'file-text'}
                  color={type?.color}
                  className="size-3.5"
                />
                {type?.name}
              </p>
              <p className="mt-0.5 font-serif text-base font-semibold">{entry.name}</p>
              {entry.aliases.length ? (
                <p className="text-xs text-muted-foreground">Also {entry.aliases.join(', ')}</p>
              ) : null}
              {entry.summary ? <p className="mt-2 line-clamp-4">{entry.summary}</p> : null}
              <button
                type="button"
                onClick={() => {
                  onOpen(entry.id);
                  setHover(null);
                }}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <PanelRight className="size-3.5" /> Show in Codex
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
