/* ══ LES PLACES LIMITÉES ET UNE SEULE REMISE, DANS MA COURONNE ══════════
   4 novembre 2026. Maquette « Places limitées » (AhFRNqiggFoaiR725iKSQe),
   « construis » de Yéman : −15 % sur les shampoings, lavages et soins, du
   mardi au vendredi, seulement un jour vide, trois places par jour
   décomptées, les jours vides des 14 jours à venir ; jamais pour une tête
   aux prix convenus, abonnée, ni qui a déjà une remise. Et, mot pour mot :
   « s'assurer que ces remises-là ne s'affichent pas sur Ma Couronne de ces
   clients-là EN AUCUNE CIRCONSTANCE. Ni les autres remises. »

   LA RÈGLE N'EST PAS ICI. Elle vit dans `offres-pur` (`offreDuJourDeLaVenue`,
   `placesRestantes`, `remiseFamilleDeLaTete`, `gesteSansRemise`), la même au
   Trône, au site et ici. Ce module ne fait que ce que Ma Couronne seule doit
   faire :
     · lire les places que la base dit (`places_de_la_remise`), puisqu'elle ne
       voit pas l'agenda des autres ;
     · juger la place d'un jour pour SON rituel ;
     · compter le panier sous « une seule remise » : un geste de la Maison, la
       remise famille, une offre de saison ou une place, jamais deux.

   PUR : ni magasin, ni réseau, ni React. Son banc :
   `node scripts/verifie-les-places-a-la-couronne.mjs --prouve`. */
import {
  arrondiDuNet, ceQueLeCodeRetire, codeNormalise, estAPlaces, joursEntre, lignesDuCode, offreDuJourDeLaVenue,
  type OffreCodee,
} from '../../shared/offres-pur';

/* ── LES PLACES LUES DE LA BASE ─────────────────────────────────────────── */

/** Les places restantes que la base a dites, par jour puis par offre
    (identifiant ou code, tel que la base l'écrit). */
export type CarteDesPlacesDeLaRemise = Record<string, Record<string, number>>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** LA RÉPONSE DE `places_de_la_remise`, lue sans confiance : une ligne
    illisible (sans jour, sans offre, sans nombre) ne dit rien, et rien n'est
    jamais négatif. Une réponse qui n'est pas une liste ne dit rien du tout. */
export function carteDesPlacesDeLaRemise(lignes: unknown): CarteDesPlacesDeLaRemise {
  const carte: CarteDesPlacesDeLaRemise = {};
  if (!Array.isArray(lignes)) return carte;
  for (const l of lignes) {
    if (!l || typeof l !== 'object') continue;
    const r = l as { jour?: unknown; offre?: unknown; places?: unknown };
    const jour = String(r.jour ?? '').slice(0, 10);
    const offre = String(r.offre ?? '').trim();
    const n = typeof r.places === 'number' ? r.places : typeof r.places === 'string' && r.places.trim() !== '' ? Number(r.places) : NaN;
    if (!ISO.test(jour) || !offre || !Number.isFinite(n)) continue;
    (carte[jour] ??= {})[offre] = Math.max(0, Math.floor(n));
  }
  return carte;
}

/** UNE FENÊTRE RELUE REMPLACE CE QU'ON SAVAIT DE SES JOURS : chaque jour de
    la fenêtre prend ce que la base vient de dire, ou s'efface. Une panne
    (`null`) efface la fenêtre entière : on ne garde jamais une place qu'on
    ne sait plus, et un jour qu'on ne sait pas ne se remise pas. */
export function fondsLaFenetre(
  avant: CarteDesPlacesDeLaRemise,
  jours: readonly string[],
  lues: CarteDesPlacesDeLaRemise | null,
): CarteDesPlacesDeLaRemise {
  const carte: CarteDesPlacesDeLaRemise = { ...avant };
  for (const j of jours) {
    if (lues && lues[j]) carte[j] = { ...lues[j] };
    else delete carte[j];
  }
  return carte;
}

/** LES PLACES D'UNE OFFRE UN JOUR, telles que lues. `null` : la base n'a rien
    dit de ce jour pour elle, et alors aucune remise ne se pose. */
export function placesLues(
  carte: CarteDesPlacesDeLaRemise | null | undefined,
  offre: { id?: string; code?: string },
  jour: string | null | undefined,
): number | null {
  const duJour = carte?.[String(jour ?? '').slice(0, 10)];
  if (!duJour) return null;
  if (offre.id && duJour[offre.id] !== undefined) return duJour[offre.id];
  const code = codeNormalise(offre.code);
  if (code) for (const [k, v] of Object.entries(duJour)) if (codeNormalise(k) === code) return v;
  return null;
}

