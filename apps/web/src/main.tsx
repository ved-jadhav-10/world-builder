import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from 'sonner';
import { ApiError } from '@/api/client';
import { router } from '@/router';
import './index.css';

/** A lapsed session anywhere sends the user back to sign in. */
function onApiError(error: unknown) {
  if (
    error instanceof ApiError &&
    error.status === 401 &&
    !location.pathname.startsWith('/sign-')
  ) {
    void router.navigate(`/sign-in?next=${encodeURIComponent(location.pathname)}`);
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Client errors (404, 403…) won't fix themselves; only retry server/network trouble.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  </StrictMode>,
);
