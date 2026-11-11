/* ══ LA PAIE DU 5, LA RÈGLE · 5 novembre 2026 (lot 1) ═══════════════════

   « Comment je peux automatiser les paiements tous les 5 du mois ? »
   (Yéman, 5 novembre 2026). Maquette VomoheW35Pi3E5CnhfjTvq validée, puis
   « construis la paie ». Ses choix, tous au sélecteur :

   · le 1er à 8 h, chaque bulletin est déposé dans Mon espace ;
   · chacun touche « Je confirme mon bulletin » ou « Je signale une erreur »
     (avec un mot) jusqu'au 5 à 12 h ;
   · Yéman ou Brice valide de 12 h à 18 h, et la paie part le 5 à 18 h ;
   · un 5 qui tombe un dimanche se paie le samedi 4, un 5 qui tombe un
     lundi le mardi 6, aux mêmes heures (11 nov. 2026 ; avant : dimanche →
     lundi 6) ;
   · une fiche confirmée en retard est payée dès qu'elle est confirmée et
     validée ;
   · un numéro MTN part par le portail MTN entreprise (aucune API : le Trône
     prépare le fichier, elle le dépose et colle le numéro de lot) ; un
     numéro Moov part par FedaPay (lot 2) ;
   · la Maison MND ne supporte pas les frais MoMo : ils sont retirés du
     montant envoyé, et le bulletin les montre ;
   · un net au-dessus du net du mois d'avant plus 25 % attend l'accord de la
     direction ; un numéro changé depuis moins de 7 jours attend sa
     revalidation ; une ligne ne se paie jamais deux fois.

   ICI, RIEN QUE DES CALCULS : ni magasin, ni écran, ni horloge lue en douce.
   Le banc `verifie-la-paie-du-5` les éprouve, et l'écran les appelle. Les
   montants sont des francs CFA entiers ; leur mise en forme vient de
   l'écran (`fmtMoney`), passée en argument. */

import type { LectureMtn } from './paie-par-mtn-pur';

export type Voie = 'MTN' | 'Moov';
export const VOIES: readonly Voie[] = ['MTN', 'Moov'];
const estUneVoie = (v: unknown): v is Voie => v === 'MTN' || v === 'Moov';

/** LE NUMÉRO MOBILE MONEY D'UNE FICHE. Privé : il vit dans `team_dossiers`
    (CHAMPS_DU_DOSSIER, migration 0161), jamais dans la fiche publique. */
export type MobileMoney = {
  /** 229 suivi de dix chiffres (01 + 8), tel que le portail MTN l'attend. */
  numero: string;
  operateur: Voie;
  /** Le dernier changement du numéro ou de l'opérateur (ISO). Une première
      saisie compte comme un changement. */
  changeLe: string;
  changePar?: string;
  /** La revalidation par la direction, qui lève la garde des sept jours. */
  revalidePar?: string;
  revalideLe?: string;
};

/* ── 1. LE CALENDRIER DU MOIS ─────────────────────────────────────────
   Cotonou vit en UTC+1 toute l'année, sans heure d'été : une heure de
   Cotonou se convertit donc exactement, quel que soit le fuseau de
   l'appareil qui calcule. Chaque moment porte sa lecture locale
   (« AAAA-MM-JJTHH:mm », pour le dire) et son instant (pour comparer). */
const COTONOU_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * 60 * 60 * 1000;
const p2 = (n: number) => String(n).padStart(2, '0');

export type Moment = { local: string; ms: number };
const momentDe = (a: number, m: number, j: number, h: number, min = 0): Moment => ({
  local: `${a}-${p2(m)}-${p2(j)}T${p2(h)}:${p2(min)}`,
  ms: Date.UTC(a, m - 1, j, h, min) - COTONOU_MS,
});

/** L'heure de Cotonou d'un instant, « AAAA-MM-JJTHH:mm ». */
export const aCotonou = (ms: number): string => {
  const d = new Date(ms + COTONOU_MS);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};

const lisLeMois = (periode: string): [number, number] | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(periode ?? '');
  if (!m) return null;
  const a = Number(m[1]); const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? [a, mo] : null;
};
export const moisSuivant = (periode: string): string => {
  const l = lisLeMois(periode); if (!l) return '';
  const [a, m] = l; return m === 12 ? `${a + 1}-01` : `${a}-${p2(m + 1)}`;
};
export const moisPrecedent = (periode: string): string => {
  const l = lisLeMois(periode); if (!l) return '';
  const [a, m] = l; return m === 1 ? `${a - 1}-12` : `${a}-${p2(m - 1)}`;
};

export type CalendrierDeLaPaie = {
  /** Le mois travaillé (celui du run), AAAA-MM. */
  periode: string;
  /** Le mois où l'on paie : le suivant. */
  moisDePaie: string;
  /** Le 1er à 8 h : les bulletins arrivent dans Mon espace. */
  depot: Moment;
  /** Le jour de paie (4, 5 ou 6) à 12 h : fin des confirmations, début de la validation. */
  finDesConfirmations: Moment;
  /** Le même jour à 18 h : fin de la validation, la paie part. */
  paie: Moment;
  /** AAAA-MM-JJ du jour de paie. */
  jourDePaie: string;
  /** Le quantième du jour de paie : 5, ou 4 (5 dimanche), ou 6 (5 lundi). */
  jourDuMois: number;
  /** Le 5 ne se paie pas ce jour-là : `samedi-4` (5 dimanche) ou
      `mardi-6` (5 lundi) ; `null` : le 5. Aux mêmes heures. */
  decalage: 'samedi-4' | 'mardi-6' | null;
};

