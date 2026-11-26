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
  /** « Autre montant » d'un TPE de poche (lot 2b, 26 novembre 2026) : son
      motif, sa précision, l'employée qui l'a encaissé. */
  autre?: { motif: string; precision?: string; nom?: string };
};

/** LE PRÉFIXE D'UN « AUTRE MONTANT » DU TPE DE POCHE (copie de
    `PREFIXE_DE_L_AUTRE_MONTANT`, tpe-de-poche-pur.ts : ce module n'importe
    rien ; le banc vérifie que les deux disent la même chose). */
export const PREFIXE_DE_L_AUTRE_DU_TPE = 'tpa-';
const MOTIF_DIT: Record<string, string> = { gamme: 'Produit de la Gamme', acompte: 'Acompte d’un rendez-vous', autre: 'Autre montant' };

/** Une ligne du registre `payments` lue comme un paiement du TPE, ou null :
    KkiaPay, réussi, sans cible (un paiement en ligne vise son rendez-vous,
    son abonnement ou sa carte cadeau, il est déjà compté ailleurs) — ou
    visant un « autre montant » du TPE de poche (`tpa-…`), qui n'est porté
    par aucune pièce tant que le comptoir ne l'a pas rangé. */
export function recuDuRegistre(row: { id?: unknown; branch_id?: unknown; data?: unknown } | null | undefined): RecuDuTpe | null {
  const d = (row?.data ?? {}) as Record<string, unknown>;
  if (String(d.provider ?? '') !== 'kkiapay') return null;
  if (String(d.status ?? 'success') !== 'success') return null;
  const cible = String(d.partnerId ?? '').trim();
  const estUnAutre = cible.startsWith(PREFIXE_DE_L_AUTRE_DU_TPE);
  if (cible && !estUnAutre) return null;
  const ref = String(row?.id ?? d.id ?? '').trim();
  const montant = Math.round(Number(d.amountXof ?? 0));
  const at = String(d.at ?? '');
  if (!ref || !(montant > 0) || !Number.isFinite(Date.parse(at))) return null;
  const branche = String(row?.branch_id ?? d.branchId ?? '').trim();
  const tpe = (d.tpe ?? {}) as Record<string, unknown>;
  const precision = String(d.precision ?? '').trim();
  const nom = String(tpe.nom ?? '').trim();
  return {
    ref, montantXof: montant, fraisXof: Math.max(0, Math.round(Number(d.feesXof ?? 0))), at,
    ...(d.method ? { source: String(d.method) } : {}),
    ...(branche ? { branchId: branche } : {}),
    ...(estUnAutre ? { autre: { motif: MOTIF_DIT[String(d.motif ?? '')] ?? 'Autre montant', ...(precision ? { precision } : {}), ...(nom ? { nom } : {}) } } : {}),
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
/** Un « autre montant » du TPE de poche se range au comptoir dans la
    journée : il se propose vingt-quatre heures. */
export const FENETRE_DES_AUTRES_MIN = 24 * 60;

/** CE QUE L'ENCAISSEMENT PROPOSE : les paiements du TPE des trois dernières
    heures (un « autre montant » : vingt-quatre), de la branche (ou sans
    branche : KkiaPay ne la connaît pas), pas encore pris. Le montant juste
    en tête, puis le plus récent. */
export function recusAProposer(
  recus: readonly RecuDuTpe[],
  o: { maintenantMs: number; dejaPris: ReadonlySet<string>; montantXof?: number; branchId?: string; fenetreMin?: number },
): (RecuDuTpe & { juste: boolean })[] {
  const depuis = o.maintenantMs - (o.fenetreMin ?? FENETRE_DU_TPE_MIN) * 60_000;
  const depuisLesAutres = o.maintenantMs - Math.max(o.fenetreMin ?? FENETRE_DU_TPE_MIN, FENETRE_DES_AUTRES_MIN) * 60_000;
  const vus = new Set<string>();
  const m = Math.round(Number(o.montantXof ?? 0));
  return recus
    .filter((r) => {
      const t = Date.parse(r.at);
      if (!(t >= (r.autre ? depuisLesAutres : depuis)) || t > o.maintenantMs + 5 * 60_000) return false;
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

/** LES DEUX NUMÉROS D'UN REÇU DE TPE — 24 novembre 2026. Le reçu porte
    « Référence 7757889838121264 » ET « N° Reçu rcp_7757889838121264 » ; la
    caissière tape l'un, la route de statut de KkiaPay peut ne connaître que
    l'autre. On essaie les deux. Copie tenue dans `kkiapay-tpe` (la fonction
    ne peut pas importer `src/`) : le banc lit les deux. */
export function identifiantsPossibles(ref: string): string[] {
  const r = String(ref ?? '').replace(/\s+/g, '').trim();
  if (r.length < 6) return [];
  const vus = [r];
  vus.push(/^rcp_/i.test(r) ? r.replace(/^rcp_/i, '') : `rcp_${r}`);
  return [...new Set(vus.filter((x) => x.length >= 6))];
}

/** LA RÉFÉRENCE SE GARDE-T-ELLE QUAND KKIAPAY NE LA RECONNAÎT PAS ? Oui :
    muet, ou inconnue de sa route de statut — dans les deux cas la caisse
    encaisse et la référence se pointe le soir. Une référence *refusée* (non
    aboutie, déjà en ligne) ne se garde pas, elle. */
export const laReferenceSeGarde = (v: VerdictDeLaReference): boolean =>
  !v.ok && (v.raison === 'injoignable' || v.raison === 'introuvable');

/** Ce que l'écran dit d'un verdict. */
export function ditLeVerdict(v: VerdictDeLaReference): string {
  if (v.ok) return '';
  switch (v.raison) {
    /* LE TPE N'EST PAS LA ROUTE DU PAIEMENT EN LIGNE — 24 novembre 2026. La
       référence d'un paiement fait au terminal n'est pas connue de la route
       de statut (« KkiaPay ne connaît pas cette référence », un vrai paiement
       de 100 F, ce soir-là). Ce n'est pas une référence fausse : c'est une
       route qui ne la voit pas. L'encaissement ne s'arrête donc pas là — la
       référence se garde et se pointe le soir, comme quand KkiaPay est muet. */
    case 'introuvable': return 'KkiaPay ne reconnaît pas cette référence : le TPE ne passe pas par la même route que les paiements en ligne. Elle est gardée et se pointera le soir ; prenez l’écran du TPE en photo pour la caisse.';
    case 'pas-reussie': return `KkiaPay dit ce paiement non abouti${v.statut ? ` (${v.statut.toLowerCase()})` : ''} : rien n’est arrivé.`;
    case 'deja-en-ligne': return 'Cette référence est un paiement en ligne (un acompte, une carte cadeau…) : il est déjà compté ailleurs.';
    case 'injoignable': return 'KkiaPay ne répond pas : la référence est gardée et se pointera le soir.';
    case 'refusee': return 'La vérification est réservée au personnel connecté.';
    default: return 'Une référence KkiaPay : lettres et chiffres, six au moins.';
  }
}
