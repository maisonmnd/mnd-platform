import { createStore, uid, useStore } from './store';
import { bindCollection } from './sync';

/* Pourboires — UNE LIGNE PAR POURBOIRE (collection synchronisée), comme les
   avances sur salaire. L'ancienne forme (un document unique Record<staffId,
   Tip[]> en dernier-écrivain-gagnant) perdait un pourboire en silence dès que
   deux caisses enregistraient dans la même fenêtre de synchronisation — et
   c'est de l'argent dû aux maîtres. En collection, chaque ligne s'upserte par
   id : plus aucun écrasement croisé. */

export type Tip = {
  id: string;
  staffId: string;
  amountXof: number;
  date: string;
  note?: string;
  branchId?: string;
  /** LA PIÈCE QUI A PORTÉ CE POURBOIRE — 19 août 2026 : « quand je supprime
      une facture de pourboire, ça doit supprimer le pourboire inscrit chez
      chacun ». Sans ce lien, une part était introuvable une fois écrite : la
      facture partait, les parts restaient, et « Mon mois » gonflait de
      pourboires que personne n'avait touchés. Absent sur les parts d'avant ce
      jour — elles ne peuvent pas être reliées après coup. */
  invoiceId?: string;
};

/** LES PARTS D'UNE PIÈCE SUPPRIMÉE S'EN VONT AVEC ELLE. Rend le nombre de
    parts retirées — un geste d'argent se dit, il ne s'estime pas. */
export function retirerPourboiresDesFactures(ids: Iterable<string>): number {
  const vises = new Set(ids);
  if (vises.size === 0) return 0;
  const avant = tipsStore.get();
  const retires = avant.filter((t) => t.invoiceId && vises.has(t.invoiceId)).length;
  if (retires > 0) tipsStore.set((prev) => prev.filter((t) => !(t.invoiceId && vises.has(t.invoiceId))));
  return retires;
}

/** À LA FUSION DES PIÈCES, le pourboire SUIT la survivante — il ne meurt pas
    avec la pièce fondue : l'argent a bien été remis, seule la pièce change. */
export function repointerPourboires(deIds: Iterable<string>, versId: string): void {
  const vises = new Set(deIds);
  if (vises.size === 0) return;
  tipsStore.set((prev) => prev.map((t) => (t.invoiceId && vises.has(t.invoiceId)
    ? { ...t, invoiceId: versId }
    : t)));
}

export const tipsStore = createStore<Tip[]>('mnd_tips_v2', []);
bindCollection(tipsStore, 'tips');

export function useTips(): [Tip[], typeof tipsStore.set] {
  const [v, set] = useStore(tipsStore);
  return [Array.isArray(v) ? v : [], set];
}

/** LA PART DE POURBOIRE D'UNE PERSONNE — 1 par défaut.

    Le pourboire de la Maison ne récompense pas la tête travaillée : il se
    partage entre TOUS, qu'on ait officié ce jour-là ou non. Chacun compte pour
    une part, sauf le gérant et le fondateur — un couple — qui n'en comptent
    qu'une à eux deux, soit une demi-part chacun.

    C'est un POIDS, jamais une division par quatre écrite en dur : les quatre
    parts d'aujourd'hui viennent de trois personnes à 1 et de deux à 0,5. Le
    jour où la Maison recrute, le total suit tout seul. Une part à 0 écarte
    quelqu'un du partage sans le retirer du personnel. */
export const PART_POURBOIRE_DEFAUT = 1;

/** Répartit un pourboire selon les parts, en francs ENTIERS dont la somme fait
    exactement le montant reçu — le XOF n'a pas de subdivision, et un franc
    perdu à chaque arrondi finit par se voir dans la caisse.

    Le reste de la division va aux plus grandes parts d'abord (méthode du plus
    fort reste) : sur 2 500 F en cinq parts de 1, 1, 1, 0,5 et 0,5, personne ne
    paie systématiquement l'arrondi du même côté. */
export function repartirPourboire(
  montantXof: number,
  membres: { id: string; part?: number }[],
): { staffId: string; amountXof: number }[] {
  const retenus = membres
    .map((m) => ({ id: m.id, part: m.part ?? PART_POURBOIRE_DEFAUT }))
    .filter((m) => m.part > 0);
  const total = retenus.reduce((n, m) => n + m.part, 0);
  if (montantXof <= 0 || total <= 0) return [];
  const brut = retenus.map((m) => ({ id: m.id, exact: (montantXof * m.part) / total }));
  const parts = brut.map((b) => ({ id: b.id, bas: Math.floor(b.exact), reste: b.exact - Math.floor(b.exact) }));
  let restant = montantXof - parts.reduce((n, p) => n + p.bas, 0);
  const ordre = [...parts].sort((a, b) => b.reste - a.reste);
  for (const p of ordre) {
    if (restant <= 0) break;
    p.bas += 1;
    restant -= 1;
  }
  return parts.filter((p) => p.bas > 0).map((p) => ({ staffId: p.id, amountXof: p.bas }));
}

/** Enregistre le pourboire d'un rituel, PARTAGÉ selon les parts de chacun.
    Une ligne par bénéficiaire — chacune s'upserte par son id, aucune ne peut
    en écraser une autre. Rend ce qui a été réellement attribué, pour que
    l'écran puisse le montrer plutôt que de l'affirmer. */
export function addTipPartage(
  membres: { id: string; part?: number }[],
  montantXof: number,
  date: string,
  note?: string,
  invoiceId?: string,
): { staffId: string; amountXof: number }[] {
  const parts = repartirPourboire(montantXof, membres);
  if (!parts.length) return [];
  const lignes: Tip[] = parts.map((p) => ({
    id: `tp-${uid()}`, staffId: p.staffId, amountXof: p.amountXof, date, note,
    ...(invoiceId ? { invoiceId } : {}),
  }));
  tipsStore.set((prev) => [...prev, ...lignes]);
  return parts;
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
