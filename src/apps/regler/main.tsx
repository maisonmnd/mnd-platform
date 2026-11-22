import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './regler.css';
import App from './App';
import { Comptoir } from './Mtn';
import { Etoiles } from './Etoiles';

/* LE QR DU COMPTOIR (11 novembre 2026, « Régler par MTN, QR ») ouvre
   regler.html?comptoir : la cliente tape son numéro MTN, sans lien à elle. */
const auComptoir = new URLSearchParams(window.location.search).has('comptoir');
/* VOS ÉTOILES (22 novembre 2026) : regler.html?e=<jeton>, ouverte par le bouton de son message. */
const etoiles = new URLSearchParams(window.location.search).get('e');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {etoiles !== null ? <Etoiles jeton={etoiles} /> : auComptoir ? <Comptoir /> : <App />}
  </StrictMode>
);
