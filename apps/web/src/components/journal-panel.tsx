import { useEffect, useRef, useState } from 'react';
import { MAX_JOURNAL_LENGTH } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useJournal, usePlayerJournals, useSaveJournal } from '@/api/journal-queries';
import { Textarea } from '@/components/ui/inputs';
import { Spinner } from '@/components/ui/misc';
import { useDebounced } from '@/lib/use-debounced';
import { useWorld } from '@/lib/world-context';

/** The signed-in person's own notes on this entry. Autosaves a moment after typing stops. */
function MyNotes({ entityId }: { entityId: string }) {
  const { world } = useWorld();
  const { data, isPending, error } = useJournal(world.id, entityId, true);
  const save = useSaveJournal(world.id, entityId);
  const [text, setText] = useState('');
  const loaded = useRef(false);
  const saved = useRef('');

  useEffect(() => {
    if (data && !loaded.current) {
      loaded.current = true;
      saved.current = data.body;
      setText(data.body);
    }
  }, [data]);

  const settled = useDebounced(text, 800);
  useEffect(() => {
    if (!loaded.current || settled === saved.current) return;
    const sent = settled;
    saved.current = sent;
    save.mutate(sent, { onError: () => (saved.current = '\u0000') });
  }, [settled, save]);

  if (isPending) return <Spinner />;
  if (error) return <p className="text-sm text-destructive">{errorMessage(error)}</p>;
  const status = save.isError
    ? 'Not saved'
    : text !== settled || save.isPending
      ? 'Saving…'
      : save.isSuccess || data?.updatedAt
        ? 'Saved'
        : '';
  return (
    <div className="space-y-1.5">
      <Textarea
        aria-label="My notes on this entry"
        value={text}
        maxLength={MAX_JOURNAL_LENGTH}
        rows={4}
        onChange={(event) => setText(event.target.value)}
        placeholder="What your character knows or suspects about this. Only you and the GM can read it."
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

function PlayersNotes({ entityId }: { entityId: string }) {
  const { world } = useWorld();
  const { data } = usePlayerJournals(world.id, entityId, true);
  const others = data ?? [];
  if (others.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Players' notes</h3>
      <ul className="space-y-2">
        {others.map((note) => (
          <li key={note.author.id} className="rounded-lg border bg-card p-3 text-sm">
            <p className="font-medium">{note.author.name}</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{note.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Private notes on an entry. Players write their own; the GM reads everyone's. Not shown to
 * readers, or while previewing as someone else.
 */
export function JournalPanel({ entityId }: { entityId: string }) {
  const { world, previewing, audience } = useWorld();
  const mayWrite = ['owner', 'editor', 'commenter', 'player'].includes(world.role);
  if (!mayWrite || previewing) return null;
  return (
    <section className="space-y-3" aria-label="Notes of my own">
      <h2 className="text-sm font-semibold">My notes</h2>
      <MyNotes entityId={entityId} />
      {audience === 'gm' ? <PlayersNotes entityId={entityId} /> : null}
    </section>
  );
}
