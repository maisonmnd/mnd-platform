import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './consultation.css';
import { PorteDeLEquipe } from '../../shared/porte-de-l-equipe';

/* L'ANCIEN TUNNEL, POUR L'ÉQUIPE CONNECTÉE SEULE — 17 novembre 2026.
   « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV »
   (Yéman). La « Consultation Souveraine » est un outil de la Maison : son
   diagnostic, sa projection et son protocole se remettent au rendez-vous.
   La consultation des clientes est celle du site (/consultation/) : une
   visiteuse qui a gardé cette adresse y est menée. Le code du tunnel
   n'arrive qu'une fois la session du personnel reconnue. */
const Tunnel = lazy(() => import('./App'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PorteDeLEquipe page="tunnel">
      <Suspense fallback={null}>
        <Tunnel />
      </Suspense>
    </PorteDeLEquipe>
  </StrictMode>
);
