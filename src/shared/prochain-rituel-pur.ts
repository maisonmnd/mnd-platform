/* ══ SON PROCHAIN RITUEL, AU MOMENT OÙ ELLE PAIE — 2 novembre 2026 ══════
   Maquette `public/maquette-remplir-les-fauteuils.html`, « Un · La Caisse »,
   validée par Yéman le 2 novembre 2026 (« construis »). Arbitrage 1 : le
   rituel se pose CONFIRMÉ, et la confirmation WhatsApp habituelle part
   aussitôt (elle l'a choisi devant vous).

   Les fauteuils sont vides les trois quarts du temps, sauf le samedi. Le
   moment où elle paie est celui où elle est devant nous : la Caisse lui
   propose son rituel habituel, au bon moment de son rythme, sur trois places
   réelles. Un toucher, et c'est posé.

   CE QUI EST LU, ET OÙ :
   · ses rituels : `sesRituelsPasses` (ses-rituels-pur.ts), la règle publiée ce
     jour dans Ma Couronne, ses trois derniers rituels différents, un geste
     fermé lu sous son successeur (`SUCCESSEURS`) ;
   · le rythme d'un rituel : l'écart MÉDIAN entre ses venues qui le portent,
     au plancher de quatorze jours de la Cadence (`cadenceObservee`) ; à moins
     de deux venues, sa cadence générale (celle que lit Perle :
     `predictNextVisit(...).avgDays`, sinon le rythme de sa fiche) ; à défaut
     de tout, vingt-huit jours ;
   · les places : `propositionsDuRdv` du « + RDV » (rdv-fluide-pur.ts), qui
     compte les fauteuils, les jours fermés, les exceptions d'horaires et les
     blocages. Aucune de ces règles n'est réécrite ici.

   UNE VENUE QUI CONTIENT LE RITUEL LE PORTE. P. A. (2 novembre 2026) alterne
   un lavage et, tous les deux mois, le rituel complet, qui commence par le
   même lavage. Mesurer le lavage sur les seuls lavages seuls comptait 53 jours
   entre le 11 septembre et le 3 novembre 2026, quand elle avait été lavée le
   10 octobre, au rituel complet : son rythme de lavage passait à quatre
   semaines. Lu sur toutes les venues qui portent ses gestes, il tombe à trois
   semaines (14, 14, 20, 29, 24 jours), « toutes les deux à trois semaines »
   comme le dit la maquette. Le rituel complet, lui, ne se lit que sur les
   rituels complets (8 août et 10 octobre 2026 : 63 jours).

   Pur, sans magasin ni React : `scripts/verifie-le-prochain-rituel` l'éprouve. */

import type { Appointment } from './agenda';
import type { LongueurId } from './catalog';
import { sesRituelsPasses, type VenuePourSesRituels } from './ses-rituels-pur';
import { addDaysISO, fromISO, medianInt } from './cadence-pur';
import { estUnSinsin, maitresPermis, MAITRE_DES_SINSIN } from './agenda-pur';
import { momentDuMessage } from './salle-des-envois';
import { propositionsDuRdv, type Proposition } from '../apps/trone/routes/clients/rdv-fluide-pur';

/** Sans venue mesurable ni cadence : quatre semaines. */
export const RYTHME_PAR_DEFAUT_JOURS = 28;
/** Le plancher de la Cadence (`cadenceObservee`) : jamais moins de deux semaines. */
export const PLANCHER_DU_RYTHME_JOURS = 14;
/** Les places s'ouvrent quelques jours avant la date visée : « autour », pas « après ». */
export const JOURS_AVANT_LA_DATE = 3;

/** Une venue telle que la lit le prochain rituel : celle de « Ses rituels »,
    plus son maître et son rang dans une série. */
export type VenueDuProchainRituel = VenuePourSesRituels & { master?: string; seriesIndex?: number };

