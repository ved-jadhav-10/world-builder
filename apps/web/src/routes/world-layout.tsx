import {
  ChevronLeft,
  Library,
  Map as MapIcon,
  Menu,
  PenLine,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { useEntityTypes, useWorldBySlug } from '@/api/queries';
import { EntityIcon } from '@/components/entity-icon';
import { SearchPalette } from '@/components/search-palette';
import { Button } from '@/components/ui/button';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { UserMenu } from '@/components/user-menu';
import { cn } from '@/lib/utils';
import { buildWorldContext, WorldContext, type WorldContextValue } from '@/lib/world-context';

const navItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted',
    isActive && 'bg-accent font-medium text-accent-foreground hover:bg-accent',
  );

function ComingSoon({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/70">
      {icon}
      {label}
      <span className="ml-auto rounded-full border px-1.5 text-[10px] uppercase tracking-wide">
        Soon
      </span>
    </div>
  );
}

function Sidebar({ ctx, onSearch }: { ctx: WorldContextValue; onSearch: () => void }) {
  const { world, types, base, canEdit } = ctx;
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4 [&_svg]:size-4">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3!" /> All worlds
        </Link>
        <h2 className="mt-1 truncate font-serif text-xl font-semibold" title={world.name}>
          {world.name}
        </h2>
      </div>

      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground hover:border-primary/40"
      >
        <Search /> Search…
        <kbd className="ml-auto rounded border px-1.5 text-[11px]">Ctrl K</kbd>
      </button>

      <nav className="space-y-0.5">
        <NavLink to={base} end className={navItem}>
          <Library /> Codex
        </NavLink>
        <ComingSoon icon={<MapIcon />} label="Atlas" />
        <NavLink to={`${base}/manuscript`} className={navItem}>
          <PenLine /> Manuscript
        </NavLink>
      </nav>

      <nav className="space-y-0.5">
        <p className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Types
        </p>
        {types.map((type) => (
          <NavLink key={type.id} to={`${base}/codex/${type.key}`} className={navItem}>
            <EntityIcon icon={type.icon} color={type.color} />
            <span className="truncate">{type.name}</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {type.entityCount}
            </span>
          </NavLink>
        ))}
        {canEdit ? (
          <NavLink to={`${base}/settings/types`} className={navItem}>
            <SlidersHorizontal /> <span className="text-muted-foreground">Manage types</span>
          </NavLink>
        ) : null}
      </nav>

      <div className="mt-auto space-y-0.5">
        {canEdit ? (
          <>
            <NavLink to={`${base}/trash`} className={navItem}>
              <Trash2 /> Trash
            </NavLink>
            <NavLink to={`${base}/settings`} end className={navItem}>
              <Settings /> World settings
            </NavLink>
          </>
        ) : null}
        <div className="border-t pt-3">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}

export function WorldLayout() {
  const { slug = '' } = useParams();
  const worldQuery = useWorldBySlug(slug);
  const typesQuery = useEntityTypes(worldQuery.data?.id);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  // The mobile menu remembers the page it was opened on, so navigating closes it.
  const [navOpenOn, setNavOpenOn] = useState<string | null>(null);
  const navOpen = navOpenOn === pathname;
  const setNavOpen = (open: boolean) => setNavOpenOn(open ? pathname : null);

  const ctx = useMemo(
    () =>
      worldQuery.data && typesQuery.data
        ? buildWorldContext(worldQuery.data, typesQuery.data)
        : null,
    [worldQuery.data, typesQuery.data],
  );

  if (worldQuery.isError) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <EmptyState title="World not found">
          <p>It may have been deleted, or you may not have access.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/">Back to your worlds</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }
  if (!ctx) return <PageSpinner />;

  return (
    <WorldContext.Provider value={ctx}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r bg-sidebar lg:block">
          <Sidebar ctx={ctx} onSearch={() => setSearchOpen(true)} />
        </aside>

        {navOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-sidebar shadow-xl">
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-3 top-3"
                onClick={() => setNavOpen(false)}
              >
                <X />
                <span className="sr-only">Close menu</span>
              </Button>
              <Sidebar ctx={ctx} onSearch={() => setSearchOpen(true)} />
            </aside>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
            <Button variant="ghost" size="icon-sm" onClick={() => setNavOpen(true)}>
              <Menu />
              <span className="sr-only">Open menu</span>
            </Button>
            <span className="truncate font-serif font-semibold">{ctx.world.name}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={() => setSearchOpen(true)}
            >
              <Search />
              <span className="sr-only">Search</span>
            </Button>
          </header>
          <main
            className={cn(
              'mx-auto px-4 py-6 lg:px-10 lg:py-10',
              // Writing gets the full width for the contents, scene and Codex panel.
              pathname.startsWith(`${ctx.base}/manuscript`) ? 'max-w-[1600px]' : 'max-w-6xl',
            )}
          >
            <Outlet />
          </main>
        </div>
      </div>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </WorldContext.Provider>
  );
}
