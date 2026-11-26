import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import { TABLE_DE_L_ATTENTE, type DemandeDAttente } from './liste-d-attente-pur';

/* LA LISTE D'ATTENTE, SON MAGASIN — 26 novembre 2026 (audit B3).
   La table `liste_d_attente` (0252) : la fonction `demande-submit` y dépose
   les demandes des clientes (service role) ; le personnel la lit et y note
   ses gestes (proposée, prise, pas intéressée, pas de réponse). Les règles
   vivent dans `liste-d-attente-pur.ts`. */

export const listeDAttenteStore = createStore<DemandeDAttente[]>('mnd_liste_d_attente', []);
export const useListeDAttente = () => useStore(listeDAttenteStore);

let liee = false;
/** Relie le magasin à la table. Idempotent. */
export function lieLaListeDAttente(): void {
  if (liee) return;
  liee = true;
  bindCollection(listeDAttenteStore, TABLE_DE_L_ATTENTE);
}

lieLaListeDAttente();

/** Écrit une demande changée (un geste du personnel). */
export function noteLAttente(a: DemandeDAttente): void {
  listeDAttenteStore.set((prev) => prev.map((x) => (x.id === a.id ? a : x)));
}
