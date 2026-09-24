import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { hourToMin } from './settings';
import { isoDuJour, joursEntre, dansLaSaison, FENETRE_PROPOSITION } from './offres-pur';

/* Offres instantanées & Cercle — ponts Trône (Marketing/Cercle) → Ma Couronne.
   Gérés côté ERP, consommés côté cliente. Synchronisés via Supabase (documents)
   pour que les clientes voient les offres depuis n'importe quel appareil. */

export const OFFER_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
export const OFFER_AUDIENCES = ['Tous', 'Actifs', 'VIP', 'Cercle', 'Dormants'] as const;
export const OFFER_HOURS = ['00h', '06h', '07h', '08h', '09h', '10h', '11h', '12h', '14h', '16h', '17h', '18h', '19h', '20h', '21h', '22h'];

export type InstantOffer = {
  id: string;
  branchId: string;
  title: string;
  tag: string; // accroche — « Offre éclair », « Heure creuse »…
  deal: string; // avantage affiché — « −25% », « 2 = 1 »…
  sub: string; // détail
  audience: string; // persona / segment qui la voit
  days: string[]; // jours d'affichage
  heureDebut: string;
  heureFin: string;
  active: boolean;
  /** Prestation réservable en un geste depuis Ma Couronne (pré-remplit la réservation). */
  serviceId?: string;
  /** LES PRESTATIONS QUE L'OFFRE COUVRE — 24 septembre 2026. « Dans
      réservation liée à une offre je ne peux que choisir 1 dans la liste.
      Besoin de cocher plusieurs au besoin » (Yéman). `serviceId` reste : il
      dit la prestation qu'on réserve EN UN GESTE depuis Ma Couronne, ce qui
      n'a de sens qu'au singulier. Celles-ci disent sur quoi la remise PORTE,
      et il en faut plusieurs : « la rentrée des couronnes » couvre quatre
      lavages et trois reprises.

      VIDE NE VEUT PAS DIRE « TOUTES ». Une offre qui ne dit pas sur quoi
      elle porte ne retire rien : un oubli de case ne doit jamais solder le
      catalogue entier. Le Trône le signale à l'écran plutôt que de le taire. */
  serviceIds?: string[];
  /** LE CODE DE LA REMISE — 24 septembre 2026. « Il faut écrire remise de
      10 % avec le code, du coup le code se remplit automatiquement lors de
      la réservation avec son nom, plus facile à suivre » (Yéman). Une remise
      silencieuse s'applique et disparaît ; un code se compte, et se dit à
      voix haute sur une affiche. */
  code?: string;
  /** Remise réellement appliquée au prix à la réservation. */
  discountPct?: number;
  /** LA SAISON D'UNE OFFRE — 18 septembre 2026. Jusqu'ici une offre se
      répétait par jour de semaine et par tranche horaire : parfait pour une
      heure creuse, inutilisable pour Octobre Rose ou pour Noël, qui ont un
      premier et un dernier jour.

      LES DEUX SONT FACULTATIVES, et c'est ce qui rend le changement sûr :
      une offre sans dates se comporte EXACTEMENT comme avant. Format ISO
      `AAAA-MM-JJ`, bornes INCLUSES, comparées comme des chaînes, ce qui est
      juste pour cette graphie et évite tout piège de fuseau. */
  du?: string;
  au?: string;
  /** LA VITRINE — 22 septembre 2026. Une offre sans dates n'existait pas sur
      le site : il ne montre que les actives ET datées. Or « la consultation
      déduite de votre création » n'a pas de saison, elle dit comment la
      Maison accueille. Coché, ce drapeau la fait paraître sans date de fin,
      tant qu'elle est active. Rien ne change pour les offres d'hier. */
  vitrine?: boolean;
  /** Le parcours du site qu'elle sert : creation, reparation, entretien,
      enfant, formation. Il choisit le bouton de la carte et sa destination,
      calendrier ou rappel, comme les cinq portes de l'accueil. */
  parcours?: string;
  /** Le texte du bouton sur le site. Sans lui, la carte dit « J’en profite ». */
  bouton?: string;
  /** Les conditions, écrites par la Maison, dépliées sous la carte : c'est
      l'équivalent honnête du « Get full terms ». Jamais écrites dans le site. */
  conditions?: string;
};

