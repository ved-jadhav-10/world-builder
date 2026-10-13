import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { PageSpinner } from '@/components/ui/misc';
import { useSession } from '@/lib/auth-client';
import { safeNext } from '@/lib/utils';

/** Gates signed-in routes; sends visitors to sign in and back afterwards. */
export function RequireAuth() {
  const { data: session, isPending } = useSession();
  const location = useLocation();
  if (isPending) return <PageSpinner />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** For sign-in/up pages: already signed-in users go straight on to where they were headed. */
export function RedirectIfSignedIn() {
  const { data: session, isPending } = useSession();
  const [params] = useSearchParams();
  if (isPending) return <PageSpinner />;
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}