export type SonProchainRituel = {
  /** Ses gestes, un geste fermé déjà lu sous son successeur. */
  ids: string[];
  /** Sa dernière venue qui porte ce rituel (AAAA-MM-JJ). */
  derniere: string;
  /** Le nombre de jours distincts où elle l'a reçu. */
  occurrences: number;
  rythmeJours: number;
  /** D'où vient le rythme : ce rituel, sa cadence générale, ou le défaut. */
  source: 'rituel' | 'cadence' | 'defaut';
  /** La date que son rythme attend, même passée. */
  attendu: string;
  /** La date visée : `attendu`, jamais avant demain. */
  vers: string;
  /** Le maître de sa dernière venue qui le porte et en nomme un ('' : aucune). */
  maitre: string;
};

const joursEntre = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
const moment = (a: { date: string; time?: string }) => `${a.date.slice(0, 10)} ${a.time ?? ''}`;

/** SES PROCHAINS RITUELS : chacun de ses rituels habituels (trois au plus,
    l'ordre de « Ses rituels »), avec son rythme et sa date visée. */
export function sesProchainsRituels(o: {
  rdvs: readonly VenueDuProchainRituel[];
  clientId: string;
  aujourdhui: string;
  /** La prestation est-elle encore à la carte du Trône ? */
  proposable: (serviceId: string) => boolean;
  successeur?: (serviceId: string) => string | undefined;
  estCreation?: (serviceId: string) => boolean;
  /** CE QU'ELLE VIENT DE RÉGLER : une venue de ce jour, même quand la vente
      ne soldait aucun rendez-vous du carnet. Le rythme se compte en JOURS
      distincts : un rendez-vous honoré le même jour ne la compte pas deux fois. */
  payeAujourdhui?: { date: string; serviceIds: readonly string[] };
  /** Sa cadence générale en jours (celle que lit Perle) ; `null` : non mesurée. */
  cadenceJours?: number | null;
}): SonProchainRituel[] {
  /* Une séance de suite n'est pas une venue de plus : la série compte une
     fois, comme pour la Cadence. */
  const siennes: VenueDuProchainRituel[] = o.rdvs.filter((a) => a.clientId === o.clientId && !(a.seriesIndex && a.seriesIndex > 1));
  const paye = o.payeAujourdhui;
  if (paye && paye.serviceIds.length > 0) {
    siennes.push({ clientId: o.clientId, date: paye.date.slice(0, 10), time: '23:59', status: 'honoré', serviceIds: [...paye.serviceIds] });
  }
  const lecture = { clientId: o.clientId, aujourdhui: o.aujourdhui, proposable: o.proposable, successeur: o.successeur, estCreation: o.estCreation };
  /* Chaque venue lue UNE PAR UNE par la même règle que ses rituels : ses
     gestes sous leurs successeurs, une création écartée, un geste fermé sans
     successeur qui écarte la venue. Rien n'est relu autrement qu'à l'écran. */
  const lues = siennes
    .map((a) => ({ a, r: sesRituelsPasses({ ...lecture, rdvs: [a], max: 1 })[0] }))
    .filter((x): x is { a: VenueDuProchainRituel; r: { ids: string[]; date: string } } => !!x.r)
    .sort((x, y) => moment(x.a).localeCompare(moment(y.a)));
  const cadence = o.cadenceJours && o.cadenceJours > 0 ? Math.round(o.cadenceJours) : null;
  const demain = addDaysISO(o.aujourdhui, 1);
  return sesRituelsPasses({ ...lecture, rdvs: siennes }).map((rituel) => {
    const porteuses = lues.filter((v) => rituel.ids.every((id) => v.r.ids.includes(id)));
    const jours = [...new Set(porteuses.map((v) => v.r.date))].sort();
    const derniere = jours[jours.length - 1] ?? rituel.date;
    const ecarts = jours.slice(1).map((d, i) => joursEntre(jours[i], d)).filter((g) => g > 0);
    const [rythmeJours, source]: [number, SonProchainRituel['source']] = ecarts.length > 0
      ? [Math.max(PLANCHER_DU_RYTHME_JOURS, medianInt(ecarts)), 'rituel']
      : cadence ? [cadence, 'cadence'] : [RYTHME_PAR_DEFAUT_JOURS, 'defaut'];
    const attendu = addDaysISO(derniere, rythmeJours);
    return {
      ids: rituel.ids,
      derniere,
      occurrences: jours.length,
      rythmeJours,
      source,
      attendu,
      vers: attendu < demain ? demain : attendu,
      /* Le dernier maître NOMMÉ : un rendez-vous pris dans Ma Couronne n'en
         porte pas, il ne fait pas oublier celui du fauteuil. */
      maitre: [...porteuses].reverse().find((v) => !!v.a.master?.trim())?.a.master?.trim() ?? '',
    };
  });
}