export const offersStore = createStore<InstantOffer[]>('mnd_offers', []);
export const useOffers = () => useStore(offersStore);

/** Une offre est visible maintenant : active + jour retenu + fenêtre horaire.
    Aucun jour coché = jamais visible (cohérent avec « Aucun jour » à l'écran). */
export function offerLiveNow(o: InstantOffer, now = new Date()): boolean {
  if (!o.active) return false;
  if (!dansLaSaison(o, now)) return false;
  const day = OFFER_DAYS[(now.getDay() + 6) % 7]; // getDay(): 0=dim → index 6
  if (!o.days.includes(day)) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= hourToMin(o.heureDebut) && nowMin < hourToMin(o.heureFin);
}

/* ══ LES SAISONS DE LA MAISON ═══════════════════════════════════════
   « J'aimerais avoir un onglet sur les offres instantanées, à venir ou les
   offres en cours. Faire une offre pour le mois d'Octobre Rose, Noël, la
   Saint-Valentin, le mois de la femme, le Ramadan, la fête des mères, et que
   j'aie la possibilité de les activer dès qu'on se rapproche de ces dates à
   21 jours près » (Yéman, 18 septembre 2026). */

/* Le noyau pur des saisons vit dans `offres-pur.ts`, que voici rendu a
   tous ceux qui importaient depuis ici. */
export * from './offres-pur';

/** UNE SAISON EST UN PATRON, pas une offre. Elle dort dans le code, la Maison
    l'active, et c'est CE GESTE qui écrit une vraie offre datée dans
    `mnd_offers`. Ainsi une saison revient chaque année sans qu'on redéploie,
    et l'offre née d'elle reste modifiable comme n'importe quelle autre. */
export type Saison = {
  cle: string;
  nom: string;
  tag: string;
  deal: string;
  sub: string;
  /** Saison À DATE FIXE : premier et dernier jour en `MM-JJ`. Elle se
      reporte d'elle-même à l'année suivante une fois passée. */
  debut?: string;
  fin?: string;
  /** Saison QUI NE SE CALCULE PAS : dates explicites, par année. Le Ramadan
      suit la lune et se constate ; la fête des mères varie selon les pays.
      Aucune règle ne les déduit, la Maison les inscrit. */
  parAnnee?: Record<string, { du: string; au: string }>;
  /** Vrai tant que la Maison n'a pas confirmé la date portée ici. */
  aConfirmer?: boolean;

  /* ── CE QUI FAIT QU'ACTIVER SUFFIT — 24 septembre 2026 ──────────────
     « Pré-remplis toutes les offres à venir, il suffira juste que je les
     active » (Yéman). Jusqu'ici une saison ne portait que son nom, sa
     phrase et ses dates : l'activer donnait une offre qu'il fallait encore
     ouvrir et remplir. Tout ce qui suit voyage désormais avec elle. */

  /** Le code écrit sur la carte et retrouvé à la réservation. */
  code?: string;
  /** La remise retirée, en pour cent. ABSENTE VEUT DIRE CADEAU : Noël offre
      un styling, la fête des mères un soin, le Ramadan allonge les heures.
      Rien ne se déduit alors d'un prix, la Maison l'applique au salon, et le
      code ne sert qu'à suivre ce que l'offre a fait venir. */
  remise?: number;
  /** LES CATÉGORIES du catalogue que l'offre couvre, résolues en
      prestations À L'ACTIVATION.

      DES CATÉGORIES ET NON DES PRESTATIONS, et c'est délibéré : un
      identifiant de prestation écrit dans le code se périme au premier
      renommage, et laisserait un code qui ne mord sur rien sans que
      personne ne le voie. Une catégorie tient. La Maison décoche ensuite ce
      qu'elle veut, sur l'offre, là où c'est visible. */
  categories?: string[];
  /** Le parcours du site, qui choisit la porte et le sceau de la carte. */
  parcours?: string;
  /** Les mots du bouton, quand ceux du parcours ne conviennent pas. */
  bouton?: string;
  /** Les conditions, dépliées sous la carte. La période s'y ajoute seule. */
  conditions?: string;
};