/** La place partie : le jour se ferme ici aussitôt, sans attendre la relecture. */
export function laPlaceEstPartie(
  carte: CarteDesPlacesDeLaRemise,
  offre: { id?: string; code?: string },
  jour: string,
): CarteDesPlacesDeLaRemise {
  const cle = offre.id || codeNormalise(offre.code);
  if (!cle || !ISO.test(jour)) return carte;
  return { ...carte, [jour]: { ...(carte[jour] ?? {}), [cle]: 0 } };
}

/* ── UNE SEULE REMISE : LA TÊTE ─────────────────────────────────────────── */

/** Ce que Ma Couronne sait d'une tête pour la remise : aux prix convenus
    (`aUnPrixConvenu`, le prédicat de toute la Maison), abonnée (une formule
    qui court au relevé, le juge unique de l'abonnée). */
export type TeteALaRemise = { prixConvenus?: boolean; abonnee?: boolean };

/** AUCUNE REMISE, AUCUNE OFFRE, NULLE PART : il suffit qu'une des têtes en
    jeu (le compte connecté, la tête pour qui elle réserve) soit aux prix
    convenus ou abonnée. « Sur Ma Couronne de ces clients-là, en aucune
    circonstance » : la mère abonnée ne voit pas de remise en réservant pour
    sa fille, sa fille aux prix convenus n'en reçoit pas. */
export const aucuneRemisePour = (tetes: readonly (TeteALaRemise | null | undefined)[]): boolean =>
  tetes.some((x) => !!x && (!!x.prixConvenus || !!x.abonnee));

/** Les têtes en jeu, réunies : aux prix convenus si l'une l'est, abonnée si
    l'une l'est. C'est ce que lit `remiseFamilleDeLaTete`. */
export const lesTetesReunies = (tetes: readonly (TeteALaRemise | null | undefined)[]): TeteALaRemise => ({
  prixConvenus: tetes.some((x) => !!x?.prixConvenus),
  abonnee: tetes.some((x) => !!x?.abonnee),
});

/** Abonnée au sens de Ma Couronne : au moins une formule qui court au relevé
    (retenue, en cours, en pause, épuisée, ou la lune réglée d'une Chaque
    Lune résiliée). Une formule finie ne fait plus d'elle une abonnée. */
export const formulesQuiCourent = (releve: { contrats?: readonly unknown[] } | null | undefined): boolean =>
  (releve?.contrats?.length ?? 0) > 0;

/* ── NI LES AUTRES REMISES, EN AUCUNE CIRCONSTANCE ─────────────────────────
   4 novembre 2026, au sélecteur (Yéman) : à une cliente aux prix convenus ou
   abonnée (`aucuneRemisePour`), Ma Couronne ne montre ni n'applique AUCUNE
   remise ni aucun avantage chiffré. Trois de plus que les places : l'avantage
   abonné du sur-mesure, la remise Foyer à l'achat d'une formule, les soins
   offerts du Cercle. */

/** L'AVANTAGE ABONNÉ DU SUR-MESURE (−15 %, réglé au Trône) : rien pour elle.
    C'est aussi ce que la composition transmet au Trône. */
export const avantageDuSurMesure = (pct: number, aucuneRemise: boolean): number =>
  (aucuneRemise ? 0 : Math.max(0, Math.round(pct || 0)));

/** LE RANG QUI DONNE LA REMISE FOYER (deuxième ou troisième tête,
    `leFoyerJoue`) : pour elle, celui d'une première tête. Le serveur juge de
    même à la souscription (0155, `abo_foyer_sans_remise`). */
export const rangDuFoyerPourElle = (rang: number, aucuneRemise: boolean): number => (aucuneRemise ? 1 : rang);

/** LES SOINS OFFERTS DU CERCLE (ses récompenses, les sceaux du Foyer) : aucun
    pour elle, ni montré ni gardé ici. Ils restent sur sa fiche. */
export const soinsOffertsPourElle = <T>(soins: readonly T[] | null | undefined, aucuneRemise: boolean): T[] =>
  (aucuneRemise ? [] : [...(soins ?? [])]);

/* ── LA PLACE D'UN JOUR, POUR SON RITUEL ────────────────────────────────── */

const pctDe = (o: { discountPct?: number } | null | undefined): number => Math.max(0, Math.round(o?.discountPct ?? 0));

