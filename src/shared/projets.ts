import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { Projet } from './projets-pur';

/* LES PROJETS, PARTAGÉS — 24 octobre 2026. Un seul document pour toute la
   Maison : deux personnes seulement les ouvrent et les changent (les
   souverains), et un projet ne porte que son nom, son pilote, ses dates et
   ses jalons. Les tâches vivent dans le Fil (`fil_messages`, champ
   `projetId`) ; rien ne les recopie ici. Les règles : `projets-pur.ts`. */
export const projetsStore = createStore<Projet[]>('mnd_projets', []);
export const useProjets = () => useStore(projetsStore);
bindDocument(projetsStore, 'mnd_projets');