/* LES CATÉGORIES DE LA MAISON, telles qu'elles vivent dans le catalogue.
   Nommées ici pour que les saisons se lisent, et parce qu'un identifiant nu
   au milieu d'une offre ne dit rien à celui qui la relira dans six mois. */
const LAVAGES = 'cat-lavages';
const REPRISES = 'tn29axgoc5';
const SOINS = 'cat-soins';
const STYLING = 'cat-styling';

export const SAISONS: readonly Saison[] = [
  {
    cle: 'rentree', nom: 'La rentrée des couronnes', tag: 'Offre de saison', deal: '−10 %',
    sub: 'Sur les lavages rituels et les reprises de racines, pour repartir net.',
    debut: '09-01', fin: '09-30',
    code: 'RENTREE10', remise: 10, categories: [LAVAGES, REPRISES],
    parcours: 'entretien',
    conditions: 'Sur les lavages rituels et les reprises de racines. '
      + 'Les prestations dont le prix se dit au salon ne sont pas remisées. '
      + 'Une offre à la fois, au règlement à la Maison.',
  },
  {
    cle: 'octobre-rose', nom: 'Octobre Rose', tag: 'Engagement', deal: '−15 %',
    sub: 'Sur les soins, et la Maison reverse une part à la lutte contre le cancer du sein.',
    debut: '10-01', fin: '10-31',
    code: 'ROSE15', remise: 15, categories: [SOINS],
    parcours: 'entretien', bouton: 'Réserver mon soin',
    conditions: 'Sur les soins de la carte. La Maison reverse une part de chaque soin '
      + 'à la lutte contre le cancer du sein. Une offre à la fois, au règlement à la Maison.',
  },
  {
    /* UN CADEAU N'EST PAS UNE REMISE : pas de `remise`, donc aucun prix ne
       bouge à l'écran. Le code voyage quand même, et c'est lui qui dit à
       l'accueil qu'un styling est dû. Annoncer « −0 % » serait un mensonge,
       et déduire un styling d'un forfait couleur d'avance en serait un autre. */
    cle: 'noel', nom: 'Noël à la Maison', tag: 'Offre de saison', deal: '2 = 1',
    sub: 'Un styling signature offert pour tout forfait couleur.',
    debut: '12-01', fin: '12-31',
    code: 'NOEL', categories: [STYLING],
    parcours: 'entretien', bouton: 'Réserver ma couleur',
    conditions: 'Un styling signature offert pour tout forfait couleur pris dans le mois. '
      + 'Le styling s’offre à la venue, il ne se déduit pas d’avance. Une offre à la fois.',
  },
  {
    cle: 'saint-valentin', nom: 'La Saint-Valentin', tag: 'Offre éclair', deal: '−20 %',
    sub: 'Pour deux couronnes qui viennent ensemble.',
    debut: '02-07', fin: '02-14',
    code: 'DEUX20', remise: 20, categories: [LAVAGES, REPRISES, SOINS],
    parcours: 'entretien', bouton: 'Réserver pour deux',
    conditions: 'Pour deux couronnes qui viennent ensemble, sur le même rendez-vous, '
      + 'sur les lavages, les reprises et les soins. Une offre à la fois, au règlement à la Maison.',
  },
  {
    cle: 'mois-de-la-femme', nom: 'Le mois de la femme', tag: 'Engagement', deal: '−15 %',
    sub: 'Sur tous les forfaits féminins, jusqu’au 8 mars.',
    debut: '03-01', fin: '03-08',
    code: 'FEMME15', remise: 15, categories: [LAVAGES, REPRISES, SOINS, STYLING],
    parcours: 'entretien',
    conditions: 'Sur les lavages, les reprises, les soins et le styling, jusqu’au 8 mars. '
      + 'Une offre à la fois, au règlement à la Maison.',
  },
  {
    /* LE RAMADAN SE CONSTATE. Les dates ci-dessous sont une ESTIMATION et
       portent `aConfirmer` : la Maison les corrige d'un champ. Sans entrée
       pour l'année visée, la saison ne se propose pas, plutôt que de
       proposer un jour faux. */
    cle: 'ramadan', nom: 'Le Ramadan', tag: 'Offre de saison', deal: 'Heures allongées',
    sub: 'Ouverture après la rupture du jeûne, et un soin hydratant à prix doux.',
    parAnnee: {
      '2027': { du: '2027-02-08', au: '2027-03-09' },
      '2028': { du: '2028-01-28', au: '2028-02-26' },
    },
    aConfirmer: true,
    /* Des heures allongées ne sont pas un pourcentage, et le prix doux du
       soin se dit au salon : rien à déduire, un code pour suivre. */
    code: 'RAMADAN',
    parcours: 'entretien', bouton: 'Réserver après la rupture',
    conditions: 'Ouverture après la rupture du jeûne pendant tout le mois, '
      + 'et un soin hydratant à prix doux, dit à la Maison. Une offre à la fois.',
  },
  {
    /* LA FÊTE DES MÈRES ne tombe pas le même jour partout. Celle-ci suit le
       dernier dimanche de mai ; à confirmer pour le Bénin. */
    cle: 'fete-des-meres', nom: 'La fête des mères', tag: 'Offre de saison', deal: 'Le soin de la mère',
    sub: 'Un soin offert à la mère pour toute venue mère et fille.',
    parAnnee: {
      '2027': { du: '2027-05-29', au: '2027-05-30' },
      '2028': { du: '2028-05-27', au: '2028-05-28' },
    },
    aConfirmer: true,
    code: 'MERE', categories: [SOINS],
    parcours: 'enfant', bouton: 'Organiser notre venue',
    conditions: 'Un soin offert à la mère pour toute venue mère et fille, le même jour. '
      + 'Le soin s’offre à la venue, il ne se déduit pas d’avance. Une offre à la fois.',
  },
];

