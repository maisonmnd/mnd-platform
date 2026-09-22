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
};

export const SAISONS: readonly Saison[] = [
  {
    cle: 'rentree', nom: 'La rentrée des couronnes', tag: 'Offre de saison', deal: '−10 %',
    sub: 'Sur les lavages rituels et les reprises de racines, pour repartir net.',
    debut: '09-01', fin: '09-30',
  },
  {
    cle: 'octobre-rose', nom: 'Octobre Rose', tag: 'Engagement', deal: '−15 %',
    sub: 'Sur les soins, et la Maison reverse une part à la lutte contre le cancer du sein.',
    debut: '10-01', fin: '10-31',
  },
  {
    cle: 'noel', nom: 'Noël à la Maison', tag: 'Offre de saison', deal: '2 = 1',
    sub: 'Un styling signature offert pour tout forfait couleur.',
    debut: '12-01', fin: '12-31',
  },
  {
    cle: 'saint-valentin', nom: 'La Saint-Valentin', tag: 'Offre éclair', deal: '−20 %',
    sub: 'Pour deux couronnes qui viennent ensemble.',
    debut: '02-07', fin: '02-14',
  },
  {
    cle: 'mois-de-la-femme', nom: 'Le mois de la femme', tag: 'Engagement', deal: '−15 %',
    sub: 'Sur tous les forfaits féminins, jusqu’au 8 mars.',
    debut: '03-01', fin: '03-08',
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
export function offreDepuisLaSaison(
  s: Saison,
  d: { du: string; au: string },
  branchId: string,
  id: string,
): InstantOffer {
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
