import { lazy, Suspense } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { PageSpinner } from '@/components/ui/misc';
import { useSession } from '@/lib/auth-client';
import { WorldsPage } from '@/routes/worlds-page';
import { safeNext } from '@/lib/utils';

// Only visitors need the front page, so it stays out of the signed-in bundle.
const LandingPage = lazy(() =>
  import('@/routes/landing-page').then((module) => ({ default: module.LandingPage })),
);

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

/** The address "/": the list of worlds for someone signed in, the front page for a visitor. */
export function HomeGate() {
  const { data: session, isPending } = useSession();
  if (isPending) return <PageSpinner />;
  if (session) return <WorldsPage />;
  return (
    <Suspense fallback={<PageSpinner />}>
      <LandingPage />
    </Suspense>
  );
}