/* LE JOUR DE PAIE — 11 novembre 2026 (Yéman, au sélecteur : « lundi = mardi,
   dimanche 5 = samedi 4 »). Un 5 qui tombe un dimanche se paie la VEILLE, le
   samedi 4 ; un 5 qui tombe un lundi, le LENDEMAIN, le mardi 6. Jusque-là, le
   dimanche passait au lundi 6. Le dépôt reste le 1er à 8 h. */
export function calendrierDeLaPaie(periode: string): CalendrierDeLaPaie | null {
  const suivant = moisSuivant(periode);
  const l = lisLeMois(suivant);
  if (!l) return null;
  const [a, m] = l;
  const jourDeLaSemaine = new Date(Date.UTC(a, m - 1, 5)).getUTCDay();
  const decalage = jourDeLaSemaine === 0 ? 'samedi-4' : jourDeLaSemaine === 1 ? 'mardi-6' : null;
  const jour = decalage === 'samedi-4' ? 4 : decalage === 'mardi-6' ? 6 : 5;
  return {
    periode,
    moisDePaie: suivant,
    depot: momentDe(a, m, 1, 8),
    finDesConfirmations: momentDe(a, m, jour, 12),
    paie: momentDe(a, m, jour, 18),
    jourDePaie: `${a}-${p2(m)}-${p2(jour)}`,
    jourDuMois: jour,
    decalage,
  };
}

/** « (le 5 est un dimanche) », « (le 5 est un lundi) », sinon rien. */
export const decalageDit = (cal: Pick<CalendrierDeLaPaie, 'decalage'>): string =>
  cal.decalage === 'samedi-4' ? 'le 5 est un dimanche : samedi 4' : cal.decalage === 'mardi-6' ? 'le 5 est un lundi : mardi 6' : '';

export type PhaseDuMois = 'avant-le-depot' | 'confirmation' | 'validation' | 'apres-la-paie';
/** Où en est le mois : avant le dépôt, le temps des confirmations, celui de
    la validation, puis après 18 h (les fiches en retard partent au fil de
    l'eau). */
export function phaseDuMois(c: CalendrierDeLaPaie, maintenantMs: number): PhaseDuMois {
  if (maintenantMs < c.depot.ms) return 'avant-le-depot';
  if (maintenantMs < c.finDesConfirmations.ms) return 'confirmation';
  if (maintenantMs < c.paie.ms) return 'validation';
  return 'apres-la-paie';
}

/* ── 2. LES DATES DITES (l'année toujours, « 1er » le premier) ── */
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « samedi 5 décembre 2026 » d'une lecture locale « AAAA-MM-JJ… ». */
export function jourDit(local: string, avecLeJour = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(local ?? '');
  if (!m) return '';
  const a = Number(m[1]); const mo = Number(m[2]); const j = Number(m[3]);
  const nom = JOURS[new Date(Date.UTC(a, mo - 1, j)).getUTCDay()];
  return `${avecLeJour ? `${nom} ` : ''}${j === 1 ? '1er' : j} ${MOIS[mo - 1]} ${a}`;
}
/** « 18 h », « 9 h 14 ». */
export function heureDite(local: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(local ?? '');
  if (!m) return '';
  const h = Number(m[1]); const min = Number(m[2]);
  return min === 0 ? `${h} h` : `${h} h ${p2(min)}`;
}
/** « samedi 5 décembre 2026 à 18 h ». */
export const momentDit = (local: string, avecLeJour = true): string => `${jourDit(local, avecLeJour)} à ${heureDite(local)}`;
/** Un horodatage ISO, dit à l'heure de Cotonou : « 2 décembre 2026 à 9 h 14 ». */
export const quandDit = (iso: string | undefined, avecLeJour = false): string => {
  const ms = Date.parse(iso ?? '');
  return Number.isFinite(ms) ? momentDit(aCotonou(ms), avecLeJour) : '';
};
/** Le mois dit, « novembre 2026 ». */
export const moisDit = (periode: string): string => {
  const l = lisLeMois(periode);
  return l ? `${MOIS[l[1] - 1]} ${l[0]}` : periode;
};
/** « de novembre 2026 », « d’octobre 2026 » : l'élision devant une voyelle. */
export const duMois = (periode: string): string => {
  const m = moisDit(periode);
  return /^[aeiouyàâéèêîôû]/i.test(m) ? `d’${m}` : `de ${m}`;
};

/* ── 3. LE NUMÉRO ─────────────────────────────────────────────────────
   Le format de ses fichiers d'essai, qui passent : 229 suivi de dix
   chiffres, 01 puis huit. Un numéro à huit chiffres (l'ancien format) se
   refuse, il ne se complète pas : un salaire envoyé au mauvais numéro ne
   revient pas, et c'est à la direction d'écrire le bon. */
export const RE_MSISDN = /^22901\d{8}$/;

export function lisLeNumero(saisi: string): { msisdn: string; erreur?: undefined } | { msisdn?: undefined; erreur: string } {
  let c = String(saisi ?? '').replace(/\D/g, '');
  if (c.startsWith('00229')) c = c.slice(2);
  if (c.length === 10 && c.startsWith('01')) c = `229${c}`;
  if (RE_MSISDN.test(c)) return { msisdn: c };
  if (c === '') return { erreur: 'Aucun numéro.' };
  if (c.length === 8 || (c.length === 11 && c.startsWith('229'))) {
    return { erreur: 'Un numéro mobile du Bénin a dix chiffres et commence par 01 : ajoutez 01 devant les huit chiffres.' };
  }
  return { erreur: 'Ce numéro ne se lit pas : dix chiffres, commençant par 01.' };
}

