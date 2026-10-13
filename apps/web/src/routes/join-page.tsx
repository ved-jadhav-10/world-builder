import { useParams, Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { INVITE_ROLE_INFO } from '@atlas/shared';
import { ApiError, errorMessage } from '@/api/client';
import { useAcceptInvite, useInvitePreview } from '@/api/member-queries';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/misc';
import { signOut, useSession } from '@/lib/auth-client';

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Brand className="mb-8" />
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">{children}</div>
    </div>
  );
}

/** Where an invite link lands: say what it is for, then sign in or up and join. */
export function JoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);

  if (preview.isPending || session.isPending) {
    return (
      <JoinShell>
        <PageSpinner />
      </JoinShell>
    );
  }

  if (preview.isError) {
    const gone = preview.error instanceof ApiError && preview.error.status === 410;
    return (
      <JoinShell>
        <h1 className="font-serif text-2xl font-semibold">
          {gone ? 'This invite has run out' : "This invite doesn't work"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{errorMessage(preview.error)}</p>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link to="/">Go to your worlds</Link>
        </Button>
      </JoinShell>
    );
  }

  const { worldName, role, invitedBy } = preview.data;
  const info = INVITE_ROLE_INFO[role];
  const user = session.data?.user;
  const next = encodeURIComponent(`/join/${token}`);

  async function join() {
    try {
      const result = await accept.mutateAsync();
      toast.success(
        result.joined
          ? `You joined ${result.world.name}`
          : `You are already in ${result.world.name}`,
      );
      void navigate(`/w/${result.world.slug}`, { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <JoinShell>
      <p className="text-sm text-muted-foreground">{invitedBy} invited you to join</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold">{worldName}</h1>
      <div className="mt-5 rounded-lg bg-muted/60 p-3 text-sm">
        <p className="font-medium">You will join as: {info.label}</p>
        <p className="mt-1 text-muted-foreground">{info.description}</p>
      </div>

      {user ? (
        <div className="mt-6 space-y-3">
          <Button className="w-full" onClick={join} disabled={accept.isPending}>
            Join {worldName}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Joining as {user.name} ({user.email}). The owner of {worldName} will see your name and
            email.{' '}
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() => void signOut()}
            >
              Not you?
            </button>
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <Button asChild className="w-full">
            <Link to={`/sign-up?next=${next}`}>Create an account to join</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to={`/sign-in?next=${next}`}>I already have an account</Link>
          </Button>
        </div>
      )}
    </JoinShell>
  );
}
