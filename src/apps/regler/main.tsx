import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './regler.css';
import App from './App';
import { Comptoir } from './Mtn';

/* LE QR DU COMPTOIR (11 novembre 2026, « Régler par MTN, QR ») ouvre
   regler.html?comptoir : la cliente tape son numéro MTN, sans lien à elle. */
const auComptoir = new URLSearchParams(window.location.search).has('comptoir');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {auComptoir ? <Comptoir /> : <App />}
  </StrictMode>
);
