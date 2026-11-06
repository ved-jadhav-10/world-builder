import {
  CalendarRange,
  ChevronLeft,
  ClipboardList,
  ListChecks,
  MessageSquare,
  Dices,
  FileImage,
  Images,
  LogOut,
  LayoutDashboard,
  Library,
  Map as MapIcon,
  Menu,
  Network,
  NotebookPen,
  PenLine,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  SpellCheck,
  Spline,
  SlidersHorizontal,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { hasRole } from '@atlas/shared';
import { useMemo, useState } from 'react';
import { HandoutAlert } from '@/components/handout-alert';
import { SprintRunner } from '@/components/sprint-runner';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useLeaveWorld } from '@/api/member-queries';
import { useEntityTypes, useWorldBySlug } from '@/api/queries';
import { useCalendar } from '@/api/timeline-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityIcon } from '@/components/entity-icon';
import { SearchPalette } from '@/components/search-palette';
import { Button } from '@/components/ui/button';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { UserMenu } from '@/components/user-menu';
import { PreviewBanner, ViewAsSwitcher } from '@/components/view-as-switcher';
import { cn } from '@/lib/utils';
import { useViewAs } from '@/lib/view-as';
import { buildWorldContext, WorldContext, type WorldContextValue } from '@/lib/world-context';

const navItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted',
    isActive && 'bg-accent font-medium text-accent-foreground hover:bg-accent',
  );

/** For anyone who was invited: step out of the world. The owner can't, since it would have none. */
function LeaveWorld({ ctx }: { ctx: WorldContextValue }) {
  const { world } = ctx;
  const leave = useLeaveWorld(world.id);
  const navigate = useNavigate();
  return (
    <ConfirmDialog
      title={`Leave ${world.name}?`}
      description="You will lose access to it. You can come back if someone sends you a new invite link."
      confirmLabel="Leave world"
      onConfirm={async () => {
        try {
          await leave.mutateAsync();
          toast.success(`You left ${world.name}`);
          void navigate('/', { replace: true });
        } catch (error) {
          toast.error(errorMessage(error));
        }
      }}
      trigger={
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut /> Leave world
        </button>
      }
    />
  );
}

function Sidebar({ ctx, onSearch }: { ctx: WorldContextValue; onSearch: () => void }) {
  const { world, types, base, canEdit, audience } = ctx;
  // Comments are for the owner, co-GMs and commenters, and never shown in a preview.
  const canComment = hasRole(world.role, 'commenter') && !ctx.previewing;
  // Only someone who can edit has a GM view to switch away from (and back to).
  const isGm = world.role === 'owner' || world.role === 'editor';
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

      {isGm ? <ViewAsSwitcher /> : null}

      <nav className="space-y-0.5">
        <NavLink to={base} end className={navItem}>
          <Library /> Codex
        </NavLink>
        <NavLink to={`${base}/atlas`} className={navItem}>
          <MapIcon /> Atlas
        </NavLink>
        {audience === 'gm' ? (
          <>
            <NavLink to={`${base}/manuscript`} className={navItem}>
              <PenLine /> Manuscript
            </NavLink>
            <NavLink to={`${base}/writing`} className={navItem}>
              <Target /> Writing goals
            </NavLink>
            <NavLink to={`${base}/word-check`} className={navItem}>
              <SpellCheck /> Word check
            </NavLink>
            <NavLink to={`${base}/arcs`} className={navItem}>
              <Spline /> Arc tracker
            </NavLink>
            <NavLink to={`${base}/plot`} className={navItem}>
              <ClipboardList /> Plot boards
            </NavLink>
            <NavLink to={`${base}/todos`} className={navItem}>
              <ListChecks /> To-do
            </NavLink>
            <NavLink to={`${base}/continuity`} className={navItem}>
              <ShieldCheck /> Continuity
            </NavLink>
          </>
        ) : null}
        {canComment ? (
          <NavLink to={`${base}/comments`} className={navItem}>
            <MessageSquare /> Comments
          </NavLink>
        ) : null}
        <NavLink to={`${base}/timeline`} className={navItem}>
          <CalendarRange /> Timeline
        </NavLink>
        <NavLink to={`${base}/graph`} className={navItem}>
          <Network /> Graph
        </NavLink>
        <NavLink to={`${base}/quests`} className={navItem}>
          <ScrollText /> Quests
        </NavLink>
        {audience === 'gm' ? (
          <NavLink to={`${base}/screen`} className={navItem}>
            <LayoutDashboard /> GM screen
          </NavLink>
        ) : null}
        {audience === 'gm' || audience === 'player' ? (
          <>
            <NavLink to={`${base}/handouts`} className={navItem}>
              <FileImage /> Handouts
            </NavLink>
            <NavLink to={`${base}/sessions`} className={navItem}>
              <NotebookPen /> Sessions
            </NavLink>
            <NavLink to={`${base}/tables`} className={navItem}>
              <Dices /> Tables & dice
            </NavLink>
          </>
        ) : null}
        <NavLink to={`${base}/gallery`} className={navItem}>
          <Images /> Gallery
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
        {world.role !== 'owner' ? <LeaveWorld ctx={ctx} /> : null}
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
  const calendarQuery = useCalendar(worldQuery.data?.id);
  const viewAs = useViewAs();
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  // The mobile menu remembers the page it was opened on, so navigating closes it.
  const [navOpenOn, setNavOpenOn] = useState<string | null>(null);
  const navOpen = navOpenOn === pathname;
  const setNavOpen = (open: boolean) => setNavOpenOn(open ? pathname : null);

  const ctx = useMemo(
    () =>
      worldQuery.data && typesQuery.data && calendarQuery.data
        ? buildWorldContext(worldQuery.data, typesQuery.data, calendarQuery.data.definition, viewAs)
        : null,
    [worldQuery.data, typesQuery.data, calendarQuery.data, viewAs],
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
  const isMapView = pathname.startsWith(`${ctx.base}/atlas/`);

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
              'mx-auto',
              // An open map fills the screen; the map list reads like the other pages.
              isMapView ? 'max-w-none' : 'px-4 py-6 lg:px-10 lg:py-10',
              // Writing gets the full width for the contents, scene and Codex panel.
              !isMapView &&
                (pathname.startsWith(`${ctx.base}/manuscript`) ? 'max-w-[1600px]' : 'max-w-6xl'),
            )}
          >
            <Outlet />
          </main>
        </div>
      </div>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      {ctx.audience === 'gm' && ctx.canEdit ? <SprintRunner /> : null}
      {ctx.audience === 'player' && !ctx.previewing ? <HandoutAlert /> : null}
      {ctx.previewing && viewAs ? <PreviewBanner audience={viewAs} /> : null}
    </WorldContext.Provider>
  );
}
