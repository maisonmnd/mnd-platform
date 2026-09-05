/* ══ LA GAMME AU RENDEZ-VOUS — 5 septembre 2026 (maquette validée) ═══

   « Comment je gère les remises sur les RDV, les forfaits et les accessoires
   avant le paiement d'un rituel ? » (Yéman).

   LA GAMME NE VIVAIT QU'AU COMPTOIR. Un produit promis à la réservation
   n'existait nulle part avant que la cliente soit devant vous : le stock ne
   savait pas qu'il était attendu, et le total annoncé au téléphone n'était
   celui d'aucun écran. Trois semaines de mémoire pour un flacon.

   CE QUE LE RENDEZ-VOUS PORTE, C'EST UNE INTENTION, PAS DE L'ARGENT. Le
   règlement continue de se faire à La Caisse, et le carnet ne solde que la part
   prestation, comme avant. Le rendez-vous transporte la promesse jusqu'au
   comptoir ; il ne la comptabilise pas.

   TOUT CE QUI EST ICI EST PUR, et jugé par `verifie-gamme`. */

export type LigneGamme = {
  /** L'identifiant du produit au catalogue. */
  id: string;
  qty: number;
  /** LE PRIX UNITAIRE FIGÉ À LA POSE — arbitrage du 5 septembre.

      C'est déjà la règle du prix d'une prestation, de la longueur travaillée et
      de la durée : un rendez-vous de mars n'est pas une prévision, c'est un
      compte rendu. Si le tarif bouge entre la promesse et la venue, le comptoir
      le dit et la Maison corrige — mais il ne se réécrit pas tout seul. */
  prixXof: number;
  /** La remise de CETTE ligne : le pourcentage d'abord, les francs ensuite,
      l'ordre de tout le reste de la Maison. */
  remise?: { pct?: number; xof?: number } | null;
};

const entier = (n: number): number => Math.max(0, Math.round(Number.isFinite(n) ? n : 0));

/** Le plein d'une ligne, avant toute remise. */
export const ligneBruteXof = (l: LigneGamme): number =>
  entier(l.prixXof) * Math.max(0, Math.round(l.qty || 0));

/** Ce que vaut une ligne une fois sa propre remise appliquée. Le pourcentage
    porte sur la ligne entière, pas sur l'unité : « −10 % sur les deux flacons »
    se dit comme on le pense. */
export const ligneNetteXof = (l: LigneGamme): number => {
  const brut = ligneBruteXof(l);
  const pct = Math.max(0, Math.min(100, l.remise?.pct ?? 0));
  const xof = Math.max(0, Math.round(l.remise?.xof ?? 0));
  return Math.max(0, Math.round(brut * (1 - pct / 100)) - xof);
};

export const gammeBruteXof = (lignes: readonly LigneGamme[] | undefined): number =>
  (lignes ?? []).reduce((n, l) => n + ligneBruteXof(l), 0);

/** LE NET DE LA GAMME D'UN RENDEZ-VOUS.

    LE POURCENTAGE DU RENDEZ-VOUS PORTE SUR TOUT — arbitrage du 5 septembre :
    « la remise famille s'applique sur tout le rendez-vous ». Un compte à −15 %
    est à −15 % partout, et c'est ce que la Maison dit à sa cliente.

    LES FRANCS, NON. La remise manuelle en CFA est un geste de comptoir déjà
    retranché du net des gestes ; la reprendre ici la donnerait deux fois. Une
    règle simple à retenir : LE POURCENTAGE PORTE SUR TOUT, LES FRANCS SUR LES
    GESTES.

    UN FORFAIT N'ABSORBE PAS LA GAMME — arbitrage du 5 septembre. S'il
    l'absorbait, le produit recevrait sa part au prorata comme un geste, et
    cette part entrerait dans la production d'un maître qui n'a rien fait de ses
    mains. Le forfait éteint le pourcentage (on ne remise pas un prix négocié) :
    la Gamme s'ajoute alors à son net de ligne. */
export const gammeNetteXof = (
  lignes: readonly LigneGamme[] | undefined,
  remisePct = 0,
): number => {
  const net = (lignes ?? []).reduce((n, l) => n + ligneNetteXof(l), 0);
  const pct = Math.max(0, Math.min(100, remisePct));
  return Math.max(0, Math.round(net * (1 - pct / 100)));
};

/** Ce que les remises retirent à la Gamme, toutes confondues. */
export const gammeEconomieXof = (
  lignes: readonly LigneGamme[] | undefined,
  remisePct = 0,
): number => Math.max(0, gammeBruteXof(lignes) - gammeNetteXof(lignes, remisePct));

/** POSER UN PRODUIT, ou en augmenter la quantité s'il est déjà là. Le prix se
    fige à la PREMIÈRE pose : une seconde unité ajoutée le lendemain ne
    retarife pas la première. */
export function poseUnProduit(
  lignes: readonly LigneGamme[] | undefined,
  produit: { id: string; priceXof: number },
  qty = 1,
): LigneGamme[] {
  const suite = [...(lignes ?? [])];
  const i = suite.findIndex((l) => l.id === produit.id);
  if (i >= 0) {
    suite[i] = { ...suite[i], qty: Math.max(0, suite[i].qty + qty) };
    return suite.filter((l) => l.qty > 0);
  }
  if (qty <= 0) return suite;
  return [...suite, { id: produit.id, qty, prixXof: entier(produit.priceXof) }];
}

/** Retirer un produit tout entier. */
export const retireUnProduit = (
  lignes: readonly LigneGamme[] | undefined, id: string,
): LigneGamme[] => (lignes ?? []).filter((l) => l.id !== id);

/** Poser la remise d'une ligne. */
export const remiseDeLaLigne = (
  lignes: readonly LigneGamme[] | undefined,
  id: string,
  patch: { pct?: number; xof?: number },
): LigneGamme[] => (lignes ?? []).map((l) => (l.id === id
  ? { ...l, remise: { ...(l.remise ?? {}), ...patch } }
  : l));

/** LE TARIF A-T-IL BOUGÉ DEPUIS LA PROMESSE ? Le prix figé fait foi, mais le
    comptoir doit pouvoir le dire — sans quoi la Maison vendrait à perte sans
    jamais le voir. */
export type EcartDeTarif = { id: string; poseXof: number; catalogueXof: number };

export const ecartsDeTarif = (
  lignes: readonly LigneGamme[] | undefined,
  catalogue: ReadonlyMap<string, { priceXof: number }>,
): EcartDeTarif[] => (lignes ?? []).flatMap((l) => {
  const p = catalogue.get(l.id);
  if (!p || entier(p.priceXof) === entier(l.prixXof)) return [];
  return [{ id: l.id, poseXof: entier(l.prixXof), catalogueXof: entier(p.priceXof) }];
});

/** CE QU'IL RESTE SUR L'ÉTAGÈRE, ET CE QUE LE RENDEZ-VOUS EN DEMANDE.

    LE STOCK NE SE RÉSERVE PAS — arbitrage du 5 septembre. Un flacon retenu
    trois semaines pour une venue qui n'aura pas lieu est un flacon invendu, et
    un stock qui compte des promesses ne dit plus ce qu'il y a sur l'étagère. Le
    rendez-vous ANNONCE, il ne retient pas : la Maison voit le risque et
    décide. */
export const manqueALEtagere = (l: LigneGamme, stock: number): boolean =>
  Math.max(0, Math.round(l.qty || 0)) > Math.max(0, Math.round(stock));
