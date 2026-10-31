import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { avecLePassage, memoireLue, type MemoireAvantLeFauteuil, type PassageAvantLeFauteuil } from './avant-le-fauteuil-passage-pur';

export { memoireLue, type MemoireAvantLeFauteuil, type PassageAvantLeFauteuil };

/* ── LA MÉMOIRE DES PASSAGES D'« AVANT LE FAUTEUIL » — 31 octobre 2026 ────
   Sur le modèle de `shared/gerard.ts` : un document lié (`bindDocument`),
   une clé, les deux cases « dernier soir » et « dernier matin ». Il vit en
   base pour que la notification ne parte qu'UNE fois par passage, quel que
   soit le poste de la direction qui a le Trône ouvert à 19 h. Le juge des
   passages est pur (`avant-le-fauteuil-passage-pur.ts`) ; ici, la prise sur
   le magasin, et rien d'autre. */

export const avantLeFauteuilStore = createStore<MemoireAvantLeFauteuil>('mnd_avant_le_fauteuil', {});
export const useMemoireAvantLeFauteuil = () => useStore(avantLeFauteuilStore);
bindDocument(avantLeFauteuilStore, 'mnd_avant_le_fauteuil');

/** Le passage est fait pour ce jour : on l'écrit AVANT d'envoyer, pour qu'un
    second poste qui lit la même seconde ne double pas la notification. */
export function noteLePassage(quand: PassageAvantLeFauteuil, jour: string): void {
  avantLeFauteuilStore.set((prev) => avecLePassage(prev, quand, jour));
}
