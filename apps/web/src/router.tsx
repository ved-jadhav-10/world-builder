import { createBrowserRouter } from 'react-router';
import { RedirectIfSignedIn, RequireAuth } from '@/components/require-auth';
import { NotFoundScreen, RouteError } from '@/components/route-error';
import { AtlasIndexPage } from '@/routes/atlas-pages';
import { SignInPage, SignUpPage } from '@/routes/auth-pages';
import { CodexHome, EntityListPage } from '@/routes/codex-pages';
import { TrashPage } from '@/routes/trash-page';
import { WorldLayout } from '@/routes/world-layout';
import { WorldSettingsPage } from '@/routes/world-settings-page';
import { WorldsPage } from '@/routes/worlds-page';

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <RedirectIfSignedIn />,
        children: [
          { path: '/sign-in', element: <SignInPage /> },
          { path: '/sign-up', element: <SignUpPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <WorldsPage /> },
          {
            path: '/w/:slug',
            element: <WorldLayout />,
            children: [
              { index: true, element: <CodexHome /> },
              { path: 'codex/:typeKey', element: <EntityListPage /> },
              // The editor-heavy pages load on demand to keep the first load small.
              { path: 'e/:entityId', lazy: () => import('@/routes/entity-page') },
              { path: 'atlas', element: <AtlasIndexPage /> },
              { path: 'atlas/:mapId', lazy: () => import('@/routes/map-page') },
              { path: 'trash', element: <TrashPage /> },
              { path: 'settings', element: <WorldSettingsPage /> },
              { path: 'settings/types', lazy: () => import('@/routes/types-settings-page') },
              {
                path: 'manuscript',
                lazy: () => import('@/routes/manuscript-layout'),
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import('@/routes/manuscript-layout')).ManuscriptHome,
                    }),
                  },
                  { path: 's/:sceneId', lazy: () => import('@/routes/scene-page') },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);
