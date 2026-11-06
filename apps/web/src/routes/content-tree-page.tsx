import { ChevronDown, ChevronRight, ExternalLink, ListTree } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { EntityIndexItem } from '@atlas/shared';
import { useEntityIndex, useTags } from '@/api/queries';
import { EntityIcon } from '@/components/entity-icon';
import { Input } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { openPopout } from '@/lib/popout';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

type Grouping = 'type' | 'tag';

interface Group {
  key: string;
  name: string;
  icon: string;
  color?: string;
  items: EntityIndexItem[];
}

/** Every article in the world in one outline, grouped by type or by tag. */
function ContentTreePage() {
  const { world, types, base } = useWorld();
  const { data: index, isPending } = useEntityIndex(world.id);
  const { data: tags = [] } = useTags(world.id);
  const [by, setBy] = useState<Grouping>('type');
  const [filter, setFilter] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const groups = useMemo<Group[]>(() => {
    const needle = filter.trim().toLowerCase();
    const items = (index ?? []).filter((e) => !needle || e.name.toLowerCase().includes(needle));
    if (by === 'type') {
      return types
        .map((type) => ({
          key: type.id,
          name: type.name,
          icon: type.icon,
          color: type.color,
          items: items.filter((e) => e.typeId === type.id),
        }))
        .filter((group) => group.items.length > 0);
    }
    const tagged = tags.map((tag) => ({
      key: tag.id,
      name: tag.name,
      icon: 'tag',
      color: tag.color,
      items: items.filter((e) => e.tagIds.includes(tag.id)),
    }));
    const untagged = items.filter((e) => e.tagIds.length === 0);
    return [
      ...tagged,
      { key: 'none', name: 'No tag', icon: 'file-text', color: undefined, items: untagged },
    ].filter((group) => group.items.length > 0);
  }, [index, types, tags, by, filter]);

  if (isPending) return <PageSpinner />;
  const total = index?.length ?? 0;
  // A search opens everything it found; otherwise groups start open.
  const isOpen = (key: string) => Boolean(filter.trim()) || !closed.has(key);
  const toggle = (key: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Codex</p>
        <h1 className="font-serif text-3xl font-semibold">Content tree</h1>
        <p className="mt-1 text-muted-foreground">
          All {total.toLocaleString()} {total === 1 ? 'article' : 'articles'} in {world.name}, in
          one outline.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Filter articles"
          placeholder="Filter by name…"
          className="max-w-64"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div
          role="radiogroup"
          aria-label="Group by"
          className="inline-flex rounded-md border bg-card p-0.5"
        >
          {(['type', 'tag'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={by === mode}
              onClick={() => setBy(mode)}
              className={cn(
                'rounded px-3 py-1 text-[13px] transition-colors',
                by === mode
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              By {mode}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<ListTree />} title={total === 0 ? 'No articles yet' : 'No match'}>
          {total === 0 ? 'Add entries in the Codex and they appear here.' : 'Try a different name.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => {
            const open = isOpen(group.key);
            return (
              <li key={group.key} className="rounded-xl border bg-card">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(group.key)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
                >
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  <EntityIcon icon={group.icon} color={group.color} />
                  {group.name}
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {group.items.length}
                  </span>
                </button>
                {open ? (
                  <ul className="border-t px-3 py-1.5">
                    {group.items.map((item) => (
                      <li key={item.id} className="group flex items-center gap-2 py-1 text-sm">
                        <Link to={`${base}/e/${item.id}`} className="truncate hover:underline">
                          {item.name}
                        </Link>
                        <button
                          type="button"
                          title="Open in its own window"
                          aria-label={`Open ${item.name} in its own window`}
                          onClick={() => openPopout(base, item.id)}
                          className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                        >
                          <ExternalLink className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { ContentTreePage as Component };
