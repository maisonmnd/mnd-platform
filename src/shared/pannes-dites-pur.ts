/* ══ LES PANNES DITES · 12 novembre 2026 (le choix du moyen, lot D) ═══════
   « Une panne de MTN ou de FedaPay dite une seule fois à la direction, et
   inscrite dans La journée » (Yéman, « Oui » au lot D de la maquette « Le
   choix du moyen », DnRyTv95VLvgXosuEBzDF4).

   Jusqu'au lot A, la panne ne vivait que sur l'appareil (localStorage) et ne
   se disait que dans la fenêtre Encaisser. Elle s'inscrit désormais en base,
   une ligne par ÉPISODE (0204) ; ce module dit ce que le POSTE inscrit, et ce
   que la direction lit.

   CE QUE LE POSTE INSCRIT :
   · une LECTURE MUETTE (le GET de collecte-mtn ou de mnd-pay sans réponse),
     seulement si l'autre fonction a répondu à la même lecture : les deux
     muettes ensemble, c'est le réseau du poste ou du serveur, ni MTN ni
     FedaPay ;
   · une VRAIE DEMANDE échouée faute de réponse (`estUnePanne`, lot A).
   CE QU'IL N'INSCRIT JAMAIS :
   · HORS LIGNE : ce n'est la panne d'aucun prestataire ;
   · FERMÉ : FedaPay éteint dans Paramètres, ou un prestataire que sa
     dernière réponse a dit fermé ou pas branché (il le reste tant qu'il ne
     s'est pas relu ouvert). La base le relit aussi, et refuse.

   L'ÉPISODE se tient en base (`vois_une_panne`) : il dure tant que les échecs
   se suivent à moins de dix minutes (`PANNE_RETENUE_MS`, la règle
   d'`echecSuivant`) ; une demande qui repasse le finit (`une_demande_repasse`).
   Plusieurs postes, une seule ligne.

   LA DIRECTION PRÉVENUE UNE FOIS : au premier échec CONFIRMÉ de l'épisode
   (une vraie demande, ou une deuxième vue : une lecture muette d'une seule
   minute ne réveille personne), jamais à chaque échec ; une panne qui revient
   moins d'une heure après la dernière notification ne se redit pas (La
   journée la compte). Le texte est `notificationDeLaPanne`, recopié mot pour
   mot dans 0204 : `scripts/verifie-les-pannes-dites` compare les deux. */
import { PANNE_RETENUE_MS, heureDite, type LectureDuPrestataire, type Prestataire } from './choix-du-moyen-pur';

export const PRESTATAIRES: readonly Prestataire[] = ['mtn', 'fedapay'];
/** D'où vient l'échec vu : la lecture de chaque minute, ou une vraie demande. */
export type SourceDeLaPanne = 'lecture' | 'demande';

/** L'épisode tient tant que les échecs se suivent à moins de dix minutes : la
    même mesure que la fenêtre Encaisser (0204 dit `interval '10 minutes'`). */
export const EPISODE_RETENU_MS = PANNE_RETENUE_MS;
/** Une lecture muette ne se dit à la direction qu'à sa deuxième vue. */
export const VUES_POUR_DIRE = 2;
/** Une panne qui revient moins d'une heure après la dernière notification ne se redit pas. */
export const SILENCE_DE_LA_DIRECTION_MS = 60 * 60_000;

/** Ce que le poste sait au moment de juger. */
export type CeQueLePosteVoit = {
  enLigne: boolean;
  /** FedaPay allumé dans Paramètres. */
  fedapayAllume: boolean;
  /** La dernière lecture de chaque prestataire QUI A RÉPONDU (la mémoire de l'appareil). */
  reponses: Partial<Record<Prestataire, LectureDuPrestataire>>;
};

/** FERMÉ À SA DERNIÈRE RÉPONSE : pas branché (clés ou relais absents), ou,
    pour MTN, le règlement pas ouvert aux clientes. La même lecture que
    `etatDuPrestataire` (le banc les confronte). */
export const reponseFermee = (p: Prestataire, l: LectureDuPrestataire | undefined): boolean =>
  !!l && (!l.pret || (p === 'mtn' && l.ouvert === false));

/** UNE PANNE QUI PEUT S'INSCRIRE : ni hors ligne, ni fermée. */
export function estInscriptible(p: Prestataire, o: CeQueLePosteVoit): boolean {
  if (!o.enLigne) return false;
  if (p === 'fedapay' && !o.fedapayAllume) return false;
  return !reponseFermee(p, o.reponses[p] ?? undefined);
}

/** LA LECTURE D'UNE MINUTE : les prestataires dont la fonction est restée
    muette pendant que l'autre répondait. Aucune muette, ou toutes : rien ;
    hors ligne ou fermée, rien (`estInscriptible`). */
export function pannesDeLaLecture(lu: Record<Prestataire, LectureDuPrestataire>, o: CeQueLePosteVoit): Prestataire[] {
  const muettes = PRESTATAIRES.filter((p) => lu[p] === null);
  if (muettes.length === 0 || muettes.length === PRESTATAIRES.length) return [];
  return muettes.filter((p) => estInscriptible(p, o));
}

/** LA VRAIE DEMANDE SANS RÉPONSE : elle s'inscrit, ni hors ligne ni fermée. */
export const panneDeLaDemande = (p: Prestataire, o: CeQueLePosteVoit): boolean => estInscriptible(p, o);

/** UN ÉPISODE CONFIRMÉ : une vraie demande l'a vu, ou il a été vu deux fois. */
export const estConfirme = (e: { parDemande: boolean; vues: number }): boolean => e.parDemande || e.vues >= VUES_POUR_DIRE;

const NOM: Record<Prestataire, string> = { mtn: 'MTN', fedapay: 'FedaPay' };

/** ⟨notification-de-la-panne⟩ « MTN ne répond pas » : ce que la direction lit,
    une fois par panne. 0204 l'écrit mot pour mot (l'heure à Porto-Novo). */
export function notificationDeLaPanne(p: Prestataire, debutMs: number): { titre: string; corps: string } {
  return {
    titre: `${NOM[p]} ne répond pas`,
    corps: `Depuis ${heureDite(debutMs)}, le Trône propose un autre moyen à la caisse. La fin de la panne s’inscrira dans La journée.`,
  };
}