/** LA PLACE LIMITÉE QUI VAUT CE JOUR-LÀ POUR CE RITUEL, ou `null`.

    SEULES LES OFFRES À PLACES SE POSENT D'ELLES-MÊMES ICI : une offre du jour
    de la venue sans places (l'ancien mercredi de la Maison, éteint le
    4 novembre 2026) ne revient pas par Ma Couronne, même rallumée.

    Les places sont celles que la base a dites (`placesConnues`) ; l'horizon,
    les jours et le passé se rejugent ici sur les RÉGLAGES de l'offre, jamais
    sur une constante. Une place que son rendez-vous tient déjà à cette date
    est gardée (`offreTenue`). */
export function laPlaceDuJour<T extends OffreCodee & { branchId?: string }>(
  offres: readonly T[],
  e: {
    branchId?: string;
    dateIso: string | null | undefined;
    serviceIds: readonly string[];
    carte: CarteDesPlacesDeLaRemise | null | undefined;
    aujourdhui: string;
    /** Prix convenus ou abonnée, d'une des têtes en jeu. */
    aucuneRemise?: boolean;
    /** Une autre remise est déjà là (famille, geste de la Maison). */
    autreRemise?: boolean;
    /** Une offre de saison a déjà été choisie (une carte d'offre). */
    dejaUnCode?: boolean;
    /** Elle a choisi le tarif de la Maison ce jour-là (la place est partie). */
    renonceLe?: string | null;
    /** L'offre dont son rendez-vous tient déjà une place à CETTE date. */
    offreTenue?: string;
  },
): T | null {
  if (e.aucuneRemise || !e.dateIso) return null;
  const jour = String(e.dateIso).slice(0, 10);
  if (e.renonceLe && e.renonceLe === jour) return null;
  let mieux: T | null = null;
  for (const o of offres) {
    if (!o || !estAPlaces(o)) continue;
    const tenue = !!o.id && e.offreTenue === o.id;
    /* Le passé et l'horizon, sur le réglage de l'offre (les jours et la
       saison, `offreDuJourDeLaVenue` les juge) : même lue de la base, une
       place au-delà ne se pose pas. Une place tenue est gardée. */
    const horizon = Math.floor(o.horizonJours ?? 0);
    if (!tenue && (jour < e.aujourdhui || (horizon > 0 && joursEntre(e.aujourdhui, jour) > horizon))) continue;
    const r = offreDuJourDeLaVenue([o], {
      branchId: e.branchId,
      dateIso: jour,
      serviceIds: e.serviceIds,
      dejaUnCode: e.dejaUnCode,
      autreRemise: e.autreRemise,
      offreTenue: e.offreTenue,
      aujourdhui: e.aujourdhui,
      placesConnues: placesLues(e.carte, o, jour),
    });
    if (r && (!mieux || pctDe(r) > pctDe(mieux))) mieux = r;
  }
  return mieux;
}

/* ── LE PANIER, SOUS UNE SEULE REMISE ───────────────────────────────────── */

/** Une ligne du panier telle que le chiffre la lit. */
export type LigneDuPanier = {
  id: string;
  /** Son prix ici (`prixDansPanier`), geste de la Maison compris. */
  prixXof: number;
  /** Prix à la Maison : hors du total connu. */
  masque?: boolean;
  /** Prix ferme : ni devis ni variable non fixé. */
  ferme: boolean;
  /** Au forfait : la remise famille ne s'y pose pas. */
  forfait?: boolean;
  /** AUCUNE remise, d'aucune sorte, famille comprise (le Rituel Sówà™). */
  sansRemise?: boolean;
};

export type RemiseRetenue = 'aucune' | 'geste' | 'famille' | 'offre' | 'place';

export type ChiffreDuPanier = {
  /** Le total connu, avant toute remise. */
  connu: number;
  /** La part au forfait. */
  forfaits: number;
  /** La part qui ne prend aucune remise. */
  sansRemiseXof: number;
  pctFamille: number;
  remiseFamille: number;
  /** L'offre de saison choisie (carte d'offre), en pour cent et en francs. */
  pctOffre: number;
  remiseOffre: number;
  /** La place limitée, l'arrondi au millier déjà repris. */
  remisePlace: number;
  /** La seule remise retenue. */
  retenue: RemiseRetenue;
  /** Ce qu'elle paiera. */
  prix: number;
};

