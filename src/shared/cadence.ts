import type { Appointment } from './agenda';
import { aDefaitSesLocks, estDePassage, estDiaspora, type Client } from './clients';
import { openingForIso } from './settings';
import {
  addDaysISO, cadenceObservee, fromISO, medianInt, poseLaDateSelon, predictNextVisitSelon,
  type Cadence,
} from './cadence-pur';

export { cadenceObservee, type Cadence, type CadenceObservee } from './cadence-pur';

/* LE JUGE PUR vit dans `cadence-pur.ts` (27 octobre 2026) ; ici, ses portes :
   les murs de la Maison lus dans les réglages. */
const ferme = (iso: string): boolean => openingForIso(iso).closed;
const poseLaDate = (iso: string, jourPrefere: number | readonly number[] | undefined): string => poseLaDateSelon(iso, jourPrefere, ferme);

export function predictNextVisit(appts: Appointment[], clients: Client[], clientId: string, today: string): Cadence {
  return predictNextVisitSelon(appts, clients.find((c) => c.id === clientId), clientId, today, ferme);
}

/* LA CADENCE D'UNE TÊTE — UN SEUL JUGE, POUR LES DEUX SŒURS.

   Prédire le retour d'une cliente sert trois écrans : la fiche du Trône
   (« Prochain rendez-vous · prédit »), son tableau de bord (les relances d'un
   carnet libre) et l'ACCUEIL DE MA COURONNE (« ≈ vendredi 28 août — réservez
   ce rituel »). Deux copies finiraient par dire deux dates à la même tête —
   le juge vit donc ici, dans la couche partagée, et chaque surface l'appelle.

   Côté Ma Couronne, la RLS ne montre à la cliente que SES rendez-vous :
   c'est exactement ce qu'il faut au calcul — sa cadence ne regarde qu'elle. */


/** Lecture éditoriale d'un intervalle : « toutes les ~5 semaines », « ~9 j ». */
export const cadenceLabel = (days: number): string => {
  if (days >= 60) return `toutes les ~${Math.round(days / 30)} mois`;
  if (days >= 14) return `toutes les ~${Math.round(days / 7)} semaines`;
  return `tous les ~${days} j`;
};

/** CE QUE VALENT VRAIMENT LES ESTIMATIONS — le juge éprouvé sur son propre
    passé (16 août 2026, demande de Yéman : « un taux de réalisation, combien
    d'estimations se vérifient vraiment »).

    AUCUNE PRÉDICTION N'A JAMAIS ÉTÉ STOCKÉE : on ne peut pas relire ce que la
    Maison avait annoncé. On la REJOUE donc — pour chaque tête, à chaque venue
    depuis la troisième, on calcule ce que le juge aurait dit avec les SEULES
    venues d'avant, puis on compare à la date réelle.

    CE QUE CELA MESURE, EXACTEMENT : la cadence médiane, cœur de la prédiction.
    Pas les ajustements de calendrier — report d'un jour fermé, jour préféré —
    qui déplacent la date de quelques jours pour des raisons d'ouverture et ne
    disent rien de la justesse du rythme lu. Mélanger les deux ferait passer
    une règle d'agenda pour une erreur de prévision.

    Un écart POSITIF veut dire qu'elle est venue APRÈS ce qu'on attendait —
    donc que la Maison l'attend trop tôt. */
export type Realisation = {
  n: number;
  dans3: number; dans7: number; dans14: number; // % dans la tolérance
  ecartMedian: number; // en valeur absolue
  biais: number; // médiane SIGNÉE — le penchant du juge
};

