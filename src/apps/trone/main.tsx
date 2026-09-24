import '../../shared/preload-guard';
/* La mise à jour automatique (2 août) — branchée le 14 : sans cet import,
   une app installée ne voyait jamais un déploiement. */
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import './trone.css';
import Shell from './shell/Shell';
import { NAV } from './routes/index';
import { AuthGate } from './auth/AuthGate';
import { applyPendingReplace } from './backup';
import { migreLeNomDeLaBranche, migreLeNomDeLaMaison } from '../../shared/identite';

/* LE NOM DE LA MAISON, corrigé une fois — 23 septembre 2026. Déclenchée ici,
   dans le seul Trône : le module d'identité est partagé par sept
   applications, et une migration des données de la Maison n'a rien à faire
   dans le navigateur d'une cliente. Elle expire fin 2026. */
migreLeNomDeLaMaison();
migreLeNomDeLaBranche();

// « Remplacer la Maison » : après le redémarrage à blanc, appliquer le fichier en
// attente sur les magasins vides AVANT le premier rendu (la synchro poussera au serveur).
applyPendingReplace();

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