/** LE CHIFFRE D'UN PANIER, SOUS UNE SEULE REMISE.

    L'ordre est celui de la Maison, et une seule passe :
      1. prix convenus ou abonnée : rien, ni famille, ni offre, ni place ;
      2. un geste offert par la Maison est déjà la remise du rituel (« une
         seule faveur à la fois », 16 août 2026) ;
      3. la remise famille, déjà jugée pour la tête (`remiseFamilleDeLaTete`),
         hors forfaits et hors lignes sans remise ; présente, rien d'autre ;
      4. l'offre de saison choisie, sur tout sauf les lignes sans remise ;
      5. la place limitée, ligne à ligne, puis le net au millier.

    « LA PLUS FORTE DES DEUX » (2 novembre 2026) N'EST PLUS : une remise
    famille présente ferme la place, quel que soit le chiffre. */
export function leChiffreDuPanier(e: {
  lignes: readonly LigneDuPanier[];
  famillePct: number;
  offreDeSaisonPct?: number;
  place?: OffreCodee | null;
  aucuneRemise?: boolean;
  geste?: boolean;
}): ChiffreDuPanier {
  const vues = e.lignes.filter((l) => !l.masque);
  const somme = (f: (l: LigneDuPanier) => boolean) => vues.filter(f).reduce((n, l) => n + Math.max(0, Math.round(l.prixXof)), 0);
  const connu = somme(() => true);
  const forfaits = somme((l) => !!l.forfait);
  const sansRemiseXof = somme((l) => !!l.sansRemise);
  const zero = { connu, forfaits, sansRemiseXof, pctFamille: 0, remiseFamille: 0, pctOffre: 0, remiseOffre: 0, remisePlace: 0 };
  if (e.aucuneRemise) return { ...zero, retenue: 'aucune', prix: connu };
  if (e.geste) return { ...zero, retenue: 'geste', prix: connu };

  const pctFamille = Math.max(0, Math.round(e.famillePct));
  const baseFamille = somme((l) => !l.forfait && !l.sansRemise);
  const remiseFamille = pctFamille > 0 ? Math.round(baseFamille * (pctFamille / 100)) : 0;
  if (remiseFamille > 0) return { ...zero, pctFamille, remiseFamille, retenue: 'famille', prix: Math.max(0, connu - remiseFamille) };

  const pctOffre = Math.max(0, Math.min(90, Math.round(e.offreDeSaisonPct ?? 0)));
  if (pctOffre > 0) {
    const base = connu - sansRemiseXof;
    const remiseOffre = base - Math.round(base * (1 - pctOffre / 100));
    if (remiseOffre > 0) return { ...zero, pctOffre, remiseOffre, retenue: 'offre', prix: Math.max(0, connu - remiseOffre) };
  }

  if (e.place) {
    const r = ceQueLeCodeRetire(lignesDuCode(
      vues.map((l) => ({ id: l.id, prixXof: Math.max(0, Math.round(l.prixXof)), ferme: l.ferme && !l.sansRemise })),
      e.place,
    ));
    const remisePlace = Math.max(0, r.retire - arrondiDuNet(r.net, r.retire));
    if (remisePlace > 0) return { ...zero, remisePlace, retenue: 'place', prix: Math.max(0, connu - remisePlace) };
  }
  return { ...zero, retenue: 'aucune', prix: connu };
}

/** Le pourcentage que porte UNE ligne sous la remise retenue : celui de la
    place (si l'offre couvre la ligne), ou celui de l'offre de saison ; rien
    sur une ligne sans remise, au devis ou à prix masqué. La remise famille,
    elle, se dit en francs sur le total, jamais ligne à ligne. */
export function pctDeLaLigne(
  c: Pick<ChiffreDuPanier, 'retenue' | 'pctOffre'>,
  l: Pick<LigneDuPanier, 'id' | 'ferme' | 'sansRemise' | 'masque'>,
  place: OffreCodee | null | undefined,
): number {
  if (l.sansRemise || l.masque) return 0;
  if (c.retenue === 'offre') return c.pctOffre;
  if (c.retenue === 'place' && place && l.ferme && (place.serviceIds ?? []).includes(l.id)) return pctDe(place);
  return 0;
}

/* ── LE REFUS DE LA BASE ────────────────────────────────────────────────── */

/** La base refuse une place partie entre l'écran et l'écriture : son garde
    écrit un message qui commence par `PLACES_LIMITEES:`. */
export const estLaPlacePartie = (message: string | null | undefined): boolean =>
  /\bPLACES_LIMITEES:/.test(String(message ?? ''));
