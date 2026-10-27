import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { RiensARepondre } from './boite-unique-pur';

/* ── RIEN À RÉPONDRE — 27 octobre 2026 ───────────────────────────────────
   Le geste des Conversations qui range une boîte dont les derniers mots
   n'appellent pas de réponse (« Merci », « Ok, à demain »). Il vaut jusqu'à
   son prochain message (`estRangee`, boite-unique-pur) et ne touche que ses
   mots : un souci, une demande, un appel gardent leur juge. Document partagé
   du personnel (hors de la liste blanche publique, comme `mnd_fils_archives`),
   pour qu'un rangement fait sur l'ordinateur vaille sur le téléphone. */

export const riensARepondreStore = createStore<RiensARepondre>('mnd_rien_a_repondre', {});
export const useRiensARepondre = () => useStore(riensARepondreStore);
bindDocument(riensARepondreStore, 'mnd_rien_a_repondre');

/** Range ces clés (la boîte et ses fils) ; `par` : qui l'a dit. */
export function rangeLaBoite(cles: readonly string[], par: string | undefined, quand: string): void {
  riensARepondreStore.set((prev) => {
    const suivant = { ...(prev ?? {}) };
    for (const k of cles) if (k && k !== 'n:') suivant[k] = par ? { le: quand, par } : { le: quand };
    return suivant;
  });
}

/** La rend à « À traiter » (le geste « Remettre à traiter »). */
export function deRangeLaBoite(cles: readonly string[]): void {
  riensARepondreStore.set((prev) => {
    const suivant = { ...(prev ?? {}) };
    for (const k of cles) delete suivant[k];
    return suivant;
  });
}
