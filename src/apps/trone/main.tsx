import '../../shared/preload-guard';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import './trone.css';
import Shell from './shell/Shell';
import { NAV } from './routes/index';
import { AuthGate } from './auth/AuthGate';

const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: NAV.flatMap((g) =>
      g.items.map((it) => ({
        path: it.path === '/' ? undefined : it.path.slice(1),
        index: it.path === '/',
        element: <it.Component />,
      }))
    ),
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>
  </StrictMode>
);
