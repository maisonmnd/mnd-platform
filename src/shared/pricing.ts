import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { Service } from './catalog';
import type { Client } from './clients';

/* L'intelligence des prix — le prix d'une cliente dépend de son MODÈLE (nombre
   de locks : 100, 204, 450…) et de son Juste Prix (coefficient personnel).

       prix personnalisé = prix catalogue × coef du modèle × Juste Prix
       durée personnalisée = durée catalogue × coef de durée du modèle

   Le modèle est porté par un BARÈME PAR TRANCHES (éditable au Juste Prix) : une
   tranche de locks → un coefficient de prix et un coefficient de durée. Seules
   les prestations qui « suivent le modèle » sont concernées (interrupteur par
   prestation au Catalogue ; par défaut : entretien, resserrage et soins — les
   créations VÈKPÈ ont déjà leurs variantes par taille). Le prix personnalisé se
   FIGE sur le rendez-vous dès la réservation (invariant : le prix d'origine
   fait foi) — retoucher le barème ne réécrit jamais l'histoire. */

export type ModelBand = {
  id: string;
  /** Nom du calibre — « Jumbo », « Micro », « Galaxy ». La Maison parle en calibres,
      pas en tranches : sans ce nom, l'écran n'afficherait que « 251 – 400 locks ». */
  name?: string;
  /** Borne haute de la tranche (nombre de locks inclus) — null = dernière tranche, sans plafond. */
  maxLocks: number | null;
  coef: number; // coefficient de PRIX
  durCoef: number; // coefficient de DURÉE
};

/** LES CALIBRES — colonne vertébrale de l'arborescence v6 : le même langage de
    taille commande la création VÈKPÈ™, le resserrage SÍNSIN™ et la lecture des prix.
    Le calibre se constate au KÒKÒ™ et s'inscrit sur la fiche cliente ; il ne se
    rediscute pas en caisse.

    Les coefficients sont calés sur le SÍNSIN™ Essentielle de v6 (20 · 25 · 35 · 45 ·
    55 000 F), le Medium servant de base ×1. GALAXY n'est pas dans v6 : il a été
    ajouté parce qu'une cliente réelle porte 700 locks — et que son resserrage a été
    facturé 70 000 F, soit exactement 2,8 × la base. Sans plafond, aucune cliente ne
    peut sortir du barème. */
export const MODEL_BANDS_SEED: ModelBand[] = [
  { id: 'cal-jumbo', name: 'Jumbo', maxLocks: 100, coef: 0.8, durCoef: 0.7 },
  { id: 'cal-medium', name: 'Medium', maxLocks: 180, coef: 1, durCoef: 1 },
  { id: 'cal-mini', name: 'Mini', maxLocks: 250, coef: 1.4, durCoef: 1.4 },
  { id: 'cal-micro', name: 'Micro', maxLocks: 400, coef: 1.8, durCoef: 1.9 },
  { id: 'cal-nano', name: 'Nano', maxLocks: 600, coef: 2.2, durCoef: 2.4 },
  { id: 'cal-galaxy', name: 'Galaxy', maxLocks: null, coef: 2.8, durCoef: 2.8 },
];

export const modelBandsStore = createStore<ModelBand[]>('mnd_model_bands', MODEL_BANDS_SEED);
export const useModelBands = () => useStore(modelBandsStore);
bindDocument(modelBandsStore, 'mnd_model_bands');

/** BARÈME PROPRE À VÈKPÈ™ · LA NAISSANCE.

    Une création ne progresse pas comme un resserrage. Sur les tarifs v6, en
    prenant Medium pour base :

      calibre   SÍNSIN™ (GBÈJÍ)     VÈKPÈ™ (création)
      Jumbo     ×0,8   (20 000)     ×0,53  ( 80 000)
      Medium    ×1     (25 000)     ×1     (150 000)
      Mini      ×1,4   (35 000)     ×1,33  (200 000)
      Micro     ×1,8   (45 000)     ×2,33  (350 000)
      Nano      ×2,2   (55 000)     ×3,33  (500 000)

    L'écart n'est pas un détail : appliquer le barème de GBÈJÍ™ à une création
    Nano la sous-facturerait d'un tiers. Poser des locks fines coûte du temps de
    façon bien plus que proportionnelle ; les resserrer, non.

    Les coefficients de DURÉE suivent les durées annoncées (3–4 h en Jumbo,
    2 jours en Micro et Nano). GALAXY est extrapolé — v6 s'arrête à 600 locks. */
