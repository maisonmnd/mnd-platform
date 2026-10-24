import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { Passage, Processus } from './processus-pur';

/* LES PROCESSUS ET LEURS PASSAGES, PARTAGÉS — 24 octobre 2026. Deux
   documents : ce que la direction a construit (et les agents qu'elle a
   réglés), et les listes que chaque passage a posées dans « À valider ».
   Un passage porte un identifiant tiré de son processus et de son créneau :
   deux postes ouverts au même moment écrivent la même ligne, pas deux.
   Les règles : `processus-pur.ts`. */
export const processusStore = createStore<Processus[]>('mnd_processus', []);
export const useProcessusStore = () => useStore(processusStore);
bindDocument(processusStore, 'mnd_processus');

export const passagesStore = createStore<Passage[]>('mnd_processus_passages', []);
export const usePassagesStore = () => useStore(passagesStore);
bindDocument(passagesStore, 'mnd_processus_passages');
