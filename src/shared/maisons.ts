import type { CatalogCategory, Maison, Service } from './catalog';

/* ═══════════════════════════════════════════════════════════════════
   LIRE LE CHIFFRE PAR MAISON — Atelier MND™ / Studio ACƆ™.

   Les deux maisons partagent un local, une caisse et des mains : elles ne
   sont donc PAS deux branches. Ce qui les sépare est le catalogue — chaque
   catégorie porte sa maison — et c'est de là que se déduit le chiffre.

   ── LE PLATEAU, ET POURQUOI IL COMPLIQUE TOUT ────────────────────
   Le plateau technique n'appartient à aucune maison : « une même ligne,
   deux origines de vente ». Un DÀNDÀN™ vendu après un resserrage de locks
   est du chiffre Atelier ; le même DÀNDÀN™ vendu après une pose de tresses
   est du chiffre Studio. Sa maison n'est donc pas dans le catalogue — elle
   est dans le RENDEZ-VOUS qui l'a porté.

   D'où la règle : un rituel de plateau suit la maison des AUTRES prestations
   du même rendez-vous. Quand il n'y en a pas — une visite qui n'est qu'un
   lavage — rien ne permet de trancher, et on ne devine pas : la vente reste
   au plateau, dans son propre seau, visible et non attribuée.

   ── LES VISITES MIXTES ───────────────────────────────────────────
   Sept rendez-vous portent des rituels des deux maisons. On ne choisit pas
   « la » maison du rendez-vous : on VENTILE ligne à ligne. Trancher pour
   l'une aurait déplacé 209 000 F d'un seul côté.
   ═══════════════════════════════════════════════════════════════════ */

/** Trois seaux : les deux maisons, plus ce qui n'a pas pu être attribué. */
export type MaisonBucket = Maison | 'plateau';

export const MAISON_BUCKETS: { k: MaisonBucket; label: string }[] = [
  { k: 'atelier', label: 'Atelier MND™' },
  { k: 'studio', label: 'Studio ACƆ™' },
  { k: 'plateau', label: 'Plateau seul' },
];

export type MaisonTotals = Record<MaisonBucket, number>;
export const emptyTotals = (): MaisonTotals => ({ atelier: 0, studio: 0, plateau: 0 });

/** La maison d'une prestation, d'après sa catégorie. `undefined` = plateau. */
export const maisonOfService = (
  serviceId: string,
  svcById: Map<string, Service>,
  catById: Map<string, CatalogCategory>,
): Maison | undefined => {
  /* REMONTEE A L'ATELIER. Une prestation rangee sous une famille — SINSIN sous
     GBEJI — n'a pas de maison propre : elle herite de celle de son atelier.
     Lire la famille seule renverrait `undefined` et ferait tomber toute la
     ventilation dans le seau « plateau ». */
  let cat = catById.get(svcById.get(serviceId)?.categoryId ?? '');
  for (let i = 0; cat?.parentId && !cat.maison && i < 8; i += 1) {
    const parent = catById.get(cat.parentId);
    if (!parent) break;
    cat = parent;
  }
  return cat?.maison;
};

/** Une part de chiffre attribuée à une prestation — la brique de la ventilation.
    `amountXof` est déjà la part NETTE de cette ligne (remises comprises). */
export type Part = { serviceId: string; amountXof: number };

/** Ventile les parts d'UN rendez-vous (ou d'une facture) entre les maisons.

    Le plateau suit la maison des autres lignes s'il n'y en a qu'une. Deux
    maisons présentes, ou aucune : le plateau reste dans son propre seau plutôt
    que d'être réparti au prorata — répartir supposerait qu'un lavage se partage
    entre deux visites, ce qui n'a pas de sens au comptoir. */
export function splitByMaison(
  parts: readonly Part[],
  svcById: Map<string, Service>,
  catById: Map<string, CatalogCategory>,
): MaisonTotals {
  const out = emptyTotals();
  const maisons = new Set<Maison>();
  for (const p of parts) {
    const m = maisonOfService(p.serviceId, svcById, catById);
    if (m) maisons.add(m);
  }
  /* Une seule maison présente : le plateau du même rendez-vous lui revient. */
  const hote: MaisonBucket = maisons.size === 1 ? [...maisons][0] : 'plateau';
  for (const p of parts) {
    const m = maisonOfService(p.serviceId, svcById, catById);
    out[m ?? hote] += p.amountXof;
  }
  return out;
}

/** Cumule plusieurs ventilations — un mois, une branche, une période. */
export function addTotals(a: MaisonTotals, b: MaisonTotals): MaisonTotals {
  return { atelier: a.atelier + b.atelier, studio: a.studio + b.studio, plateau: a.plateau + b.plateau };
}

export const sumTotals = (t: MaisonTotals): number => t.atelier + t.studio + t.plateau;

/** Ventile une LISTE de rendez-vous déjà découpés en parts.
    `partsOf` rend les parts nettes d'un rendez-vous — c'est l'appelant qui sait
    comment ventiler son net (au prorata des prix, ou selon un prix figé). */
export function totalsOf<T>(
  items: readonly T[],
  partsOf: (item: T) => readonly Part[],
  svcById: Map<string, Service>,
  catById: Map<string, CatalogCategory>,
): MaisonTotals {
  return items.reduce((acc, it) => addTotals(acc, splitByMaison(partsOf(it), svcById, catById)), emptyTotals());
}
