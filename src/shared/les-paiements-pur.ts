/* ══ LES PAIEMENTS DU MOIS, LA RÈGLE · 5 novembre 2026 ══════════════════

   « Construis » (Yéman, maquette maquette-les-paiements.html, v5). Un mois,
   un tableau, un toucher : tout ce qui sort vers l'équipe et ceux qui
   travaillent pour la Maison, sur un seul écran (Équipe › Les paiements).

   Ses décisions, toutes tranchées le 5 novembre 2026 :
   · le périmètre : les salaires nets du run du mois (la paie du 5), les
     retenues de prêt, les pourboires, les prestataires, et les entreprises
     (agents d'autres entreprises) ;
   · un seul toucher pour le mois, le sien ou celui de Brice, par la question
     de la Maison (`demande`), annulable jusqu'au 5 à 17 h 59 ;
   · les pourboires partent EN ESPÈCES le 5, jamais dans le virement MTN : le
     montant du mois par personne, coché « Remis » un à un ;
   · les numéros MTN sont repris des fiches, et MTN dit le nom du titulaire :
     un nom conforme se prend d'un toucher, un nom différent attend son mot ;
     la garde des sept jours ne change pas ;
   · prestataires et entreprises sont compris dans le toucher du 5, CHACUN À
     SA DATE : le 10 par défaut, réglable de 1 à 28 ou « dernier jour », dans
     le mois qui suit la période ; un dimanche passe au lundi ; départ à 18 h
     (Cotonou, UTC+1). Une date avant le 5 se valide par un toucher à part.
     Une date changée après le toucher annule l'envoi programmé, et la ligne
     attend un nouveau toucher, elle seule ;
   · une entreprise est payée À L'ENTREPRISE, sur sa facture, par MTN, sur
     son numéro ; la facture est facultative depuis le 11 nov. 2026, seul le
     montant du mois arrête la ligne ; la dépense est celle
     d'un fournisseur, jamais « Salaires » ;
   · avant le premier mois par l'API, un test : 500 F à Yéman, 500 F à Brice,
     100 F à Gérard, montants modifiables, sous toucher.

   ICI, RIEN QUE DES CALCULS : ni magasin, ni écran, ni horloge lue en douce.
   Les règles de la paie du 5 (`paie-du-5-pur`) et de la paie par MTN
   (`paie-par-mtn-pur`) restent les leurs : on les appelle, on ne les
   réécrit pas. Le banc `verifie-les-paiements` éprouve ce fichier. */

import { periodeDesPourboires } from './periode-des-pourboires-pur';
import {
  aCotonou, gardeDuNumero, lisLeNumero, moisDit, moisSuivant, pourboiresEnEspecesXof,
  type Blocage, type LectureDeLaLigne, type MobileMoney,
} from './paie-du-5-pur';
import {
  MONTANT_ESSAI_MAX, ceQuiManque, dernierEnvoi, envoiActif, nomConcorde,
  type BilanDeLEssai, type EnvoiMtn, type ItemAEnvoyer, type LectureMtn, type NomMtnVu,
} from './paie-par-mtn-pur';

const HEURE_MS = 60 * 60 * 1000;
const p2 = (n: number) => String(n).padStart(2, '0');
const entier = (n: unknown): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v : 0;
};

/* ── 1. LA DATE DE CHACUN ─────────────────────────────────────────────
   Le jour se règle sur la ligne : 1 à 28, ou le dernier jour du mois. Il
   tombe dans le mois qui suit la période travaillée. Un dimanche passe au
   lundi (même quand le lundi ouvre le mois suivant). Départ à 18 h de
   Cotonou, soit 17 h UTC, toute l'année. */
export type JourDePaie = number | 'dernier';
export const JOUR_PAR_DEFAUT = 10;
export const JOURS_POSSIBLES: readonly JourDePaie[] = [...Array.from({ length: 28 }, (_, i) => i + 1), 'dernier'];

/** Un jour lu d'un magasin : 1 à 28, « dernier », sinon le 10. */
export function jourLu(v: unknown): JourDePaie {
  if (v === 'dernier') return 'dernier';
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : JOUR_PAR_DEFAUT;
}
/** « le 1er », « le 10 », « dernier jour ». */
export const jourDit = (j: JourDePaie): string => (j === 'dernier' ? 'dernier jour' : j === 1 ? 'le 1er' : `le ${j}`);

/* L'HEURE DE CHACUN — 11 novembre 2026 (Yéman : « je veux pouvoir modifier la
   date du 9 et l'heure »). Une ligne à sa date (prestataire, entreprise) porte
   aussi son heure, par demi-heure de 7 h à 21 h, 18 h par défaut. L'équipe
   reste payée le 5 à 18 h (la paie du 5). */
export const HEURE_PAR_DEFAUT = '18:00';
export const HEURES_POSSIBLES: readonly string[] = Array.from({ length: 29 }, (_, i) => {
  const t = 7 * 60 + i * 30;
  return `${p2(Math.floor(t / 60))}:${p2(t % 60)}`;
});
/** Une heure lue d'un magasin : une des heures possibles, sinon 18 h. */
export const heureLue = (v: unknown): string => (typeof v === 'string' && HEURES_POSSIBLES.includes(v) ? v : HEURE_PAR_DEFAUT);
/** « 18 h », « 9 h 30 ». */
export const heureDePaieDite = (h: string | undefined): string => {
  const [hh, mm] = heureLue(h).split(':');
  return `${Number(hh)} h${mm === '00' ? '' : ` ${mm}`}`;
};

export type DateDePaie = {
  /** Le jour où l'argent part, AAAA-MM-JJ (Cotonou). */
  jour: string;
  /** L'heure de départ, ISO (à l'heure réglée, de Cotonou). */
  partA: string;
  /** L'heure réglée, « HH:MM » de Cotonou. */
  heure: string;
  ms: number;
  /** Le jour réglé tombait un dimanche : le lundi. */
  decaleAuLundi: boolean;
  /** Réglé avant le 5 (le 1er au 4) : un toucher à part, ce jour-là. */
  avantLe5: boolean;
};

