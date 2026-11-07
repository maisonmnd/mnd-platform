/* ══ L'ARRONDI DES REMISES EN POURCENTAGE — 7 novembre 2026 ══════════════
   « Arrondis les pourcentages, pas de monnaie, arrondis au franc rond
   suivant. » (Yéman, sur la capture d'un forfait à 20 % qui affichait
   93 600 F, 95 200 F, 96 800 F, 115 200 F.) Au sélecteur : AU 500 F
   SUPÉRIEUR, pour TOUTES les remises en pourcentage : les forfaits du
   Catalogue par calibre, les remises posées au Carnet, à la Caisse et aux
   lignes d'une pièce.

   LA RÈGLE, UNE SEULE FONCTION : le prix APRÈS une remise en pourcentage
   (prix − prix × % / 100) monte au multiple de 500 F supérieur.
     · jamais inférieur au prix exact (la cliente ne perd rien à l'arrondi
       que la Maison ne lui doive pas : 28 050 F → 28 500 F) ;
     · jamais au-delà du prix avant remise (10 250 F à 1 % : 10 250 F, pas
       10 500 F : une remise ne fait jamais payer plus que le prix plein) ;
     · 0 % ne change rien (le prix plein, même s'il n'est pas rond) ;
     · 100 % = 0 F.

   LE PASSÉ NE BOUGE PAS. Cette règle ne s'applique qu'aux remises POSÉES
   à partir du 7 novembre 2026, et elle s'applique AU MOMENT DE LA POSE :
   le pourcentage est alors écrit en FRANCS sur le rendez-vous ou la pièce
   (`remiseEnFrancsArrondie`), si bien qu'aucune lecture, aucun total, aucun
   chiffre d'affaires d'avant ne se recalcule. Une pièce ou un rendez-vous
   déjà posé garde son `discountPct` et son total au franc près.

   Ce module n'importe rien : une fonction Edge le recopie à l'identique
   (bloc ⟨arrondi-des-remises⟩), `scripts/verifie-arrondi-des-remises.mjs`
   compare les copies. */

/** Le jour d'entrée en vigueur : les remises posées avant ne sont pas touchées. */
export const LE_JOUR_DE_L_ARRONDI = '2026-11-07';

/** Le palier : 500 F, pas de monnaie. */
export const PALIER_DES_REMISES_XOF = 500;

const nombre = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Un montant exact monte au multiple de 500 F supérieur ; un multiple de
    500 F reste le sien. Négatif ou illisible : 0. La poussière de virgule
    flottante (28 049,9999999) ne fait pas monter d'un palier. */
export const arrondiAuCinqCents = (xof: number): number => {
  const v = Math.round(nombre(xof) * 1e6) / 1e6;
  if (v <= 0) return 0;
  return Math.ceil(v / PALIER_DES_REMISES_XOF - 1e-9) * PALIER_DES_REMISES_XOF;
};

/** Le prix après une remise en pourcentage, arrondi au 500 F supérieur,
    borné par le prix plein. `pct` peut être fractionnaire (50/3). */
export const prixApresRemisePct = (prixPlein: number, pct: number): number => {
  const plein = Math.max(0, Math.round(nombre(prixPlein)));
  const p = Math.max(0, Math.min(100, nombre(pct)));
  if (plein === 0 || p === 0) return plein;
  if (p >= 100) return 0;
  const exact = plein - (plein * p) / 100;
  return Math.min(plein, arrondiAuCinqCents(exact));
};

/** Ce que la remise retire, en francs, l'arrondi compris : la valeur qu'un
    rendez-vous ou une pièce écrit EN FRANCS pour figer le pourcentage. */
export const remiseEnFrancsArrondie = (prixPlein: number, pct: number): number =>
  Math.max(0, Math.round(nombre(prixPlein))) - prixApresRemisePct(prixPlein, pct);

/** Une remise posée ce jour-là (AAAA-MM-JJ, ou un instant ISO) est-elle
    soumise à l'arrondi ? Illisible : non (le passé ne bouge pas). */
export const arrondiEnVigueur = (jourIso: string | undefined | null): boolean =>
  /^\d{4}-\d{2}-\d{2}/.test(String(jourIso ?? '')) && String(jourIso).slice(0, 10) >= LE_JOUR_DE_L_ARRONDI;

/** Une ligne de pièce porte-t-elle un pourcentage que l'arrondi doit figer
    en francs ? Utilisé à l'enregistrement d'une pièce modifiée à la main :
    `avant` est la ligne telle qu'elle était enregistrée (absente : neuve).
    Une ligne dont le pourcentage, le prix et la quantité n'ont pas changé
    est LAISSÉE TELLE QUELLE. */
type LigneFigee = { id: string; qty: number; unitXof: number; discountPct: number; discountXof?: number };
export const figeLaLigne = <L extends LigneFigee>(l: L, avant?: LigneFigee | null): L => {
  const pct = nombre(l.discountPct);
  if (pct <= 0) return l;
  if (avant && nombre(avant.discountPct) === pct && nombre(avant.unitXof) === nombre(l.unitXof) && nombre(avant.qty) === nombre(l.qty)) return l;
  const base = nombre(l.qty) * nombre(l.unitXof);
  return { ...l, discountPct: 0, discountXof: Math.max(0, Math.round(nombre(l.discountXof))) + remiseEnFrancsArrondie(base, pct) };
};

/** La pièce entière : ses lignes, puis sa remise globale en %. Le total
    est celui que `invoiceTotal` aurait donné avec le pourcentage, monté au
    500 F supérieur ; il est écrit en francs (`globalDiscountXof`). */
type PieceFigee<L extends LigneFigee> = { lines: L[]; globalDiscountPct: number; globalDiscountXof?: number; discountLabel?: string };
export const figeLesRemisesDeLaPiece = <P extends PieceFigee<LigneFigee>>(p: P, avant?: PieceFigee<LigneFigee> | null): P => {
  const lignes = p.lines.map((l) => figeLaLigne(l, avant?.lines.find((x) => x.id === l.id)));
  const gpct = nombre(p.globalDiscountPct);
  let out: P = { ...p, lines: lignes } as P;
  if (gpct > 0 && !(avant && nombre(avant.globalDiscountPct) === gpct && lignes.every((l, i) => l === p.lines[i]))) {
    const sous = lignes.reduce((s, l) => s + Math.max(0, nombre(l.qty) * nombre(l.unitXof) * (1 - nombre(l.discountPct) / 100) - nombre(l.discountXof)), 0);
    const plein = Math.round(sous);
    out = {
      ...out, globalDiscountPct: 0,
      globalDiscountXof: Math.max(0, Math.round(nombre(p.globalDiscountXof))) + remiseEnFrancsArrondie(plein, gpct),
      /* Le pourcentage reste lisible sur le papier : « Remise 15 % ». */
      ...(p.discountLabel ? {} : { discountLabel: `Remise ${Number(gpct.toFixed(1))} %` }),
    };
  }
  return out;
};
