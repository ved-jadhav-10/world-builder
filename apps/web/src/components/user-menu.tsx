import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { signOut, useSession } from '@/lib/auth-client';

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
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
        {session.user.name.slice(0, 1).toUpperCase()}
      </div>
      <span className="truncate text-sm">{session.user.name}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleSignOut}
        title="Sign out"
        className="ml-auto"
      >
        <LogOut />
        <span className="sr-only">Sign out</span>
      </Button>
    </div>
  );
}