export const VEKPE_BANDS_SEED: ModelBand[] = [
  { id: 'cal-jumbo', name: 'Jumbo', maxLocks: 100, coef: 0.53, durCoef: 0.74 },
  { id: 'cal-medium', name: 'Medium', maxLocks: 180, coef: 1, durCoef: 1 },
  { id: 'cal-mini', name: 'Mini', maxLocks: 250, coef: 1.33, durCoef: 1.32 },
  { id: 'cal-micro', name: 'Micro', maxLocks: 400, coef: 2.33, durCoef: 2.11 },
  { id: 'cal-nano', name: 'Nano', maxLocks: 600, coef: 3.33, durCoef: 2.53 },
  { id: 'cal-galaxy', name: 'Galaxy', maxLocks: null, coef: 4.2, durCoef: 3 },
];

/** LES BARÈMES PAR ATELIER — clé = identifiant de CATÉGORIE du catalogue.
    Une catégorie absente de cette table suit le barème de la Maison
    (`modelBandsStore`). C'est ce qui permet à VÈKPÈ™ d'avoir ses propres
    coefficients sans que GBÈJÍ™ ni le plateau ne bougent. */
export const bandSetsStore = createStore<Record<string, ModelBand[]>>('mnd_model_band_sets', {
  'atl-i-vekpe': VEKPE_BANDS_SEED,
});
export const useBandSets = () => useStore(bandSetsStore);
bindDocument(bandSetsStore, 'mnd_model_band_sets');

/** Le barème qui s'applique à une catégorie : le sien s'il existe, sinon celui
    de la Maison. */
export const bandsForCategory = (
  categoryId: string,
  sets: Record<string, ModelBand[]>,
  defauts: ModelBand[],
): ModelBand[] => (sets[categoryId]?.length ? sets[categoryId] : defauts);

/** Tranches triées par plafond croissant (la sans-plafond en dernier). */
export const sortedBands = (bands: ModelBand[]): ModelBand[] =>
  [...bands].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));

/** Étendue d'une tranche — « 181 – 250 locks », « > 600 locks ». */
export const bandRange = (band: ModelBand, bands: ModelBand[]): string => {
  const sorted = sortedBands(bands);
  const i = sorted.findIndex((b) => b.id === band.id);
  const prevMax = i > 0 ? sorted[i - 1].maxLocks ?? 0 : 0;
  if (band.maxLocks == null) return `> ${prevMax} locks`;
  return prevMax === 0 ? `≤ ${band.maxLocks} locks` : `${prevMax + 1} – ${band.maxLocks} locks`;
};

/** Libellé lisible — « Mini · 181 – 250 locks ». Le nom du calibre passe devant :
    c'est lui qu'on prononce au fauteuil, l'étendue n'est que sa définition. */
export const bandLabel = (band: ModelBand, bands: ModelBand[]): string =>
  band.name ? `${band.name} · ${bandRange(band, bands)}` : bandRange(band, bands);

/** La tranche d'un modèle (nombre de locks) — undefined si modèle inconnu ou barème vide. */
export const bandOf = (lockCount: number | undefined, bands: ModelBand[]): ModelBand | undefined => {
  if (!lockCount || lockCount <= 0 || bands.length === 0) return undefined;
  const sorted = sortedBands(bands);
  return sorted.find((b) => lockCount <= (b.maxLocks ?? Infinity)) ?? sorted[sorted.length - 1];
};

/* Prestations HORS Juste Prix (décision maison) — prix catalogue FERME : jamais
   modulé par le modèle NI par le coefficient personnel, sur toutes les surfaces.
   Par identifiant (stable) — un renommage ne le casse pas. Cette exemption prime
   sur l'interrupteur ◈ du Catalogue : pour ces trois-là, le prix ne bouge pas. */
