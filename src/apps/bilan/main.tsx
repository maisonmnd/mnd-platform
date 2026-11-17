import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './bilan.css';
import App from './App';
import { PorteDeLEquipe } from '../../shared/porte-de-l-equipe';

/* LA PAPETERIE DU BILAN, POUR L'ÉQUIPE CONNECTÉE SEULE — 17 novembre 2026.
   Cette page compose et imprime un bilan de séance sur le papier de la
   Maison. Aucun lien vers elle n'est jamais parti chez une cliente : le
   Trône l'ouvrait dans un onglet pour imprimer, et depuis le 4 octobre 2026
   le bilan se remet en PDF et se lit dans Ma Couronne. Elle ne s'ouvre plus
   qu'à une session du personnel ; qui n'en est pas est menée à Ma Couronne,
   où la Maison remet les bilans. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PorteDeLEquipe page="bilan">
      <App />
    </PorteDeLEquipe>
  </StrictMode>
);