/** LA PROCHAINE FOIS QUE CETTE SAISON OUVRE, ou `null` si la Maison ne l'a
    pas encore datée. Une saison à date fixe déjà passée cette année se
    reporte à l'an prochain : c'est ce qui la fait revenir sans redéploiement. */
export function prochaineOccurrence(
  s: Saison,
  now = new Date(),
): { du: string; au: string } | null {
  const j = isoDuJour(now);
  if (s.parAnnee) {
    const annees = Object.keys(s.parAnnee).sort();
    for (const a of annees) {
      const d = s.parAnnee[a];
      if (d.au >= j) return d;
    }
    return null;
  }
  if (!s.debut || !s.fin) return null;
  for (let i = 0; i <= 1; i += 1) {
    const an = now.getFullYear() + i;
    const d = { du: `${an}-${s.debut}`, au: `${an}-${s.fin}` };
    if (d.au >= j) return d;
  }
  return null;
}

/** Les saisons que la Maison doit regarder aujourd'hui : datées, à moins de
    trois semaines de leur ouverture, et pas déjà posées en offre. */
export function saisonsAProposer(
  saisons: readonly Saison[],
  dejaPosees: readonly InstantOffer[],
  now = new Date(),
  fenetre = FENETRE_PROPOSITION,
): { saison: Saison; du: string; au: string; dans: number }[] {
  const j = isoDuJour(now);
  const out: { saison: Saison; du: string; au: string; dans: number }[] = [];
  for (const s of saisons) {
    const d = prochaineOccurrence(s, now);
    if (!d) continue;
    const dans = joursEntre(j, d.du);
    if (dans > fenetre) continue;
    /* Déjà posée pour CETTE occurrence : on ne la propose pas deux fois. */
    if (dejaPosees.some((o) => o.du === d.du && o.title === s.nom)) continue;
    out.push({ saison: s, du: d.du, au: d.au, dans });
  }
  return out.sort((a, b) => a.dans - b.dans);
}

/** L'offre qu'une saison fait naître quand la Maison l'active. Elle court
    toute la semaine ; l'heure de fin s'arrête à la dernière heure que la
    Maison sait dire (`OFFER_HOURS`), et non à minuit. */
/** LES PRESTATIONS D'UNE LISTE DE CATÉGORIES, descendantes comprises.

    On descend l'arbre parce que la Maison range par famille : « les soins »
    peut un jour se scinder en deux rayons, et une offre écrite sur le parent
    doit continuer de couvrir les enfants. Sans cela, un rangement du
    catalogue viderait une offre en silence. */
