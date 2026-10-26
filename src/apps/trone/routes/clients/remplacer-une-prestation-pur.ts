/* ══ REMPLACER UNE PRESTATION SUR SES PIÈCES — 26 octobre 2026 ═════════════
   « Tous les rendez-vous de [la cliente] de 2025 : change le Shampoing « Le
   Souffle » en Shampoing « L'Ancrage » à 10 000 F. Réajuste-moi toutes ces
   factures 2025 » (Yéman). Puis, au sélecteur : « le total ne bouge pas » et
   « le shampoing seul » (les rendez-vous gardent leur longueur).

   LE TOTAL NE BOUGE PAS. Ces pièces sont réglées ; l'argent reçu ne change
   pas parce qu'on corrige le nom de ce qui a été fait. L'écart passe d'abord
   dans la ligne « Ajustement · prix consenti ce jour-là » (elle existe pour
   ça : c'est le prix que la cliente a payé, au-delà du catalogue) ; s'il
   n'y en a pas, en remise sur la nouvelle ligne ; si la nouvelle coûte moins,
   l'ajustement monte d'autant. Une pièce dont le total ne retombe pas pile
   (remise globale en pourcentage) n'est pas touchée : elle se reprend à la main.

   ON GARDE L'AVANT. Chaque pièce et chaque rendez-vous touchés gardent leurs
   lignes d'avant sous `remplacements` (le geste, sa date) : « Défaire »
   les remet telles quelles.

   Règle pure (banc verifie-remplacer-une-prestation) : le total d'une pièce
   est passé par l'appelant (`invoiceTotal`), une seule définition. */

export const LIBELLE_AJUSTEMENT = 'Ajustement · prix consenti ce jour-là';

export type LigneDePiece = {
  id: string;
  label: string;
  qty: number;
  unitXof: number;
  discountPct: number;
  discountXof?: number;
  produitId?: string;
  detail?: string[];
};

/** Ce que la pièce était avant un remplacement, pour le défaire. */
export type TraceDuRemplacement = {
  le: string;
  de: string;
  vers: string;
  lines: LigneDePiece[];
  globalDiscountXof?: number;
};

export type PieceRemplacable = {
  id: string;
  date: string;
  kind?: string;
  lines: LigneDePiece[];
  globalDiscountPct: number;
  globalDiscountXof?: number;
  remplacements?: TraceDuRemplacement[];
};

export type PlanDuRemplacement = {
  /** Le libellé exact de la ligne à remplacer. */
  de: string;
  /** Le libellé de la prestation qui la remplace. */
  vers: string;
  /** Son prix unitaire. */
  prixXof: number;
  /** « 2025 », ou null pour toutes les années. */
  annee: string | null;
};

export type ChangementDePiece<P> = {
  piece: P;
  apres: P;
  totalAvant: number;
  totalApres: number;
  /** Ce qui a absorbé l'écart. */
  ajustement?: { avant: number; apres: number };
  remiseLigne?: number;
  ajoute?: number;
  /** Le total retombe pile : la pièce peut changer. */
  ok: boolean;
};

const dansLAnnee = (date: string, annee: string | null) => !annee || String(date ?? '').startsWith(annee);

/** Les pièces de l'année qui portent la ligne, avec ce qu'elles deviennent. */
export function remplacementsDesPieces<P extends PieceRemplacable>(
  pieces: readonly P[],
  plan: PlanDuRemplacement,
  totalDe: (p: P) => number,
  le: string,
): ChangementDePiece<P>[] {
  const prix = Math.max(0, Math.round(plan.prixXof));
  const out: ChangementDePiece<P>[] = [];
  for (const p of pieces) {
    if (p.kind === 'devis' || !dansLAnnee(p.date, plan.annee)) continue;
    if (!p.lines.some((l) => l.label === plan.de)) continue;
    const totalAvant = totalDe(p);
    let lignes: LigneDePiece[] = p.lines.map((l) => (l.label === plan.de ? { ...l, label: plan.vers, unitXof: prix } : l));
    let ecart = totalDe({ ...p, lines: lignes }) - totalAvant;
    const c: Omit<ChangementDePiece<P>, 'piece' | 'apres' | 'totalAvant' | 'totalApres' | 'ok'> = {};

    if (ecart !== 0) {
      const iA = lignes.findIndex((l) => l.label === LIBELLE_AJUSTEMENT && l.qty === 1 && !l.discountPct && !l.discountXof);
      if (iA >= 0) {
        const a = lignes[iA];
        const pris = ecart > 0 ? Math.min(a.unitXof, ecart) : ecart;
        const reste = a.unitXof - pris;
        c.ajustement = { avant: a.unitXof, apres: reste };
        lignes = reste > 0 ? lignes.map((l, i) => (i === iA ? { ...l, unitXof: reste } : l)) : lignes.filter((_, i) => i !== iA);
        ecart -= pris;
      }
      if (ecart > 0) {
        const iN = lignes.findIndex((l) => l.label === plan.vers);
        lignes = lignes.map((l, i) => (i === iN ? { ...l, discountXof: (l.discountXof ?? 0) + ecart } : l));
        c.remiseLigne = ecart;
      } else if (ecart < 0) {
        lignes = [...lignes, { id: `aj-${p.id}-${le.slice(0, 10)}`, label: LIBELLE_AJUSTEMENT, qty: 1, unitXof: -ecart, discountPct: 0 }];
        c.ajoute = -ecart;
      }
    }

    const trace: TraceDuRemplacement = {
      le, de: plan.de, vers: plan.vers, lines: p.lines,
      ...(p.globalDiscountXof !== undefined ? { globalDiscountXof: p.globalDiscountXof } : {}),
    };
    const apres = { ...p, lines: lignes, remplacements: [...(p.remplacements ?? []), trace] };
    const totalApres = totalDe(apres);
    out.push({ piece: p, apres, totalAvant, totalApres, ...c, ok: totalApres === totalAvant });
  }
  return out;
}

