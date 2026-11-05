import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { CLE_DES_ENGAGEMENTS, type EngagementDuMois } from './engagements-du-mois-pur';

/* LES ENGAGEMENTS DE CHAQUE MOIS, gardés — 5 novembre 2026. Un document de
   la table `documents`, comme les porteurs et les prestataires. « Direction
   seule » (Yéman, 5 novembre 2026) : la base ne le montre qu'à la direction,
   souverain et gérant (0160, une règle restrictive sur cette seule clé). Pour
   un compte de l'équipe la ligne n'existe pas : rien ne descend, son essai
   d'amorçage est refusé sans bruit (un refus de droit n'est pas une panne),
   et l'écran ne lui montre rien (EngagementsDuMois). La déconnexion efface la
   copie du poste (auth.ts, SENSITIVE_KEYS). Les règles : engagements-du-mois-pur. */
/* La clé en toutes lettres : verifie-cles-uniques lit chaque createStore. */
export const engagementsDuMoisStore = createStore<EngagementDuMois[]>('mnd_engagements_du_mois', []);
bindDocument(engagementsDuMoisStore, CLE_DES_ENGAGEMENTS);
export const useEngagementsDuMois = () => useStore(engagementsDuMoisStore);
