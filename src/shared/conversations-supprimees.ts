import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { filsArchivesStore } from './conversations';
import { poseLaMarque, retireLaMarque, type MarquesDesBoites } from './rangement-des-boites-pur';

/* ── ARCHIVER ET SUPPRIMER UNE DISCUSSION — 18 novembre 2026 ──────────────
   La règle vit dans `rangement-des-boites-pur`. Ici, les deux documents
   partagés du personnel, hors de la liste blanche publique, comme
   `mnd_rien_a_repondre` : une discussion archivée ou supprimée à
   l'ordinateur l'est aussi au téléphone.

   · L'ARCHIVE reprend `mnd_fils_archives` (15 septembre 2026) : mêmes
     marques, même règle, des clés de boîte en plus des numéros. Toute
     l'équipe archive depuis ce jour (la direction seule, avant).
   · LA SUPPRESSION a son document, `mnd_conversations_supprimees`. La
     direction seule supprime : une garde d'écran, comme l'archive l'était.
     Rien n'est effacé en base. */

export const conversationsSupprimeesStore = createStore<MarquesDesBoites>('mnd_conversations_supprimees', {});
export const useConversationsSupprimees = () => useStore(conversationsSupprimeesStore);
bindDocument(conversationsSupprimeesStore, 'mnd_conversations_supprimees');

export function archiveLaDiscussion(cles: readonly string[], par: string | undefined, quand: string): void {
  filsArchivesStore.set((prev) => poseLaMarque(prev, cles, par, quand));
}

export function desarchiveLaDiscussion(cles: readonly string[]): void {
  filsArchivesStore.set((prev) => retireLaMarque(prev, cles));
}

export function supprimeLaDiscussion(cles: readonly string[], par: string | undefined, quand: string): void {
  conversationsSupprimeesStore.set((prev) => poseLaMarque(prev, cles, par, quand));
}