export function prestationsDesCategories(
  categories: readonly string[],
  catalogue: readonly { id: string; categoryId?: string }[],
  arbre: readonly { id: string; parentId?: string }[] = [],
): string[] {
  const voulues = new Set(categories);
  /* Les descendantes, de proche en proche : l'arbre est petit, et une
     boucle bornée vaut mieux qu'une récursion qui tournerait sur un cycle. */
  for (let i = 0; i < 8; i += 1) {
    const avant = voulues.size;
    for (const c of arbre) if (c.parentId && voulues.has(c.parentId)) voulues.add(c.id);
    if (voulues.size === avant) break;
  }
  return catalogue.filter((s) => s.categoryId && voulues.has(s.categoryId)).map((s) => s.id);
}

/** ACTIVER UNE SAISON ÉCRIT UNE OFFRE COMPLÈTE — 24 septembre 2026.

    « Pré-remplis toutes les offres à venir, il suffira juste que je les
    active » (Yéman). Le code, la remise, les prestations couvertes, le
    parcours, les mots du bouton et les conditions descendent du patron. Les
    catégories se résolvent ICI, contre le catalogue du jour : l'offre écrite
    porte des prestations concrètes, que la Maison décoche ensuite à l'écran,
    là où elle les voit.

    Un champ vide NE S'ÉCRIT PAS, comme ailleurs dans ce fichier : c'est ce
    qui laisse intactes toutes les offres d'hier. */
export function offreDepuisLaSaison(
  s: Saison,
  d: { du: string; au: string },
  branchId: string,
  id: string,
  catalogue: readonly { id: string; categoryId?: string }[] = [],
  arbre: readonly { id: string; parentId?: string }[] = [],
): InstantOffer {
  const couvertes = s.categories?.length ? prestationsDesCategories(s.categories, catalogue, arbre) : [];
  return {
    id,
    branchId,
    title: s.nom,
    tag: s.tag,
    deal: s.deal,
    sub: s.sub,
    audience: 'Tous',
    days: [...OFFER_DAYS],
    heureDebut: OFFER_HOURS[0],
    heureFin: OFFER_HOURS[OFFER_HOURS.length - 1],
    active: true,
    du: d.du,
    au: d.au,
    /* LE GESTE UNIQUE DE MA COURONNE N'EST PAS DÉDUIT D'UNE FAMILLE.
       `serviceId` ouvre une réservation pré-remplie d'UNE prestation. Une
       saison qui en couvre sept n'a pas de geste unique : en désigner un
       ouvrirait la réservation sur une prestation tirée au hasard, et la
       cliente croirait que la Maison a choisi pour elle. On ne l'écrit donc
       que lorsque l'offre ne couvre qu'une seule prestation. */
    ...(couvertes.length === 1 ? { serviceId: couvertes[0] } : {}),
    ...(s.code ? { code: s.code } : {}),
    ...(s.remise ? { discountPct: s.remise } : {}),
    ...(couvertes.length ? { serviceIds: couvertes } : {}),
    ...(s.parcours ? { parcours: s.parcours } : {}),
    ...(s.bouton ? { bouton: s.bouton } : {}),
    ...(s.conditions ? { conditions: s.conditions } : {}),
  };
}

/* ---------- Cercle — paliers de récompense & points ---------- */

export type RewardTier = {
  id: string;
  pts: number; // seuil de points
  serviceId: string; // prestation offerte, tirée du catalogue
  desc: string;
  g: string; // chiffre du sceau — Ⅰ · Ⅱ · Ⅲ…
};

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const TIERS_SEED: RewardTier[] = [];

export const tiersStore = createStore<RewardTier[]>('mnd_cercle_tiers', TIERS_SEED);
export const useTiers = () => useStore(tiersStore);

/** 1 point / N F dépensés. */
export const pointsRateStore = createStore<number>('mnd_points_rate', 100);