/** La pièce telle qu'avant le geste `le` — seulement si c'est le DERNIER
    remplacement qu'elle a reçu (sinon on défait d'abord le plus récent). */
export function piecesSansLeRemplacement<P extends PieceRemplacable>(p: P, le: string): P {
  const t = p.remplacements ?? [];
  const dernier = t[t.length - 1];
  if (!dernier || dernier.le !== le) return p;
  const reste = t.slice(0, -1);
  const { remplacements: _r, globalDiscountXof: _g, ...nu } = p;
  return {
    ...nu,
    lines: dernier.lines,
    ...(dernier.globalDiscountXof !== undefined ? { globalDiscountXof: dernier.globalDiscountXof } : {}),
    ...(reste.length ? { remplacements: reste } : {}),
  } as P;
}

/* ── Les rendez-vous ─────────────────────────────────────────────────────
   La prestation change de nom sur le rendez-vous aussi, à la même place :
   `mains` et `remisesLignes` sont des tableaux PARALLÈLES à `serviceIds`,
   on remplace donc l'identifiant là où il est, sans rien déplacer. Le prix
   d'un rendez-vous honoré est figé (`priceXof`) : il ne bouge pas. La
   longueur reste celle du jour (« le shampoing seul »). */

export type TraceDuRdv = { le: string; serviceIds: string[]; depositServiceIds?: string[] };

export type RdvRemplacable = {
  id: string;
  date: string;
  status?: string;
  serviceIds: string[];
  depositServiceIds?: string[];
  remplacements?: TraceDuRdv[];
};

export function remplacementsDesRdv<A extends RdvRemplacable>(
  rdvs: readonly A[],
  o: { deId: string; versId: string; annee: string | null },
  le: string,
): { rdv: A; apres: A }[] {
  if (!o.deId || !o.versId || o.deId === o.versId) return [];
  const remplace = (ids: string[]) => ids.map((x) => (x === o.deId ? o.versId : x));
  return rdvs
    .filter((a) => a.status !== 'annulé' && dansLAnnee(a.date, o.annee) && (a.serviceIds ?? []).includes(o.deId))
    .map((a) => ({
      rdv: a,
      apres: {
        ...a,
        serviceIds: remplace(a.serviceIds),
        ...(a.depositServiceIds ? { depositServiceIds: remplace(a.depositServiceIds) } : {}),
        remplacements: [...(a.remplacements ?? []), {
          le, serviceIds: a.serviceIds, ...(a.depositServiceIds ? { depositServiceIds: a.depositServiceIds } : {}),
        }],
      },
    }));
}

export function rdvSansLeRemplacement<A extends RdvRemplacable>(a: A, le: string): A {
  const t = a.remplacements ?? [];
  const dernier = t[t.length - 1];
  if (!dernier || dernier.le !== le) return a;
  const reste = t.slice(0, -1);
  const { remplacements: _r, depositServiceIds: _d, ...nu } = a;
  return {
    ...nu,
    serviceIds: dernier.serviceIds,
    ...(dernier.depositServiceIds ? { depositServiceIds: dernier.depositServiceIds } : {}),
    ...(reste.length ? { remplacements: reste } : {}),
  } as A;
}

/** Le dernier geste encore défaisable sur ces pièces : le plus récent `le`. */
export function dernierRemplacement(pieces: readonly PieceRemplacable[]): TraceDuRemplacement | null {
  let d: TraceDuRemplacement | null = null;
  for (const p of pieces) {
    const t = p.remplacements?.[p.remplacements.length - 1];
    if (t && (!d || t.le > d.le)) d = t;
  }
  return d;
}