export const FIXED_PRICE_SERVICE_IDS = new Set<string>([
  'sv-gbigbi-essentiel', // FÍNFÍN™ Éveil
  'sv-rituel-mq6wbusw',  // SÍNSIN™ La Reprise Frontal
  'sv-rituel-mq6zu12s',  // SÍNSIN™ La Reprise Réveil Frontal +
  'sv-rituel-mp2qnjwa',  // FÍNFÍN™ Sublimation
]);
export const isFixedPrice = (sv: { id?: string }): boolean => !!sv.id && FIXED_PRICE_SERVICE_IDS.has(sv.id);

/** Une prestation suit-elle le modèle ? Hors Juste Prix → non. Sinon UNIQUEMENT
    si l'interrupteur est posé au Catalogue — jamais déduit du libellé. */
export const scalesWithModel = (s: Pick<Service, 'name' | 'categoryId'> & { id?: string; scalesWithModel?: boolean }): boolean => {
  if (isFixedPrice(s)) return false;
  /* LE COMPORTEMENT TARIFAIRE NE SE DEDUIT PLUS DU NOM. La regle precedente
     lisait le libelle : toute prestation contenant « resserrage » ou
     « entretien » etait indexee sur le nombre de locks, meme a prix fixe. Quatre
     forfaits et deux formations de l'Academie tombaient dedans par accident —
     « Les 3 Premiers Entretiens » a 380 000 F etait facture 1 265 500 F a une
     cliente Nano, et le prix d'une formation dependait du nombre de locks de
     l'eleve. Les identifiants de la liste ('sinsin', 'finfin', 'cat-finfin')
     ne correspondaient d'ailleurs a aucune categorie reelle du catalogue v6.
     Seul le champ explicite fait foi desormais. */
  return s.scalesWithModel === true;
};

/** Arrondi commercial — au 500 F, un prix se dit sans virgule au comptoir. */
export const roundPrice = (x: number): number => Math.round(x / 500) * 500;

/** `lockCount` est porté ici — et pas seulement résumé par `band` — parce que les
    prestations au lock comptent le nombre EXACT de locks, là où la tranche ne
    donne qu'un coefficient. Le transporter dans le contexte évite de toucher aux
    dizaines d'appels existants à `personalPriceXof`. */
export type PersonalPricing = {
  band?: ModelBand;
  clientCoef: number;
  lockCount?: number;
  /** Barèmes par atelier, s'il y en a. Portés ici pour que `personalPriceXof`
      choisisse la bonne tranche SANS que chaque appelant ait à le savoir. */
  sets?: Record<string, ModelBand[]>;
};

/** Le contexte tarifaire d'une cliente : sa tranche de modèle + son Juste Prix.
    `sets` est facultatif : sans lui, tout suit le barème de la Maison, comme avant. */
export const pricingOf = (
  client: Pick<Client, 'lockCount' | 'priceCoef'> | undefined,
  bands: ModelBand[],
  sets?: Record<string, ModelBand[]>,
): PersonalPricing => ({
  band: bandOf(client?.lockCount, bands),
  clientCoef: client?.priceCoef && client.priceCoef > 0 ? client.priceCoef : 1,
  lockCount: client?.lockCount,
  sets,
});

/** La tranche qui s'applique À CETTE prestation : celle de son atelier si
    l'atelier a son barème, sinon celle de la Maison déjà calculée. */
export const bandForService = (sv: Pick<Service, 'categoryId'>, p: PersonalPricing): ModelBand | undefined => {
  const propre = p.sets?.[sv.categoryId];
  return propre?.length ? bandOf(p.lockCount, propre) : p.band;
};

/** Y a-t-il quelque chose à personnaliser (modèle connu ou Juste Prix ≠ 1) ? */
export const isPersonalized = (p: PersonalPricing): boolean => !!p.band || p.clientCoef !== 1;