/** « 01 90 00 00 01 » d'un 2290190000001. */
export const numeroDit = (msisdn: string): string => {
  const c = String(msisdn ?? '').replace(/\D/g, '');
  const dix = c.length === 13 && c.startsWith('229') ? c.slice(3) : c;
  return dix.length === 10 ? dix.replace(/(\d{2})(?=\d)/g, '$1 ') : msisdn;
};

export const JOURS_DE_GARDE_DU_NUMERO = 7;

/** LA GARDE DES SEPT JOURS. Un numéro changé (ou posé) depuis moins de sept
    jours ne reçoit rien tant que la direction ne l'a pas revalidé. Une date
    illisible garde aussi : on ne prouve pas l'âge d'un numéro qu'on ne sait
    pas dater. Une revalidation antérieure au dernier changement ne vaut rien. */
export function gardeDuNumero(mm: MobileMoney | undefined, maintenantMs: number): { bloque: boolean; revalide: boolean; jusquAMs?: number } {
  if (!mm) return { bloque: false, revalide: false };
  const change = Date.parse(mm.changeLe ?? '');
  if (!Number.isFinite(change)) return { bloque: true, revalide: false };
  const reval = Date.parse(mm.revalideLe ?? '');
  const revalide = Number.isFinite(reval) && reval >= change;
  const jusquAMs = change + JOURS_DE_GARDE_DU_NUMERO * JOUR_MS;
  return { bloque: maintenantMs < jusquAMs && !revalide, revalide, jusquAMs };
}

/** Le numéro tel qu'il sort du formulaire de la fiche : neuf ou changé, il
    repart à zéro (date du jour, plus de revalidation) ; identique, il garde
    son histoire. Vide, il n'y a plus de numéro. */
export function numeroDeLaFiche(
  avant: MobileMoney | undefined, saisi: string, operateur: string, le: string, par?: string,
): { mobileMoney?: MobileMoney; erreur?: string } {
  if (!String(saisi ?? '').trim()) return {};
  const lu = lisLeNumero(saisi);
  if (lu.erreur !== undefined) return { erreur: lu.erreur };
  if (!estUneVoie(operateur)) return { erreur: 'Choisissez l’opérateur du numéro : MTN ou Moov.' };
  if (avant && avant.numero === lu.msisdn && avant.operateur === operateur) return { mobileMoney: avant };
  return { mobileMoney: { numero: lu.msisdn, operateur, changeLe: le, ...(par ? { changePar: par } : {}) } };
}

/* ── 4. LE PLAFOND : LE NET DU MOIS D'AVANT PLUS 25 % ────────────────── */
export const HAUSSE_PERMISE_PCT = 25;

/** Le plafond du net de ce mois. `null` = pas de mois d'avant, donc pas de
    plafond (l'écran le dit). Un mois d'avant à 0 F donne un plafond de 0 F :
    tout net positif attend l'accord. */
export const plafondDuNet = (netAvantXof?: number | null): number | null =>
  netAvantXof == null || !Number.isFinite(netAvantXof)
    ? null
    : Math.floor((Math.max(0, netAvantXof) * (100 + HAUSSE_PERMISE_PCT)) / 100);

type RunPourLePlafond = {
  id: string; period: string; branchId?: string; status?: string; createdAt?: string;
  lines?: readonly { employeeId: string; payeLe?: string; result?: { net?: number } }[];
};
const estPayee = (l: { payeLe?: string }): boolean => !!(l.payeLe ?? '').trim();
/** Un tableau, ou rien : une valeur de magasin abîmée ne casse pas le calcul. */
const liste = <T,>(v: readonly T[] | undefined | null): readonly T[] => (Array.isArray(v) ? v : []);

/** Le net du mois d'avant pour une personne : sa ligne dans un run du mois
    précédent (même branche), validé ou payé, ou à défaut une ligne déjà
    payée. Deux runs le même mois : le plus récent fait foi. */
export function netDuMoisDAvant(runs: readonly RunPourLePlafond[], run: { id: string; period: string; branchId?: string }, employeeId: string): number | undefined {
  const avant = moisPrecedent(run.period);
  if (!avant) return undefined;
  const trouves = liste(runs)
    .filter((r) => r && r.id !== run.id && r.period === avant && (!run.branchId || !r.branchId || r.branchId === run.branchId))
    .flatMap((r) => liste(r.lines)
      .filter((l) => l && l.employeeId === employeeId && (r.status !== 'brouillon' || estPayee(l)))
      .map((l) => ({ net: Math.round(l.result?.net ?? 0), at: r.createdAt ?? '' })))
    .sort((a, b) => a.at.localeCompare(b.at));
  return trouves.length ? trouves[trouves.length - 1].net : undefined;
}

/* ── 5. LES FRAIS D'ENVOI ─────────────────────────────────────────────
   « La Maison MND ne supporte pas les frais Momo » (Yéman, 5 novembre
   2026). Le tarif n'est pas connu : le réglage reste vide, dit « à
   renseigner », et tant qu'il l'est le montant envoyé est le net. Zéro est
   un tarif renseigné. */
export type FraisParEnvoi = Partial<Record<Voie, number>>;

