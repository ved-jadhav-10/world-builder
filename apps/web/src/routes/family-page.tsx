import { GitFork, Minus, Network, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  FAMILY_NODE_H,
  FAMILY_NODE_W,
  MAX_FAMILY_GENERATIONS,
  layoutFamily,
  type FamilyLayout,
} from '@atlas/shared';
import { useFamily } from '@/api/graph-queries';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const FALLBACK_COLOR = '#64748b';
const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5];

/** Drops from a parent down to a child: out of the parent, across at mid-height, into the child. */
function parentPath(parent: { x: number; y: number }, child: { x: number; y: number }) {
  const startY = parent.y + FAMILY_NODE_H / 2;
  const endY = child.y - FAMILY_NODE_H / 2;
  if (endY <= startY) return `M ${parent.x} ${parent.y} L ${child.x} ${child.y}`;
  const midY = (startY + endY) / 2;
  return `M ${parent.x} ${startY} V ${midY} H ${child.x} V ${endY}`;
}

function Tree({
  layout,
  focusId,
  colors,
  zoom,
  onCentre,
  onOpen,
}: {
  layout: FamilyLayout;
  focusId: string;
  colors: Map<string, string>;
  zoom: number;
  onCentre: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const at = new Map(layout.nodes.map((n) => [n.id, n]));
  return (
    <svg
      role="img"
      aria-label={`Family tree of ${at.get(focusId)?.name ?? 'this person'}, ${layout.nodes.length} people`}
      width={layout.width * zoom}
      height={layout.height * zoom}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="block"
    >
      {layout.siblingLinks.map(({ a, b }) => {
        const p = at.get(a);
        const q = at.get(b);
        if (!p || !q) return null;
        const top = p.y - FAMILY_NODE_H / 2;
        const lift = 16 + Math.min(20, Math.abs(p.x - q.x) / 30);
        return (
          <path
            key={`${a}:${b}`}
            d={`M ${p.x} ${top} C ${p.x} ${top - lift}, ${q.x} ${top - lift}, ${q.x} ${top}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeDasharray="4 4"
          />
        );
      })}
      {layout.parentLinks.map(({ parentId, childId }) => {
        const p = at.get(parentId);
        const c = at.get(childId);
        if (!p || !c) return null;
        return (
          <path
            key={`${parentId}>${childId}`}
            d={parentPath(p, c)}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeWidth={1.5}
          />
        );
      })}
      {layout.couples.map(({ a, b }) => {
        const p = at.get(a);
        const q = at.get(b);
        if (!p || !q) return null;
        return (
          <line
            key={`${a}=${b}`}
            x1={p.x + FAMILY_NODE_W / 2}
            x2={q.x - FAMILY_NODE_W / 2}
            y1={p.y}
            y2={q.y}
            stroke="currentColor"
            strokeOpacity={0.6}
            strokeWidth={3}
          />
        );
      })}
      {layout.nodes.map((node) => {
        const color = colors.get(node.id) ?? FALLBACK_COLOR;
        const isFocus = node.id === focusId;
        const name = node.name.length > 21 ? `${node.name.slice(0, 20)}…` : node.name;
        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`${node.name}${isFocus ? ' (centre)' : ''}. Click to centre the tree on them; double-click to open.`}
            transform={`translate(${node.x - FAMILY_NODE_W / 2} ${node.y - FAMILY_NODE_H / 2})`}
            className="cursor-pointer"
            onClick={() => onCentre(node.id)}
            onDoubleClick={() => onOpen(node.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onCentre(node.id);
            }}
          >
            <title>{node.name}</title>
            <rect
              width={FAMILY_NODE_W}
              height={FAMILY_NODE_H}
              rx={8}
              fill="var(--card)"
              stroke={isFocus ? color : 'var(--border)'}
              strokeWidth={isFocus ? 2.5 : 1.2}
            />
            <rect width={6} height={FAMILY_NODE_H} rx={3} fill={color} />
            <text
              x={18}
              y={FAMILY_NODE_H / 2 + 4}
              className={cn('fill-foreground text-[13px]', isFocus && 'font-semibold')}
            >
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function FamilyPage() {
  const { world, base, typeById } = useWorld();
  const { entityId = '' } = useParams();
  const navigate = useNavigate();
  const [up, setUp] = useState(3);
  const [down, setDown] = useState(3);
  const [zoomIndex, setZoomIndex] = useState(3);
  const { data, isPending, isError } = useFamily(world.id, entityId, up, down);

  const layout = useMemo(
    () =>
      data
        ? layoutFamily(data.focusId, data.people, {
            parentOf: data.parentOf,
            spouses: data.spouses,
            siblings: data.siblings,
          })
        : null,
    [data],
  );
  const colors = useMemo(
    () => new Map(data?.people.map((p) => [p.id, typeById.get(p.typeId)?.color ?? FALLBACK_COLOR])),
    [data, typeById],
  );

  if (isPending) return <PageSpinner />;
  if (isError || !data || !layout) {
    return (
      <EmptyState icon={<GitFork />} title="Family tree not available">
        <p>That entry may have been deleted, or it is not shared with you.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={base}>Back to the Codex</Link>
        </Button>
      </EmptyState>
    );
  }

  const focus = data.people.find((p) => p.id === data.focusId);
  const alone = data.people.length <= 1;
  const generationOptions = Array.from({ length: MAX_FAMILY_GENERATIONS + 1 }, (_, n) => n);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Connections</p>
          <h1 className="font-serif text-3xl font-semibold">Family tree</h1>
          <p className="mt-1 text-muted-foreground">
            {focus ? (
              <>
                <Link
                  to={`${base}/e/${focus.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {focus.name}
                </Link>{' '}
                with their ancestors, descendants, partners and siblings
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Ancestors
            <NativeSelect
              aria-label="Generations of ancestors"
              className="w-auto"
              value={up}
              onChange={(event) => setUp(Number(event.target.value))}
            >
              {generationOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Descendants
            <NativeSelect
              aria-label="Generations of descendants"
              className="w-auto"
              value={down}
              onChange={(event) => setDown(Number(event.target.value))}
            >
              {generationOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Smaller"
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex((i) => i - 1)}
            >
              <Minus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Larger"
              disabled={zoomIndex === ZOOMS.length - 1}
              onClick={() => setZoomIndex((i) => i + 1)}
            >
              <Plus />
            </Button>
          </div>
          <Button asChild variant="outline">
            <Link to={`${base}/graph?focus=${data.focusId}`}>
              <Network /> Relationship graph
            </Link>
          </Button>
        </div>
      </div>

      {alone ? (
        <EmptyState icon={<GitFork />} title="No family linked yet">
          <p>
            Link {focus?.name ?? 'this entry'} to relatives with “parent of”, “spouse of” or
            “sibling of” from the relationships panel, and the tree grows from there.
          </p>
          {focus ? (
            <Button asChild variant="outline" className="mt-4">
              <Link to={`${base}/e/${focus.id}`}>Open {focus.name}</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-auto rounded-xl border bg-card p-2">
            <Tree
              layout={layout}
              focusId={data.focusId}
              colors={colors}
              zoom={ZOOMS[zoomIndex]!}
              onCentre={(id) => navigate(`${base}/family/${id}`)}
              onOpen={(id) => navigate(`${base}/e/${id}`)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Click a person to centre the tree on them, double-click to open their entry. A thick
            line joins partners; a dashed arc joins siblings whose parents are not shown.
          </p>
        </>
      )}
    </div>
  );
}

export { FamilyPage as Component };
