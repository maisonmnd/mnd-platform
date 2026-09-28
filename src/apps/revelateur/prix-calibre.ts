/* LE PRIX SELON LE CALIBRE, SUR LE SITE — 28 septembre 2026. « Pour une
   nouvelle cliente qui vient sur le site, elle doit choisir son palier de
   nombre de locks pour que son prix soit ajusté » (Yéman).

   POURQUOI CE FICHIER ET PAS `shared/pricing`. Le barème de la Maison vit dans
   `shared/pricing.ts`, qui importe les magasins du Trône et leur synchro
   (`sync.ts`, qui elle-même importe la veille de version qui recharge
   l'application) : l'embarquer dans une page publique, c'est embarquer le
   Trône. On recopie donc ici LA SEULE branche qui sert au site : une visiteuse
   sans fiche, sans coefficient personnel, sans prix convenu, sans forfait, qui
   a dit son calibre et rien d'autre.

   ET LA COPIE EST TENUE : `verifie-prix` compare, prestation par prestation
   et calibre par calibre, ce que rend ce fichier et ce que rend
   `personalPriceXof`. Le jour où le barème change là-bas, le harnais crie ici.

   Ce que le site ne sait pas : la longueur (choisie au rendez-vous), le
   compte exact de locks (compté au fauteuil). Il prend pour représentant de
   la tranche son plafond, et dit « à partir de » quand le geste se compte
   au lock. */

export type Bande = { id: string; name: string; maxLocks: number | null; coef: number; durCoef: number };

export type PrestationTarifee = {
  id: string;
  categoryId: string;
  priceXof?: number;
  priceMode?: 'fixe' | 'variable' | 'devis';
  scalesWithModel?: boolean;
  priceFloors?: Record<string, number>;
  bandId?: string;
  bandIds?: string[];
  ratePerLock?: number;
  tarifMode?: 'lock' | 'calibre';
  prixParLongueur?: Partial<Record<string, number>>;
  paliersDeLocks?: { auDela: number; prixXof: number }[];
};

export type ContexteDuCalibre = {
  bande?: Bande;
  lockCount?: number;
  sets?: Record<string, Bande[]>;
  cats?: { id: string; parentId?: string }[];
  baremeSuspendu?: boolean;
};

/* Les mêmes exemptions que `shared/pricing` (FIXED_PRICE_SERVICE_IDS) : ces
   quatre-là ne bougent ni au calibre ni au coefficient, par identifiant. */
const PRIX_FIXES = new Set(['sv-gbigbi-essentiel', 'sv-rituel-mq6wbusw', 'sv-rituel-mq6zu12s', 'sv-rituel-mp2qnjwa']);

export const bandesTriees = (bandes: readonly Bande[]): Bande[] =>
  [...bandes].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));

/** « ≤ 80 locks », « 81 – 150 locks », « > 550 locks » : la définition de la tranche. */
export function etendueDeLaBande(bande: Bande, bandes: readonly Bande[]): string {
  const tri = bandesTriees(bandes);
  const i = tri.findIndex((b) => b.id === bande.id);
  const avant = i > 0 ? tri[i - 1].maxLocks ?? 0 : 0;
  if (bande.maxLocks == null) return `plus de ${avant} locks`;
  return avant === 0 ? `jusqu’à ${bande.maxLocks} locks` : `${avant + 1} à ${bande.maxLocks} locks`;
}

/** Le nombre de locks qui représente la tranche : son plafond, ou cent de
    plus que la tranche d'en dessous pour la dernière, sans plafond. */
export function representantDeLaBande(bande: Bande, bandes: readonly Bande[]): number {
  if (bande.maxLocks != null) return bande.maxLocks;
  const tri = bandesTriees(bandes);
  const i = tri.findIndex((b) => b.id === bande.id);
  return (i > 0 ? tri[i - 1].maxLocks ?? 0 : 0) + 100;
}

const bandeDuCompte = (lockCount: number | undefined, bandes: readonly Bande[]): Bande | undefined => {
  if (!lockCount || lockCount <= 0 || bandes.length === 0) return undefined;
  const tri = bandesTriees(bandes);
  return tri.find((b) => lockCount <= (b.maxLocks ?? Infinity)) ?? tri[tri.length - 1];
};

