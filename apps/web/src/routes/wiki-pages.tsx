import { ArrowLeft, Lock, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Outlet, useOutletContext, useParams, useSearchParams } from 'react-router';
import { READER_END, READER_START, type WikiProgress } from '@atlas/shared';
import { ApiError, errorMessage } from '@/api/client';
import {
  useWikiEntry,
  useWikiHome,
  useWikiUnlock,
  wikiImageUrl,
  WikiLockedError,
  type WikiHomeData,
} from '@/api/wiki-queries';
import { BrandMark } from '@/components/brand';
import { EntityIcon } from '@/components/entity-icon';
import { RichTextView } from '@/components/rich-text-view';
import { Button } from '@/components/ui/button';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { PageSpinner } from '@/components/ui/misc';
import { hasRichText } from '@/lib/rich-text';

/*
 * The reader wiki: the public, read-only companion to a world. The one control that matters is
 * "I have read up to": everything on the page is worked out for that chapter by the server, so a
 * reader can browse freely without meeting anything from later in the book.
 */

interface WikiContext {
  slug: string;
  home: WikiHomeData;
  progress: WikiProgress;
  /** Keeps the reader's chapter in a link to another wiki page. */
  href: (path?: string) => string;
}

const useWiki = () => useOutletContext<WikiContext>();

/** The reader's chapter: from the address if it says, otherwise what this device remembers. */
function useProgress(slug: string): [WikiProgress, (next: WikiProgress) => void] {
  const [params, setParams] = useSearchParams();
  const key = `atlas-wiki-${slug}`;
  const remembered = useMemo(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);
  const progress = params.get('ch') ?? remembered ?? READER_START;
  const set = (next: WikiProgress) => {
    try {
      localStorage.setItem(key, next);
    } catch {
      // Not remembered in a private window; the address still carries it.
    }
    setParams(
      (current) => {
        current.set('ch', next);
        return current;
      },
      { replace: true },
    );
  };
  return [progress, set];
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 pb-10 pt-8 sm:px-8">
      {children}
      <footer className="mt-auto pt-16 text-sm text-muted-foreground">
        <Link to="/" className="inline-flex items-center gap-1.5 hover:text-foreground">
          <BrandMark className="size-4!" /> Kept in Atlas &amp; Ink
        </Link>
      </footer>
    </div>
  );
}

function PasswordGate({ slug, worldName }: { slug: string; worldName: string }) {
  const unlock = useWikiUnlock(slug);
  const [error, setError] = useState('');
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await unlock.mutateAsync(String(new FormData(event.currentTarget).get('password')));
    } catch (problem) {
      setError(errorMessage(problem));
    }
  }
  return (
    <Shell>
      <div className="my-auto max-w-sm">
        <Lock className="size-6 text-muted-foreground" />
        <h1 className="mt-4 font-serif text-4xl font-medium">{worldName}</h1>
        <p className="mt-2 text-muted-foreground">
          This wiki is for invited readers. Enter the password you were given.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wiki-password">Password</Label>
            <Input id="wiki-password" name="password" type="password" required autoFocus />
          </div>
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
          <Button type="submit" disabled={unlock.isPending}>
            Open the wiki
          </Button>
        </form>
      </div>
    </Shell>
  );
}

