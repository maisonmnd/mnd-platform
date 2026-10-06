import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import { TABLE_CLOTURES, TABLE_POINTAGES, type Cloture, type Pointage } from './caisse-du-soir-pur';

/* Les magasins du pointage du jour et des clôtures de tiroir — 3 octobre
   2026. Les règles vivent dans `caisse-du-soir-pur.ts` ; les tables et leurs
   gardes dans la migration 0113 (seule la direction décide d'un écart, et
   une clôture ne s'efface pas). */
export const pointagesStore = createStore<Pointage[]>('mnd_pointages', []);
export const usePointages = () => useStore(pointagesStore);
bindCollection(pointagesStore, TABLE_POINTAGES);

export const cloturesStore = createStore<Cloture[]>('mnd_clotures_caisse', []);
export const useClotures = () => useStore(cloturesStore);
bindCollection(cloturesStore, TABLE_CLOTURES);