export function dateDePaie(periode: string, jour: JourDePaie, heure: string = HEURE_PAR_DEFAUT): DateDePaie | null {
  const m = /^(\d{4})-(\d{2})$/.exec(moisSuivant(periode));
  if (!m) return null;
  const a = Number(m[1]); const mo = Number(m[2]);
  const dernier = new Date(Date.UTC(a, mo, 0)).getUTCDate();
  const j = jour === 'dernier' ? dernier : Math.min(Math.max(1, Math.round(jour)), 28);
  const dimanche = new Date(Date.UTC(a, mo - 1, j)).getUTCDay() === 0;
  const d = new Date(Date.UTC(a, mo - 1, j + (dimanche ? 1 : 0)));
  const h = heureLue(heure);
  const [hh, mn] = h.split(':').map(Number);
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mn) - HEURE_MS;
  return {
    jour: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`,
    partA: new Date(ms).toISOString(),
    heure: h,
    ms,
    decaleAuLundi: dimanche,
    avantLe5: jour !== 'dernier' && j < 5,
  };
}

/** Le toucher du mois s'annule jusqu'au 5 (ou au lundi 6) à 17 h 59. */
export const peutAnnuler = (paieMs: number | undefined, maintenantMs: number): boolean =>
  paieMs != null && Number.isFinite(paieMs) && maintenantMs < paieMs;

/* ── 2. LES TROIS GROUPES ET LEURS ENVOIS ─────────────────────────────
   Le registre MTN garde UN envoi vivant par (run, personne). L'équipe part
   sous l'identifiant du run de paie ; les prestataires et les entreprises
   sous un run à eux, par mois, avec l'identifiant stable de la fiche ou de
   l'entreprise. */
export type Genre = 'equipe' | 'prestataire' | 'entreprise';
export const runDesPrestataires = (periode: string): string => `prestataires-${periode}`;
export const runDesEntreprises = (periode: string): string => `entreprises-${periode}`;
export const cleDeLigne = (genre: Genre, id: string): string => `${genre}:${id}`;

/** Le toucher d'une ligne à sa date (prestataire, entreprise) : ce qu'il a
    validé, pour ce montant, ce jour et ce numéro-là. */
export type ValidationADate = {
  par: string;
  le: string;
  montantXof: number;
  jour: JourDePaie;
  /** L'heure validée (absente avant le 11 nov. 2026 : 18 h). */
  heure?: string;
  msisdn: string;
  /** Les missions payées par cet envoi (prestataire extérieur). */
  missions?: string[];
  /** Validée par un toucher à part (date avant le 5, date changée). */
  aPart?: boolean;
};

/* ── 3. LE NUMÉRO ─────────────────────────────────────────────────────
   Celui de la fiche (`mobileMoney`, MTN) ; à défaut, son téléphone, proposé
   (« repris de la fiche »), jamais pris sans un toucher. MTN dit le nom du
   titulaire ; tant que le profil n'est pas ouvert, ce nom manque : la ligne
   dit « nom pas encore lu », jamais une erreur. */
export type EtatDuNumero = 'verifie' | 'non-lu' | 'differe' | 'inactif' | 'repris' | 'sans' | 'autre-voie';
export type SourceDuNumero = 'fiche' | 'repris' | 'saisi' | 'sans' | 'autre-voie';

export function etatDuNumero(o: {
  nom: string;
  msisdn?: string;
  source: SourceDuNumero;
  lecture?: LectureMtn | null;
  vu?: NomMtnVu;
}): { etat: EtatDuNumero; nomMtn?: string | null } {
  if (o.source === 'autre-voie') return { etat: 'autre-voie' };
  if (!o.msisdn || o.source === 'sans') return { etat: 'sans' };
  const lu = o.lecture?.numeros?.[o.msisdn];
  const nomMtn = lu?.nom ?? null;
  if (o.source === 'repris') return { etat: 'repris', nomMtn };
  if (!lu) return { etat: 'non-lu', nomMtn: null };
  if (lu.actif === false) return { etat: 'inactif', nomMtn };
  const accord = nomConcorde(o.nom, lu.nom);
  if (accord === 'concorde') return { etat: 'verifie', nomMtn };
  if (accord === 'inconnu') return { etat: 'non-lu', nomMtn: null };
  const vu = o.vu;
  return vu && vu.msisdn === o.msisdn && vu.nomMtn === lu.nom ? { etat: 'verifie', nomMtn } : { etat: 'differe', nomMtn };
}

/** Le numéro qu'une fiche propose : son téléphone, s'il se lit en numéro
    mobile du Bénin (01 et huit chiffres). Rien d'autre ne se devine. */
export function numeroPropose(telephone: string | undefined | null): string | undefined {
  const lu = lisLeNumero(String(telephone ?? ''));
  return lu.msisdn;
}

/** « Prendre » : seulement un numéro proposé que MTN ne contredit pas (nom
    conforme, ou pas encore lu). Un nom différent attend « C'est bien son
    numéro » ; un numéro sans compte MoMo ne se prend pas. */
export function peutPrendre(nom: string, msisdn: string | undefined, lecture?: LectureMtn | null): 'oui' | 'son-mot' | 'non' {
  if (!msisdn) return 'non';
  const lu = lecture?.numeros?.[msisdn];
  if (lu?.actif === false) return 'non';
  return lu && nomConcorde(nom, lu.nom) === 'differe' ? 'son-mot' : 'oui';
}

/* ── 4. L'ÉTAT DE CHAQUE LIGNE ────────────────────────────────────────── */
export type EtatDuPaiement =
  | 'paye' | 'envoi' | 'programme' | 'refuse'
  | 'valide' | 'confirme' | 'toucher-a-part' | 'date-changee' | 'change'
  | 'attend' | 'erreur' | 'ne-part-pas';

export const ETAT_DIT: Record<EtatDuPaiement, string> = {
  paye: 'Payé',
  envoi: 'Envoi…',
  programme: 'Programmé',
  refuse: 'Refusé par MTN',
  valide: 'Validé',
  confirme: 'Confirmé',
  'toucher-a-part': 'Toucher à part',
  'date-changee': 'Date changée · votre toucher',
  change: 'Changé · votre toucher',
  attend: 'Attend sa confirmation',
  erreur: 'Erreur signalée',
  'ne-part-pas': 'Ne part pas',
};

export type LigneDuMois = {
  cle: string;
  genre: Genre;
  id: string;
  nom: string;
  /** La mission, la facture, l'agent. */
  detail?: string;
  /** Net avant le prêt, hors pourboires (l'équipe) ; le montant (les autres). */
  netXof: number;
  pretXof: number;
  /** Ce qui part (ou est parti) par MTN. */
  parMtnXof: number;
  /** La ligne passe-t-elle par MTN ? (sinon : hors du pont, dite à part) */
  viaMtn: boolean;
  /** En espèces, le 5 (l'équipe) : ceux du registre des pourboires du mois. */
  pourboiresXof: number;
  /** Ceux que le bulletin porte et que la paie du 5 retire du virement (e6). */
  especesDuBulletinXof?: number;
  msisdn?: string;
  numero: EtatDuNumero;
  nomMtn?: string | null;
  jour?: JourDePaie;
  /** L'heure de départ réglée, « HH:MM » (lignes à leur date). */
  heure?: string;
  date?: DateDePaie | null;
  /** L'employé d'une entreprise : l'entreprise qui le porte (11 nov. 2026). */
  entrepriseId?: string;
  etat: EtatDuPaiement;
  pourquoi?: string;
  runId: string;
  envoi?: EnvoiMtn;
  /** Entre dans le toucher du mois. */
  aValider: boolean;
  /** Ce qu'il reste à programmer chez MTN (validée, sans envoi vivant). */
  aProgrammer: boolean;
};

/** L'état d'un envoi du registre, s'il dit quelque chose. */
function etatDeLEnvoi(envois: readonly EnvoiMtn[], runId: string, id: string): { etat?: EtatDuPaiement; envoi?: EnvoiMtn } {
  const actif = envoiActif(envois, runId, id);
  if (actif) {
    if (actif.etat === 'recu') return { etat: 'paye', envoi: actif };
    if (actif.etat === 'programme') return { etat: 'programme', envoi: actif };
    return { etat: 'envoi', envoi: actif };
  }
  const dernier = dernierEnvoi(envois, runId, id);
  if (dernier?.etat === 'refuse') return { etat: 'refuse', envoi: dernier };
  return dernier ? { envoi: dernier } : {};
}

const COURT: Record<Blocage['code'], string> = {
  'net-nul': 'net nul', 'sans-numero': 'sans numéro mobile money', 'numero-illisible': 'numéro illisible',
  'voie-changee': 'opérateur changé depuis le dépôt', 'numero-recent': 'numéro changé depuis moins de 7 jours',
  plafond: 'au-dessus du plafond', 'frais-au-dela': 'frais au-delà du net',
};
export const blocagesDits = (b: readonly Blocage[]): string => b.map((x) => COURT[x.code]).join(', ');

/** LA LIGNE D'UN MEMBRE DE L'ÉQUIPE. Sa lecture vient de la paie du 5
    (`litLaLigne`) ; ici, ce qui part par MTN : le montant envoyé de son
    bulletin, MOINS les pourboires que le bulletin porte (ils partent en
    espèces le 5). Le prêt est déjà retiré du net par le bulletin. */
export function ligneDeLEquipe(o: {
  employeeId: string;
  nom: string;
  runId: string;
  /** La lecture de la paie du 5 ; absente : pas encore de run. */
  lecture?: LectureDeLaLigne;
  ligne?: { result?: { net?: number }; gains?: { pourboires?: number }; deductions?: { retenuePret?: number }; payeLe?: string; payeMoyen?: string; envoyeXof?: number };
  /** Les pourboires du mois, comptés dans le registre des pourboires. */
  pourboiresDuMoisXof: number;
  numero: { etat: EtatDuNumero; nomMtn?: string | null };
  envois: readonly EnvoiMtn[];
  /** Le numéro MTN de la fiche, quand il n'y a pas encore de run (11 nov.
      2026) : sans lui, « Lire chez MTN » ne demandait jamais le nom de
      l'équipe entre deux paies, et la ligne disait « nom pas encore lu »
      pour toujours. Avec un run, la lecture de la paie du 5 l'emporte. */
  msisdn?: string;
}): LigneDuMois {
  const l = o.ligne;
  const lu = o.lecture;
  const msisdn = lu?.msisdn ?? o.msisdn;
  const pret = Math.max(0, entier(l?.deductions?.retenuePret));
  /* La lecture de la paie du 5 retire DÉJÀ les pourboires du montant envoyé
     (`LectureDeLaLigne.especesXof`, règle unique `pourboiresEnEspecesXof` de
     paie-du-5-pur, e6) : on ne les retire pas une seconde fois. */
  const especes = lu ? lu.especesXof : l ? pourboiresEnEspecesXof(l) : 0;
  const envoye = lu ? lu.envoyeXof : 0;
  const parMtn = Math.max(0, envoye);
  const viaMtn = !!lu && lu.voie === 'MTN' && !!lu.msisdn && parMtn > 0;
  const { etat: parLEnvoi, envoi } = etatDeLEnvoi(o.envois, o.runId, o.employeeId);
  let etat: EtatDuPaiement;
  let pourquoi: string | undefined;
  if (!lu || !l) { etat = 'ne-part-pas'; pourquoi = 'pas encore de run ce mois'; }
  else if (l.payeLe) etat = 'paye';
  else if (parLEnvoi) etat = parLEnvoi;
  else if (lu.etat === 'payee') etat = 'paye';
  else if (lu.etat === 'payable') etat = 'valide';
  else if (lu.etat === 'confirmee') etat = 'confirme';
  else if (lu.etat === 'erreur') etat = 'erreur';
  else if (lu.etat === 'bloquee') { etat = 'ne-part-pas'; pourquoi = blocagesDits(lu.blocages); }
  else { etat = 'attend'; pourquoi = lu.attente; }
  if (lu && !viaMtn && !pourquoi && etat !== 'paye') pourquoi = lu.voie === 'Moov' ? 'Moov, à la main' : 'pas de numéro MTN';
  return {
    cle: cleDeLigne('equipe', o.employeeId), genre: 'equipe', id: o.employeeId, nom: o.nom,
    netXof: parMtn + pret,
    especesDuBulletinXof: especes,
    pretXof: pret,
    parMtnXof: viaMtn ? parMtn : 0,
    viaMtn,
    pourboiresXof: Math.max(0, entier(o.pourboiresDuMoisXof)),
    ...(msisdn ? { msisdn } : {}),
    numero: o.numero.etat, nomMtn: o.numero.nomMtn,
    etat, ...(pourquoi ? { pourquoi } : {}),
    runId: o.runId, ...(envoi ? { envoi } : {}),
    aValider: etat === 'confirme',
    aProgrammer: etat === 'valide' && viaMtn,
  };
}

/** LA LIGNE D'UN PRESTATAIRE OU D'UNE ENTREPRISE, à sa date. */
export function ligneADate(o: {
  genre: 'prestataire' | 'entreprise';
  id: string;
  nom: string;
  detail?: string;
  periode: string;
  /** `null` : une mission sans prix. */
  montantXof: number | null;
  /** Ce qui l'arrête avant tout (montant du mois à poser, facture pas acceptée…). */
  arret?: string;
  msisdn?: string;
  numero: { etat: EtatDuNumero; nomMtn?: string | null };
  jour: JourDePaie;
  /** L'heure de départ, « HH:MM » ; 18 h par défaut. */
  heure?: string;
  /** L'employé d'une entreprise : l'id de l'entreprise. */
  entrepriseId?: string;
  validation?: ValidationADate;
  payeLe?: string;
  envois: readonly EnvoiMtn[];
  /** Une prestataire DE L'ÉQUIPE (fiche au contrat « prestataire ») garde ses
      pourboires du mois, remis en espèces le 5 comme ceux de l'équipe. */
  pourboiresDuMoisXof?: number;
}): LigneDuMois {
  const runId = o.genre === 'prestataire' ? runDesPrestataires(o.periode) : runDesEntreprises(o.periode);
  const heure = heureLue(o.heure);
  const date = dateDePaie(o.periode, o.jour, heure);
  const montant = o.montantXof == null ? 0 : Math.max(0, entier(o.montantXof));
  const numeroOk = !!o.msisdn && (o.numero.etat === 'verifie' || o.numero.etat === 'non-lu');
  const { etat: parLEnvoi, envoi } = etatDeLEnvoi(o.envois, runId, o.id);
  let etat: EtatDuPaiement;
  let pourquoi: string | undefined;
  const v = o.validation;
  /* Une date changée après le toucher se dit avant l'envoi encore vivant :
     l'écran l'annule, et la ligne attend son toucher, elle seule. */
  const dateChangee = !!v && (v.jour !== o.jour || heureLue(v.heure) !== heure);
  if (o.payeLe) etat = 'paye';
  else if (dateChangee && parLEnvoi !== 'paye' && parLEnvoi !== 'envoi') etat = 'date-changee';
  else if (parLEnvoi) etat = parLEnvoi;
  else if (o.arret) { etat = 'ne-part-pas'; pourquoi = o.arret; }
  else if (o.montantXof == null) { etat = 'ne-part-pas'; pourquoi = 'sans prix'; }
  else if (montant <= 0) { etat = 'ne-part-pas'; pourquoi = 'montant nul'; }
  else if (!o.msisdn) { etat = 'ne-part-pas'; pourquoi = 'sans numéro MTN'; }
  else if (o.numero.etat === 'inactif') { etat = 'ne-part-pas'; pourquoi = 'pas de compte MoMo MTN'; }
  else if (o.numero.etat === 'differe') { etat = 'ne-part-pas'; pourquoi = 'nom MTN différent, votre mot'; }
  else if (o.numero.etat === 'repris') { etat = 'ne-part-pas'; pourquoi = 'numéro repris, à prendre'; }
  else if (v && (v.montantXof !== montant || v.msisdn !== o.msisdn)) etat = 'change';
  else if (v) etat = 'valide';
  else if (date?.avantLe5) etat = 'toucher-a-part';
  else etat = 'confirme';
  const viaMtn = montant > 0 && !!o.msisdn && etat !== 'ne-part-pas';
  return {
    cle: cleDeLigne(o.genre, o.id), genre: o.genre, id: o.id, nom: o.nom,
    ...(o.detail ? { detail: o.detail } : {}),
    netXof: montant, pretXof: 0,
    parMtnXof: viaMtn ? montant : 0,
    viaMtn,
    pourboiresXof: o.genre === 'prestataire' ? Math.max(0, entier(o.pourboiresDuMoisXof ?? 0)) : 0,
    ...(o.msisdn ? { msisdn: o.msisdn } : {}),
    numero: o.numero.etat, nomMtn: o.numero.nomMtn,
    jour: o.jour, heure, date,
    ...(o.entrepriseId ? { entrepriseId: o.entrepriseId } : {}),
    etat, ...(pourquoi ? { pourquoi } : {}),
    runId, ...(envoi ? { envoi } : {}),
    aValider: etat === 'confirme' && numeroOk,
    aProgrammer: etat === 'valide' && viaMtn && numeroOk,
  };
}

/** Une ligne qui se valide d'un toucher À PART, sur sa ligne : date avant le
    5, date changée après le toucher, montant ou numéro changés depuis. */
export const seValideAPart = (l: LigneDuMois): boolean =>
  l.genre !== 'equipe' && (l.etat === 'toucher-a-part' || l.etat === 'date-changee' || l.etat === 'change')
  && l.parMtnXof > 0 && !!l.msisdn && (l.numero === 'verifie' || l.numero === 'non-lu');

/** La validation que pose un toucher sur une ligne à sa date. */
export function validationDe(l: LigneDuMois, par: string, le: string, missions?: readonly string[]): ValidationADate | null {
  if (l.genre === 'equipe' || !l.msisdn || l.parMtnXof <= 0 || l.jour == null) return null;
  return {
    par, le, montantXof: l.parMtnXof, jour: l.jour, heure: heureLue(l.heure), msisdn: l.msisdn,
    ...(missions?.length ? { missions: [...missions] } : {}),
    ...(l.etat !== 'confirme' ? { aPart: true } : {}),
  };
}

/** Ce que l'on confie au serveur pour une ligne : sa personne, son numéro,
    son montant. Le tri (`triDesEnvois`) reste celui de la paie par MTN. */
export const itemDeLaLigne = (l: LigneDuMois): ItemAEnvoyer | null =>
  l.msisdn && l.parMtnXof > 0 ? { employeeId: l.id, nom: l.nom, msisdn: l.msisdn, montantXof: l.parMtnXof } : null;

/** L'heure de départ d'une ligne : l'heure de paie pour l'équipe (donnée par
    l'appelant, `heureDeDepart`), sa date à son heure pour les autres — ou la
    prochaine fois que sonne son heure si la date est passée. */
export function departDeLaLigne(l: LigneDuMois, departDeLEquipe: string, maintenantMs: number): string {
  if (l.genre === 'equipe' || !l.date) return departDeLEquipe;
  if (l.date.ms > maintenantMs) return l.date.partA;
  const minuitLocal = Math.floor((maintenantMs + HEURE_MS) / (24 * HEURE_MS)) * 24 * HEURE_MS - HEURE_MS;
  const [hh, mn] = heureLue(l.heure ?? l.date.heure).split(':').map(Number);
  let depart = minuitLocal + hh * HEURE_MS + mn * 60_000;
  if (depart <= maintenantMs) depart += 24 * HEURE_MS;
  return new Date(depart).toISOString();
}

/* ── 5. LES CHIFFRES DU MOIS, EN PONT ─────────────────────────────────
   Salaires nets − retenues de prêt + prestataires + entreprises = par MTN.
   Les pourboires sont à part : en espèces, jamais dans le virement. Une
   ligne qui ne passe pas par MTN (Moov, sans numéro, sans prix, sans
   facture) sort du pont et se dit à part. */
export type ChiffresDuMois = {
  parMtnXof: number;
  virements: number;
  salairesNetsXof: number;
  bulletins: number;
  pretsXof: number;
  nbPrets: number;
  prestatairesXof: number;
  nbPrestataires: number;
  nbPrestatairesTotal: number;
  entreprisesXof: number;
  nbEntreprises: number;
  nbEntreprisesTotal: number;
  horsMtn: number;
  pourboiresXof: number;
  pourboiresRemis: number;
  pourboiresATotal: number;
  /** Ce qui a déjà quitté le compte, reçu chez MTN. */
  partisXof: number;
};

export function chiffresDuMois(lignes: readonly LigneDuMois[], remis: Readonly<Record<string, unknown>> = {}): ChiffresDuMois {
  const c: ChiffresDuMois = {
    parMtnXof: 0, virements: 0, salairesNetsXof: 0, bulletins: 0, pretsXof: 0, nbPrets: 0,
    prestatairesXof: 0, nbPrestataires: 0, nbPrestatairesTotal: 0, entreprisesXof: 0, nbEntreprises: 0, nbEntreprisesTotal: 0,
    horsMtn: 0, pourboiresXof: 0, pourboiresRemis: 0, pourboiresATotal: 0, partisXof: 0,
  };
  /* Une entreprise à employés compte UNE entreprise, quel que soit le nombre
     de ses employés (11 nov. 2026) ; chacun reste un virement. */
  const groupes = new Set<string>();
  const groupesParMtn = new Set<string>();
  for (const l of lignes) {
    if ((l.genre === 'equipe' || l.genre === 'prestataire') && l.pourboiresXof > 0) {
      c.pourboiresXof += l.pourboiresXof;
      c.pourboiresATotal += 1;
      if (remis[l.id]) c.pourboiresRemis += 1;
    }
    if (l.genre === 'prestataire') c.nbPrestatairesTotal += 1;
    if (l.genre === 'entreprise') {
      if (!l.entrepriseId) c.nbEntreprisesTotal += 1;
      else if (!groupes.has(l.entrepriseId)) { groupes.add(l.entrepriseId); c.nbEntreprisesTotal += 1; }
    }
    if (!l.viaMtn) { c.horsMtn += 1; continue; }
    c.parMtnXof += l.parMtnXof;
    c.virements += 1;
    if (l.etat === 'paye') c.partisXof += l.parMtnXof;
    if (l.genre === 'equipe') {
      c.salairesNetsXof += l.parMtnXof + l.pretXof;
      c.bulletins += 1;
      c.pretsXof += l.pretXof;
      if (l.pretXof > 0) c.nbPrets += 1;
    } else if (l.genre === 'prestataire') {
      c.prestatairesXof += l.parMtnXof;
      c.nbPrestataires += 1;
    } else {
      c.entreprisesXof += l.parMtnXof;
      if (!l.entrepriseId) c.nbEntreprises += 1;
      else if (!groupesParMtn.has(l.entrepriseId)) { groupesParMtn.add(l.entrepriseId); c.nbEntreprises += 1; }
    }
  }
  return c;
}

/** Le pont se tient-il ? (le banc le demande à chaque mois inventé) */
export const pontTenu = (c: ChiffresDuMois): boolean =>
  c.salairesNetsXof - c.pretsXof + c.prestatairesXof + c.entreprisesXof === c.parMtnXof;

/** Les pourboires de la période d'une personne (du 6 au 4, payés le 5) : ce que le registre a inscrit. */
export function pourboiresDuMois(parts: readonly { staffId: string; amountXof: number; date: string }[], staffId: string, periode: string): number {
  return parts
    .filter((p) => p && p.staffId === staffId && periodeDesPourboires(p.date) === periode)
    .reduce((n, p) => n + Math.max(0, entier(p.amountXof)), 0);
}

/* ── 6. CE QUE LE TRÔNE A REPÉRÉ ─────────────────────────────────────── */
export type CodeDuPoint =
  | 'numero-repris' | 'nom-differe' | 'numero-inactif' | 'plafond' | 'numero-garde' | 'sans-prix'
  | 'sans-montant' | 'confirmation' | 'erreur' | 'solde-court' | 'solde-inconnu' | 'avant-le-5'
  | 'date-changee' | 'change' | 'refuse' | 'sans-numero' | 'pourboires-ecart';

export type PointARegarder = {
  code: CodeDuPoint;
  /** Les lignes concernées. */
  cles: string[];
  /** Ce point empêche-t-il un envoi ? */
  bloque: boolean;
  manqueXof?: number;
};

export function pointsARegarder(o: {
  lignes: readonly LigneDuMois[];
  /** Les lectures de la paie du 5, par employé (blocages, plafond). */
  lectures?: ReadonlyMap<string, LectureDeLaLigne>;
  /** Le solde lu chez MTN : `null` ou absent, inconnu. */
  soldeXof?: number | null;
  /** Ce qui doit partir et que le solde doit couvrir. */
  aCouvrirXof: number;
  /** Les écarts entre les pourboires du bulletin et ceux du mois. */
  ecartsDePourboires?: readonly string[];
}): PointARegarder[] {
  const out: PointARegarder[] = [];
  const vivantes = o.lignes.filter((l) => l.etat !== 'paye');
  const de = (f: (l: LigneDuMois) => boolean) => vivantes.filter(f).map((l) => l.cle);
  const pose = (code: CodeDuPoint, cles: string[], bloque: boolean) => { if (cles.length) out.push({ code, cles, bloque }); };
  pose('numero-repris', de((l) => l.numero === 'repris'), false);
  pose('nom-differe', de((l) => l.numero === 'differe'), true);
  pose('numero-inactif', de((l) => l.numero === 'inactif'), true);
  pose('plafond', de((l) => l.genre === 'equipe' && !!o.lectures?.get(l.id)?.blocages.some((b) => b.code === 'plafond')), true);
  pose('numero-garde', de((l) => (l.genre === 'equipe' && !!o.lectures?.get(l.id)?.blocages.some((b) => b.code === 'numero-recent'))
    || (l.genre !== 'equipe' && l.pourquoi === ARRET_GARDE)), true);
  pose('sans-prix', de((l) => l.genre === 'prestataire' && l.pourquoi === 'sans prix'), true);
  pose('sans-montant', de((l) => l.genre === 'entreprise' && /montant du mois/.test(l.pourquoi ?? '')), true);
  pose('confirmation', de((l) => l.etat === 'attend'), false);
  pose('erreur', de((l) => l.etat === 'erreur'), true);
  pose('refuse', de((l) => l.etat === 'refuse'), true);
  pose('avant-le-5', de((l) => l.etat === 'toucher-a-part'), false);
  pose('date-changee', de((l) => l.etat === 'date-changee'), false);
  pose('change', de((l) => l.etat === 'change'), false);
  pose('sans-numero', de((l) => l.numero === 'sans' && (l.genre !== 'equipe' || !!o.lectures?.get(l.id))), true);
  if (o.ecartsDePourboires?.length) pose('pourboires-ecart', [...o.ecartsDePourboires], false);
  const manque = ceQuiManque(o.soldeXof, o.aCouvrirXof);
  if (o.aCouvrirXof > 0) {
    if (manque == null) out.push({ code: 'solde-inconnu', cles: [], bloque: false });
    else if (manque > 0) out.push({ code: 'solde-court', cles: [], bloque: true, manqueXof: manque });
  }
  return out;
}

/* ── 7. LE TEST MTN, AVANT LE PREMIER MOIS PAR L'API ─────────────────
   500 F à Yéman, 500 F à Brice, 100 F à Gérard, modifiables ligne à ligne,
   jamais plus de 500 F (le serveur le refuse aussi). Les bulletins ne
   bougent pas ; la dépense « Essai de paie MTN » s'écrit quand tout a
   répondu (`depenseDeLEssai`). Un refus se relance à 500 F. */
export const TEST_DU_PREMIER_MOIS: readonly { prenom: string; montantXof: number }[] = [
  { prenom: 'Yéman', montantXof: 500 },
  { prenom: 'Brice', montantXof: 500 },
  { prenom: 'Gérard', montantXof: 100 },
];

const sansAccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const prenomDe = (nom: string | undefined): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';

export type FichePourLeTest = { id: string; name: string; phone?: string; archiveeLe?: string; mobileMoney?: { numero: string; operateur: string } };
export type LigneDuTest = {
  prenom: string;
  montantXof: number;
  ficheId?: string;
  nom?: string;
  msisdn?: string;
  /** Le numéro vient du téléphone de la fiche, pas encore pris. */
  repris: boolean;
  pourquoi?: string;
};

export function lignesDuTest(fiches: readonly FichePourLeTest[], montants: Readonly<Record<string, number>> = {}): LigneDuTest[] {
  return TEST_DU_PREMIER_MOIS.map((t) => {
    const montantXof = montants[t.prenom] ?? t.montantXof;
    const f = fiches.find((x) => !x.archiveeLe && sansAccent(prenomDe(x.name)) === sansAccent(t.prenom));
    if (!f) return { prenom: t.prenom, montantXof, repris: false, pourquoi: 'fiche introuvable' };
    const mm = f.mobileMoney;
    if (mm?.operateur === 'MTN' && lisLeNumero(mm.numero).msisdn) {
      return { prenom: t.prenom, montantXof, ficheId: f.id, nom: f.name, msisdn: lisLeNumero(mm.numero).msisdn, repris: false };
    }
    const propose = numeroPropose(f.phone);
    if (propose && !mm) return { prenom: t.prenom, montantXof, ficheId: f.id, nom: f.name, msisdn: propose, repris: true, pourquoi: 'numéro repris de la fiche, à prendre' };
    return { prenom: t.prenom, montantXof, ficheId: f.id, nom: f.name, repris: false, pourquoi: mm ? 'numéro Moov sur la fiche' : 'sans numéro MTN' };
  });
}

/** Ce qui part au test : les lignes avec un numéro pris et un montant. */
export function itemsDuTest(lignes: readonly LigneDuTest[]): ItemAEnvoyer[] {
  return lignes
    .filter((l) => l.ficheId && l.msisdn && !l.repris && l.montantXof > 0)
    .map((l) => ({ employeeId: l.ficheId as string, nom: l.nom as string, msisdn: l.msisdn as string, montantXof: l.montantXof }));
}

export function pourquoiPasLeTest(lignes: readonly LigneDuTest[]): string | null {
  for (const l of lignes) {
    if (!Number.isInteger(l.montantXof) || l.montantXof < 0) return `Le montant de ${l.prenom} est un nombre entier de francs.`;
    if (l.montantXof > MONTANT_ESSAI_MAX) return `Le test ne dépasse pas ${MONTANT_ESSAI_MAX} F par personne (${l.prenom}).`;
  }
  if (!itemsDuTest(lignes).length) return 'Aucune ligne du test n’a de numéro MTN pris : prenez-les d’abord.';
  return null;
}

export const totalDuTest = (lignes: readonly LigneDuTest[]): number => itemsDuTest(lignes).reduce((n, x) => n + x.montantXof, 0);

/** Un refus du test se relance à 500 F (un montant trop petit pour MTN). */
export const seRelanceA500 = (e: Pick<EnvoiMtn, 'etat' | 'montant_xof'>): boolean => e.etat === 'refuse' && e.montant_xof < MONTANT_ESSAI_MAX;

/** Le test est réussi : tout a répondu, rien n'est refusé, au moins un reçu.
    Le bloc se replie alors en une ligne. */
export const testReussi = (b: BilanDeLEssai): boolean => b.fini && b.refuses === 0 && b.recus > 0;

/* ── 8. LES PRÊTS : L'ÉCHÉANCIER ──────────────────────────────────────
   Ce que la retenue a déjà rendu (y compris ce mois), ce qui restera après
   ce bulletin, et la dernière retenue. Les mois à venir viennent de
   `projectionDeLaRetenue` (shared/foyer), passés par l'appelant : la règle
   de la projection reste la sienne. */
export type EcheanceDuPret = { mois: string; montantXof: number; etat: 'faite' | 'ce-mois' | 'a-venir' };
export function echeancierDuPret(o: {
  preteXof: number;
  /** Ce qui restait dû avant le bulletin du mois. */
  resteAvantXof: number;
  periode: string;
  retenueDuMoisXof: number;
  /** Les remboursements déjà inscrits, mois par mois. */
  faites: readonly { mois: string; montantXof: number }[];
  /** La projection des mois suivants (projectionDeLaRetenue). */
  avenir: readonly { mois: string; retenueXof: number }[];
}): { retenuXof: number; resteApresXof: number; derniereRetenue: string | null; partRemboursee: number; echeances: EcheanceDuPret[] } {
  const prete = Math.max(0, entier(o.preteXof));
  const ceMois = Math.max(0, Math.min(entier(o.retenueDuMoisXof), Math.max(0, entier(o.resteAvantXof))));
  const resteApres = Math.max(0, entier(o.resteAvantXof) - ceMois);
  const retenu = Math.max(0, prete - resteApres);
  const echeances: EcheanceDuPret[] = [
    ...o.faites.filter((f) => f.mois < o.periode && f.montantXof > 0).map((f) => ({ mois: f.mois, montantXof: entier(f.montantXof), etat: 'faite' as const })),
    ...(ceMois > 0 ? [{ mois: o.periode, montantXof: ceMois, etat: 'ce-mois' as const }] : []),
    ...(resteApres > 0 ? o.avenir.filter((a) => a.mois > o.periode && a.retenueXof > 0).map((a) => ({ mois: a.mois, montantXof: entier(a.retenueXof), etat: 'a-venir' as const })) : []),
  ];
  const derniere = resteApres <= 0 ? (ceMois > 0 ? o.periode : null) : (o.avenir.length ? o.avenir[o.avenir.length - 1].mois : null);
  return { retenuXof: retenu, resteApresXof: resteApres, derniereRetenue: derniere, partRemboursee: prete > 0 ? Math.min(1, retenu / prete) : 0, echeances };
}

/* ── 9. L'ENTREPRISE : UN FOURNISSEUR, SA FACTURE, SA DÉPENSE ──────────
   Une entreprise payée sur facture EST un fournisseur : elle vit au carnet
   des fournisseurs (`mnd_fournisseurs_depenses`), avec son bloc `paiement`
   (numéro MTN, jour, agent). Chaque mois, sa facture (n°, montant, pièce)
   vit à part (`mnd_paiements_factures`) et pointe le fournisseur.
   L'entreprise est payée, pas son agent : par MTN, sur son numéro. La
   facture est facultative (11 nov. 2026). La dépense porte `fournisseurId` et le nom
   de la maison : elle tombe dans le compte du fournisseur, jamais en
   « Salaires ». */
export type PieceDeFacture = { chemin: string; nom: string; type: string; taille: number };

/* ── 9 bis. LES EMPLOYÉS D'UNE ENTREPRISE — 11 novembre 2026 ────────────
   Maquette public/maquette-les-employes-des-entreprises.html, « construis »
   (Yéman). Une entreprise porte ses employés ; CHACUN est payé sur SON numéro
   MTN, à la date et à l'heure de l'entreprise, sous le run des entreprises.
   Le montant de l'entreprise est la somme de leurs montants mensuels ; un
   montant se change pour un mois seulement. Dès qu'elle a un employé pour le
   mois, son propre numéro ne reçoit plus rien. La garde des sept jours et le
   nom chez MTN valent pour chacun, comme pour l'équipe ; les autres partent
   sans attendre. Pas de WhatsApp à l'employé. Un retrait vaut à partir du
   mois qui suit la période où il est fait. */
export type EmployeDEntreprise = {
  id: string;
  nom: string;
  /** Son numéro MTN, avec la date du dernier changement (la garde). */
  mobileMoney: MobileMoney;
  mensuelXof: number;
  /** La première période payée, AAAA-MM. */
  dePeriode: string;
  /** La dernière période payée, AAAA-MM ; absente : toujours. */
  retireApres?: string;
  creeLe: string;
  creePar: string;
};

export const ARRET_GARDE = 'numéro de moins de 7 jours';

/** Les employés payés pour cette période. */
export const employesDuMois = (employes: readonly EmployeDEntreprise[] | undefined, periode: string): EmployeDEntreprise[] =>
  (employes ?? []).filter((e) => e && (!e.dePeriode || e.dePeriode <= periode) && (!e.retireApres || periode <= e.retireApres));

/** Le montant d'un employé ce mois : celui posé pour le mois, sinon son mensuel. */
export const montantDeLEmploye = (e: Pick<EmployeDEntreprise, 'id' | 'mensuelXof'>, montantsDuMois?: Readonly<Record<string, number>>): number => {
  const pose = montantsDuMois?.[cleDeLigne('entreprise', e.id)];
  return Number.isInteger(pose) && (pose as number) >= 0 ? pose as number : Math.max(0, entier(e.mensuelXof));
};

/** La garde de l'employé, jugée à l'heure où l'argent part (ou maintenant, si
    elle est passée) : un numéro qui aura sept jours ce jour-là part. */
export function gardeDeLEmploye(e: Pick<EmployeDEntreprise, 'mobileMoney'>, departMs: number | undefined, maintenantMs: number): boolean {
  if (!e.mobileMoney) return false;
  return gardeDuNumero(e.mobileMoney, Math.max(maintenantMs, departMs ?? maintenantMs)).bloque;
}

/** La dépense d'un employé payé : une dépense de l'entreprise (Sous-traitance,
    son compte fournisseur), une par employé, jamais « Salaires ». */
export const depenseDeLEmployeId = (periode: string, employeId: string): string => `exp-ent-${periode}-${employeId}`;
export function depenseDeLEmploye(
  fournisseur: Pick<FournisseurAPayer, 'id' | 'nom' | 'branchId'>,
  employe: Pick<EmployeDEntreprise, 'id' | 'nom'>,
  envoi: Pick<EnvoiMtn, 'etat' | 'repondu_le' | 'envoye_le' | 'programme_le' | 'montant_xof' | 'periode'>,
  facture?: Pick<FactureDEntreprise, 'piece'>,
) {
  if (envoi.etat !== 'recu' || !envoi.periode) return null;
  const jour = aCotonou(Date.parse(envoi.repondu_le ?? envoi.envoye_le ?? envoi.programme_le)).slice(0, 10);
  return {
    id: depenseDeLEmployeId(envoi.periode, employe.id),
    branchId: fournisseur.branchId,
    label: `${fournisseur.nom} - ${employe.nom} - ${moisDit(envoi.periode)}`,
    amountXof: envoi.montant_xof,
    date: jour,
    cashbox: '',
    category: CATEGORIE_DES_ENTREPRISES,
    laMaisonAPaye: true,
    fournisseurId: fournisseur.id,
    ...(facture?.piece ? { fichier: facture.piece } : {}),
  };
}

export type PaiementDuFournisseur = {
  /** Le numéro de l'entreprise ; vide quand elle ne paie que ses employés. */
  msisdn: string;
  jour: JourDePaie;
  /** « HH:MM », 18 h par défaut. */
  heure?: string;
  agent?: string;
  employes?: EmployeDEntreprise[];
};
export type FournisseurAPayer = { id: string; branchId: string; nom: string; archived?: boolean; paiement?: PaiementDuFournisseur };
export type FactureDEntreprise = {
  id: string;
  branchId: string;
  fournisseurId: string;
  /** Le mois du service, AAAA-MM ; payé le mois suivant. */
  periode: string;
  /** Le n° de la facture. */
  facture: string;
  montantXof: number;
  piece?: PieceDeFacture;
  creeLe: string;
  creePar: string;
};

/** Les entreprises de l'écran : les fournisseurs qui portent un `paiement`. */
export const entreprisesDuCarnet = <F extends FournisseurAPayer>(carnet: readonly F[], branchId: string): F[] =>
  carnet.filter((f) => f && f.branchId === branchId && !f.archived && !!f.paiement);

/** La facture du mois d'une entreprise (la plus récente si deux). */
export const factureDuMois = (factures: readonly FactureDEntreprise[], fournisseurId: string, periode: string): FactureDEntreprise | undefined =>
  factures.filter((x) => x && x.fournisseurId === fournisseurId && x.periode === periode)
    .sort((a, b) => (b.creeLe ?? '').localeCompare(a.creeLe ?? ''))[0];

/* 11 nov. 2026 (Yéman) : « Je ne veux pas que ce soit une obligation de
   soumettre ». La facture d'une entreprise devient FACULTATIVE : son n° et sa
   pièce, quand ils existent, vont dans la dépense comme justificatif ; seul le
   montant du mois arrête la ligne. */
export function arretDeLEntreprise(facture: Pick<FactureDEntreprise, 'montantXof'> | undefined, msisdn: string | undefined): string | undefined {
  if (!facture || !(Number.isInteger(facture.montantXof) && facture.montantXof > 0)) return 'montant du mois à poser';
  if (!msisdn || !lisLeNumero(msisdn).msisdn) return 'numéro MTN illisible';
  return undefined;
}

export const CATEGORIE_DES_ENTREPRISES = 'Sous-traitance';
export const depenseDeLEntrepriseId = (factureId: string): string => `exp-ent-${factureId}`;
export function depenseDeLEntreprise(
  fournisseur: Pick<FournisseurAPayer, 'id' | 'nom'>,
  facture: FactureDEntreprise,
  envoi: Pick<EnvoiMtn, 'etat' | 'repondu_le' | 'envoye_le' | 'programme_le' | 'montant_xof'>,
) {
  if (envoi.etat !== 'recu') return null;
  const jour = aCotonou(Date.parse(envoi.repondu_le ?? envoi.envoye_le ?? envoi.programme_le)).slice(0, 10);
  return {
    id: depenseDeLEntrepriseId(facture.id),
    branchId: facture.branchId,
    /* « <maison> - <mois> » : le carnet retrouve la maison par ce libellé
       (beneficiaireDuLibelle), et d'abord par fournisseurId. */
    label: `${fournisseur.nom} - ${moisDit(facture.periode)}`,
    amountXof: envoi.montant_xof,
    date: jour,
    cashbox: '',
    category: CATEGORIE_DES_ENTREPRISES,
    laMaisonAPaye: true,
    fournisseurId: fournisseur.id,
    ...(facture.piece ? { fichier: facture.piece } : {}),
  };
}

/* ── 10. LA PÉRIODE AFFICHÉE ──────────────────────────────────────────
   Dans le mois M, on paie la période M-1 : le 5 l'équipe, puis chacun à sa
   date jusqu'au dernier jour. L'écran s'ouvre donc sur le mois d'avant. */
export function periodeParDefaut(maintenantMs: number): string {
  const ici = aCotonou(maintenantMs);
  const a = Number(ici.slice(0, 4)); const m = Number(ici.slice(5, 7));
  return m === 1 ? `${a - 1}-12` : `${a}-${p2(m - 1)}`;
}