export function WikiLayout() {
  const { slug = '' } = useParams();
  const [progress, setProgress] = useProgress(slug);
  const home = useWikiHome(slug, progress);

  useEffect(() => {
    if (home.data) document.title = `${home.data.world.name}: a reader's wiki`;
    return () => {
      document.title = 'Atlas & Ink';
    };
  }, [home.data]);

  if (home.error instanceof WikiLockedError) {
    return <PasswordGate slug={slug} worldName={home.error.worldName} />;
  }
  if (home.isError) {
    const missing = home.error instanceof ApiError && home.error.status === 404;
    return (
      <Shell>
        <div className="my-auto">
          <h1 className="font-serif text-4xl font-medium">
            {missing ? 'No wiki here' : 'The wiki could not be opened'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {missing
              ? 'There is no reader wiki at this address. Its author may have closed it.'
              : 'Try again in a moment.'}
          </p>
        </div>
      </Shell>
    );
  }
  if (!home.data) return <PageSpinner />;

  const { world, chapters } = home.data;
  // The server falls back to the start for a chapter it does not know; show what it used.
  const used = home.data.progress;
  const href = (path = '') => `/wiki/${slug}${path}?ch=${encodeURIComponent(used)}`;
  const context: WikiContext = { slug, home: home.data, progress: used, href };

  return (
    <Shell>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b pb-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">A reader’s wiki</p>
          <Link to={href()} className="font-serif text-3xl font-medium leading-tight">
            {world.name}
          </Link>
        </div>
        {chapters.length ? (
          <div className="space-y-1">
            <Label htmlFor="wiki-progress">I have read up to</Label>
            <NativeSelect
              id="wiki-progress"
              className="h-9 w-auto min-w-44"
              value={used}
              onChange={(event) => setProgress(event.target.value)}
            >
              <option value={READER_START}>Nothing yet</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.label}
                </option>
              ))}
              <option value={READER_END}>The whole story</option>
            </NativeSelect>
          </div>
        ) : null}
      </header>
      <main className="pt-8">
        <Outlet context={context} />
      </main>
      {home.data.reportTo ? (
        <p className="pt-10 text-sm text-muted-foreground">
          Something here that should not be public?{' '}
          <a
            className="underline underline-offset-4"
            href={`mailto:${home.data.reportTo}?subject=${encodeURIComponent(`Report: wiki of ${world.name}`)}`}
          >
            Report this wiki
          </a>
          .
        </p>
      ) : null}
    </Shell>
  );
}