export function fraisDeLaVoie(frais: FraisParEnvoi | undefined, voie: Voie | undefined): { fraisXof: number; renseignes: boolean } {
  if (!voie) return { fraisXof: 0, renseignes: false };
  const v = frais?.[voie];
  if (v == null || typeof v !== 'number' || !Number.isFinite(v) || v < 0) return { fraisXof: 0, renseignes: false };
  return { fraisXof: Math.round(v), renseignes: true };
}

export const libelleDesFrais = (voie: Voie | undefined): string =>
  voie === 'Moov' ? 'Frais d’envoi Moov Money' : 'Frais d’envoi MoMo';

/* ── 6. LE BULLETIN DÉPOSÉ ET SA CLÉ ──────────────────────────────────
   Chacun confirme LE bulletin qu'il a lu. La clé résume ce qu'il a lu : le
   net, ce qui le compose, la voie et les frais retenus au dépôt. Une
   correction change la clé ; la confirmation d'avant ne vaut plus, et la
   personne confirme à nouveau. */
export type ResultatDeLaLigne = { brut?: number; cnssSalariale?: number; its?: number; retenues?: number; net?: number };

export const cleDuBulletin = (r: ResultatDeLaLigne | undefined, voie: Voie | undefined, fraisXof: number): string =>
  [r?.net ?? 0, r?.brut ?? 0, r?.cnssSalariale ?? 0, r?.its ?? 0, r?.retenues ?? 0, voie ?? '-', fraisXof].join('|');

/** Le dépôt d'un bulletin dans Mon espace, figé sur la ligne : la voie et
    les frais de ce jour-là. Les frais réglés plus tard s'appliquent au dépôt
    suivant, jamais en douce sur un bulletin déjà confirmé. */
export type DepotDeLaLigne = { le: string; par?: string; cle: string; voie?: Voie; fraisXof: number; fraisRenseignes: boolean };

export function depotDeLaLigne(r: ResultatDeLaLigne | undefined, voie: Voie | undefined, frais: FraisParEnvoi | undefined, le: string, par?: string): DepotDeLaLigne {
  const f = fraisDeLaVoie(frais, voie);
  return { le, ...(par ? { par } : {}), cle: cleDuBulletin(r, voie, f.fraisXof), ...(voie ? { voie } : {}), fraisXof: f.fraisXof, fraisRenseignes: f.renseignes };
}

export type LigneDuDetail = { libelle: string; montantXof: number; retenue: boolean };

/** LES POURBOIRES PARTENT EN ESPÈCES — 6 novembre 2026. Maquette « Les
    paiements » (7AvgqVQdWV1QrQn7eQoA4i), validée, choix 1 de Yéman : les
    pourboires du mois sont remis en espèces le jour de paie, cochés « Remis »
    personne par personne. Ils restent dans le net du bulletin (ils sont un
    gain), mais ne partent PAS par mobile money : le montant envoyé est le
    net moins les frais d'envoi moins ces pourboires. Sans cela, un pourboire
    partirait deux fois, par MTN et de la main à la main. Une prestataire n'en
    a pas sur sa facture. */
export const LIBELLE_DES_ESPECES = 'Pourboires, remis en espèces';
export const pourboiresEnEspecesXof = (l: { gains?: { pourboires?: number }; prestataire?: boolean }): number =>
  l.prestataire ? 0 : Math.max(0, Math.round(Number(l.gains?.pourboires) || 0));
type GainsDuBulletin = { base?: number; heuresSup?: number; prime?: number; pourboires?: number; commission?: number; indemnites?: number };
type RetenuesDuBulletin = { avance?: number; autresRetenues?: number; retenuePret?: number; retenueCompteCourant?: number };

/** LE DÉTAIL DU BULLETIN, tel que Mon espace le montre : ce qui le compose,
    le net, puis les frais d'envoi et ce qui arrive sur le téléphone. */
export function detailDuBulletin(
  l: { gains?: GainsDuBulletin; deductions?: RetenuesDuBulletin; result?: ResultatDeLaLigne; prestataire?: boolean },
  voie: Voie | undefined, fraisXof: number,
): { lignes: LigneDuDetail[]; netXof: number; fraisXof: number; especesXof: number; envoyeXof: number; libelleDesFrais: string } {
  const g = l.gains ?? {}; const d = l.deductions ?? {}; const r = l.result ?? {};
  const out: LigneDuDetail[] = [{ libelle: l.prestataire ? 'Facture acceptée' : 'Salaire de base', montantXof: Math.round(g.base ?? 0), retenue: false }];
  const plus = (libelle: string, n?: number) => { if ((n ?? 0) > 0) out.push({ libelle, montantXof: Math.round(n ?? 0), retenue: false }); };
  const moins = (libelle: string, n?: number) => { if ((n ?? 0) > 0) out.push({ libelle, montantXof: Math.round(n ?? 0), retenue: true }); };
  plus('Heures supplémentaires', g.heuresSup);
  plus(l.prestataire ? 'Bonus, hors facture' : 'Primes', g.prime);
  plus('Commission', g.commission);
  plus('Pourboires', g.pourboires);
  plus('Indemnités', g.indemnites);
  moins('CNSS, part salariale', r.cnssSalariale);
  moins('Impôt sur les salaires', r.its);
  moins('Avance du mois', d.avance);
  moins('Autres retenues', d.autresRetenues);
  moins('Remboursement de prêt', d.retenuePret);
  moins('Compte courant d’associé', d.retenueCompteCourant);
  const netXof = Math.round(r.net ?? 0);
  const frais = Math.max(0, Math.round(fraisXof || 0));
  const especesXof = Math.min(pourboiresEnEspecesXof(l), Math.max(0, netXof - frais));
  return { lignes: out, netXof, fraisXof: frais, especesXof, envoyeXof: Math.max(0, netXof - frais - especesXof), libelleDesFrais: libelleDesFrais(voie) };
}

