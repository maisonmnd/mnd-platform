import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tpe.css';
import App from './App';

/* LE TPE DE POCHE (25 novembre 2026) : tpe.html, à côté du Trône servi.
   tpe.html?a=<code> active le téléphone (le QR que la direction montre au
   Trône) ; ensuite, la page ouvre la liste du jour derrière le code secret. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