/** LE RITUEL CHOISI D'OFFICE : celui qui revient le plus tôt selon SON
    rythme ; à égalité, le plus récent (le premier de la liste). -1 : aucun.
    UN RITUEL VENU UNE SEULE FOIS N'A PAS DE RYTHME À LUI : daté par sa
    cadence générale, un soin d'il y a quatre mois tomberait « dès demain »
    et passerait devant le lavage qu'elle vient de payer. Il ne se choisit
    d'office que si aucun de ses rituels n'est mesuré ; sa puce reste là. */
export function leRituelDOffice(rituels: readonly SonProchainRituel[]): number {
  const mesure = rituels.some((r) => r.source === 'rituel');
  let mieux = -1;
  rituels.forEach((r, i) => {
    if (mesure && r.source !== 'rituel') return;
    if (mieux < 0 || r.vers < rituels[mieux].vers) mieux = i;
  });
  return mieux;
}

/** SON RYTHME, DIT : « 3 semaines », « 2 mois », « 10 jours ». */
export function dureeDite(jours: number): string {
  if (jours < 14) return `${jours} jours`;
  if (jours < 56) return `${Math.round(jours / 7)} semaines`;
  return `${Math.round(jours / 30.4)} mois`;
}

/** SON RYTHME, EN CADENCE : « toutes les 3 semaines », « tous les 2 mois ». */
export function rythmeDit(jours: number): string {
  if (jours < 14) return `tous les ${jours} jours`;
  if (jours < 56) return `toutes les ${Math.round(jours / 7)} semaines`;
  return `tous les ${Math.round(jours / 30.4)} mois`;
}

/** LA PHRASE DE LA DATE VISÉE, pour l'équipe au comptoir. */
export function versDit(r: SonProchainRituel, aujourdhui: string, jourDit: (iso: string) => string): string {
  const depuis = r.derniere === aujourdhui ? 'aujourd’hui' : `le ${jourDit(r.derniere)}`;
  if (r.vers !== r.attendu) return `Dès demain : son rythme (${dureeDite(r.rythmeJours)}) l’attendait le ${jourDit(r.attendu)}.`;
  const pourquoi = r.source === 'rituel'
    ? `son rythme pour ce rituel, lu sur ${r.occurrences} venues`
    : r.source === 'cadence' ? 'sa cadence de venue, ce rituel n’ayant qu’une venue' : 'faute de rythme mesuré';
  return `Vers le ${jourDit(r.vers)}, ${dureeDite(r.rythmeJours)} après ${depuis} : ${pourquoi}.`;
}

/** SON MAÎTRE POUR CE RITUEL, par la règle du « + RDV » : un SÍNSIN va chez
    Team (24 octobre 2026) ; sinon son maître habituel s'il peut le recevoir ;
    sinon celui que la branche désigne. Le Trône ne change jamais de maître
    tout seul : ce choix ne vaut que pour un rendez-vous neuf. */
export function leMaitreDuRituel(o: {
  habituel: string;
  noms: readonly (string | null | undefined)[];
  maitres: readonly string[];
  parDefaut: string;
}): string {
  if (o.noms.some(estUnSinsin) && o.maitres.includes(MAITRE_DES_SINSIN)) return MAITRE_DES_SINSIN;
  if (o.habituel && maitresPermis(o.noms, o.maitres).includes(o.habituel)) return o.habituel;
  return o.parDefaut;
}

export type PlaceDuProchainRituel = Proposition;

const minutes = (h: string) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + (mm || 0); };

/** SES TROIS PLACES, AUTOUR DE LA DATE VISÉE, par `propositionsDuRdv` : sa
    date (ou la place suivante), une place un peu avant, son jour habituel,
    à son heure la plus proche. Les jours de recherche partent de quelques
    jours avant la date visée, jamais avant demain. Rangées dans le temps. */