export function tauxDeRealisation(venues: { clientId: string; date: string }[]): Realisation | null {
  const parClient = new Map<string, string[]>();
  for (const v of venues) parClient.set(v.clientId, [...(parClient.get(v.clientId) ?? []), v.date]);
  const ecarts: number[] = [];
  for (const dates of parClient.values()) {
    const v = [...new Set(dates)].sort();
    for (let k = 3; k <= v.length; k += 1) {
      const passe = v.slice(0, k - 1);
      const gaps: number[] = [];
      for (let i = 1; i < passe.length; i += 1) {
        gaps.push(Math.round((fromISO(passe[i]).getTime() - fromISO(passe[i - 1]).getTime()) / 86400000));
      }
      const use = gaps.filter((g) => g > 0);
      /* LE MÊME SEUIL QUE LE JUGE, pas un plus sévère : `predictNextVisit` se
         prononce dès DEUX venues — donc dès UN intervalle. Exiger deux
         intervalles ici aurait écarté du calcul les estimations les plus
         fragiles, celles qui se trompent le plus : le taux annoncé aurait été
         flatteur. On éprouve le juge tel qu'il parle. */
      if (!use.length) continue;
      const med = Math.max(14, medianInt(use));
      const prevu = addDaysISO(passe[passe.length - 1], med);
      ecarts.push(Math.round((fromISO(v[k - 1]).getTime() - fromISO(prevu).getTime()) / 86400000));
    }
  }
  if (!ecarts.length) return null;
  const abs = ecarts.map((e) => Math.abs(e));
  const part = (j: number) => Math.round((abs.filter((e) => e <= j).length / abs.length) * 100);
  return {
    n: ecarts.length,
    dans3: part(3), dans7: part(7), dans14: part(14),
    ecartMedian: medianInt(abs),
    biais: medianInt(ecarts),
  };
}

/* ══ POSER LA SUITE D'UN ABONNEMENT — 1er septembre 2026 ═════════════
   « J'aimerais poser les RDV à venir de chaque abonnement vendu en respectant
   le rythme de 4, 6 ou 8 semaines pour chaque client, et donner la liberté de
   modifier ses dates au besoin » (Yéman).

   UN ABONNEMENT VENDU EST UNE PROMESSE DE RYTHME. La Maison encaissait la
   promesse et laissait le rythme se débrouiller : six resserrages achetés,
   aucun fauteuil retenu, et la tête qui rappelle en novembre trouve l'agenda
   plein.

   LE CALCUL EST PUR, ET C'EST VOULU : il ne crée aucun rendez-vous, il PROPOSE
   des dates que l'écran laisse corriger une à une. Poser six séances d'un geste
   sans pouvoir en bouger une seule ferait plus de dégâts que de bien. */

/* ══ LE JOUR QU'ELLE PRÉFÈRE — 6 septembre 2026 ═══════════════════════

   « Le jour qui remporte le plus sous le carnet d'un client, remplir
   automatiquement ce jour favori dans sa fiche » (Yéman).

   LE CARNET SAIT DÉJÀ QUEL JOUR ELLE VIENT. Personne ne l'avait compté : le
   champ « elle ne vient que le… » attendait qu'on le remplisse à la main, et
   il restait vide sur presque toutes les têtes — donc la prédiction tombait
   n'importe quel jour, y compris ceux où elle ne vient jamais.

   TROIS GARDES, PARCE QU'UNE COÏNCIDENCE N'EST PAS UNE HABITUDE :

   ① SEULES LES VENUES HONORÉES COMPTENT. Un rendez-vous annulé, ou posé et
      jamais rendu, ne dit rien de ce qu'elle aime — il dit le contraire.

   ② QUATRE VENUES AU MOINS. Sur trois, deux un mardi font 67 % et ne prouvent
      rien : c'est le comptoir qui a proposé mardi, pas elle qui l'a choisi.

   ③ LA MOITIÉ, ET DEVANT LA SUIVANTE. Un jour qui ne rassemble pas la moitié
      de ses venues n'est pas SON jour ; et à égalité, deux jours se valent —
      en choisir un serait décider à sa place. */

export type JourFavori = {
  /** 0 = dimanche, comme `Date.getDay()`. Le premier de ses jours. */
  jour: number;
  /** UN OU DEUX JOURS — 6 septembre 2026. « 4 fois le mardi et 4 fois le
      mercredi : sélectionne les deux. » Le second rejoint le premier quand il
      pèse au moins les TROIS QUARTS de lui : en dessous, ce n'est plus une
      seconde habitude, c'est une exception qu'on prendrait pour une règle. */
  jours: number[];
  fois: number;
  /** Les venues HONORÉES, celles qui comptent. */
  total: number;
};

/** La part du premier jour qu'un second doit atteindre pour le rejoindre. */
export const PART_DU_SECOND_JOUR = 0.75;

type VenueLue = { clientId: string; date: string; status?: string };

