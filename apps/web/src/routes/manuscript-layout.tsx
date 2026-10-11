import { BookMarked, Plus } from 'lucide-react';
import { Link, Outlet, useMatch } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useCreateNode } from '@/api/manuscript-queries';
import { Binder } from '@/components/binder';
import { Button } from '@/components/ui/button';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { formatWords, KIND_ICONS, useManuscriptTree } from '@/lib/manuscript-tree';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

/** Contents on the left, the open scene (or an overview) on the right. */
export function ManuscriptLayout() {
  const { base } = useWorld();
  const inScene = useMatch(`${base}/manuscript/s/:sceneId`);

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* On small screens the contents give way to the open scene. */}
      <div
        className={cn(
          'lg:sticky lg:top-10 lg:max-h-[calc(100dvh-5rem)] lg:self-start lg:overflow-y-auto',
          inScene && 'hidden lg:block',
        )}
      >
        <Binder />
      </div>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

export function ManuscriptHome() {
  const { world, canEdit, base } = useWorld();
  const { tree, isPending } = useManuscriptTree();
  const createNode = useCreateNode(world.id);
  const books = tree.childrenOf(null);
  const totalWords = books.reduce((sum, b) => sum + b.wordCount, 0);
  const scenes = tree.nodes.filter((n) => n.kind === 'scene');
  const recent = [...scenes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  if (isPending) return <PageSpinner />;

  if (books.length === 0) {
    return (
      <EmptyState icon={<BookMarked />} title="Start your manuscript">
        <p>
          Organise your story as books, parts, chapters and scenes. Names from your Codex are picked
          up as you write, so every entry knows where it appears.
        </p>
        {canEdit ? (
          <Button
            className="mt-4"
            onClick={() =>
              createNode
                .mutateAsync({ kind: 'book', parentId: null, title: world.name })
                .catch((e: unknown) => toast.error(errorMessage(e)))
            }
          >
            <Plus /> Create a book
          </Button>
        ) : null}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Manuscript</p>
        <h1 className="font-serif text-3xl font-semibold">{world.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {totalWords.toLocaleString()} words across {scenes.length}{' '}
          {scenes.length === 1 ? 'scene' : 'scenes'}
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {books.map((book) => {
          const chapters = tree.nodes.filter(
            (n) => n.kind === 'chapter' && isInside(tree.byId, n.id, book.id),
          );
          return (
            <li key={book.id} className="rounded-xl border bg-card p-5">
              <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
                <BookMarked className="size-5 text-muted-foreground" /> {book.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatWords(book.wordCount)} words · {chapters.length}{' '}
                {chapters.length === 1 ? 'chapter' : 'chapters'}
              </p>
            </li>
          );
        })}
      </ul>

      {recent.length ? (
        <section>
          <h2 className="font-serif text-xl font-semibold">Pick up where you left off</h2>
          <ul className="mt-3 divide-y rounded-xl border bg-card">
            {recent.map((scene) => {
              const Icon = KIND_ICONS.scene;
              return (
                <li key={scene.id}>
                  <Link
                    to={`${base}/manuscript/s/${scene.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted"
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="font-medium">{scene.title}</span>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {scene.wordCount.toLocaleString()} words
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add a chapter to your book from the contents, then a scene inside it to start writing.
        </p>
      )}
    </div>
  );
}

function isInside(
  byId: Map<string, { parentId: string | null }>,
  id: string,
  ancestorId: string,
): boolean {
  for (
    let current = byId.get(id)?.parentId ?? null;
    current;
    current = byId.get(current)?.parentId ?? null
  ) {
    if (current === ancestorId) return true;
  }
  return false;
}

export { ManuscriptLayout as Component };
