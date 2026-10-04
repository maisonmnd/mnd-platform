import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lokaa.css';
import App from './App';
import { registerSW } from '../../shared/push';

/* L'APPLICATION RESTE SUR LE TÉLÉPHONE (4 octobre 2026, « hors ligne », temps 2) :
   le service s'enregistre dès l'ouverture, pas seulement quand on règle les
   notifications. C'est lui qui ouvre l'application sans réseau. */
void registerSW();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