export function sesTroisPlaces(o: {
  vers: string;
  aujourdhui: string;
  /** Les places libres d'un jour pour sa durée : `placesDuJour` du « + RDV ». */
  placesDe: (iso: string) => { ferme: boolean; heures: readonly string[] };
  heureHabituelle?: string | null;
  jourHabituel?: number | null;
  /** « mardi 17 novembre 2026 » */
  jourDit: (iso: string) => string;
  /** « samedi » */
  nomDuJour: (jour: number) => string;
}): PlaceDuProchainRituel[] {
  const demain = addDaysISO(o.aujourdhui, 1);
  const avant = addDaysISO(o.vers, -JOURS_AVANT_LA_DATE);
  const debut = avant < demain ? demain : avant;
  const vers = o.vers < debut ? debut : o.vers;
  return propositionsDuRdv({
    aujourdhui: debut,
    placesDe: o.placesDe,
    reprise: vers,
    heureHabituelle: o.heureHabituelle,
    jourHabituel: o.jourHabituel,
    jourDit: o.jourDit,
    nomDuJour: o.nomDuJour,
  })
    /* Les mots du « + RDV » parlent de sa reprise et de la première place
       libre ; ici, c'est son rythme qui parle. */
    .map((p) => (p.cle === 'date'
      ? { ...p, titre: 'À sa date', pourquoi: p.iso === vers ? 'Le jour où son rythme la ramène.' : `Son rythme tombe le ${o.jourDit(vers)}, ${o.placesDe(vers).ferme ? 'jour de fermeture' : 'complet'} : la place suivante.` }
      : p.cle === 'tot'
        ? { ...p, titre: 'Un peu avant', pourquoi: 'La première place libre des jours qui précèdent.' }
        : p))
    .sort((a, b) => a.iso.localeCompare(b.iso) || minutes(a.heure) - minutes(b.heure));
}

/** UNE PLACE TIENT-ELLE ENCORE ? Relue au toucher, sur le carnet du moment :
    une autre main a pu la prendre entre-temps. */
export const laPlaceTient = (fraiches: { heures: readonly string[] }, heure: string): boolean => fraiches.heures.includes(heure);

/** CE QUI NE SE POSE PAS D'UN TOUCHER. La fenêtre du rendez-vous fait ces
    gestes, la Caisse ne les refait pas : un toucher ouvre alors sa fiche,
    posée sur la place choisie. `null` : rien, le toucher pose. */
export function ceQuiDemandeSaFiche(c: {
  /** Une formule vit à cette date : sa séance se rattache à son contrat. */
  formule?: boolean;
  /** Le taux de la remise famille que la fenêtre poserait d'office. */
  remiseFamillePct?: number;
  /** Un geste sans prix ferme pour elle : le montant se convient. */
  prixLibre?: boolean;
  /** Un forfait qui pose ses séances incluses au carnet. */
  seancesIncluses?: boolean;
  /** Une prestation qui privatise le salon. */
  salonPrive?: boolean;
  /** Le réglage strict des paliers refuse la main du jour. */
  paliersStricts?: boolean;
}): string | null {
  if (c.formule) return 'Elle a une formule en cours : sa séance se rattache à son contrat dans sa fiche';
  if ((c.remiseFamillePct ?? 0) > 0) return `La remise famille de son foyer (${c.remiseFamillePct} %) se pose dans sa fiche`;
  if (c.prixLibre) return 'Un geste de ce rituel se tarife au fauteuil : son prix se convient dans sa fiche';
  if (c.seancesIncluses) return 'Ce rituel pose des séances incluses : elles se datent dans sa fiche';
  if (c.salonPrive) return 'Ce rituel privatise la Maison : la fermeture se pose dans sa fiche';
  if (c.paliersStricts) return 'Le réglage strict des paliers demande une main habilitée : elle se choisit dans sa fiche';
  return null;
}

