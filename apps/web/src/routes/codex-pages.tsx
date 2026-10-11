import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { EntitySort } from '@atlas/shared';
import { useEntityList, useTags } from '@/api/queries';
import { EntityIcon } from '@/components/entity-icon';
import { EntityRow } from '@/components/entity-row';
import { NewEntityDialog } from '@/components/new-entity-dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { EmptyState, PageSpinner, Spinner } from '@/components/ui/misc';
import { useWorld } from '@/lib/world-context';

export function CodexHome() {
  const { world, types, base, canEdit } = useWorld();
  const recent = useEntityList(world.id, { sort: 'updated', limit: 8 });
  const recentItems = recent.data?.pages[0]?.items ?? [];
  const total = types.reduce((sum, t) => sum + t.entityCount, 0);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">Codex</p>
          <h1 className="font-serif text-3xl font-semibold">{world.name}</h1>
          {world.description ? (
            <p className="mt-2 max-w-2xl text-muted-foreground">{world.description}</p>
          ) : null}
        </div>
        {canEdit ? (
          <NewEntityDialog
            trigger={
              <Button>
                <Plus /> New entry
              </Button>
            }
          />
        ) : null}
      </div>

      <section>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {types.map((type) => (
            <li key={type.id}>
              <Link
                to={`${base}/codex/${type.key}`}
                className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs transition hover:border-primary/40"
              >
                <span
                  className="flex size-9 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${type.color}1a` }}
                >
                  <EntityIcon icon={type.icon} color={type.color} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{type.name}</span>
                  <span className="text-xs text-muted-foreground">{type.entityCount}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-xl font-semibold">Recently updated</h2>
        <div className="mt-3">
          {recent.isPending ? (
            <Spinner />
          ) : total === 0 ? (
            <EmptyState title="Your codex is empty">
              Add a character, a place or a piece of lore to get started. Everything you add can be
              linked together.
            </EmptyState>
          ) : (
            <ul className="-mx-3">
              {recentItems.map((entity) => (
                <EntityRow key={entity.id} entity={entity} showType />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export function EntityListPage() {
  const { typeKey = '' } = useParams();
  const { world, typeByKey, canEdit } = useWorld();
  const type = typeByKey.get(typeKey);
  const [sort, setSort] = useState<EntitySort>('name');
  const [tagId, setTagId] = useState('');
  const { data: tags = [] } = useTags(world.id);
  const list = useEntityList(world.id, { typeId: type?.id, sort, tagId: tagId || undefined });

  if (!type)
    return (
      <EmptyState title="Unknown type">This entity type doesn't exist in this world.</EmptyState>
    );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${type.color}1a` }}
          >
            <EntityIcon icon={type.icon} color={type.color} className="size-5" />
          </span>
          <div>
            <h1 className="font-serif text-2xl font-semibold">{type.name}</h1>
            <p className="text-sm text-muted-foreground">
              {type.entityCount} {type.entityCount === 1 ? 'entry' : 'entries'}
            </p>
          </div>
        </div>
        {canEdit ? (
          <NewEntityDialog
            typeId={type.id}
            trigger={
              <Button>
                <Plus /> New {type.name.toLowerCase()}
              </Button>
            }
          />
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <NativeSelect
          aria-label="Sort"
          className="w-auto"
          value={sort}
          onChange={(e) => setSort(e.target.value as EntitySort)}
        >
          <option value="name">Name A–Z</option>
          <option value="updated">Recently updated</option>
        </NativeSelect>
        {tags.length ? (
          <NativeSelect
            aria-label="Filter by tag"
            className="w-auto"
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>

      <div className="mt-4">
        {list.isPending ? (
          <PageSpinner />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<EntityIcon icon={type.icon} />}
            title={`No ${type.name.toLowerCase()} entries yet`}
          >
            {tagId ? 'Nothing here has that tag.' : 'Create the first one with the button above.'}
          </EmptyState>
        ) : (
          <>
            <ul className="-mx-3 divide-y divide-border/60">
              {items.map((entity) => (
                <EntityRow key={entity.id} entity={entity} />
              ))}
            </ul>
            {list.hasNextPage ? (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                >
                  {list.isFetchingNextPage ? <Spinner /> : null} Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
