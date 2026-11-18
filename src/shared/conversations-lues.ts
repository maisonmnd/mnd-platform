import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { aMarquer, type ConversationsLues } from './recus-pur';

/* ── LES CONVERSATIONS LUES — 6 novembre 2026 ────────────────────────────
   « Je ne remarque jamais quand j'ai de nouveaux messages qui arrivent dans
   la conversation » (Yéman). La marque « lu » des Conversations : par clé de
   boîte, l'ISO de la dernière bulle d'elle qu'une PERSONNE de la Maison a eue
   sous les yeux. Document partagé du personnel, exactement comme
   `mnd_rien_a_repondre` : une conversation ouverte à l'ordinateur cesse
   d'être « reçue » au téléphone aussi, et le compte baisse partout.

   Il ne s'écrit que depuis l'écran des Conversations, quand une personne a
   la boîte ouverte (shared/recus-pur juge quoi écrire). Jamais depuis Perle,
   l'automate ou un modèle : une réponse partie seule n'est pas une lecture. */

export const conversationsLuesStore = createStore<ConversationsLues>('mnd_conversations_lues', {});
export const useConversationsLues = () => useStore(conversationsLuesStore);
bindDocument(conversationsLuesStore, 'mnd_conversations_lues');

/* MARQUER COMME NON LUE (18 novembre 2026, les Conversations façon
   WhatsApp) : un geste de la main, partagé entre les postes, qui pose un
   point sur la ligne jusqu'à ce qu'une personne rouvre la discussion. Il ne
   compte pas dans les Reçus (la barre, l'onglet, la pastille du haut) : ce
   n'est pas un message arrivé, c'est un pense-bête. Par clé de boîte,
   l'instant du geste. */
export const nonLuesALaMainStore = createStore<Record<string, string>>('mnd_conversations_non_lues', {});
export const useNonLuesALaMain = () => useStore(nonLuesALaMainStore);
bindDocument(nonLuesALaMainStore, 'mnd_conversations_non_lues');

export function marqueNonLue(cle: string, quand: string): void {
  nonLuesALaMainStore.set((prev) => ({ ...(prev ?? {}), [cle]: quand }));
}

export function retireNonLue(cle: string): void {
  if (!(cle in (nonLuesALaMainStore.get() ?? {}))) return;
  nonLuesALaMainStore.set((prev) => {
    const { [cle]: _retiree, ...reste } = prev ?? {};
    return reste;
  });
}

/** Marque la boîte lue jusqu'à `iso` (la dernière bulle d'elle) ; n'écrit
    que si c'est plus récent que la marque posée (`aMarquer`). */
export function marqueLue(cle: string, iso: string | undefined): void {
  if (!aMarquer(conversationsLuesStore.get(), cle, iso) || !iso) return;
  conversationsLuesStore.set((prev) => (aMarquer(prev, cle, iso) ? { ...(prev ?? {}), [cle]: iso } : (prev ?? {})));
}
