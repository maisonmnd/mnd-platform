import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { PrisesDesBoites } from './qui-tient-pur';

/* ── QUI TIENT LA CONVERSATION · 4 novembre 2026 ──────────────────────────
   « Gérée par » des Conversations : la personne de l'équipe qui a pris une
   boîte (« Je la prends », ou le menu « Gérée par »). Document partagé du
   personnel, comme `mnd_rien_a_repondre`, pour qu'une prise faite à
   l'ordinateur vaille au téléphone et pour toute l'équipe. Une boîte sans
   prise est jugée par `quiTient` (l'automate, Perle, la dernière main). */

export const prisesStore = createStore<PrisesDesBoites>('mnd_qui_tient', {});
export const usePrises = () => useStore(prisesStore);
bindDocument(prisesStore, 'mnd_qui_tient');

/** La boîte est prise par `nom` ; `par` : qui fait le geste. */
export function prendsLaBoite(cle: string, nom: string, par: string | undefined, quand: string): void {
  if (!cle || !nom.trim()) return;
  prisesStore.set((prev) => ({ ...(prev ?? {}), [cle]: par && par !== nom ? { nom: nom.trim(), le: quand, par } : { nom: nom.trim(), le: quand } }));
}

/** La boîte retourne en salle d'attente : personne ne la tient plus de sa main. */
export function rendsLaBoite(cle: string): void {
  prisesStore.set((prev) => {
    const suivant = { ...(prev ?? {}) };
    delete suivant[cle];
    return suivant;
  });
}
