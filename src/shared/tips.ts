import { createStore, uid, useStore } from './store';
import { bindCollection } from './sync';

/* Pourboires — UNE LIGNE PAR POURBOIRE (collection synchronisée), comme les
   avances sur salaire. L'ancienne forme (un document unique Record<staffId,
   Tip[]> en dernier-écrivain-gagnant) perdait un pourboire en silence dès que
   deux caisses enregistraient dans la même fenêtre de synchronisation — et
   c'est de l'argent dû aux maîtres. En collection, chaque ligne s'upserte par
   id : plus aucun écrasement croisé. */

export type Tip = { id: string; staffId: string; amountXof: number; date: string; note?: string; branchId?: string };

export const tipsStore = createStore<Tip[]>('mnd_tips_v2', []);
bindCollection(tipsStore, 'tips');

export function useTips(): [Tip[], typeof tipsStore.set] {
  const [v, set] = useStore(tipsStore);
  return [Array.isArray(v) ? v : [], set];
}

/** Enregistre un pourboire pour un membre du personnel (par staffId). */
export function addTip(staffId: string, amountXof: number, date: string, note?: string) {
  if (!staffId || amountXof <= 0) return;
  const t: Tip = { id: `tp-${uid()}`, staffId, amountXof: Math.round(amountXof), date, note };
  tipsStore.set((prev) => [...prev, t]);
}

/** Reprise de l'ANCIEN magasin (document unique `mnd_tips`, encore présent dans
    le cache local d'appareils antérieurs) : chaque entrée devient une ligne,
    add-if-missing-by-id — idempotent, sûr multi-appareils (la migration SQL 0008
    convertit la copie serveur ; ceci rattrape d'éventuels pourboires restés
    locaux). À appeler au montage d'un écran consommateur, dépendant du magasin,
    pour converger aussi après l'hydratation. */
export function importLegacyTips(): void {
  let legacy: Record<string, { id?: string; amountXof?: number; date?: string; note?: string }[]>;
  try {
    legacy = JSON.parse(localStorage.getItem('mnd_tips') ?? 'null');
  } catch {
    return;
  }
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return;
  const cur = tipsStore.get();
  if (!Array.isArray(cur)) return;
  const have = new Set(cur.map((t) => t.id));
  const toAdd: Tip[] = [];
  for (const [staffId, list] of Object.entries(legacy)) {
    if (!Array.isArray(list)) continue;
    for (const t of list) {
      if (!t || typeof t.id !== 'string' || have.has(t.id)) continue;
      if (typeof t.amountXof !== 'number' || t.amountXof <= 0) continue;
      toAdd.push({ id: t.id, staffId, amountXof: Math.round(t.amountXof), date: t.date ?? '', note: t.note });
    }
  }
  if (toAdd.length) tipsStore.set((prev) => [...prev, ...toAdd]);
}