/* ── 7. L'ÉTAT DE CHAQUE LIGNE ─────────────────────────────────────── */
export type ConfirmationDeLaLigne = { etat: 'confirme' | 'erreur'; le: string; mot?: string; cle: string };
export type ValidationDeLaLigne = { par: string; le: string; cle: string };
export type AccordDuPlafond = { par: string; le: string; netXof: number };

/** CE QUE CHACUN ÉCRIT DEPUIS MON ESPACE (table `paie_confirmations`, 0161).
    Une ligne par bulletin : `id` = celui du bulletin, `<run>:<fiche>`. */
export type ConfirmationDePaie = ConfirmationDeLaLigne & { id: string; branchId?: string; runId: string; period: string; employeeId: string };

export const idDuBulletin = (runId: string, employeeId: string): string => `${runId}:${employeeId}`;

/** Ce que la règle lit d'une ligne de paie (la forme de `PayrollLine`). */
export type LigneDeLaPaie = {
  employeeId: string;
  name: string;
  prestataire?: boolean;
  result: ResultatDeLaLigne;
  /** Les pourboires du bulletin, remis en espèces (voir `pourboiresEnEspecesXof`). */
  gains?: { pourboires?: number };
  payeLe?: string;
  payeMoyen?: string;
  payeNote?: string;
  depot?: DepotDeLaLigne;
  confirmation?: ConfirmationDeLaLigne;
  validation?: ValidationDeLaLigne;
  accordPlafond?: AccordDuPlafond;
  lotMtn?: string;
  fraisEnvoiXof?: number;
  envoyeXof?: number;
};

export type EtatDeLaPaie = 'a-confirmer' | 'erreur' | 'bloquee' | 'confirmee' | 'payable' | 'payee';
export const ETAT_DIT: Record<EtatDeLaPaie, string> = {
  'a-confirmer': 'À confirmer',
  erreur: 'Erreur signalée',
  bloquee: 'Bloquée',
  confirmee: 'Confirmée',
  payable: 'Validée',
  payee: 'Payée',
};

export type Blocage =
  | { code: 'net-nul' }
  | { code: 'sans-numero' }
  | { code: 'numero-illisible'; erreur: string }
  | { code: 'voie-changee'; avant?: Voie; apres: Voie }
  | { code: 'numero-recent'; jusquA: string }
  | { code: 'plafond'; netXof: number; plafondXof: number; netAvantXof: number }
  | { code: 'frais-au-dela'; fraisXof: number; netXof: number };

export function phraseDuBlocage(b: Blocage, F: (xof: number) => string): string {
  switch (b.code) {
    case 'net-nul': return 'Rien à envoyer : le net est nul.';
    case 'sans-numero': return 'Aucun numéro mobile money sur sa fiche.';
    case 'numero-illisible': return `Numéro mobile money illisible. ${b.erreur}`;
    case 'voie-changee': return b.avant
      ? `L’opérateur a changé depuis le dépôt du bulletin (${b.avant}, puis ${b.apres}) : déposez-le à nouveau dans Mon espace.`
      : 'Le numéro est arrivé après le dépôt du bulletin : déposez-le à nouveau dans Mon espace, pour que les frais d’envoi y figurent.';
    case 'numero-recent': return `Numéro changé depuis moins de ${JOURS_DE_GARDE_DU_NUMERO} jours : bloqué jusqu’au ${jourDit(b.jusquA)} à ${heureDite(b.jusquA)}, ou jusqu’à sa revalidation par la direction.`;
    case 'plafond': return `Net de ${F(b.netXof)}, au-dessus du plafond de ${F(b.plafondXof)} (le net du mois d’avant, ${F(b.netAvantXof)}, plus ${HAUSSE_PERMISE_PCT} %) : il attend l’accord de la direction.`;
    case 'frais-au-dela': return `Les frais d’envoi (${F(b.fraisXof)}) atteignent le net (${F(b.netXof)}) : rien ne partirait.`;
    default: return '';
  }
}

export type LectureDeLaLigne = {
  etat: EtatDeLaPaie;
  /** Pourquoi elle attend encore une réponse (à confirmer). */
  attente?: string;
  /** Ce qui l'empêcherait de partir, même confirmée. */
  blocages: Blocage[];
  voie?: Voie;
  msisdn?: string;
  netXof: number;
  fraisXof: number;
  fraisRenseignes: boolean;
  /** Les pourboires remis en espèces, hors du montant envoyé. */
  especesXof: number;
  envoyeXof: number;
  cle: string;
  depotAJour: boolean;
  /** La réponse qui vaut pour ce bulletin, s'il y en a une. */
  confirmation?: ConfirmationDeLaLigne;
  /** La dernière réponse, même périmée (pour dire le mot d'une erreur). */
  derniereReponse?: ConfirmationDeLaLigne;
  enRetard: boolean;
  /** `null` : pas de mois d'avant, donc pas de plafond. */
  plafond: { netAvantXof: number; plafondXof: number; accorde: boolean } | null;
  numero: { bloque: boolean; revalide: boolean; jusquA?: string } | null;
};

