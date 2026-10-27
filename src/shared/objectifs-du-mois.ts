import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { ObjectifsDuMois } from './prevision-du-mois-pur';

/* ── L'OBJECTIF DU MOIS — 27 octobre 2026 ────────────────────────────────
   Au sélecteur : « je le fixe chaque mois ». Un chiffre d'argent par mois
   (`'2026-10': 2400000`), gardé d'un mois sur l'autre jusqu'à ce qu'elle le
   change (`objectifDuMois`, prevision-du-mois-pur.ts) ; 0 = pas d'objectif
   ce mois-là. Le tableau de bord le trace sur la courbe du mois. */

export const objectifsDuMoisStore = createStore<ObjectifsDuMois>('mnd_objectifs_du_mois', {});
export const useObjectifsDuMois = () => useStore(objectifsDuMoisStore);
bindDocument(objectifsDuMoisStore, 'mnd_objectifs_du_mois');

/** Fixe l'objectif d'un mois ; `null` le retire pour ce mois (sans reprendre celui d'avant). */
export function fixeLObjectif(mk: string, xof: number | null): void {
  objectifsDuMoisStore.set((prev) => ({ ...(prev ?? {}), [mk]: xof && xof > 0 ? Math.round(xof) : 0 }));
}