/** ══ LA RÈGLE DE LA MAISON — 6 septembre 2026 ══════════════════════

    « Pour le jour à trancher, le Trône tranche avec une prédominance des jours
    favoris selon les derniers mois. Il faut écrire une règle pour la Maison
    pour toujours remplir un jour » (Yéman).

    JE REFUSAIS DE TRANCHER, LA MAISON DEMANDE QU'ON TRANCHE. Mon premier
    moteur laissait le champ vide dès qu'un doute existait : deux jours à
    égalité, un jour trop dispersé, moins de quatre venues. Résultat, presque
    aucune tête n'avait de jour, et la prédiction tombait n'importe où — ce qui
    est PIRE qu'un jour imparfait.

    LES VENUES RÉCENTES PÈSENT PLUS LOURD. C'est ce qui tranche les égalités
    sans qu'on ait à inventer une seconde règle : une tête qui venait le mardi
    l'an dernier et le jeudi depuis six mois est une tête du jeudi. Le poids
    décroît doucement, `1 / (1 + mois)` — pas de seuil, donc pas de bascule
    brutale d'un jour à l'autre quand une venue passe une date ronde.

    TROIS VENUES HONORÉES AVANT DE CONCLURE — arbitrage de la Maison du
    6 septembre, après un premier seuil à quatre. En dessous, le champ reste
    vide et l'écran dit pourquoi : deux venues ne font pas une prédominance,
    elles font une coïncidence. Au-delà, on tranche TOUJOURS. */
export const VENUES_POUR_UN_JOUR = 3;

/** Le poids d'une venue selon son âge. Aujourd'hui vaut 1, il y a un an 0,5,
    il y a deux ans 0,33 : le passé compte, mais il ne commande plus. */
const poidsDeLaVenue = (iso: string, aujourdhui: string): number => {
  const j = (Date.parse(`${aujourdhui}T00:00:00`) - Date.parse(`${iso}T00:00:00`)) / 86400000;
  const mois = Math.max(0, j) / 30.4;
  return 1 / (1 + mois / 12);
};

