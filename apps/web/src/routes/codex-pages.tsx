import { CheckSquare, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { VISIBILITIES, type EntitySort, type Visibility } from '@atlas/shared';
import { useEntityList, useTags } from '@/api/queries';
import { BulkBar } from '@/components/bulk-bar';
import { EntityIcon } from '@/components/entity-icon';
import { EntityRow } from '@/components/entity-row';
import { SavedFiltersBar } from '@/components/saved-filters-bar';
import { NewEntityDialog } from '@/components/new-entity-dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { EmptyState, PageSpinner, Spinner } from '@/components/ui/misc';
import { useManuscriptTree } from '@/lib/manuscript-tree';
import { VISIBILITY_LABELS } from '@/lib/visibility-labels';
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
          <p className="text-sm text-muted-foreground">
            The codex of{' '}
            <span className="tabular-nums">
              {total} {total === 1 ? 'entry' : 'entries'}
            </span>
          </p>
          <h1 className="font-serif text-5xl font-medium">{world.name}</h1>
          {world.description ? (
            <p className="mt-3 max-w-2xl font-serif text-xl text-muted-foreground">
              {world.description}
            </p>
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
        <h2 className="font-serif text-2xl font-medium">Contents</h2>
        <ul className="mt-3 gap-x-10 sm:columns-2 lg:columns-3">
          {types.map((type) => (
            <li key={type.id} className="break-inside-avoid">
              <Link
                to={`${base}/codex/${type.key}`}
                className="group flex items-baseline gap-2 rounded-md py-1.5 text-[15px] hover:text-primary"
              >
                <EntityIcon icon={type.icon} color={type.color} className="self-center" />
                <span className="truncate">{type.name}</span>
                <span
                  aria-hidden="true"
                  className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-input"
                />
                <span
                  className={
                    type.entityCount ? 'tabular-nums' : 'tabular-nums text-muted-foreground'
                  }
                >
                  {type.entityCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-2xl font-medium">Recently updated</h2>
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
  const { world, typeByKey, canEdit, audience } = useWorld();
  const type = typeByKey.get(typeKey);
  const [sort, setSort] = useState<EntitySort>('name');
  const [tagId, setTagId] = useState('');
  const [visibility, setVisibility] = useState<Visibility | ''>('');
  const [bookId, setBookId] = useState('');
  const { tree } = useManuscriptTree();
  const books = tree.nodes.filter((n) => n.kind === 'book');
  // Bulk edit: pick rows, then change them all at once.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data: tags = [] } = useTags(world.id);
  const list = useEntityList(world.id, {
    typeId: type?.id,
    sort,
    tagId: tagId || undefined,
    bookId: bookId || undefined,
    visibility: visibility || undefined,
  });

  if (!type)
    return (
      <EmptyState title="Unknown type">This entity type doesn't exist in this world.</EmptyState>
    );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  // Only what is on screen counts, so changing a filter never changes hidden entries.
  const pickedIds = items.filter((entity) => picked.has(entity.id)).map((entity) => entity.id);
  const allPicked = items.length > 0 && pickedIds.length === items.length;
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };

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
        {books.length > 0 ? (
          <NativeSelect
            aria-label="Filter by book"
            className="w-auto"
            value={bookId}
            onChange={(e) => setBookId(e.target.value)}
          >
            <option value="">All books</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        {audience === 'gm' ? (
          <NativeSelect
            aria-label="Filter by visibility"
            className="w-auto"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility | '')}
          >
            <option value="">Any visibility</option>
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABELS[v]}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        {canEdit && items.length > 0 ? (
          <Button
            variant={selecting ? 'default' : 'outline'}
            className="ml-auto"
            aria-pressed={selecting}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          >
            <CheckSquare /> {selecting ? 'Done' : 'Select'}
          </Button>
        ) : null}
      </div>

      <SavedFiltersBar
        typeId={type.id}
        current={{ tagId, visibility, sort }}
        onApply={(filters) => {
          setTagId(filters.tagId);
          setVisibility(filters.visibility);
          setSort(filters.sort);
        }}
      />

      {selecting ? (
        <div className="mt-4 space-y-2">
          <BulkBar ids={pickedIds} onDone={stopSelecting} />
          <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={allPicked}
              onChange={() =>
                setPicked(allPicked ? new Set() : new Set(items.map((entity) => entity.id)))
              }
              className="size-4 accent-primary"
            />
            Select all {items.length} shown
            {list.hasNextPage ? ' (load more to include the rest)' : ''}
          </label>
        </div>
      ) : null}

      <div className="mt-4">
        {list.isPending ? (
          <PageSpinner />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<EntityIcon icon={type.icon} />}
            title={`No ${type.name.toLowerCase()} entries yet`}
          >
            {tagId || visibility
              ? 'Nothing matches these filters.'
              : 'Create the first one with the button above.'}
          </EmptyState>
        ) : (
          <>
            <ul className="-mx-3 divide-y divide-border/60">
              {items.map((entity) => (
                <EntityRow
                  key={entity.id}
                  entity={entity}
                  selection={
                    selecting
                      ? { selected: picked.has(entity.id), onToggle: () => toggle(entity.id) }
                      : undefined
                  }
                />
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