/* `bandForService` : la famille hérite du barème de son atelier, en remontant
   les parents ; sans barème propre, la tranche de la tête. */
const bandeDeLaPrestation = (s: PrestationTarifee, ctx: ContexteDuCalibre): Bande | undefined => {
  let id: string | undefined = s.categoryId;
  for (let i = 0; id && i < 8; i += 1) {
    const propre = ctx.sets?.[id];
    if (propre?.length) return bandeDuCompte(ctx.lockCount, propre);
    id = ctx.cats?.find((c) => c.id === id)?.parentId;
  }
  return ctx.bande;
};

const sertLaBande = (s: PrestationTarifee, bande: Bande | undefined): boolean => {
  if (s.bandIds?.length) return !!bande && s.bandIds.includes(bande.id);
  if (!bande) return true;
  if (s.bandId) return s.bandId === bande.id;
  const cles = Object.keys(s.priceFloors ?? {});
  return cles.length === 0 || cles.includes(bande.id);
};

const modeDuTarif = (s: PrestationTarifee): 'lock' | 'calibre' => s.tarifMode ?? (s.ratePerLock ? 'lock' : 'calibre');

const arrondi = (x: number): number => {
  const r = Math.round(x / 500) * 500;
  return r === 0 && x > 0 ? Math.round(x) : r;
};

const prixSelonLesLocks = (s: PrestationTarifee, lockCount: number | undefined): number | undefined => {
  if (!s.paliersDeLocks?.length || !lockCount || lockCount <= 0) return undefined;
  let gagnant: { auDela: number; prixXof: number } | undefined;
  for (const pal of s.paliersDeLocks) {
    if (lockCount > pal.auDela && (!gagnant || pal.auDela > gagnant.auDela)) gagnant = pal;
  }
  return gagnant?.prixXof;
};

const suitLeModele = (s: PrestationTarifee, ctx: ContexteDuCalibre): boolean =>
  !PRIX_FIXES.has(s.id) && !ctx.baremeSuspendu && s.scalesWithModel === true;

/** Le prix de la prestation pour ce calibre, au franc près comme au Trône.
    `undefined` quand la prestation n'a aucun prix ; sinon le nombre. */
export function prixSelonLeCalibre(s: PrestationTarifee, ctx: ContexteDuCalibre): number | undefined {
  const base = Number(s.priceXof ?? 0);
  if (PRIX_FIXES.has(s.id)) return base || undefined;
  const bande = bandeDeLaPrestation(s, ctx);
  const deBase = prixSelonLesLocks(s, ctx.lockCount) ?? base;
  if (!sertLaBande(s, bande)) return deBase || undefined;
  if (modeDuTarif(s) === 'calibre' && bande && s.priceFloors?.[bande.id] !== undefined) return s.priceFloors[bande.id];
  const auLock = modeDuTarif(s) === 'lock'
    ? (ctx.lockCount && ctx.lockCount > 0 && s.ratePerLock ? ctx.lockCount * s.ratePerLock : undefined)
    : (s.ratePerLock && ctx.lockCount && ctx.lockCount > 0
      ? Math.max(ctx.lockCount * s.ratePerLock, bande ? s.priceFloors?.[bande.id] ?? 0 : 0)
      : undefined);
  if (auLock !== undefined) return auLock;
  const grilleLongueur = !!s.prixParLongueur && Object.keys(s.prixParLongueur).length > 0;
  const coef = !grilleLongueur && suitLeModele(s, ctx) && bande ? bande.coef : 1;
  const prix = arrondi(deBase * coef);
  return prix || undefined;
}

/** Vrai quand le prix dépend du compte exact de locks, que le site ne
    connaît pas : on dit alors « à partir de ». */
export const seCompteAuLock = (s: PrestationTarifee): boolean =>
  !PRIX_FIXES.has(s.id) && (modeDuTarif(s) === 'lock' || !!s.paliersDeLocks?.length);
