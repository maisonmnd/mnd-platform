/* ══ LE TPE KKIAPAY : SON PAIEMENT, SANS RIEN TAPER — 22 novembre 2026 ═══

   « Il faut un meilleur moyen pour valider un paiement sur la TPE de KkiaPay.
   On ne peut pas saisir un numéro de ticket et 4 derniers chiffres. Comment
   faciliter ? » puis « les deux voies » (Yéman).

   VOIE 1 — LE PAIEMENT REÇU. Quand la cliente pose sa carte, KkiaPay appelle
   `kkiapay-webhook`, qui inscrit la transaction au registre `payments` (sans
   cible : elle ne vise aucun rendez-vous). L'encaissement lit ce registre et
   propose « 7 h 05 · 62 000 F » : on touche « C'est son paiement ».
   VOIE 2 — LA RÉFÉRENCE VÉRIFIÉE. On tape la référence KkiaPay du reçu ;
   `kkiapay-tpe` la demande à KkiaPay et l'inscrit au même registre.

   Une transaction ne règle qu'une part : celles déjà portées par une pièce
   ne se proposent plus.

   Pur : aucun import. */

export type RecuDuTpe = {
  ref: string;
  /** Ce que KkiaPay a reçu pour la Maison, et ses frais (payés par la cliente). */
  montantXof: number;
  fraisXof: number;
  source?: string;
  at: string;
  branchId?: string;
};

/** Une ligne du registre `payments` lue comme un paiement du TPE, ou null :
    KkiaPay, réussi, sans cible (un paiement en ligne vise son rendez-vous,
    son abonnement ou sa carte cadeau, il est déjà compté ailleurs). */
export function recuDuRegistre(row: { id?: unknown; branch_id?: unknown; data?: unknown } | null | undefined): RecuDuTpe | null {
  const d = (row?.data ?? {}) as Record<string, unknown>;
  if (String(d.provider ?? '') !== 'kkiapay') return null;
  if (String(d.status ?? 'success') !== 'success') return null;
  if (String(d.partnerId ?? '').trim()) return null;
  const ref = String(row?.id ?? d.id ?? '').trim();
  const montant = Math.round(Number(d.amountXof ?? 0));
  const at = String(d.at ?? '');
  if (!ref || !(montant > 0) || !Number.isFinite(Date.parse(at))) return null;
  const branche = String(row?.branch_id ?? d.branchId ?? '').trim();
  return {
    ref, montantXof: montant, fraisXof: Math.max(0, Math.round(Number(d.feesXof ?? 0))), at,
    ...(d.method ? { source: String(d.method) } : {}),
    ...(branche ? { branchId: branche } : {}),
  };
}

/** Les références KkiaPay déjà portées par une pièce (un versement, sa trace). */
export function refsDejaPrises(pieces: readonly { payments?: readonly { trace?: { kkiapay?: { ref?: string } } }[] }[]): Set<string> {
  const s = new Set<string>();
  for (const p of pieces) for (const v of p.payments ?? []) {
    const r = String(v.trace?.kkiapay?.ref ?? '').trim();
    if (r) s.add(r);
  }
  return s;
}

/** La fenêtre des paiements proposés : trois heures. Un paiement plus vieux
    se retrouve par sa référence (voie 2). */
export const FENETRE_DU_TPE_MIN = 180;

/** CE QUE L'ENCAISSEMENT PROPOSE : les paiements du TPE des trois dernières
    heures, de la branche (ou sans branche : KkiaPay ne la connaît pas), pas
    encore pris. Le montant juste en tête, puis le plus récent. */
export function recusAProposer(
  recus: readonly RecuDuTpe[],
  o: { maintenantMs: number; dejaPris: ReadonlySet<string>; montantXof?: number; branchId?: string; fenetreMin?: number },
): (RecuDuTpe & { juste: boolean })[] {
  const depuis = o.maintenantMs - (o.fenetreMin ?? FENETRE_DU_TPE_MIN) * 60_000;
  const vus = new Set<string>();
  const m = Math.round(Number(o.montantXof ?? 0));
  return recus
    .filter((r) => {
      const t = Date.parse(r.at);
      if (!(t >= depuis) || t > o.maintenantMs + 5 * 60_000) return false;
      if (o.dejaPris.has(r.ref) || vus.has(r.ref)) return false;
      if (o.branchId && r.branchId && r.branchId !== o.branchId) return false;
      vus.add(r.ref);
      return true;
    })
    .map((r) => ({ ...r, juste: m > 0 && Math.abs(r.montantXof - m) <= 1 }))
    .sort((a, b) => Number(b.juste) - Number(a.juste) || Date.parse(b.at) - Date.parse(a.at));
}

/** « 7 h 05 », à l'heure de Cotonou. */
export function heureDuRecu(at: string): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 60 * 60_000);
  return `${d.getUTCHours()} h ${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Ce que rend `kkiapay-tpe` pour une référence. */
export type VerdictDeLaReference =
  | { ok: true; ref: string; montantXof: number; fraisXof: number; source?: string }
  | { ok: false; raison: 'introuvable' | 'pas-reussie' | 'deja-en-ligne' | 'injoignable' | 'refusee' | 'mal-formee'; statut?: string };

/** Ce que l'écran dit d'un verdict. */
export function ditLeVerdict(v: VerdictDeLaReference): string {
  if (v.ok) return '';
  switch (v.raison) {
    case 'introuvable': return 'KkiaPay ne connaît pas cette référence : vérifiez-la sur le reçu.';
    case 'pas-reussie': return `KkiaPay dit ce paiement non abouti${v.statut ? ` (${v.statut.toLowerCase()})` : ''} : rien n’est arrivé.`;
    case 'deja-en-ligne': return 'Cette référence est un paiement en ligne (un acompte, une carte cadeau…) : il est déjà compté ailleurs.';
    case 'injoignable': return 'KkiaPay ne répond pas : la référence est gardée et se pointera le soir.';
    case 'refusee': return 'La vérification est réservée au personnel connecté.';
    default: return 'Une référence KkiaPay : lettres et chiffres, six au moins.';
  }
}