/** SON JOUR. `undefined` seulement quand aucune venue n'a été honorée. */
export function jourFavoriDe(
  venues: readonly VenueLue[],
  clientId: string,
  aujourdhui?: string,
): JourFavori | undefined {
  const jour0 = aujourdhui ?? new Date().toISOString().slice(0, 10);
  const siennes = venues.filter((a) => a.clientId === clientId && a.status === 'honoré');
  if (siennes.length < VENUES_POUR_UN_JOUR) return undefined;
  const compte = new Array(7).fill(0) as number[];
  const poids = new Array(7).fill(0) as number[];
  /* LE JOUR DE LA DERNIÈRE VENUE, gardé pour l'ultime départage : à poids
     rigoureusement égal — deux venues le même jour de la semaine à des dates
     symétriques — c'est la plus récente qui parle. */
  let dernierJour = -1;
  let dernierIso = '';
  for (const a of siennes) {
    const d = new Date(`${a.date}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    compte[d.getDay()] += 1;
    poids[d.getDay()] += poidsDeLaVenue(a.date, jour0);
    if (a.date > dernierIso) { dernierIso = a.date; dernierJour = d.getDay(); }
  }
  const total = compte.reduce((n, x) => n + x, 0);
  if (total === 0) return undefined;
  let jour = 0;
  for (let i = 1; i < 7; i += 1) {
    if (poids[i] > poids[jour] + 1e-9) jour = i;
    else if (Math.abs(poids[i] - poids[jour]) <= 1e-9 && i === dernierJour) jour = i;
  }
  /* LE SECOND JOUR, s'il pèse assez. On le cherche après le premier, jamais
     avant : c'est le premier qui donne la mesure. */
  let second = -1;
  for (let i = 0; i < 7; i += 1) {
    if (i === jour || compte[i] === 0) continue;
    if (second < 0 || poids[i] > poids[second]) second = i;
  }
  const jours = (second >= 0 && poids[second] >= poids[jour] * PART_DU_SECOND_JOUR)
    ? [jour, second]
    : [jour];
  return { jour, jours, fois: compte[jour], total };
}

/** CE QUE LE CARNET DIT DE SES JOURS — avec la raison quand rien ne se dégage.

    Trois refus possibles, et ils ne se corrigent pas de la même façon :
    · `trop-peu` — il faut la faire revenir, rien d'autre à faire ;
    · `egalite` — deux jours se valent, c'est à la Maison de trancher ;
    · `disperse` — elle vient quand elle peut, et c'est une information. */
export type LectureDuJour = {
  favori?: JourFavori;
  /** Ses venues HONORÉES, celles qui comptent. */
  honorees: number;
  /** Tous ses rendez-vous, honorés ou non — pour dire l'écart. */
  rituels: number;
  /** Le jour le plus fréquent, même quand il ne suffit pas. */
  tete?: { jour: number; fois: number };
  /** LA SEULE ABSTENTION QUI SUBSISTE : pas encore trois venues honorées. */
  raison?: 'trop-peu';
};

export function litSonJour(
  venues: readonly { clientId: string; date: string; status?: string }[],
  clientId: string,
  aujourdhui?: string,
): LectureDuJour {
  const siens = venues.filter((a) => a.clientId === clientId);
  const honorees = siens.filter((a) => a.status === 'honoré');
  const favori = jourFavoriDe(honorees, clientId, aujourdhui);
  return {
    honorees: honorees.length,
    rituels: siens.length,
    tete: favori ? { jour: favori.jour, fois: favori.fois } : undefined,
    favori,
    raison: favori ? undefined : 'trop-peu',
  };
}

/** LA RAISON, EN FRANÇAIS. `nomDuJour` sert quand un jour se détache sans
    suffire — le nommer évite de chercher lequel. */
export const diraPourquoiPasDeJour = (l: LectureDuJour, nomDuJour?: string): string => {
  if (l.raison !== 'trop-peu') return '';
  void nomDuJour;
  const manque = VENUES_POUR_UN_JOUR - l.honorees;
  if (l.honorees === 0) {
    return l.rituels > 0
      ? `${l.rituels} rendez-vous, aucun encore honoré. Son jour se lira à sa ${VENUES_POUR_UN_JOUR}ᵉ venue.`
      : `Aucune venue honorée. Son jour se lira à sa ${VENUES_POUR_UN_JOUR}ᵉ.`;
  }
  return `${l.honorees} venue${l.honorees > 1 ? 's' : ''} honorée${l.honorees > 1 ? 's' : ''} sur ${VENUES_POUR_UN_JOUR}. Encore ${manque} et son jour se lira.`;
};

/** EN CLAIR, pour que la fiche dise D'OÙ vient la proposition. Une valeur posée
    sans sa raison ne se conteste pas : on la subit ou on l'efface. */
export const diraLeJourFavori = (f: JourFavori, nomDuJour: string, nomDuSecond?: string): string => {
  const j = nomDuJour.toLowerCase();
  if (f.jours.length > 1 && nomDuSecond) {
    return `Elle vient le ${j} ou le ${nomDuSecond.toLowerCase()}, ${f.total} venues comptées.`;
  }
  if (f.fois === f.total) return `Elle vient toujours le ${j}, ${f.total} fois sur ${f.total}.`;
  return `Elle vient le ${j} ${f.fois} fois sur ${f.total}, et le plus souvent ces derniers mois.`;
};

/** LES RYTHMES DE LA MAISON, en semaines — 3 septembre 2026.

    Quatre, six et huit couvraient « presque tout » ; dix est venu avec la
    reprise à la clôture, puis CINQ et SEPT. Ce n'est pas un détail de
    présentation : une tête qui revient toutes les cinq semaines et qu'on
    programme à quatre vient trop tôt douze fois par an, et à six elle vient
    trop tard autant de fois. Le pas d'une semaine est celui du cheveu, pas
    celui d'un calendrier rond.

    Le champ libre reste ouvert à côté, pour ce qui ne tombe sur aucun de
    ceux-là. */
/* 9, 11 et 12 rejoignent la gamme le 9 septembre (« rajoute 9, 11 et 12
   semaines », Yéman) — la cadence observée tombe souvent entre les anciens
   barreaux, et une pastille qui n'existe pas ne peut pas s'allumer. */
export const RYTHMES_ABO = [4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** LA DATE DE LA REPRISE — 3 septembre 2026.

    Le rituel d'aujourd'hui plus son rythme, posé sur SON jour puis sur une
    porte ouverte. Les deux règles de la Maison s'appliquent dans cet ordre : le
    salon ne s'ouvre pas parce qu'une cliente préfère le samedi.

    ON COMPTE DEPUIS LE RITUEL, PAS DEPUIS LE CLIC. Marquer honoré trois jours
    plus tard décalerait la reprise de trois jours, et la cadence dériverait
    d'un mois par an sans que personne ne comprenne pourquoi. */
export const dateDeLaReprise = (
  isoDuRituel: string, semaines: number, jourPrefere?: number | readonly number[],
): string => poseLaDate(addDaysISO(isoDuRituel, Math.max(1, Math.round(semaines)) * 7), jourPrefere);

export type SeanceProposee = {
  rang: number;
  dateIso: string;
  serviceIds: string[];
  /** La date a bougé : porte close, son jour à elle, ou la séance d'avant. */
  glissee: boolean;
};

export function proposeLaCadence(o: {
  /** Ce qu'il lui reste, prestation par prestation. `reste === null` = illimité. */
  restes: readonly { serviceId: string; reste: number | null }[];
  departIso: string;
  pasJours: number;
  jourPrefere?: number | readonly number[];
  /** L'échéance du paquet : on ne pose rien au-delà. */
  finIso?: string | null;
  plafond?: number;
}): SeanceProposee[] {
  const pas = Math.max(1, Math.round(o.pasJours));
  /* COMBIEN DE SÉANCES, PAS COMBIEN DE JETONS. Six resserrages et six lavages
     se font dans la MÊME visite : poser douze rendez-vous doublerait son agenda
     et viderait ses crédits deux fois plus vite. Le nombre de séances est donc
     le PLUS GRAND des restes. */
  const finis = o.restes.filter((r) => r.reste !== null).map((r) => r.reste as number);
  const combien = Math.min(o.plafond ?? 24, Math.max(0, ...finis));
  /* UNE PRESTATION À VOLONTÉ NE SE POSE PAS TOUTE SEULE : elle s'ajoute à
     chaque séance et n'en commande aucune. Sans crédit fini, rien à poser. */
  if (combien === 0) return [];

  const suite: SeanceProposee[] = [];
  let precedente: string | null = null;
  for (let rang = 1; rang <= combien; rang += 1) {
    const brut = rang === 1 ? o.departIso : addDaysISO(o.departIso, pas * (rang - 1));
    let iso = poseLaDate(brut, o.jourPrefere);
    /* DEUX SÉANCES NE TOMBENT JAMAIS LE MÊME JOUR. Un jour préféré très proche
       d'une porte close peut ramener deux dates au même endroit ; la seconde
       repart du lendemain de la première. */
    if (precedente !== null && iso <= precedente) iso = poseLaDate(addDaysISO(precedente, 1), o.jourPrefere);
    /* ON NE POSE RIEN APRÈS L'ÉCHÉANCE DU PAQUET : un crédit posé au-delà de la
       date de fin serait un rendez-vous que la formule ne couvre plus. */
    if (o.finIso && iso > o.finIso) break;
    /* LES CRÉDITS SE POSENT DANS L'ORDRE : si les quotas ne sont pas égaux, six
       Reprises et trois soins, les trois premières séances portent les deux et
       les trois suivantes la Reprise seule. */
    const serviceIds = o.restes
      .filter((r) => r.reste === null || r.reste >= rang)
      .map((r) => r.serviceId);
    suite.push({ rang, dateIso: iso, serviceIds, glissee: iso !== brut });
    precedente = iso;
  }
  return suite;
}

/** DÉCALER TOUTE LA SUITE d'un même nombre de jours, portes closes comprises.
    Une séance repoussée seule casse le rythme ; c'est le rythme qu'on déplace. */
export const decaleLaSuite = (
  suite: readonly SeanceProposee[], jours: number, jourPrefere?: number | readonly number[],
): SeanceProposee[] =>
  suite.map((x) => {
    const brut = addDaysISO(x.dateIso, jours);
    const iso = poseLaDate(brut, jourPrefere);
    return { ...x, dateIso: iso, glissee: iso !== brut };
  });


/* ══ LE RYTHME DE LA REPRISE — la main d'abord, l'observée sinon ═════
   La reprise à la clôture n'exige plus un rythme saisi : posé à la main il
   COMMANDE ; absent, la cadence observée prend le relais — jamais pour une
   tête de passage ni une diaspora sans rythme posé, leur intervalle mesure
   des billets d'avion, pas un rythme. */
export function rythmeDeReprise(
  cliente: Client,
  appts: readonly Appointment[],
): { semaines: number; observe: boolean } | null {
  if (cliente.rythmeSemaines) return { semaines: cliente.rythmeSemaines, observe: false };
  if (estDePassage(cliente) || estDiaspora(cliente) || aDefaitSesLocks(cliente)) return null;
  const obs = cadenceObservee(appts, cliente.id);
  return obs ? { semaines: obs.semaines, observe: true } : null;
}