/** Prix AU LOCK — `lockCount × ratePerLock`, sans borne. Rend undefined si la
    prestation n'est pas au lock ou si le modèle est inconnu : l'appelant retombe
    alors sur le prix catalogue (« à partir de »).

    PAS de plancher ni de plafond, et pas d'arrondi commercial : le contrôle sur
    les rendez-vous de l'ancien ERP a tranché — 13 sur 16 au franc près avec la
    règle nue, contre 7 sur 16 dès qu'on borne. Les prix « affichés » du catalogue
    (15 000 → 25 000 F) ne sont qu'une fourchette de vitrine, jamais une limite :
    455 locks ont été facturés 500 500 F. Borner ici aurait plafonné à 110 000 F. */
export const perLockPriceXof = (
  sv: Pick<Service, 'ratePerLock' | 'priceFloors'>,
  lockCount: number | undefined,
  band?: ModelBand,
): number | undefined => {
  if (!sv.ratePerLock || !lockCount || lockCount <= 0) return undefined;
  const brut = lockCount * sv.ratePerLock;
  /* Plancher du calibre — jamais de plafond : 455 locks ont bien été facturés
     500 500 F dans l'ancien ERP, très au-delà du prix « affiché ». */
  const plancher = band ? sv.priceFloors?.[band.id] ?? 0 : 0;
  return Math.max(brut, plancher);
};

/** Prix personnalisé d'une prestation. Trois régimes, dans cet ordre :
    ① prix ferme (hors Juste Prix) — rien ne le module ;
    ② tarif AU LOCK — compté lock par lock, le coefficient de tranche ne s'y
       applique pas (il ferait double emploi et quantifierait un prix continu) ;
    ③ prix catalogue × coefficient de tranche.
    Le Juste Prix de la cliente s'applique aux régimes ② et ③. */
/** La prestation sert-elle le calibre de cette cliente ? Une création liée à un
    calibre n'existe pas ailleurs : ni plus chère, ni moins — hors sujet. */
/** Le calibre auquel une prestation est LIÉE.

    Explicite via `bandId`, ou DÉDUIT de ses planchers : une prestation qui n'a
    qu'un seul plancher n'existe que dans ce calibre-là. C'est le cas des cinq
    créations VÈKPÈ™ — un Jumbo, c'est 50 à 100 locks, au-delà il n'existe pas.
    Le SÍNSIN™, lui, porte six planchers : il sert tous les calibres.

    La déduction compte autant que le champ : le catalogue en base a été importé
    avant que `bandId` n'existe, et attendre une migration pour que l'écran dise
    la vérité n'avait pas de sens. */
export const bandIdOf = (sv: Pick<Service, 'bandId' | 'priceFloors'>): string | undefined => {
  if (sv.bandId) return sv.bandId;
  const cles = Object.keys(sv.priceFloors ?? {});
  return cles.length === 1 ? cles[0] : undefined;
};

/** LES CALIBRES SERVIS SONT CEUX QUI ONT UN PLANCHER. Un seul plancher = la
    prestation n'existe que dans ce calibre (les créations VÈKPÈ™). Plusieurs
    planchers = elle sert exactement ceux-là, et pas les autres — c'est ce qui
    permet d'étendre une création au-delà de son calibre d'origine sans la
    proposer à tout le monde. Aucun plancher = elle sert tout le monde. */
export const servesBand = (sv: Pick<Service, 'bandId' | 'priceFloors'>, band: ModelBand | undefined): boolean => {
  if (!band) return true;
  if (sv.bandId) return sv.bandId === band.id;
  const cles = Object.keys(sv.priceFloors ?? {});
  return cles.length === 0 || cles.includes(band.id);
};

/** Qui commande le prix de cette prestation — le comptage ou la tranche.
    Sans choix explicite, on garde le comportement historique : le tarif au lock
    s'il existe, la tranche sinon. Rien ne bouge tant que la Maison n'a pas
    bascule l'interrupteur au Catalogue. */
export const tarifModeOf = (sv: Pick<Service, 'tarifMode' | 'ratePerLock'>): 'lock' | 'calibre' =>
  sv.tarifMode ?? (sv.ratePerLock ? 'lock' : 'calibre');

