import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './certificat.css';
import App from './App';
import { PorteDeLEquipe } from '../../shared/porte-de-l-equipe';

/* LE CERTIFICAT SE DRESSE PAR L'ÉQUIPE CONNECTÉE SEULE — 17 novembre 2026.
   Dresser un certificat de l'Académie MND est un geste de l'équipe. Le
   Suivi de l'Académie ouvre cette page dans un onglet, sur la même origine,
   donc avec la session du Trône ; ce qui part chez l'apprenant est le
   papier ou son PDF, jamais ce lien. Elle s'ouvre à une session du
   personnel ; qui n'en est pas est menée à l'Académie, qui vérifie les
   certificats. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PorteDeLEquipe page="certificat">
      <App />
    </PorteDeLEquipe>
  </StrictMode>
);
