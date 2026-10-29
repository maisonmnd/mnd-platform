/* LES AUTOMATISATIONS RÉELLES — 21 octobre 2026.

   « Dans Marketing, les boutons Campagnes, Automatisations et Audience ne
   sont pas branchés et ne sont pas reliés » (Yéman). L'onglet montrait six
   lignes semées au premier jour (`AUTOMATIONS_SEED`), avec un interrupteur
   chacune : AUCUNE fonction ne les lisait, leur compteur ne bougeait jamais,
   et la vraie mécanique (rappels, confirmations, relances, avis…) vivait
   ailleurs, invisible ici.

   CE FICHIER DIT CE QUI PART VRAIMENT, tout seul, aujourd'hui : un catalogue
   écrit d'après les fonctions elles-mêmes (supabase/functions/*), et le compte
   du mois lu dans la table `envois`, par le même juge que le journal des
   envois (`compteDuJournal`). Un interrupteur n'est nommé que là où un vrai
   interrupteur existe ; les autres s'allument avec leur modèle WhatsApp et
   s'arrêtent d'eux-mêmes s'il manque. Pur, éprouvé par
   `verifie-le-marketing-branche`. */

import { compteDuJournal, jourDuSalon, type CompteDuJournal, type EnvoiLu } from './envois';
import { attendEncore } from './salle-des-envois';

export type GroupeDAutomatisation = 'avant' | 'entre' | 'apres' | 'argent' | 'site';

export const GROUPES_DES_AUTOMATISATIONS: readonly { k: GroupeDAutomatisation; dit: string }[] = [
  { k: 'avant', dit: 'Avant le rendez-vous' },
  { k: 'entre', dit: 'Entre deux séances' },
  { k: 'apres', dit: 'Après la venue' },
  { k: 'argent', dit: 'L’argent' },
  { k: 'site', dit: 'Le site et WhatsApp' },
];

/** Comment elle s'allume. `reglage` : un vrai interrupteur, qui vit à
    l'endroit nommé par `reglage`. `ici` : l'interrupteur vit dans cet onglet. */
export type Allumage = 'toujours' | 'avec-son-modele' | 'trone-ouvert' | 'reglage' | 'ici';

export type AutomatisationReelle = {
  id: string;
  groupe: GroupeDAutomatisation;
  quand: string;
  quoi: string;
  /** Les modèles Meta qu'elle envoie (vide : notification, message libre). */
  modeles: readonly string[];
  /** Les `type` de la table `envois` qu'elle écrit : c'est sur eux qu'elle se compte. */
  types: readonly string[];
  allumage: Allumage;
  /** Où vit son interrupteur, quand ce n'est pas ici. */
  reglage?: { vers: string; dit: string };
  /** Une ligne que la table `envois` ne compte pas : on dit pourquoi. */
  pasCompte?: string;
};

