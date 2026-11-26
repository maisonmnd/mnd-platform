import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tpe.css';
import App from './App';
import { CHEMIN_DU_TERMINAL } from '../../shared/tpe-de-poche-pur';

/* LE TPE DE POCHE (25 novembre 2026) : tpe.html, à côté du Trône servi.
   tpe.html?a=<code> active le téléphone (le QR que la direction montre au
   Trône) ; ensuite, la page ouvre la liste du jour derrière le code secret. */
/* L'ANCIENNE ADRESSE RENVOIE À LA NOUVELLE (26 novembre 2026). Trône Terminal
   a quitté /trone/ pour le portail (CHEMIN_DU_TERMINAL) : l'app Le Trône
   captait /trone/ sur Android. Un QR, un favori ou une app installée depuis
   /trone/tpe.html y arrive encore : la page part aussitôt à la nouvelle
   adresse, avec son code. Le jeton du téléphone suit (même origine). */
const ancienne = !import.meta.env.DEV && window.location.pathname.startsWith('/trone/');
if (ancienne) {
  window.location.replace(`${CHEMIN_DU_TERMINAL}tpe.html${window.location.search}`);
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
