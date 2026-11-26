import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { DOCUMENT_DU_LUNDI_VIDE, type DocumentDuLundi } from './les-dix-du-lundi-pur';

/* LES DIX DU LUNDI, GARDÉES — 26 novembre 2026. Un document de la table
   `documents` (comme `mnd_gerard`), lu et écrit par l'équipe : les listes
   figées, une par branche et par semaine ISO, et les gestes posés sur leurs
   lignes. Aucun nom, aucun numéro : des identifiants de fiches seulement. Les
   règles vivent dans `les-dix-du-lundi-pur.ts`. */
/* La clé en toutes lettres : verifie-cles-uniques lit chaque createStore. */
export const lesDixDuLundiStore = createStore<DocumentDuLundi>('mnd_les_dix_du_lundi', DOCUMENT_DU_LUNDI_VIDE);
export const useLesDixDuLundi = () => useStore(lesDixDuLundiStore);
bindDocument(lesDixDuLundiStore, 'mnd_les_dix_du_lundi');