/** LA LECTURE D'UNE LIGNE. L'ordre compte :
    ① payée (la date fait foi, comme `ligneEstPayee`) ;
    ② la réponse de la personne : pas de bulletin déposé, un bulletin
       corrigé depuis, pas de réponse, ou une erreur signalée ;
    ③ confirmée mais arrêtée par une garde : bloquée ;
    ④ confirmée et validée pour ce bulletin : prête à partir (« Validée ») ;
    ⑤ sinon confirmée, elle attend la validation.
    Une prestataire n'a pas de bulletin : sa facture acceptée tient lieu de
    confirmation. */
export function litLaLigne(o: {
  ligne: LigneDeLaPaie;
  mobileMoney?: MobileMoney;
  confirmationLue?: ConfirmationDePaie;
  netAvantXof?: number;
  parFacture?: boolean;
  fraisParEnvoi?: FraisParEnvoi;
  calendrier?: CalendrierDeLaPaie | null;
  maintenantMs: number;
}): LectureDeLaLigne {
  const l = o.ligne;
  const net = Math.round(l.result?.net ?? 0);
  const mm = o.mobileMoney;
  const lu = mm ? lisLeNumero(mm.numero) : null;
  const voieFiche = mm && estUneVoie(mm.operateur) ? mm.operateur : undefined;
  const avecDepot = !l.prestataire && !!l.depot;
  const frais = avecDepot && l.depot
    ? { fraisXof: Math.max(0, Math.round(l.depot.fraisXof || 0)), renseignes: !!l.depot.fraisRenseignes }
    : fraisDeLaVoie(o.fraisParEnvoi, voieFiche);
  const cle = cleDuBulletin(l.result, avecDepot && l.depot ? l.depot.voie : voieFiche, frais.fraisXof);
  const depotAJour = avecDepot && !!l.depot && l.depot.cle === cle;

  const reponses = [l.confirmation, o.confirmationLue && o.confirmationLue.employeeId === l.employeeId ? o.confirmationLue : undefined]
    .filter((c): c is ConfirmationDeLaLigne => !!c && (c.etat === 'confirme' || c.etat === 'erreur'))
    .sort((a, b) => (a.le ?? '').localeCompare(b.le ?? ''));
  const derniere = reponses.length ? reponses[reponses.length - 1] : undefined;
  const valable = !l.prestataire && derniere && depotAJour && derniere.cle === cle ? derniere : undefined;

  const blocages: Blocage[] = [];
  if (net <= 0) blocages.push({ code: 'net-nul' });
  if (!mm) blocages.push({ code: 'sans-numero' });
  else if (lu && lu.erreur !== undefined) blocages.push({ code: 'numero-illisible', erreur: lu.erreur });
  if (avecDepot && l.depot && voieFiche && l.depot.voie !== voieFiche) blocages.push({ code: 'voie-changee', ...(l.depot.voie ? { avant: l.depot.voie } : {}), apres: voieFiche });
  const g = mm ? gardeDuNumero(mm, o.maintenantMs) : null;
  if (g?.bloque) blocages.push({ code: 'numero-recent', jusquA: g.jusquAMs != null ? aCotonou(g.jusquAMs) : '' });
  const plafondXof = plafondDuNet(o.netAvantXof);
  const accorde = !!l.accordPlafond && l.accordPlafond.netXof === net;
  if (plafondXof != null && net > plafondXof && !accorde) {
    blocages.push({ code: 'plafond', netXof: net, plafondXof, netAvantXof: Math.round(o.netAvantXof ?? 0) });
  }
  if (net > 0 && frais.fraisXof >= net) blocages.push({ code: 'frais-au-dela', fraisXof: frais.fraisXof, netXof: net });

  let etat: EtatDeLaPaie;
  let attente: string | undefined;
  if (estPayee(l)) etat = 'payee';
  else {
    let confirmee = false;
    let erreur = false;
    if (l.prestataire) {
      confirmee = !!o.parFacture;
      if (!confirmee) attente = 'Sa facture du mois n’est pas encore acceptée.';
    } else if (!l.depot) attente = 'Bulletin pas encore déposé dans Mon espace.';
    else if (!depotAJour) attente = 'Bulletin corrigé depuis son dépôt : déposez-le à nouveau dans Mon espace.';
    else if (!valable) attente = derniere ? 'Bulletin corrigé après sa réponse : il attend une nouvelle confirmation.' : 'Pas encore confirmé dans Mon espace.';
    else if (valable.etat === 'erreur') erreur = true;
    else confirmee = true;
    etat = erreur ? 'erreur'
      : !confirmee ? 'a-confirmer'
        : blocages.length > 0 ? 'bloquee'
          : l.validation && l.validation.cle === cle && (l.validation.par ?? '').trim() ? 'payable'
            : 'confirmee';
  }

  /* Les pourboires remis en espèces ne partent pas par mobile money. */
  const especes = Math.min(pourboiresEnEspecesXof(l), Math.max(0, net - frais.fraisXof));
  const enRetard = !!valable && valable.etat === 'confirme' && !!o.calendrier
    && Date.parse(valable.le) > o.calendrier.finDesConfirmations.ms;

  return {
    etat,
    ...(attente && etat === 'a-confirmer' ? { attente } : {}),
    blocages,
    ...(voieFiche ? { voie: voieFiche } : {}),
    ...(lu && lu.msisdn ? { msisdn: lu.msisdn } : {}),
    netXof: net,
    fraisXof: frais.fraisXof,
    fraisRenseignes: frais.renseignes,
    especesXof: especes,
    envoyeXof: Math.max(0, net - frais.fraisXof - especes),
    cle,
    depotAJour,
    ...(valable ? { confirmation: valable } : {}),
    ...(derniere ? { derniereReponse: derniere } : {}),
    enRetard,
    plafond: plafondXof == null ? null : { netAvantXof: Math.round(o.netAvantXof ?? 0), plafondXof, accorde },
    numero: g ? { bloque: g.bloque, revalide: g.revalide, ...(g.jusquAMs != null ? { jusquA: aCotonou(g.jusquAMs) } : {}) } : null,
  };
}

