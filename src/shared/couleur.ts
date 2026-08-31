/* ── L'OPTION COULEUR — les cheveux blancs, 28 août 2026 ──────────────
   « J'ai de plus en plus de jeunes dames dans la quarantaine, cinquantaine,
   qui bataillent avec leurs cheveux blancs ou gris. On doit créer l'option
   avec tous les abonnements » (Yéman).

   DEUX VOIES, PARCE QUE CES DAMES NE VEULENT PAS LA MÊME CHOSE. L'une veut
   que les blancs disparaissent, l'autre veut que son gris devienne beau. Leur
   imposer un seul chemin, c'est en perdre la moitié — et celle qui cache
   aujourd'hui assume souvent deux ans plus tard. Une seule option qui porte
   les deux voies la garde ; deux formules séparées l'obligeraient à résilier
   pour changer d'avis.

   DEUX RYTHMES, parce que les blancs ne reviennent pas à la même vitesse chez
   toutes. C'est elle qui sait, pas la Maison.

   LA COULEUR SUIT LE RESSERRAGE, jamais le lavage : on reprend les racines
   quand on reprend les racines. C'est pourquoi le nombre de reprises se
   compte sur le quota de resserrage de la formule, pas sur son plus gros
   quota — L'Année Fraîche porte douze lavages et six resserrages, elle donne
   six reprises et non douze.

   AUCUN PRIX N'EST ÉCRIT ICI. Le supplément se calcule sur le prix que la
   prestation porte AU CATALOGUE, à l'instant où on le lit. Un tarif recopié
   dans le code aurait vieilli le jour où la Maison change ses prix, et la
   cliente aurait payé l'ancien. */

export type VoieCouleur = 'ebene' | 'argent';
export type RythmeCouleur = 'legere' | 'reguliere';

export type OptionCouleur = {
  voie: VoieCouleur;
  rythme: RythmeCouleur;
  /** La prestation du catalogue qui sert cette voie, figée à la signature :
      le prix a pu être négocié, la promesse est faite sur celle-là. */
  serviceId?: string;
  /** Supplément retenu à la signature, pour ne pas le recalculer ensuite. */
  supplementXof?: number;
};

export const VOIES: {
  k: VoieCouleur; nom: string; promesse: string; dit: string;
  /** La prestation du catalogue attendue — vérifiée à l'usage, jamais supposée. */
  serviceIdDefaut: string;
}[] = [
  {
    k: 'ebene', nom: 'L’Ébène', promesse: 'Les blancs disparaissent.',
    dit: 'Les racines reprises à chaque passage, la couronne d’un seul ton.',
    serviceIdDefaut: 'sv-rituel-mq6vpu7d',
  },
  {
    k: 'argent', nom: 'L’Argent', promesse: 'Le gris devient une couleur choisie.',
    dit: 'Des reflets posés sur le blanc : il cesse d’être un accident pour devenir une intention.',
    serviceIdDefaut: 'sv-yekpe-lumiere',
  },
];

export const RYTHMES: { k: RythmeCouleur; nom: string; dit: string }[] = [
  { k: 'legere', nom: 'Légère', dit: 'une venue sur deux' },
  { k: 'reguliere', nom: 'Régulière', dit: 'à chaque venue' },
];

/** La remise consentie parce que c'est un abonnement, et non de la carte. */
export const REMISE_OPTION_PCT = 15;

/** Les prix de la Maison se disent en billets, pas en francs isolés — MAIS
    l'arrondi ne fait jamais disparaître un supplément. Même règle, mot pour
    mot, que `roundPrice` du moteur tarifaire (1er septembre 2026) : sous le
    pas de l'arrondi, le montant exact fait foi. */
const arrondi500 = (x: number) => {
  const r = Math.round(x / 500) * 500;
  return r === 0 && x > 0 ? Math.round(x) : r;
};

/** COMBIEN DE REPRISES la formule porte, selon le rythme choisi.
    En rythme léger, une venue sur deux — arrondi vers le HAUT : sur cinq
    venues elle en a trois, jamais deux. La Maison donne le passage de trop,
    elle ne le retient pas. */
export const reprisesDeCouleur = (quotaResserrage: number, rythme: RythmeCouleur): number => {
  const n = Math.max(0, Math.floor(quotaResserrage));
  return rythme === 'reguliere' ? n : Math.ceil(n / 2);
};

/** LE SUPPLÉMENT, calculé sur le prix du catalogue à l'instant où on le lit.
    Rend 0 quand la prestation manque : une option sans prestation rattachée
    ne se facture pas, elle se signale. */
export const supplementCouleurXof = (
  reprises: number, prixServiceXof: number, remisePct = REMISE_OPTION_PCT,
): number => {
  if (reprises <= 0 || prixServiceXof <= 0) return 0;
  const brut = reprises * prixServiceXof;
  return arrondi500(brut * (1 - Math.min(100, Math.max(0, remisePct)) / 100));
};

/** Ce que l'option pèse au prix plein — pour dire à la cliente ce qu'elle gagne. */
export const supplementSansRemiseXof = (reprises: number, prixServiceXof: number): number =>
  Math.max(0, reprises) * Math.max(0, prixServiceXof);

export const voieDe = (k: VoieCouleur) => VOIES.find((v) => v.k === k)!;
export const rythmeDe = (k: RythmeCouleur) => RYTHMES.find((r) => r.k === k)!;

/** Le libellé qu'on lit dans un tableau : « L'Ébène · à chaque venue ». */
export const libelleCouleur = (o: OptionCouleur): string =>
  `${voieDe(o.voie).nom} · ${rythmeDe(o.rythme).dit}`;

/** LA PART MENSUELLE de l'option, pour qu'elle entre au MRR comme le reste.
    Un supplément annuel qui ne serait pas normalisé gonflerait le revenu
    récurrent du mois de la signature, puis disparaîtrait. */
export const partMensuelleXof = (supplementXof: number, moisCouverts: number): number =>
  moisCouverts <= 0 ? 0 : Math.round(supplementXof / moisCouverts);
