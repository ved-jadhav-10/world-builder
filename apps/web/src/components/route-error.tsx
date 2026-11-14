import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';

/** A whole-page message for a wrong address or a crash, set beside Ortelius's sea monsters. */
export function ErrorScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <AuthShell chart="islandia">
      <h1 className="font-serif text-4xl font-medium">{title}</h1>
      <p className="mt-3 text-muted-foreground">{detail}</p>
      <div className="mt-8">
        <Button asChild>
          <Link to="/">Back to safe waters</Link>
        </Button>
      </div>
    </AuthShell>
  );
}

export function NotFoundScreen() {
  return (
    <ErrorScreen
      title="Off the edge of the map"
      detail="There is nothing at this address. It may have moved, or the link may be mistyped."
    />
  );
}

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundScreen />;
  console.error(error);
  return (
    <ErrorScreen
      title="Something went wrong"
      detail="The page ran into a problem. Reloading usually sorts it out; your saved work is safe."
    />
  );
}
