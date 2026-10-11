import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export function ErrorScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <EmptyState title={title}>
        <p>{detail}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">Go home</Link>
        </Button>
      </EmptyState>
    </div>
  );
}

export function NotFoundScreen() {
  return <ErrorScreen title="Page not found" detail="There's nothing at this address." />;
}

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundScreen />;
  console.error(error);
  return <ErrorScreen title="Something went wrong" detail="Try reloading the page." />;
}
