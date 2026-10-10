/* ══ LA CAGNOTTE DU FOYER — 10 octobre 2026 (la genèse des prix, lot 3) ═══
   « Vous mettez de côté, la Maison ajoute » : décision de Yéman au sélecteur
   (Le Foyer, la Maison en famille). Trois paliers ; chaque tête du foyer y
   puise, enfants compris, pour toute prestation ; en 2 fois dès 100 000 F, en
   3 fois dès 200 000 F ; l'ajout de la Maison arrive avec le dernier
   versement ; valable douze lunes.

   ELLE VIT DANS LE PORTE-MONNAIE DU FOYER. Les versements sont des dépôts
   d'avoir ordinaires (une caisse, un moyen, une ligne au registre des
   recettes), marqués de la Cagnotte. L'AJOUT DE LA MAISON est un dépôt
   marqué `abondement` : il n'a ni caisse ni moyen, il n'entre dans AUCUN
   tiroir et n'est PAS une recette : ce n'est pas de l'argent reçu, c'est un
   geste. Il se dépense comme l'avoir, avec le reste.

   LE PLAFOND DE 25 % TIENT AVEC LA REMISE FAMILLE (décision : « oui, sous
   25 % »). Payer avec la Cagnotte une venue déjà remisée de r, c'est payer
   (1 − r) / (1 + a) : l'ajout a est plafonné pour que ce chiffre ne descende
   jamais sous 75 %. À 15 % de remise famille, le palier de 300 000 F ajoute
   donc 40 000 F (13,3 %) au lieu de 45 000 F.

   Pur : aucun magasin, aucun réseau. */

export type Palier = { verseXof: number; ajoutPct: number };
export const PALIERS: readonly Palier[] = [
  { verseXof: 100_000, ajoutPct: 10 },
  { verseXof: 200_000, ajoutPct: 12.5 },
  { verseXof: 300_000, ajoutPct: 15 },
];

export type Cagnotte = {
  id: string;
  branchId: string;
  /** Le foyer qui la porte (le porte-monnaie du payeur). */
  familyId: string;
  verseXof: number;
  /** L'ajout de la Maison, fixé à l'ouverture (plafond compris). */
  ajoutXof: number;
  /** En combien de fois elle se règle (1, 2 ou 3). */
  parts: number;
  ouverteLe: string;
  valableJusquau: string;
  /** La remise famille du foyer à l'ouverture, qui a fixé le plafond. */
  remiseFamillePct: number;
};

/** L'AJOUT DE LA MAISON pour ce palier et cette remise famille, plafonné pour
    que l'avantage total ne dépasse jamais 25 %. Arrondi au 500 F INFÉRIEUR. */
export function ajoutDeLaMaison(palier: Palier, remiseFamillePct: number): number {
  const r = Math.max(0, Math.min(100, remiseFamillePct)) / 100;
  const plafond = Math.max(0, (1 - r) / 0.75 - 1);
  const taux = Math.min(palier.ajoutPct / 100, plafond);
  /* Le plafond tombe souvent juste (2/15 de 300 000 F = 40 000 F) : sans la
     marge, la virgule flottante rendrait 39 999,99 et l'arrondi 39 500 F. */
  return Math.floor((palier.verseXof * taux) / 500 + 1e-9) * 500;
}

type Mouvement = { id: string; kind: 'depot' | 'usage' | 'remboursement'; amountXof: number; cagnotteId?: string; abondement?: boolean };

/** OÙ EN EST LA CAGNOTTE : ce qui est versé, ce qui reste à verser, et si
    l'ajout de la Maison est posé. */
export function etatDeLaCagnotte(c: Pick<Cagnotte, 'id' | 'verseXof'>, mouvements: readonly Mouvement[]): {
  verseXof: number; resteXof: number; ajoutPose: boolean; complete: boolean;
} {
  const siens = mouvements.filter((m) => m.cagnotteId === c.id);
  const verse = siens.filter((m) => m.kind === 'depot' && !m.abondement).reduce((t, m) => t + m.amountXof, 0);
  const ajoutPose = siens.some((m) => m.kind === 'depot' && m.abondement);
  return { verseXof: verse, resteXof: Math.max(0, c.verseXof - verse), ajoutPose, complete: verse >= c.verseXof };
}

/** L'AJOUT À POSER : quand le palier est versé et que l'ajout ne l'est pas
    encore, le mouvement à écrire (sans id ni date, que l'écran fixe) ; sinon
    `null`. Rejoué, il ne pose jamais deux fois. */
export function ajoutAPoser(c: Cagnotte, mouvements: readonly Mouvement[]): {
  cagnotteId: string; abondement: true; kind: 'depot'; amountXof: number; note: string;
} | null {
  const e = etatDeLaCagnotte(c, mouvements);
  if (!e.complete || e.ajoutPose || c.ajoutXof <= 0) return null;
  return { cagnotteId: c.id, abondement: true, kind: 'depot', amountXof: c.ajoutXof, note: 'Cagnotte du Foyer · l’ajout de la Maison' };
}

/** En combien de fois un palier peut se régler (la règle de la Maison). */
export const partsPermises = (verseXof: number): number[] =>
  verseXof >= 200_000 ? [1, 2, 3] : verseXof >= 100_000 ? [1, 2] : [1];

/** Valable douze lunes : la date de fin, à partir de l'ouverture. */
export const valableJusquau = (ouverteLe: string): string => {
  const d = new Date(`${ouverteLe}T12:00:00`);
  d.setDate(d.getDate() + 365);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
