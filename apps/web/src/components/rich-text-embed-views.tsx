import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { CalendarRange, Map as MapIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useMap } from '@/api/atlas-queries';
import { useTimeline } from '@/api/timeline-queries';
import { useDates } from '@/lib/use-dates';
import { useWorld } from '@/lib/world-context';

/** How a map embedded in an article looks inside the editor and when read. */
export function MapEmbedView({ node }: NodeViewProps) {
  const { world, base } = useWorld();
  const mapId = String(node.attrs.mapId ?? '');
  const { data: map, isError, isPending } = useMap(world.id, mapId);
  return (
    <NodeViewWrapper className="embed-block" contentEditable={false}>
      {isError ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapIcon className="size-4" /> This map isn’t available.
        </p>
      ) : isPending || !map ? (
        <p className="text-sm text-muted-foreground">Loading the map…</p>
      ) : (
        <Link
          to={`${base}/atlas/${map.id}`}
          className="flex items-center gap-3 no-underline"
          draggable={false}
        >
          {map.status === 'ready' ? (
            <img
              src={`/api/worlds/${world.id}/maps/${map.id}/thumbnail`}
              alt=""
              className="h-20 w-32 rounded-md border object-cover"
              draggable={false}
            />
          ) : (
            <span className="flex h-20 w-32 items-center justify-center rounded-md border bg-muted text-muted-foreground">
              <MapIcon className="size-6" />
            </span>
          )}
          <span>
            <span className="block text-xs text-muted-foreground">Map</span>
            <span className="block font-medium">{map.name}</span>
            <span className="block text-xs text-muted-foreground">Open the map</span>
          </span>
        </Link>
      )}
    </NodeViewWrapper>
  );
}

/** How an embedded timeline looks. */
const TIMELINE_ROWS = 10;

export function TimelineEmbedView({ node }: NodeViewProps) {
  const { world, base, typeById } = useWorld();
  const dates = useDates();
  const { data } = useTimeline(world.id);
  const typeId = typeof node.attrs.typeId === 'string' ? node.attrs.typeId : '';
  const type = typeId ? typeById.get(typeId) : undefined;
  const rows = (data?.entities ?? [])
    .filter((e) => !typeId || e.typeId === typeId)
    .slice(0, TIMELINE_ROWS);
  const total = (data?.entities ?? []).filter((e) => !typeId || e.typeId === typeId).length;

  return (
    <NodeViewWrapper className="embed-block" contentEditable={false}>
      <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <CalendarRange className="size-4" /> Timeline{type ? `: ${type.name}` : ''}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing dated to show yet.</p>
      ) : (
        <ol className="space-y-0.5 text-sm">
          {rows.map((entity) => (
            <li key={entity.id} className="flex gap-3">
              <span className="w-40 shrink-0 tabular-nums text-muted-foreground">
                {dates.date(entity.startDay ?? entity.endDay!)}
              </span>
              <Link to={`${base}/e/${entity.id}`} draggable={false}>
                {entity.name}
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-1.5 text-xs">
        <Link to={`${base}/timeline`} draggable={false}>
          {total > rows.length ? `All ${total} on the timeline` : 'Open the timeline'}
        </Link>
      </p>
    </NodeViewWrapper>
  );
}