/* ── 8. VALIDER : QUI, QUAND, ET RIEN QUE LES CONFIRMÉES ─────────────── */
/** « Valider et programmer » : chaque ligne confirmée que rien n'arrête
    reçoit la validation (qui, quand, pour quel bulletin) et garde la
    réponse de la personne. Sans nom, rien ne se valide : chaque validation
    dit qui a validé. */
export function valideLesLignes<L extends LigneDeLaPaie>(
  lignes: readonly L[], lectures: ReadonlyMap<string, LectureDeLaLigne>, par: string, le: string,
): { lignes: L[]; validees: string[]; erreur?: string } {
  if (!(par ?? '').trim()) return { lignes: [...lignes], validees: [], erreur: 'Une validation dit qui valide : le nom du compte manque.' };
  const validees: string[] = [];
  const out = lignes.map((l) => {
    const lu = lectures.get(l.employeeId);
    if (!lu || lu.etat !== 'confirmee') return l;
    validees.push(l.employeeId);
    return { ...l, validation: { par: par.trim(), le, cle: lu.cle }, ...(lu.confirmation ? { confirmation: lu.confirmation } : {}) };
  });
  return { lignes: out, validees };
}

/* ── 9. LE FICHIER DU PORTAIL MTN ─────────────────────────────────────
   Le format exact de ses fichiers d'essai qui passent :
     HDR,Salary,<nombre de lignes>,<total en F>
     <n°>,MSISDN,229XXXXXXXXXX,<montant>,<nom>
   Virgules, fins de ligne CRLF (la dernière comprise), aucune ligne vide à
   la fin, ni marque d'ordre des octets. Le total de l'en-tête est la somme
   des montants, le nombre celui des lignes. Le montant est le net moins les
   frais. */
export type LigneDuFichierMtn = { employeeId: string; nom: string; msisdn: string; montantXof: number };

/** Le nom pour le portail : des lettres sans accent, des chiffres, des
    espaces et des traits d'union, comme dans ses fichiers. C'est une
    contrainte du fichier MTN, pas une écriture de la Maison : les lettres
    fon y prennent leur plus proche latine (ɔ o, ɛ e, ɖ d) plutôt qu'un trou. */
export const nomPourMtn = (nom: string): string => {
  const fon: Record<string, string> = { 'ɔ': 'o', 'Ɔ': 'O', 'ɛ': 'e', 'Ɛ': 'E', 'ɖ': 'd', 'Ɖ': 'D' };
  const propre = String(nom ?? '')
    .replace(/[ɔƆɛƐɖƉ]/g, (c) => fon[c] ?? ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return propre || 'Sans nom';
};

/** Les lignes qui partent par le fichier MTN : validées, MTN, un numéro
    lisible, un montant positif, pas encore payées. */
export function lignesDuFichierMtn(lues: readonly { ligne: LigneDeLaPaie; lecture: LectureDeLaLigne }[]): LigneDuFichierMtn[] {
  return lues
    .filter(({ ligne, lecture }) => lecture.etat === 'payable' && lecture.voie === 'MTN' && !!lecture.msisdn
      && lecture.envoyeXof > 0 && !estPayee(ligne))
    .map(({ ligne, lecture }) => ({ employeeId: ligne.employeeId, nom: ligne.name, msisdn: lecture.msisdn as string, montantXof: lecture.envoyeXof }));
}

export function fichierMtn(lignes: readonly LigneDuFichierMtn[]): { csv: string; nombre: number; totalXof: number; erreur?: undefined } | { erreur: string; csv?: undefined } {
  if (!lignes.length) return { erreur: 'Aucune ligne MTN validée à payer.' };
  const vues = new Set<string>();
  for (const l of lignes) {
    if (vues.has(l.employeeId)) return { erreur: `${l.nom} figure deux fois : une ligne ne se paie qu’une fois.` };
    vues.add(l.employeeId);
    if (!RE_MSISDN.test(l.msisdn)) return { erreur: `Le numéro de ${l.nom} ne se lit pas : 229 suivi de dix chiffres.` };
    if (!Number.isInteger(l.montantXof) || l.montantXof <= 0) return { erreur: `Le montant de ${l.nom} n’est pas un nombre entier de francs positif.` };
  }
  const totalXof = lignes.reduce((s, l) => s + l.montantXof, 0);
  const rangs = [`HDR,Salary,${lignes.length},${totalXof}`, ...lignes.map((l, i) => `${i + 1},MSISDN,${l.msisdn},${l.montantXof},${nomPourMtn(l.nom)}`)];
  return { csv: `${rangs.join('\r\n')}\r\n`, nombre: lignes.length, totalXof };
}

/** Le nom du fichier, sans espace ni accent. */
export const nomDuFichierMtn = (periode: string, n: number): string => `paie-mtn-${periode}-${n}-ligne${n > 1 ? 's' : ''}.csv`;

/* ── 10. « C'EST ENVOYÉ » : LE NUMÉRO DE LOT ──────────────────────────
   Au dépôt, le portail affiche UNE SEULE FOIS un numéro de lot (batch ID).
   « C'est envoyé » ne se touche qu'avec lui ; il est gardé sur la paie du
   mois et sur chaque ligne payée par ce lot. */
export type FichierMtnPrepare = { le: string; par: string; lignes: LigneDuFichierMtn[]; totalXof: number };
export type LotMtn = {
  batch: string; le: string; par: string;
  /** Les lignes du fichier déposé, et son total. */
  employeeIds: string[]; totalXof: number;
  /** Celles qui étaient déjà payées avant ce lot : à vérifier chez MTN. */
  dejaPayees?: string[];
};
export type PaieDu5DuRun = {
  /** Chaque « Valider et programmer » : qui, quand, quelles fiches. */
  validations?: { par: string; le: string; employeeIds: string[] }[];
  /** Le fichier téléchargé, en attente de son numéro de lot. */
  fichierMtn?: FichierMtnPrepare;
  /** Les lots déposés au portail. */
  lotsMtn?: LotMtn[];
  /** LA PAIE PAR MTN (lot 2) : le solde et les noms lus chez MTN avant le toucher. */
  lectureMtn?: LectureMtn;
};

export const RE_LOT = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,63}$/;

