import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { mondeDeCat, priceModeOf, type CatalogCategory, type LongueurId, type Service } from './catalog';
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
  /** SES PRIX FERMES, prestation par prestation (voir `Client.prixFixes`).
      Portés dans le contexte pour que `personalPriceXof` les applique sans
      qu'aucun appelant ait à le savoir — la réservation, la Caisse, la Vitrine
      et Ma Couronne passent tous par lui. */
  prixFixes?: Record<string, number>;
  /** Barèmes par atelier, s'il y en a. Portés ici pour que `personalPriceXof`
      choisisse la bonne tranche SANS que chaque appelant ait à le savoir. */
  sets?: Record<string, ModelBand[]>;
  /** L'arbre des categories — pour remonter d'une famille a son atelier. Le
      bareme est attache a l'ATELIER : sans cette remontee, une prestation
      rangee sous SINSIN cesserait de suivre le bareme de GBEJI. `maison` sert
      au juge des mondes : le Juste Prix ne touche que l'ATELIER (13 août). */
  cats?: Pick<CatalogCategory, 'id' | 'parentId' | 'maison'>[];
  /** LA LONGUEUR TRAVAILLÉE. Depuis le 11 août, la fiche porte un DÉFAUT que
      `pricingOf` hérite (Ma Couronne montre ainsi SES prix) ; l'écran qui
      réserve pose la sienne par-dessus, et le rendez-vous la fige. Absente,
      une prestation à prix par longueur retombe sur son prix catalogue. */
  longueur?: LongueurId;
};

/** Le prix de base d'une prestation POUR CETTE LONGUEUR — son prix catalogue
    quand elle n'en a qu'un, ou quand la longueur n'est pas connue. */
export const prixDeBase = (sv: Pick<Service, 'priceXof' | 'prixParLongueur'>, p: PersonalPricing): number =>
  (p.longueur ? sv.prixParLongueur?.[p.longueur] : undefined) ?? sv.priceXof;

/** Le contexte tarifaire d'une cliente : sa tranche de modèle + son Juste Prix.
    `sets` est facultatif : sans lui, tout suit le barème de la Maison, comme avant. */
export const pricingOf = (
  client: Pick<Client, 'lockCount' | 'priceCoef' | 'prixFixes' | 'longueur'> | undefined,
  bands: ModelBand[],
  sets?: Record<string, ModelBand[]>,
  /* L'arbre des categories : sans lui, une prestation rangee sous une famille
     ne trouverait pas le bareme de son atelier. Facultatif — absent, tout se
     comporte comme avant la mise en place des familles. */
  cats?: Pick<CatalogCategory, 'id' | 'parentId' | 'maison'>[],
): PersonalPricing => ({
  band: bandOf(client?.lockCount, bands),
  clientCoef: client?.priceCoef && client.priceCoef > 0 ? client.priceCoef : 1,
  lockCount: client?.lockCount,
  prixFixes: client?.prixFixes,
  /* SA longueur par défaut — les écrans qui posent la leur (modale RDV,
     Caisse) l'écrasent par l'étalement `{ ...pricingOf(...), longueur }` ;
     Ma Couronne, qui n'a pas de sélecteur, montre ainsi SES prix. */
  longueur: client?.longueur,
  sets,
  cats,
});

/** LE JUSTE PRIX NE TOUCHE QUE L'ATELIER (13 août, décision de Yéman). Le
    coefficient personnel a été pensé pour la couronne — appliqué en global, il
    remisait aussi une manucure du Studio et le Module Création de l'Académie
    (180 000 F). Le coefficient EFFECTIF d'une prestation est donc :
      · son monde est l'ATELIER → le coefficient de la cliente ;
      · plateau, Studio, Académie, ou monde introuvable → ×1 (on échoue fermé :
        pas de remise silencieuse sur une prestation mal rangée) ;
      · contexte SANS arbre de catégories (harnais, appels nus) → comportement
        global d'avant, pour ne déplacer aucun prix à l'aveugle. */
export const coefJustePrix = (sv: Pick<Service, 'categoryId'>, p: PersonalPricing): number => {
  if (p.clientCoef === 1) return 1;
  if (!p.cats?.length) return p.clientCoef;
  const cat = p.cats.find((c) => c.id === sv.categoryId);
  if (!cat) return 1;
  return mondeDeCat(cat, p.cats) === 'atelier' ? p.clientCoef : 1;
};

/** Le prix ferme convenu avec CETTE cliente pour CETTE prestation, s'il existe.
    Zéro et les valeurs négatives ne comptent pas : un rituel offert se dit
    « offert » sur le rendez-vous, il ne se déguise pas en prix fixe à 0 F. */
