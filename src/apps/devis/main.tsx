import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './devis.css';
import App from './App';

/* LE DEVIS EN DIRECT — 22 novembre 2026. La page s'ouvre par son jeton
   (`devis.html?d=<jeton>`), que le bouton de son message porte
   (`payer.html?tg=d-<jeton>`). Rien d'autre à router ici : un devis, une
   page. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