/** Le prix de cette prestation est-il EXACTEMENT connu pour cette cliente ?

    Vrai des que son modele permet de trancher : un tarif au lock avec un
    comptage, ou un prix par calibre avec un calibre. Dans ces cas l'ecran doit
    afficher le montant ferme, pas « des X F » — annoncer une fourchette sur un
    prix qu'on sait calculer fait ressaisir a la main un montant deja connu. */
export const prixFerme = (sv: Service, p: PersonalPricing): boolean => {
  if (isFixedPrice(sv)) return true;
  const bande = bandForService(sv, p);
  if (tarifModeOf(sv) === 'calibre') return !!bande && sv.priceFloors?.[bande.id] !== undefined;
  return !!p.lockCount;
};

export const personalPriceXof = (sv: Service, p: PersonalPricing): number => {
  if (isFixedPrice(sv)) return sv.priceXof; // hors Juste Prix — prix catalogue ferme
  /* Hors de son calibre : on rend le prix catalogue, sans personnalisation.
     Calculer « 200 locks × 1 100 F » sur un Jumbo donnait 220 000 F pour les
     cinq créations à la fois — un prix identique du Jumbo au Nano, qui ne
     voulait rien dire. */
  const bande = bandForService(sv, p);
  /* Hors de son calibre : prix catalogue, sans personnalisation. */
  if (!servesBand(sv, bande)) return sv.priceXof;

  /* PRIX PAR CALIBRE — quand l'interrupteur du Catalogue le dit. Le plancher
     de la tranche EST le prix, pas un minimum ; le tarif au lock reste inscrit
     sur la fiche mais ne commande pas.

     Avant cette regle, le tarif au lock etait de toute facon inerte : a 100 F
     le lock, le plafond du calibre Medium donnait 18 000 F contre un plancher
     a 25 000 F. Le plancher gagnait partout sauf au-dela de 550 locks, et deux
     clientes a 105 et 180 locks payaient le meme prix sans que rien ne le dise. */
  if (tarifModeOf(sv) === 'calibre' && bande && sv.priceFloors?.[bande.id] !== undefined) {
    const parCalibre = sv.priceFloors[bande.id];
    return p.clientCoef === 1 ? parCalibre : roundPrice(parCalibre * p.clientCoef);
  }

  const auLock = perLockPriceXof(sv, p.lockCount, bande);
  /* Pas d'arrondi au 500 sur un prix au lock non modulé : 113 locks font
     11 300 F, et l'arrondi commercial les transformerait en 11 500 F — un écart
     inventé sur chaque cliente dont le compte de locks n'est pas rond. L'arrondi
     ne revient que si le Juste Prix personnel entre en jeu et produit une décimale. */
  if (auLock !== undefined) return p.clientCoef === 1 ? auLock : roundPrice(auLock * p.clientCoef);
  const modelCoef = scalesWithModel(sv) && bande ? bande.coef : 1;
  return roundPrice(sv.priceXof * modelCoef * p.clientCoef);
};

/** Durée personnalisée d'une prestation — calée au quart d'heure, jamais nulle. */
export const personalDurationMin = (sv: Service, p: PersonalPricing): number => {
  if (isFixedPrice(sv)) return sv.durationMin; // hors Juste Prix — durée catalogue
  const bande = bandForService(sv, p);
  const c = scalesWithModel(sv) && bande ? bande.durCoef : 1;
  return Math.max(15, Math.round((sv.durationMin * c) / 15) * 15);
};

/** Répartit un TOTAL en parts entières proportionnelles à des poids — la dernière
    part absorbe l'arrondi pour que la somme égale EXACTEMENT le total. Sert à
    ventiler un prix (figé ou net) par prestation de façon IDENTIQUE au rendez-vous
    et à la facture : chacune pèse selon son prix personnalisé, jamais le catalogue.
    Poids nuls/absents → parts égales. */
export const splitByWeights = (total: number, weights: number[]): number[] => {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  let acc = 0;
  return weights.map((w, i) => {
    if (i === n - 1) return total - acc; // la dernière solde le reste (somme exacte)
    const share = sum > 0 ? Math.round((total * Math.max(0, w)) / sum) : Math.round(total / n);
    acc += share;
    return share;
  });
};