export const prixFixeDe = (sv: Pick<Service, 'id'>, p: PersonalPricing): number | undefined => {
  const v = p.prixFixes?.[sv.id];
  return typeof v === 'number' && v > 0 ? Math.round(v) : undefined;
};

/** La tranche qui s'applique À CETTE prestation : celle de son atelier si
    l'atelier a son barème, sinon celle de la Maison déjà calculée. */
export const bandForService = (sv: Pick<Service, 'categoryId'>, p: PersonalPricing): ModelBand | undefined => {
  /* On cherche le bareme sur la categorie, puis en remontant ses parents : une
     famille herite du bareme de son atelier, elle ne le redefinit pas. */
  let id: string | undefined = sv.categoryId;
  for (let i = 0; id && i < 8; i += 1) {
    const propre = p.sets?.[id];
    if (propre?.length) return bandOf(p.lockCount, propre);
    id = p.cats?.find((c) => c.id === id)?.parentId;
  }
  return p.band;
};

/** Y a-t-il quelque chose à personnaliser — modèle connu, Juste Prix ≠ 1, ou un
    PRIX FERME convenu avec elle ? Ce dernier a failli manquer : une cliente
    sans modèle ni coefficient n'était pas « personnalisée », le rendez-vous
    retombait sur le prix catalogue, et l'accord écrit sur sa fiche restait
    lettre morte au moment précis où il devait s'appliquer. */
export const isPersonalized = (p: PersonalPricing): boolean =>
  !!p.band || p.clientCoef !== 1 || Object.keys(p.prixFixes ?? {}).length > 0;

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
export const servesBand = (sv: Pick<Service, 'bandId' | 'bandIds' | 'priceFloors'>, band: ModelBand | undefined): boolean => {
  /* PLUSIEURS CALIBRES, EXPLICITES : le forfait GBÈJÍ™ Fidélité sert Micro ET
     Nano. Quand la liste est posée, elle fait foi — et un modèle INCONNU ne
     passe pas : une prestation réservée à des calibres ne se propose pas à
     une tête qu'on n'a pas encore mesurée. */
  if (sv.bandIds?.length) return !!band && sv.bandIds.includes(band.id);
  if (!band) return true;
  if (sv.bandId) return sv.bandId === band.id;
  const cles = Object.keys(sv.priceFloors ?? {});
  return cles.length === 0 || cles.includes(band.id);
};

/** La prestation est-elle OUVERTE à cette tête, vu ses venues honorées ?
    `desVenue: 3` s'ouvre quand elle a DÉJÀ 2 venues — celle qu'on réserve est
    la 3ᵉ. Sans fiche cliente (vente au comptoir), une prestation à seuil ne
    se propose pas : on ne sait pas compter les venues de personne. */
export const ouverteDesVenue = (sv: Pick<Service, 'desVenue'>, venuesAcquises: number): boolean =>
  !sv.desVenue || venuesAcquises >= sv.desVenue - 1;

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
  /* Un prix convenu avec elle est le plus ferme de tous : l'écran ne doit
     jamais l'annoncer « dès X F », ni réclamer un montant au fauteuil. */
  if (prixFixeDe(sv, p) !== undefined) return true;
  /* UNE PRESTATION « SUR DEVIS » OU « VARIABLE » N'EST JAMAIS FERME (12 août).
     Le repli `!scalesWithModel` ci-dessous est vrai pour tout service sans
     l'interrupteur — dont « Création Microlocks sur mesure » (devis, 0 F) :
     déclarée ferme, la modale RDV n'ouvrait plus son champ de montant et la
     Caisse la basculait en « fixe » en contournant le garde devisMissing —
     rituel réservé ET facturé à 0 F. Le mode du Catalogue prime : seul un
     prix FIXE peut être exactement connu ; devis et variable se conviennent
     au fauteuil (sauf prix convenu sur la fiche, jugé au-dessus). */
  if (priceModeOf(sv) !== 'fixe') return false;
  if (isFixedPrice(sv)) return true;
  const bande = bandForService(sv, p);
  if (tarifModeOf(sv) === 'calibre') {
    if (!!bande && sv.priceFloors?.[bande.id] !== undefined) return true;
    /* SANS grille par calibre NI tarif au lock, le prix ne dépend de rien
       d'inconnu : c'est `prixDeBase × coef de tranche × Juste Prix`, que
       `personalPriceXof` rend au franc près. Le déclarer « pas ferme »
       faisait RÉCLAMER un montant pour un shampoing à 10 000 F affiché en
       clair — la caissière ressaisissait un prix que l'écran connaissait déjà
       (11 août : « un prix fixe est fixe »). Ferme dès que le
       coefficient est connu : modèle renseigné, ou prestation qui ne suit
       pas le modèle du tout. */
    /* Une grille par longueur est un prix SAISI — et elle NEUTRALISE le
       modèle (voir personalPriceXof) : le prix est connu quel que soit le
       comptage. */
    if (sv.prixParLongueur && Object.keys(sv.prixParLongueur).length > 0) return true;
    if (!sv.ratePerLock) return !scalesWithModel(sv) || !!bande;
    return false;
  }
  return !!p.lockCount;
};