export function pourquoiPasLeLot(batch: string, dejaNotes: readonly string[]): string | null {
  const b = String(batch ?? '').trim();
  if (!b) return 'Le numéro de lot est obligatoire : le portail MTN l’affiche une seule fois, au dépôt du fichier.';
  if (!RE_LOT.test(b)) return 'Ce numéro de lot ne se lit pas : collez-le tel que le portail l’affiche, des lettres et des chiffres, sans espace.';
  if (dejaNotes.some((x) => String(x ?? '').trim().toLowerCase() === b.toLowerCase())) return 'Ce numéro de lot est déjà noté : un lot ne se note qu’une fois.';
  return null;
}

/** Les lots déjà notés, sur tous les runs. */
export const lotsDejaNotes = (runs: readonly { paieDu5?: PaieDu5DuRun }[]): string[] =>
  liste(runs).flatMap((r) => liste(r?.paieDu5?.lotsMtn).map((l) => l.batch));

/** Le lot posé sur les lignes du fichier : payées ce jour, par MTN, avec
    leur numéro de lot, les frais retenus et ce qui est parti. Une ligne
    déjà payée ne se repaie pas : elle est rendue à part, pour le dire. */
export function appliqueLeLot<L extends LigneDeLaPaie>(
  lignes: readonly L[], fichier: FichierMtnPrepare, batch: string, jour: string,
): { lignes: L[]; payees: string[]; dejaPayees: string[]; absentes: string[] } {
  const b = String(batch ?? '').trim();
  const parFiche = new Map(fichier.lignes.map((x) => [x.employeeId, x]));
  const payees: string[] = []; const dejaPayees: string[] = [];
  const presentes = new Set(lignes.map((l) => l.employeeId));
  const absentes = fichier.lignes.map((x) => x.employeeId).filter((id) => !presentes.has(id));
  const out = lignes.map((l) => {
    const f = parFiche.get(l.employeeId);
    if (!f) return l;
    if (estPayee(l)) { dejaPayees.push(l.employeeId); return l; }
    payees.push(l.employeeId);
    const net = Math.round(l.result?.net ?? 0);
    return { ...l, payeLe: jour, payeMoyen: 'MTN', payeNote: undefined, lotMtn: b, envoyeXof: f.montantXof, fraisEnvoiXof: Math.max(0, net - pourboiresEnEspecesXof(l) - f.montantXof) };
  });
  return { lignes: out, payees, dejaPayees, absentes };
}

/* ── 11. LES TOTAUX ───────────────────────────────────────────────────── */
export type TotalDeVoie = { nombre: number; netXof: number; fraisXof: number; envoyeXof: number };

/** Les totaux par voie des lignes qui partiront (confirmées ou validées). */
export function totauxParVoie(lectures: readonly LectureDeLaLigne[], etats: readonly EtatDeLaPaie[] = ['confirmee', 'payable']): Record<Voie | 'sans-voie', TotalDeVoie> {
  const vide = (): TotalDeVoie => ({ nombre: 0, netXof: 0, fraisXof: 0, envoyeXof: 0 });
  const t: Record<Voie | 'sans-voie', TotalDeVoie> = { MTN: vide(), Moov: vide(), 'sans-voie': vide() };
  for (const lu of lectures) {
    if (!etats.includes(lu.etat)) continue;
    const k = lu.voie ?? 'sans-voie';
    t[k].nombre += 1; t[k].netXof += lu.netXof; t[k].fraisXof += lu.fraisXof; t[k].envoyeXof += lu.envoyeXof;
  }
  return t;
}

/** Le résumé de l'écran : confirmées (à payer), ce qui partira, ce qui attend. */
export function resumeDeLaPaie(lectures: readonly LectureDeLaLigne[]): {
  confirmees: number; aEnvoyerXof: number; enAttente: number; aValider: number; payables: number; payees: number;
} {
  const n = (e: EtatDeLaPaie) => lectures.filter((x) => x.etat === e).length;
  return {
    confirmees: n('confirmee') + n('payable'),
    aEnvoyerXof: lectures.filter((x) => x.etat === 'confirmee' || x.etat === 'payable').reduce((s, x) => s + x.envoyeXof, 0),
    enAttente: n('a-confirmer') + n('erreur') + n('bloquee'),
    aValider: n('confirmee'),
    payables: n('payable'),
    payees: n('payee'),
  };
}
