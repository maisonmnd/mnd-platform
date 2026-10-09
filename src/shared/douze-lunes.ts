import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { SEUIL_GRAINE_DEFAUT, type ReglageDesLunes } from './douze-lunes-pur';

/* DE MAIN EN MAIN — 9 octobre 2026. Le réglage du programme : N (les
   visites qui font une Graine) et l'instant du lancement. Un document À
   PART de `mnd_parrainage` : Ma Couronne doit lire N pour dire « votre
   Graine dans n visites », alors que `mnd_parrainage` porte des phrases
   réservées au personnel ; et la garde en base (0124) lit `lanceLe` ici.
   Écrit par le Trône (geste de lancement, réglage de N), lu par les
   clientes connectées grâce à la politique `docs_douze_lunes_read`. Les
   juges vivent dans `douze-lunes-pur`. */
export const REGLAGE_DES_LUNES_DEFAUT: ReglageDesLunes = { seuilGraine: SEUIL_GRAINE_DEFAUT };

export const douzeLunesStore = createStore<ReglageDesLunes>('mnd_douze_lunes', REGLAGE_DES_LUNES_DEFAUT);
export const useDouzeLunes = () => useStore(douzeLunesStore);
bindDocument(douzeLunesStore, 'mnd_douze_lunes');
