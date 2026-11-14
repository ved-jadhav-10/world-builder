import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut, useSession } from '@/lib/auth-client';
import {
  setThemeChoice,
  THEME_CHOICES,
  THEME_LABELS,
  useThemeChoice,
  type ThemeChoice,
} from '@/lib/theme';

const THEME_ICONS: Record<ThemeChoice, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

/** The three theme choices as menu rows; shared by the user menu and the signed-out pages. */
export function ThemeMenuItems() {
  const choice = useThemeChoice();
  return (
    <>
      {THEME_CHOICES.map((option) => {
        const Icon = THEME_ICONS[option];
        return (
          <DropdownMenuItem
            key={option}
            onSelect={(event) => {
              // Keep the menu open, so the change is seen before it closes.
              event.preventDefault();
              setThemeChoice(option);
            }}
          >
            <Icon /> {THEME_LABELS[option]}
            {choice === option ? <Check className="ml-auto text-primary" /> : null}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export function UserMenu() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (!session) return null;

  async function handleSignOut() {
    await signOut();
    queryClient.clear();
    void navigate('/sign-in');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
        aria-label={`Account menu for ${session.user.name}`}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-[15px] font-medium text-ink-foreground">
          {session.user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate">{session.user.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link to="/account">
            <UserRound /> Your account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