/** LE CERCLE SE GAGNE — on y entre au 3ᵉ passage à la Maison MND.

    Un passage ne donne pas le Cercle. Une cliente qui vient une fois n'est pas
    une lignée, et lui ouvrir la reconnaissance dès la première visite vide le
    mot de son sens : ce qui se donne à tout le monde ne récompense personne.
    Trois venues, et la Maison la reconnaît.

    « À PARTIR DU 3ᵉ » — le 3ᵉ passage compte, les deux premiers non. Elle entre
    ce jour-là et gagne ses points ce jour-là ; on ne lui crédite pas après coup
    des passages faits avant d'être membre. C'est aussi ce qui se dit le plus
    simplement au fauteuil : « le Cercle s'ouvre à votre troisième venue. »

    Un seuil, pas une constante : la Maison le corrige d'un champ (Le Cercle →
    Les points) sans qu'on redéploie. Les VENUES se comptent par
    `venuesHonorees` (shared/agenda.ts), par la payeuse — la même clé que les
    points. */
export const cercleSeuilStore = createStore<number>('mnd_cercle_seuil', 3);

/** Est-elle du Cercle ? `venues` compte désormais SES PROPRES venues (par tête,
    `venuesHonorees(appts, id, false)`) — plus par la payeuse. Le statut complet
    (prix convenu, dépendant, foyer) se lit par `statutFidelite` (shared/accounts). */
export const estDuCercle = (venues: number, seuil = cercleSeuilStore.get()): boolean =>
  venues >= Math.max(1, seuil);

/** LE SEUIL DU FOYER (25 août) — dépense honorée CUMULÉE d'une famille (F CFA) à
    partir de laquelle la maisonnée reçoit un geste. Une reconnaissance de
    famille, distincte du Cercle individuel. Réglable d'un champ, comme le Cercle. */
export const foyerSeuilStore = createStore<number>('mnd_foyer_seuil', 300000);

/** LES PALIERS DU FOYER (25 août) — comme les paliers du Cercle, mais franchis
    par la DÉPENSE CUMULÉE de la famille (F CFA) et non par des points. Quand un
    foyer passe un seuil, le geste s'offre de lui-même. Gérés au Trône (Cercle),
    lus par Ma Couronne. */
export type FoyerTier = {
  id: string;
  seuilXof: number;   // dépense cumulée du foyer à partir de laquelle le geste s'offre
  serviceId: string;  // prestation offerte, du catalogue
  desc: string;
  g: string;          // chiffre du sceau
};
export const foyerTiersStore = createStore<FoyerTier[]>('mnd_foyer_tiers', []);
export const useFoyerTiers = () => useStore(foyerTiersStore);

/** Le meilleur palier Foyer déjà atteint pour une dépense donnée (null sinon). */
export const meilleurPalierFoyer = (depenseXof: number, tiers: FoyerTier[]): FoyerTier | null => {
  const atteints = tiers.filter((t) => t.seuilXof <= depenseXof).sort((a, b) => a.seuilXof - b.seuilXof);
  return atteints.length ? atteints[atteints.length - 1] : null;
};

/** Attribution des points Cercle — COUPÉE tant que la maison ne l'active pas
    (Cercle MND) : aucune écriture de points à l'encaissement/honneur avant que
    le programme ne soit officiellement lancé. */
export const pointsEnabledStore = createStore<boolean>('mnd_points_enabled', false);

export type PointsEvent = {
  id: string;
  clientId: string;
  clientName: string;
  label: string; // récompense offerte ou ajustement
  pts: number; // négatif = points rendus en soin
  at: string; // ISO
};

export const pointsHistoryStore = createStore<PointsEvent[]>('mnd_points_history', []);
export const usePointsHistory = () => useStore(pointsHistoryStore);

bindDocument(offersStore, 'mnd_offers');
bindDocument(tiersStore, 'mnd_cercle_tiers');
bindDocument(pointsRateStore, 'mnd_points_rate');
bindDocument(cercleSeuilStore, 'mnd_cercle_seuil');
bindDocument(foyerSeuilStore, 'mnd_foyer_seuil');
bindDocument(foyerTiersStore, 'mnd_foyer_tiers');
bindDocument(pointsEnabledStore, 'mnd_points_enabled');
bindDocument(pointsHistoryStore, 'mnd_points_history');