/** CE QUI FAIT LE PRIX DE CETTE PRESTATION — dit en une phrase, dans l'ORDRE
    même du moteur (`personalPriceXof`). Le Catalogue l'affiche sur chaque
    ligne : la Maison doit distinguer d'un regard ce qui dépend du comptage,
    du plancher par calibre, d'une grille par longueur ou du Juste Prix — les
    réglages se lisaient champ par champ, jamais comme une règle (13 août).
    `justePrix` dit si le coefficient personnel de la cliente s'appliquera. */
export type RegimeClef = 'ferme' | 'forfait' | 'devis' | 'longueur' | 'calibre' | 'lock' | 'modele' | 'variable' | 'fixe';
export type RegimeTarifaire = { k: RegimeClef; mots: string; justePrix: boolean };
const regimeBrut = (sv: Service): RegimeTarifaire => {
  if (isFixedPrice(sv)) return { k: 'ferme', mots: 'prix ferme du catalogue', justePrix: false };
  if (sv.includes?.length) return { k: 'forfait', mots: 'composition du forfait − sa remise, aux prix de la cliente', justePrix: true };
  if (priceModeOf(sv) === 'devis') return { k: 'devis', mots: 'sur devis — montant convenu au fauteuil', justePrix: false };
  if (sv.prixParLongueur && Object.keys(sv.prixParLongueur).length > 0) {
    return { k: 'longueur', mots: 'grille par longueur (court · mi-long · long), prix saisis', justePrix: true };
  }
  const planchers = Object.keys(sv.priceFloors ?? {}).length > 0;
  if (tarifModeOf(sv) === 'calibre' && planchers) {
    return { k: 'calibre', mots: 'prix par calibre — le plancher de la tranche EST le prix', justePrix: true };
  }
  if (sv.tarifMode === 'lock' && sv.ratePerLock) {
    return { k: 'lock', mots: 'comptage — locks × tarif, sans plancher', justePrix: true };
  }
  if (sv.ratePerLock) {
    return {
      k: 'lock',
      mots: planchers ? 'comptage — locks × tarif, plancher par calibre en filet' : 'comptage — locks × tarif',
      justePrix: true,
    };
  }
  if (scalesWithModel(sv)) return { k: 'modele', mots: 'prix de base × coefficient du calibre', justePrix: true };
  if (priceModeOf(sv) === 'variable') return { k: 'variable', mots: 'prix de départ « dès » — montant convenu au fauteuil', justePrix: true };
  return { k: 'fixe', mots: 'prix fixe du catalogue', justePrix: true };
};

/** Avec l'arbre des catégories, le juge applique la règle des mondes : LE
    JUSTE PRIX NE TOUCHE QUE L'ATELIER (même règle que `coefJustePrix`) —
    une prestation du plateau, du Studio ou de l'Académie dit « Juste Prix :
    non » quel que soit son régime. Sans arbre : le régime brut, comme avant. */
export const regimeTarifaire = (
  sv: Service,
  cats?: readonly Pick<CatalogCategory, 'id' | 'parentId' | 'maison'>[],
): RegimeTarifaire => {
  const r = regimeBrut(sv);
  if (!cats?.length || !r.justePrix) return r;
  const cat = cats.find((c) => c.id === sv.categoryId);
  const atelier = !!cat && mondeDeCat(cat, cats) === 'atelier';
  return atelier ? r : { ...r, justePrix: false };
};

/** LE PRIX D'UN FORFAIT POUR CETTE TETE. Somme de ses prestations au prix de la
    cliente, moins la remise du forfait. Une ligne « selon le calibre » se resout
    ici comme a la reservation : on prend la prestation de l'atelier qui sert son
    modele.

    `profondeur` arrete une composition qui se contiendrait elle-meme : un
    forfait ne peut pas se calculer a partir de lui-meme. */
