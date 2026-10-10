/* ══ LA CAGNOTTE DU FOYER, AU TRÔNE — 10 octobre 2026 ═══════════════════
   Le juge vit dans `cagnotte-pur.ts`. Ici : le magasin des Cagnottes ouvertes
   (un document, comme les autres réglages de la Maison : pas de table neuve,
   donc rien à poser au serveur) et le seul geste qui écrit l'ajout de la
   Maison, une fois, quand le palier est versé. */
import { createStore, useStore, uid } from './store';
import { bindDocument } from './sync';
import { creditMovementsStore } from './finance';
import { ajoutAPoser, type Cagnotte } from './cagnotte-pur';

export const cagnottesStore = createStore<Cagnotte[]>('mnd_cagnottes', []);
export const useCagnottes = () => useStore(cagnottesStore);
bindDocument(cagnottesStore, 'mnd_cagnottes');

/** POSE L'AJOUT DE LA MAISON si le palier de cette Cagnotte est versé et que
    l'ajout ne l'est pas encore. Rejoué, il ne pose jamais deux fois. Rend
    vrai s'il a posé. */
export function poseLAjoutSiVerse(cagnotteId: string, jourIso: string): boolean {
  const c = cagnottesStore.get().find((x) => x.id === cagnotteId);
  if (!c) return false;
  const a = ajoutAPoser(c, creditMovementsStore.get());
  if (!a) return false;
  creditMovementsStore.set((prev) => [...prev, {
    id: uid(), branchId: c.branchId, holderType: 'family', holderId: c.familyId,
    kind: a.kind, amountXof: a.amountXof, date: jourIso, note: a.note,
    cagnotteId: a.cagnotteId, abondement: true,
  }]);
  return true;
}
