/* ══ LA COMPOSITION D'UNE FORMULE OU D'UN FORFAIT, EN CLAIR — 8 novembre 2026 ══
   « Besoin de voir leur composition pour pouvoir acheter » (Yéman). Les
   cartes de Ma Couronne ne disaient que les trois premières prestations d'un
   forfait, « et 3 autres », et cinq avantages d'une formule : une cliente
   achetait sans savoir ce qu'elle recevait.

   MODULE PUR : il range ce que la Maison a déjà écrit, il n'invente rien.
   Il rend des données ; la phrase se dit à l'écran, par `t()`, pour que
   l'anglais suive. Il ne lit ni prix ni remise : « voir la composition » ne
   change aucun montant.

   · Un FORFAIT du catalogue : ses lignes `includes`, une prestation répétée
     devient « 3 × » avec ses semaines (0, 4, 8). Si l'une porte une `venue`
     (Le Moment en quatre venues), les lignes se rangent venue par venue.
   · Une FORMULE (plan) : ses lignes `included` avec leur quota ; un quota
     absent se dit « à volonté ». */

export type LigneDeForfait = {
  serviceId: string;
  categoryId?: string;
  productId?: string;
  afterWeeks?: number;
  offert?: boolean;
  venue?: number;
};

export type LigneDeComposition = {
  /** Ce qui rend deux lignes identiques : la même prestation, offerte ou non. */
  cle: string;
  quoi: string;
  /** Combien de fois dans la composition. */
  fois: number;
  /** Les semaines après la visite d'ouverture, dans l'ordre ; 0 = au départ. */
  semaines: number[];
  offert: boolean;
};

export type GroupeDeComposition = {
  /** 1 à N si le forfait se range par venue ; absent sinon. */
  venue?: number;
  lignes: LigneDeComposition[];
};

const cleDe = (l: LigneDeForfait): string =>
  `${l.productId ? `p:${l.productId}` : l.categoryId ? `c:${l.categoryId}` : `s:${l.serviceId}`}|${l.offert ? 'offert' : 'paye'}`;

/** La composition d'un forfait, rangée. `nom` dit une ligne en clair (la
    prestation, l'atelier, le produit) : l'écran sait déjà le faire. */
export function compositionDuForfait(
  inclus: readonly LigneDeForfait[] | undefined,
  nom: (l: LigneDeForfait) => string,
): GroupeDeComposition[] {
  const lignes = inclus ?? [];
  if (lignes.length === 0) return [];
  const parVenue = lignes.some((l) => Number.isInteger(l.venue) && (l.venue as number) > 0);
  const ordre: number[] = [];
  const groupes = new Map<number, LigneDeComposition[]>();
  for (const l of lignes) {
    const v = parVenue ? ((Number.isInteger(l.venue) && (l.venue as number) > 0) ? (l.venue as number) : 1) : 0;
    if (!groupes.has(v)) { groupes.set(v, []); ordre.push(v); }
    const liste = groupes.get(v) as LigneDeComposition[];
    const cle = cleDe(l);
    const deja = liste.find((x) => x.cle === cle);
    const semaine = Number.isFinite(l.afterWeeks) ? Math.max(0, Math.round(l.afterWeeks as number)) : undefined;
    if (deja) {
      deja.fois += 1;
      if (semaine !== undefined) deja.semaines.push(semaine);
    } else {
      liste.push({ cle, quoi: nom(l), fois: 1, semaines: semaine !== undefined ? [semaine] : [], offert: !!l.offert });
    }
  }
  return ordre
    .sort((a, b) => a - b)
    .map((v) => ({
      ...(parVenue ? { venue: v } : {}),
      lignes: (groupes.get(v) as LigneDeComposition[]).map((x) => ({ ...x, semaines: [...x.semaines].sort((a, b) => a - b) })),
    }));
}

export type LigneDeFormule = {
  serviceId: string;
  quoi: string;
  /** Le quota ; `null` = à volonté. */
  qty: number | null;
};

/** La composition d'une formule : une ligne par prestation, les quotas d'une
    même prestation additionnés ; « à volonté » l'emporte sur un nombre. */
export function compositionDeLaFormule(
  included: readonly { serviceId: string; qty: number | null }[] | undefined,
  nom: (serviceId: string) => string,
): LigneDeFormule[] {
  const out: LigneDeFormule[] = [];
  for (const i of included ?? []) {
    const deja = out.find((x) => x.serviceId === i.serviceId);
    if (deja) {
      deja.qty = deja.qty === null || i.qty === null ? null : deja.qty + i.qty;
    } else {
      out.push({ serviceId: i.serviceId, quoi: nom(i.serviceId), qty: i.qty === null || i.qty === undefined ? null : i.qty });
    }
  }
  return out;
}
