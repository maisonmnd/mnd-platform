import '../../shared/preload-guard';
/* La mise à jour automatique (2 août) — branchée le 14 : sans cet import,
   une app installée ne voyait jamais un déploiement. */
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import './trone.css';
import Shell from './shell/Shell';
import { ErreurDEcran } from './shell/ErreurDEcran';
import { NAV } from './routes/index';
import { AuthGate } from './auth/AuthGate';
import { applyPendingReplace } from './backup';
import { migreLaRaisonDeLaMaison, migreLeNomDeLaBranche, migreLeNomDeLaMaison } from '../../shared/identite';
import { registerSW } from '../../shared/push';
import { migreLesFormulesAZero } from '../../shared/abonnements';
import { migreLaNouvelleGrille } from '../../shared/nouvelle-grille';
import { migreLesFormulesEnLunes } from '../../shared/formules-en-lunes';

/* L'APPLICATION RESTE SUR LE TÉLÉPHONE (4 octobre 2026, « hors ligne », temps 2) :
   le service s'enregistre dès l'ouverture, pas seulement quand on règle les
   notifications. C'est lui qui ouvre l'application sans réseau. */
void registerSW();

/* LE NOM DE LA MAISON, corrigé une fois — 23 septembre 2026. Déclenchée ici,
   dans le seul Trône : le module d'identité est partagé par sept
   applications, et une migration des données de la Maison n'a rien à faire
   dans le navigateur d'une cliente. Elle expire fin 2026. */
migreLeNomDeLaMaison();
migreLeNomDeLaBranche();
/* LE REGISTRE DE LA MAISON — 10 octobre 2026. La raison stockée qui dit
   encore ACIA 1 passe au registre de Maison MND ; l'employeur garde ACIA 1.
   Une fois, depuis le Trône seul, morte fin 2026. Les mentions du
   Secrétariat, elles, se corrigent à l'ouverture du Secrétariat : charger
   ici sa table, signatures comprises, alourdirait chaque démarrage. */
migreLaRaisonDeLaMaison();
/* LES SIX FORMULES À 0 F — 10 octobre 2026 (la genèse des prix, « Fermer
   aujourd'hui ») : fermées à la vente une fois, depuis le Trône seul, jamais
   effacées ; leurs contrats en cours les lisent toujours. */
migreLesFormulesAZero();
/* LA NOUVELLE GRILLE — 10 octobre 2026 (« construis ») : la phase
   « maintenant » de la genèse des prix (noms, archives, baisses, nouveautés au
   comptoir), une fois, depuis le Trône seul. Voir shared/nouvelle-grille. */
migreLaNouvelleGrille();
/* LES SEPT FORMULES EN LUNES — 10 octobre 2026 (lot 2) : nées une fois,
   au comptoir pour le pilote, masquées de Ma Couronne jusqu'en janvier. */
migreLesFormulesEnLunes();

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
        /* Un écran qui ne s'ouvre pas le dit, la barre reste (4 oct. 2026). */
        errorElement: <ErreurDEcran />,
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
