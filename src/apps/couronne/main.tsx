import '../../shared/preload-guard';
/* La mise à jour automatique — écrite le 2 août, JAMAIS branchée jusqu'au
   14 : une app installée repartait de sa copie et ne voyait aucun
   déploiement. L'import suffit : le module s'arme tout seul. */
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './couronne.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