export const forfaitPriceXof = (
  sv: Service,
  p: PersonalPricing,
  catalogue: readonly Service[],
  /* LES PRODUITS DE LA COMPOSITION (12 août). Le moteur les sautait en silence
     (`serviceId: ''` → find raté → continue) pendant que l'aperçu du Catalogue
     les comptait : le composeur voyait un prix qu'aucune caisse ne sonnait —
     9 600 F d'écart par vente sur un flacon à 12 000 F remisé 20 %. Le modèle
     de données a toujours dit qu'ils comptent (« il se compte dans la valeur
     du forfait ») ; leur prix est ferme, aucune personnalisation à faire. */
  produits?: readonly { id: string; priceXof: number }[],
  profondeur = 0,
): number | undefined => {
  if (!sv.includes?.length || profondeur > 2) return undefined;
  /* Un forfait SANS prix propre vaut sa composition. Poser 0 F en attendant que
     le calcul prenne le relais laissait le forfait se vendre... zero franc :
     l'intention etait claire, l'application ne la lisait pas. Remise absente et
     prix a zero = remise nulle, le forfait vaut la somme de ses prestations. */
  const remise = sv.forfaitRemisePct ?? (sv.priceXof === 0 ? 0 : undefined);
  if (remise === undefined) return undefined;
  let somme = 0;
  for (const inc of sv.includes) {
    if (inc.productId) {
      const pr = produits?.find((x) => x.id === inc.productId);
      if (pr) somme += pr.priceXof;
      continue;
    }
    const cible = inc.categoryId
      ? catalogue.find((x) => x.categoryId === inc.categoryId && servesBand(x, bandForService(x, p)))
      : catalogue.find((x) => x.id === inc.serviceId);
    if (!cible) continue;
    somme += forfaitPriceXof(cible, p, catalogue, produits, profondeur + 1) ?? personalPriceXof(cible, p);
  }
  if (somme <= 0) return undefined;
  return Math.max(0, Math.round(somme * (1 - remise / 100)));
};

/** LA PRESTATION EST-ELLE PROPOSABLE À CETTE TÊTE ? Le juge UNIQUE de
    l'éligibilité — calibre servi ET seuil de venues atteint. Quatre surfaces
    le composaient chacune à la main (modale RDV, Caisse, tunnel et reco
    Ma Couronne) et la reco avait oublié le seuil : le forfait « dès la 3ᵉ
    venue » se recommandait — et se réservait — à la première visite. */
export const estProposable = (sv: Service, p: PersonalPricing, venuesAcquises: number): boolean =>
  servesBand(sv, bandForService(sv, p)) && ouverteDesVenue(sv, venuesAcquises);