/* ══ LE RENDEZ-VOUS, CONSTRUIT EN UN SEUL ENDROIT ══════════════════════
   Appelé JUSTE AVANT l'enregistrement (`poseUnRendezVous`, agenda.ts), le
   même que celui de « Poser le rendez-vous » dans la fenêtre du rendez-vous.
   Mêmes champs que la fenêtre pour un rituel neuf sans formule, sans remise,
   sans forfait : posé CONFIRMÉ, au Trône, SANS `sansConfirmation`, donc la
   confirmation-rdv le balaie et la confirmation WhatsApp habituelle part.

   L'OFFRE « LE MERCREDI DE LA MAISON » (−15 % sur un rituel posé un
   mercredi, code MERCREDI15) S'Y BRANCHE depuis le 2 novembre 2026 au soir :
   `offreDuJour`, ce que `poseLOffreDuJour` (offres-pur) rend pour la place
   touchée, écrit son code, son offre et ses remises de ligne, comme le site
   et la fenêtre du rendez-vous les écrivent ; le prix figé est alors le net
   arrondi au millier (`ceQueRetireLeMercredi`). Sans elle, rien ne change :
   aucun code, aucune remise.

   LA CARTE « SON PROCHAIN RITUEL » (4 novembre 2026) le pose SANS
   confirmation tant qu'elle est ouverte (`sansConfirmation`), relié à son
   rituel (`repriseDe`), et lève le drapeau à sa fermeture : la
   confirmation-rdv le balaie alors, une fois, à la date retenue. La remise
   famille de sa tête s'y fige en francs, comme la fenêtre la fige. */
export function leRendezVousDuProchainRituel(o: {
  id: string;
  branchId: string;
  clientId: string;
  serviceIds: readonly string[];
  place: { iso: string; heure: string };
  master: string;
  /** Inscrite seulement si une prestation s'y facture, comme la fenêtre. */
  longueur?: LongueurId;
  dureeMin: number;
  /** Le brut du rituel au tarif de sa tête (`brutDuRituel`), figé à la pose. */
  priceXof: number;
  depositServiceIds: readonly string[];
  depositXof: number;
  /** Le parent qui reçoit la confirmation, sur une fiche à deux numéros. */
  numeroAPrevenir?: string;
  /** Le mercredi de la Maison posé sur cette place (`poseLOffreDuJour`). */
  offreDuJour?: { codeOffre: string; offreId?: string; remisesLignes: ({ pct?: number; xof?: number } | null)[] } | null;
  /** LA CARTE « SON PROCHAIN RITUEL » (4 novembre 2026) : le rituel dont il
      est la suite (« un rituel, un seul prochain », `prochainDejaPose`). */
  repriseDe?: string;
  /** La carte pose SANS confirmation tant qu'elle est ouverte ; elle lève
      ce drapeau à sa fermeture, et la confirmation part une fois. */
  sansConfirmation?: boolean;
  /** La remise famille de sa tête, en francs, comme la fenêtre la fige
      (`remiseFamille`, `remiseFamilleXof`, et le cumul `discountXof`). */
  remiseFamilleXof?: number;
}): Appointment {
  const famille = Math.max(0, Math.round(o.remiseFamilleXof ?? 0));
  return {
    id: o.id,
    branchId: o.branchId,
    clientId: o.clientId,
    serviceIds: [...o.serviceIds],
    numeroAPrevenir: o.numeroAPrevenir,
    longueur: o.longueur,
    dureeMin: o.dureeMin,
    date: o.place.iso,
    time: o.place.heure,
    master: o.master,
    status: 'confirmé',
    source: 'trone',
    ...(o.sansConfirmation ? { sansConfirmation: true } : {}),
    ...(o.repriseDe ? { repriseDe: o.repriseDe } : {}),
    priceXof: o.priceXof,
    ...(famille > 0 ? { discountXof: famille, remiseFamille: true, remiseFamilleXof: famille } : {}),
    depositServiceIds: [...o.depositServiceIds],
    depositXof: o.depositXof,
    ...(o.offreDuJour ? {
      codeOffre: o.offreDuJour.codeOffre,
      ...(o.offreDuJour.offreId ? { offreId: o.offreDuJour.offreId } : {}),
      remisesLignes: o.offreDuJour.remisesLignes.map((r) => (r ? { ...r } : null)),
    } : {}),
  };
}

/** L'ÉCRAN POSÉ DIT LA PHRASE ENTIÈRE, avec l'année : « Posé, confirmé :
    mardi 17 novembre 2026 à 13 h. » (le moment de la confirmation-rdv). */
export const phraseDeLaPose = (date: string, heure: string): string => `Posé, confirmé : ${momentDuMessage(date, heure)}.`;