export const AUTOMATISATIONS_REELLES: readonly AutomatisationReelle[] = [
  { id: 'confirmation', groupe: 'avant', quand: 'Un rendez-vous passe « confirmé »', quoi: 'Confirmation WhatsApp, et notification avec l’itinéraire', modeles: ['confirmation_rdv'], types: ['confirmation'], allumage: 'toujours' },
  { id: 'rappel-j1', groupe: 'avant', quand: 'La veille du rendez-vous, 18 h et 19 h', quoi: 'Rappel WhatsApp, et SMS quand il est posé', modeles: ['rappel_rdv'], types: ['rappel-j1'], allumage: 'toujours' },
  { id: 'reprise-j3', groupe: 'avant', quand: '3 jours avant une reprise', quoi: 'La séance suivante proposée, deux boutons', modeles: ['reprise_proposee'], types: ['reprise-j3'], allumage: 'avec-son-modele' },
  { id: 'push-rappels', groupe: 'avant', quand: '22 h puis 2 h avant', quoi: 'Rappel sur Ma Couronne', modeles: [], types: [], allumage: 'toujours', pasCompte: 'compté par le serveur seulement' },
  { id: 'point-apres', groupe: 'entre', quand: '7 jours après une séance', quoi: 'Point d’étape, la tête répond d’un toucher', modeles: ['point_apres_seance'], types: ['point-apres'], allumage: 'avec-son-modele' },
  { id: 'point-avant', groupe: 'entre', quand: '7 jours avant la séance suivante', quoi: 'Point d’étape avant la séance', modeles: ['point_avant_seance'], types: ['point-avant'], allumage: 'avec-son-modele' },
  { id: 'avis-google', groupe: 'apres', quand: 'Première facture réglée', quoi: 'Demande d’avis Google', modeles: ['avis_google'], types: ['avis-google'], allumage: 'reglage', reglage: { vers: '/parametres', dit: 'Paramètres › Automatisations' } },
  { id: 'avis-premiere-venue', groupe: 'apres', quand: 'Au comptoir, à l’encaissement d’une première venue', quoi: 'Demande d’avis préparée dans la conversation, envoyée à la main', modeles: [], types: [], allumage: 'ici', pasCompte: 'envoyée à la main, non comptée' },
  { id: 'relance-facture', groupe: 'argent', quand: 'Facture à régler · J+1, 3, 7 et 14, à 10 h', quoi: 'Rappel de règlement, avec le bouton « Régler »', modeles: ['rappel_de_reglement'], types: ['relance-facture'], allumage: 'reglage', reglage: { vers: '/parametres', dit: 'Paramètres › L’encaissement' } },
  { id: 'rappel-echeance', groupe: 'argent', quand: 'La veille d’une échéance d’abonnement', quoi: 'Rappel d’échéance', modeles: ['rappel_echeance_veille'], types: ['rappel-echeance'], allumage: 'avec-son-modele' },
  { id: 'prix-revu', groupe: 'argent', quand: 'Prix revu après le comptage', quoi: 'L’écart annoncé avant la prochaine échéance', modeles: ['prix_revu_apres_comptage'], types: ['prix-revu'], allumage: 'avec-son-modele' },
  { id: 'fin-de-paquet', groupe: 'argent', quand: 'Dernière séance du paquet, ou 15 jours avant sa fin', quoi: 'Fin de paquet', modeles: ['fin_de_paquet'], types: ['fin-de-paquet'], allumage: 'trone-ouvert' },
  { id: 'accuse', groupe: 'site', quand: 'Une demande arrive du site', quoi: 'Accusé, qui dit ce qui a été demandé', modeles: ['demande_recue', 'demande_recue_simple'], types: ['accuse'], allumage: 'avec-son-modele' },
  { id: 'parrainage', groupe: 'site', quand: 'Une amie réserve avec un code', quoi: 'La marraine est prévenue', modeles: ['parrainage_reservation'], types: ['parrainage'], allumage: 'avec-son-modele' },
  { id: 'merci-marraine', groupe: 'site', quand: 'L’amie est venue', quoi: 'Merci à la marraine', modeles: ['parrainage_merci'], types: [], allumage: 'reglage', reglage: { vers: '/parrainages', dit: 'Les ambassadrices' }, pasCompte: 'écrit dans le fil de la marraine' },
  { id: 'automate-wa', groupe: 'site', quand: 'Un message arrive sur WhatsApp', quoi: 'L’automate de réservation répond', modeles: [], types: [], allumage: 'reglage', reglage: { vers: '/parametres', dit: 'Paramètres › Notifications & automatisations' }, pasCompte: 'ses réponses vivent dans les conversations' },
];

/** Ce que l'allumage dit, quand il n'y a pas d'interrupteur à toucher. */
export const ALLUMAGE_DIT: Record<Exclude<Allumage, 'reglage' | 'ici'>, string> = {
  toujours: 'toujours allumé',
  'avec-son-modele': 'allumé avec son modèle',
  'trone-ouvert': 'part quand un Trône est ouvert',
};

/** LES IDÉES — les quatre lignes semées qui n'ont jamais rien envoyé. Elles
    restent visibles, sans interrupteur : chacune se construit sur demande. */
export const IDEES_PAS_ENCORE_CONSTRUITES: readonly string[] = [
  'Dormante depuis 90 jours → un réveil doux',
  'Un an de locks → l’invitation au Couronnement',
  '5 jours après un soin → un produit du Carnet',
  'Stock bas → le bon de réassort',
];

/** LE MOIS EN COURS, au jour du salon : « AAAA-MM ». */
export const moisDuSalon = (maintenantIso: string): string => jourDuSalon(maintenantIso).slice(0, 7);

export type CompteDeLAutomatisation = CompteDuJournal & { dernier: string | null };

/** CE QU'UNE AUTOMATISATION A FAIT CE MOIS-CI, d'après la table `envois`.
    Ce qui attend encore en salle n'est pas compté (il a son écran) ; la
    branche filtre quand l'envoi la porte. */
export function compteDuMois(
  envois: readonly EnvoiLu[], types: readonly string[], mois: string, branchId?: string,
): CompteDeLAutomatisation {
  const du = envois.filter((e) => e && types.includes(e.type)
    && !attendEncore(e)
    && (!branchId || !e.branchId || e.branchId === branchId)
    && jourDuSalon(e.quand).slice(0, 7) === mois);
  const dernier = du.reduce<string | null>((d, e) => (d === null || e.quand > d ? e.quand : d), null);
  return { ...compteDuJournal(du), dernier };
}

/** LE TOTAL DE L'ONGLET : chaque envoi une fois, même si deux lignes
    partageaient un type (elles ne le font pas, mais le total ne doit pas
    dépendre de cette chance). */
export function compteDeTout(envois: readonly EnvoiLu[], mois: string, branchId?: string): CompteDuJournal {
  const tous = new Set(AUTOMATISATIONS_REELLES.flatMap((a) => a.types));
  return compteDuMois(envois, [...tous], mois, branchId);
}
