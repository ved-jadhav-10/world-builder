import {
  CalendarRange,
  CircleUserRound,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  ListChecks,
  ListTree,
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
  Handshake,
  SpellCheck,
  Spline,
  SlidersHorizontal,
  Target,
  Trash2,
  X,
  type LucideIcon,
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
import { AmbienceControl } from '@/components/ambience-control';
import { BrandMark } from '@/components/brand';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityIcon } from '@/components/entity-icon';
import { SearchPalette } from '@/components/search-palette';
import { ShortcutsDialog } from '@/components/shortcuts-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { UserMenu } from '@/components/user-menu';
import { PreviewBanner, ViewAsSwitcher } from '@/components/view-as-switcher';
import { isPopoutPath } from '@/lib/popout';
import { useWorldShortcuts } from '@/lib/use-shortcuts';
import { cn } from '@/lib/utils';
import { useViewAs } from '@/lib/view-as';
import { buildWorldContext, WorldContext, type WorldContextValue } from '@/lib/world-context';

const navItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-foreground',
    isActive && 'bg-muted font-medium text-foreground',
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

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** A titled group of links that folds away; the choice is remembered on this device. */
function NavGroup({ id, title, items }: { id: string; title: string; items: NavEntry[] }) {
  const storageKey = `atlas-nav-${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== 'closed';
    } catch {
      return true;
    }
  });
  const { pathname } = useLocation();
  if (!items.length) return null;
  // A folded group still shows the page you are on, so you never lose your place.
  const shown = open ? items : items.filter((item) => pathname.startsWith(item.to));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(storageKey, next ? 'open' : 'closed');
    } catch {
      // Not remembered in a private window; it still folds for this visit.
    }
  };
  return (
    <nav className="space-y-0.5" aria-label={title}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1 rounded-md px-2.5 py-1 text-left text-[13px] text-muted-foreground hover:text-foreground"
      >
        {title}
        <ChevronDown
          className={cn('ml-auto size-3.5! transition-transform', !open && '-rotate-90')}
        />
      </button>
      {shown.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={navItem}>
          <item.icon /> {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Sidebar({ ctx, onSearch }: { ctx: WorldContextValue; onSearch: () => void }) {
  const { world, types, base, canEdit, audience } = ctx;
  // Comments are for the owner, co-GMs and commenters, and never shown in a preview.
  const canComment = hasRole(world.role, 'commenter') && !ctx.previewing;
  // Only someone who can edit has a GM view to switch away from (and back to).
  const isGm = world.role === 'owner' || world.role === 'editor';
  const gm = audience === 'gm';
  const atTable = gm || audience === 'player';

  // The four views of one world come first; the rest is grouped by what you are doing.
  const views: NavEntry[] = [
    { to: base, label: 'Codex', icon: Library, end: true },
    { to: `${base}/atlas`, label: 'Atlas', icon: MapIcon },
    ...(gm ? [{ to: `${base}/manuscript`, label: 'Manuscript', icon: PenLine }] : []),
    { to: `${base}/timeline`, label: 'Timeline', icon: CalendarRange },
  ];
  const write: NavEntry[] = [
    ...(gm
      ? [
          { to: `${base}/plot`, label: 'Plot boards', icon: ClipboardList },
          { to: `${base}/arcs`, label: 'Arc tracker', icon: Spline },
          { to: `${base}/writing`, label: 'Writing goals', icon: Target },
          { to: `${base}/word-check`, label: 'Word check', icon: SpellCheck },
          { to: `${base}/continuity`, label: 'Continuity', icon: ShieldCheck },
          { to: `${base}/todos`, label: 'To-do', icon: ListChecks },
        ]
      : []),
    ...(canComment ? [{ to: `${base}/comments`, label: 'Comments', icon: MessageSquare }] : []),
  ];
  const explore: NavEntry[] = [
    { to: `${base}/tree`, label: 'Content tree', icon: ListTree },
    { to: `${base}/graph`, label: 'Graph', icon: Network },
    { to: `${base}/diplomacy`, label: 'Diplomacy', icon: Handshake },
    { to: `${base}/gallery`, label: 'Gallery', icon: Images },
  ];
  const play: NavEntry[] = [
    { to: `${base}/quests`, label: 'Quests', icon: ScrollText },
    ...(gm ? [{ to: `${base}/screen`, label: 'GM screen', icon: LayoutDashboard }] : []),
    ...(atTable
      ? [
          { to: `${base}/sessions`, label: 'Sessions', icon: NotebookPen },
          { to: `${base}/handouts`, label: 'Handouts', icon: FileImage },
          { to: `${base}/tables`, label: 'Tables & dice', icon: Dices },
        ]
      : []),
    ...(gm ? [{ to: `${base}/tokens`, label: 'Token maker', icon: CircleUserRound }] : []),
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3 [&_svg]:size-4">
      <div className="px-1.5 pt-1">
        <Link to="/" className="inline-flex items-center gap-1.5" title="All worlds">
          <BrandMark className="size-5!" />
          <span className="font-serif text-[15px] text-muted-foreground">Atlas &amp; Ink</span>
        </Link>
        <h2
          className="mt-2 truncate font-serif text-[1.7rem] font-medium leading-tight"
          title={world.name}
        >
          {world.name}
        </h2>
        <Link
          to="/"
          className="inline-flex items-center gap-0.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5!" /> All worlds
        </Link>
      </div>

      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 shrink-0 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground hover:border-input"
      >
        <Search /> Search…
        <kbd className="ml-auto rounded border px-1.5 font-sans text-[11px]">Ctrl K</kbd>
      </button>

      {isGm ? <ViewAsSwitcher /> : null}

      <nav className="space-y-0.5" aria-label="Views">
        {views.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navItem}>
            <item.icon /> {item.label}
          </NavLink>
        ))}
      </nav>

      <NavGroup id="write" title="Write" items={write} />
      <NavGroup id="explore" title="Explore" items={explore} />
      <NavGroup id="play" title="Play" items={play} />

      <nav className="space-y-0.5" aria-label="Entry types">
        <p className="px-2.5 py-1 text-[13px] text-muted-foreground">Entry types</p>
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
        <div className="mt-2 space-y-0.5 border-t pt-2">
          <AmbienceControl />
          <UserMenu />
        </div>
      </div>
    </div>
  );
}

/** Registers the keyboard shortcuts; it renders nothing. */
function Shortcuts({
  ctx,
  onSearch,
  onHelp,
}: {
  ctx: WorldContextValue;
  onSearch: () => void;
  onHelp: () => void;
}) {
  useWorldShortcuts(
    { base: ctx.base, isGm: ctx.audience === 'gm', canEdit: ctx.canEdit },
    { onSearch, onHelp },
  );
  return null;
}

export function WorldLayout() {
  const { slug = '' } = useParams();
  const worldQuery = useWorldBySlug(slug);
  const typesQuery = useEntityTypes(worldQuery.data?.id);
  const calendarQuery = useCalendar(worldQuery.data?.id);
  const viewAs = useViewAs();
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
  // A pop-out is one entry in a small window: no sidebar, but the same world behind it.
  if (isPopoutPath(pathname, ctx.base)) {
    return (
      <WorldContext.Provider value={ctx}>
        <main className="mx-auto max-w-3xl px-4 py-5">
          <Outlet />
        </main>
        {ctx.previewing && viewAs ? <PreviewBanner audience={viewAs} /> : null}
      </WorldContext.Provider>
    );
  }
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
            <span className="ml-auto">
              <AmbienceControl variant="icon" />
            </span>
            <Button variant="ghost" size="icon-sm" onClick={() => setSearchOpen(true)}>
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
      <ShortcutsDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        ctx={{ isGm: ctx.audience === 'gm', canEdit: ctx.canEdit }}
      />
      <Shortcuts ctx={ctx} onSearch={() => setSearchOpen(true)} onHelp={() => setHelpOpen(true)} />
      {ctx.audience === 'gm' && ctx.canEdit ? <SprintRunner /> : null}
      {ctx.audience === 'player' && !ctx.previewing ? <HandoutAlert /> : null}
      {ctx.previewing && viewAs ? <PreviewBanner audience={viewAs} /> : null}
    </WorldContext.Provider>
  );
}