export function WikiHomePage() {
  const { home, href, progress } = useWiki();
  const [filter, setFilter] = useState('');
  const wanted = filter.trim().toLowerCase();
  const entries = wanted
    ? home.entries.filter(
        (entry) =>
          entry.name.toLowerCase().includes(wanted) ||
          entry.aliases.some((alias) => alias.toLowerCase().includes(wanted)),
      )
    : home.entries;

  return (
    <div className="space-y-10">
      {home.world.intro || home.world.description ? (
        <p className="max-w-2xl font-serif text-[1.35rem] leading-snug">
          {home.world.intro || home.world.description}
        </p>
      ) : null}

      {home.entries.length === 0 ? (
        <p className="text-muted-foreground">
          {progress === READER_END
            ? 'Nothing has been published here yet.'
            : 'Nothing to show for this point in the story yet. Tell the wiki how far you have read, above.'}
        </p>
      ) : (
        <>
          <label className="relative block max-w-xs">
            <span className="sr-only">Find an entry by name</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Find a name…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>

          {home.types.map((type) => {
            const ofType = entries.filter((entry) => entry.typeKey === type.key);
            if (!ofType.length) return null;
            return (
              <section key={type.key} aria-labelledby={`wiki-${type.key}`}>
                <h2
                  id={`wiki-${type.key}`}
                  className="flex items-center gap-2 font-serif text-2xl font-medium"
                >
                  <EntityIcon icon={type.icon} color={type.color} /> {type.name}
                </h2>
                <ul className="mt-2 divide-y">
                  {ofType.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        to={href(`/e/${entry.id}`)}
                        className="group block py-3 hover:text-primary"
                      >
                        <span className="font-serif text-xl">{entry.name}</span>
                        {entry.aliases.length ? (
                          <span className="ml-2 text-sm text-muted-foreground">
                            {entry.aliases.join(' · ')}
                          </span>
                        ) : null}
                        {entry.summary ? (
                          <span className="mt-0.5 block text-[15px] text-muted-foreground">
                            {entry.summary}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {wanted && entries.length === 0 ? (
            <p className="text-muted-foreground">
              No entry by that name at this point in the story.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function WikiEntryPage() {
  const { entryId = '' } = useParams();
  const { slug, href, progress, home } = useWiki();
  const entry = useWikiEntry(slug, entryId, progress);
  const chapter = home.chapters.find((c) => c.id === progress);

  if (entry.isError) {
    const missing = entry.error instanceof ApiError && entry.error.status === 404;
    return (
      <div>
        <Link to={href()} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> All entries
        </Link>
        <h1 className="mt-6 font-serif text-4xl font-medium">
          {missing ? 'Not at this point in the story' : 'This entry could not be opened'}
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          {missing
            ? 'There is no entry here for a reader who has read this far. It may appear later in the book, or it may not be public.'
            : 'Try again in a moment.'}
        </p>
      </div>
    );
  }
  if (!entry.data) return <PageSpinner />;
  const data = entry.data;
  const portrait = data.images.find((image) => image.isPortrait) ?? data.images[0];
  const others = data.images.filter((image) => image !== portrait);

  return (
    <article>
      <Link
        to={href()}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All entries
      </Link>

      <header className="mt-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <EntityIcon icon={data.type.icon} color={data.type.color} /> {data.type.name}
          <span aria-hidden="true">·</span>
          <span>
            {progress === READER_END
              ? 'As at the end of the story'
              : chapter
                ? `As of ${chapter.label}`
                : 'As at the start of the story'}
          </span>
        </p>
        <h1 className="mt-1 font-serif text-5xl font-medium leading-none">{data.name}</h1>
        {data.aliases.length ? (
          <p className="mt-2 text-muted-foreground">Also known as {data.aliases.join(', ')}</p>
        ) : null}
      </header>

      <div className="mt-6 gap-8 sm:flex">
        <div className="min-w-0 flex-1">
          {data.summary ? (
            <p className="font-serif text-[1.35rem] leading-snug">{data.summary}</p>
          ) : null}
          {hasRichText(data.body) ? (
            <RichTextView doc={data.body} className="prose-ink prose-manuscript mt-6" />
          ) : null}
        </div>

        <aside className="mt-8 shrink-0 space-y-6 sm:mt-0 sm:w-60">
          {portrait ? (
            <figure>
              <img
                src={wikiImageUrl(slug, portrait.id, 'file')}
                alt={portrait.caption || data.name}
                width={portrait.width}
                height={portrait.height}
                className="w-full rounded-lg border"
              />
              {portrait.caption ? (
                <figcaption className="mt-1 text-[13px] text-muted-foreground">
                  {portrait.caption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}
          {data.fields.length ? (
            <dl className="space-y-3 text-sm">
              {data.fields.map((field) => (
                <div key={field.key}>
                  <dt className="text-[13px] text-muted-foreground">{field.label}</dt>
                  <dd className="whitespace-pre-line">{field.text}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {data.links.length ? (
            <div className="text-sm">
              <h2 className="text-[13px] text-muted-foreground">Connections</h2>
              <ul className="mt-1 space-y-1.5">
                {data.links.map((link, index) => (
                  <li key={index}>
                    <span className="text-muted-foreground">{link.label}</span>{' '}
                    <Link
                      to={href(`/e/${link.other.id}`)}
                      className="font-medium underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                    >
                      {link.other.name}
                    </Link>
                    {link.notes ? (
                      <span className="block text-[13px] text-muted-foreground">{link.notes}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      {others.length ? (
        <section className="mt-10" aria-label="Pictures">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {others.map((image) => (
              <li key={image.id}>
                <a href={wikiImageUrl(slug, image.id, 'file')} target="_blank" rel="noreferrer">
                  <img
                    src={wikiImageUrl(slug, image.id, 'thumbnail')}
                    alt={image.caption || data.name}
                    loading="lazy"
                    className="aspect-square w-full rounded-lg border object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
