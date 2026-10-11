import { BookOpenText } from 'lucide-react';
import { Link } from 'react-router';
import { useAppearances } from '@/api/manuscript-queries';
import { Badge, Spinner } from '@/components/ui/misc';
import { useWorld } from '@/lib/world-context';

/** Scenes that mention this entry, or use it as point of view or setting. */
export function AppearsIn({ entityId }: { entityId: string }) {
  const { world, base } = useWorld();
  const { data: appearances, isPending } = useAppearances(world.id, entityId);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <BookOpenText className="size-4 text-muted-foreground" /> Appears in
      </h2>
      {isPending ? (
        <Spinner />
      ) : !appearances?.length ? (
        <p className="text-sm text-muted-foreground">
          Not in the manuscript yet. Write its name or an alias in a scene and it shows up here.
        </p>
      ) : (
        <ul className="space-y-2">
          {appearances.map((a) => (
            <li key={a.sceneId}>
              <Link to={`${base}/manuscript/s/${a.sceneId}`} className="group block text-sm">
                <span className="font-medium group-hover:underline">{a.sceneTitle}</span>
                <span className="block text-xs text-muted-foreground">
                  {[a.bookTitle, a.chapterTitle].filter(Boolean).join(' › ')}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {a.mentions ? (
                    <Badge>
                      {a.mentions} {a.mentions === 1 ? 'mention' : 'mentions'}
                    </Badge>
                  ) : null}
                  {a.asPov ? <Badge>Point of view</Badge> : null}
                  {a.asLocation ? <Badge>Setting</Badge> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