export const personalPriceXof = (sv: Service, p: PersonalPricing, catalogue?: readonly Service[], produits?: readonly { id: string; priceXof: number }[]): number => {
  /* SON PRIX FERME PASSE AVANT TOUT — avant le forfait, le calibre, le tarif au
     lock, le plancher, la longueur et le Juste Prix. C'est le sens même d'un
     prix convenu avec quelqu'un : rien de ce que la Maison recalcule ensuite
     n'a le droit de le déplacer. Le laisser passer après le coefficient, par
     exemple, l'aurait multiplié — et le montant écrit sur la fiche n'aurait
     plus été celui qu'elle paie. */
  const ferme = prixFixeDe(sv, p);
  if (ferme !== undefined) return ferme;
  if (catalogue) {
    const forfait = forfaitPriceXof(sv, p, catalogue, produits);
    /* PAS de Juste Prix ici : la composition est DÉJÀ au prix de la cliente
       (`forfaitPriceXof` somme des `personalPriceXof`, qui l'appliquent).
       Le multiplier encore l'appliquait DEUX FOIS — une cliente à ×0,5
       payait le quart au lieu de la moitié (attrapé par le harnais, 11 août). */
    if (forfait !== undefined) return forfait;
  }
  if (isFixedPrice(sv)) return sv.priceXof; // hors Juste Prix — prix catalogue ferme
  /* Hors de son calibre : on rend le prix catalogue, sans personnalisation.
     Calculer « 200 locks × 1 100 F » sur un Jumbo donnait 220 000 F pour les
     cinq créations à la fois — un prix identique du Jumbo au Nano, qui ne
     voulait rien dire. */
  const bande = bandForService(sv, p);
  /* Hors de son calibre : prix catalogue, sans personnalisation. */
  if (!servesBand(sv, bande)) return prixDeBase(sv, p);

  /* PRIX PAR CALIBRE — quand l'interrupteur du Catalogue le dit. Le plancher
     de la tranche EST le prix, pas un minimum ; le tarif au lock reste inscrit
     sur la fiche mais ne commande pas.

     Avant cette regle, le tarif au lock etait de toute facon inerte : a 100 F
     le lock, le plafond du calibre Medium donnait 18 000 F contre un plancher
     a 25 000 F. Le plancher gagnait partout sauf au-dela de 550 locks, et deux
     clientes a 105 et 180 locks payaient le meme prix sans que rien ne le dise. */
  /* Le Juste Prix EFFECTIF de cette prestation — ×1 hors de l'Atelier. */
  const justePrix = coefJustePrix(sv, p);
  if (tarifModeOf(sv) === 'calibre' && bande && sv.priceFloors?.[bande.id] !== undefined) {
    const parCalibre = sv.priceFloors[bande.id];
    return justePrix === 1 ? parCalibre : roundPrice(parCalibre * justePrix);
  }

  /* LE COMPTAGE COMMANDE, choisi explicitement au Catalogue : le prix est
     `locks x tarif`, sans plancher. Les `priceFloors` sont les prix PAR TRANCHE,
     pas des minimums — les appliquer ici annulerait le choix : a 100 F le lock,
     le plancher Medium a 25 000 F ecrasait les 12 500 F d'une tete a 125 locks,
     et basculer l'interrupteur ne changeait rien.

     En mode automatique (aucun choix pose), on garde le comportement historique
     — `max(comptage, plancher)` — pour ne pas deplacer un prix tout seul. */
  const auLock = sv.tarifMode === 'lock'
    ? (p.lockCount && p.lockCount > 0 && sv.ratePerLock ? p.lockCount * sv.ratePerLock : undefined)
    : perLockPriceXof(sv, p.lockCount, bande);
  /* Pas d'arrondi au 500 sur un prix au lock non modulé : 113 locks font
     11 300 F, et l'arrondi commercial les transformerait en 11 500 F — un écart
     inventé sur chaque cliente dont le compte de locks n'est pas rond. L'arrondi
     ne revient que si le Juste Prix personnel entre en jeu et produit une décimale. */
  if (auLock !== undefined) return justePrix === 1 ? auLock : roundPrice(auLock * justePrix);
  /* UNE GRILLE PAR LONGUEUR REMPLACE LE MODÈLE (11 août 2026). WÈWÈ™ La
     Purification porte 25 000 F en Mi-Long — et l'interrupteur « suit le
     modèle » : pour une tête Nano (coef 2,5), l'écran annonçait 62 500 F.
     Deux graduations de taille s'empilaient, alors que la grille par longueur
     EST déjà celle de ce soin : trois prix SAISIS par la Maison, pas une base
     à multiplier. Dès qu'une prestation porte cette grille, le coefficient de
     tranche ne s'applique plus — ni sur le prix de la longueur choisie, ni
     sur le prix de repli quand la longueur n'est pas encore connue. Le Juste
     Prix personnel, lui, reste : c'est un accord par CLIENTE, pas une taille. */
  const grilleLongueur = !!sv.prixParLongueur && Object.keys(sv.prixParLongueur).length > 0;
  const modelCoef = !grilleLongueur && scalesWithModel(sv) && bande ? bande.coef : 1;
  /* PRIX PAR LONGUEUR — un prix SAISI, pas un calcul. Tant que le Juste Prix
     ne le module pas, il sort au franc près : l'arrondi commercial au 500 F a
     du sens sur un produit de multiplication, aucun sur un montant que la
     Maison a écrit elle-même. */
  const parLongueur = p.longueur ? sv.prixParLongueur?.[p.longueur] : undefined;
  if (parLongueur !== undefined && justePrix === 1) return parLongueur;
  return roundPrice(prixDeBase(sv, p) * modelCoef * justePrix);
};

/** Durée personnalisée d'une prestation — calée au quart d'heure, jamais nulle. */
export const personalDurationMin = (sv: Service, p: PersonalPricing): number => {
  /* La durée suit la longueur AVANT tout le reste : un soin Long ne prend pas
     45 minutes parce que la fiche annonce 45 minutes pour le Court. */
  const base = (p.longueur ? sv.dureeParLongueur?.[p.longueur] : undefined) ?? sv.durationMin;
  if (isFixedPrice(sv)) return base; // hors Juste Prix — durée annoncée
  const bande = bandForService(sv, p);
  const c = scalesWithModel(sv) && bande ? bande.durCoef : 1;
  return Math.max(15, Math.round((base * c) / 15) * 15);
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
