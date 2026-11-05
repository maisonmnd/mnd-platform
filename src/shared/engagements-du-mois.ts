import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { CLE_DES_ENGAGEMENTS, type EngagementDuMois } from './engagements-du-mois-pur';

/* LES ENGAGEMENTS DE CHAQUE MOIS, gardés — 5 novembre 2026. Un document de
   la table `documents`, sans migration, comme les porteurs et les
   prestataires : la même lecture que les dépenses (le personnel), la
   direction seule les écrit à l'écran. Les règles : engagements-du-mois-pur. */
export const engagementsDuMoisStore = createStore<EngagementDuMois[]>(CLE_DES_ENGAGEMENTS, []);
bindDocument(engagementsDuMoisStore, CLE_DES_ENGAGEMENTS);
export const useEngagementsDuMois = () => useStore(engagementsDuMoisStore);
