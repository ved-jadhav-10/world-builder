import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useHandouts } from '@/api/handout-queries';
import { useWorld } from '@/lib/world-context';

/** How often a player's page asks whether the GM has revealed something. */
const POLL_MS = 8000;

const storageKey = (worldId: string) => `atlas.handouts.seen.${worldId}`;

/** Handout ids against the moment each was last revealed, as this browser has already seen. */
function readSeen(worldId: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(storageKey(worldId));
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function writeSeen(worldId: string, seen: Record<string, string>) {
  try {
    localStorage.setItem(storageKey(worldId), JSON.stringify(seen));
  } catch {
    // Without storage the page still tells people, once per visit.
  }
}

/**
 * Mounted for players: when the GM reveals a handout (or shows one again), a message appears
 * wherever the player is, with a button to open it. The first visit marks what is already there
 * as seen, so nobody is greeted by a pile of old handouts.
 */
export function HandoutAlert() {
  const { world, base } = useWorld();
  const navigate = useNavigate();
  const { data } = useHandouts(world.id, { poll: POLL_MS });
  // Kept in memory too, so storage that will not save cannot cause the same toast every poll.
  const seen = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (!data) return;
    const known = seen.current ?? readSeen(world.id);
    const next: Record<string, string> = { ...(known ?? {}) };
    for (const handout of data) {
      const stamp = handout.revealedAt ?? '';
      if (known !== null && next[handout.id] !== stamp) {
        toast(`New handout: ${handout.title}`, {
          description: 'The GM has shared something with you.',
          duration: 15_000,
          action: {
            label: 'Open',
            onClick: () => void navigate(`${base}/handouts?open=${handout.id}`),
          },
        });
      }
      next[handout.id] = stamp;
    }
    seen.current = next;
    writeSeen(world.id, next);
  }, [data, world.id, base, navigate]);

  return null;
}
