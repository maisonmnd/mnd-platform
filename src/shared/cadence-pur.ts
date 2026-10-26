/* ══ LA CADENCE, PURE — 27 octobre 2026 ═════════════════════════════════
   Le juge de la Cadence sorti de `cadence.ts`, qui lit les murs de la Maison
   dans le magasin des réglages : ici, les jours fermés se passent en
   argument (`estFerme`). Le Trône et Ma Couronne passent par `cadence.ts`
   (rien ne change pour eux) ; la fonction serveur de l'Assistant Maison
   l'appelle avec les heures lues en base. Un seul juge, deux portes. */
import type { Appointment } from './agenda';
import type { Client } from './clients';
import { aDefaitSesLocks, dortDepuisLongtemps, estDePassage, estDiaspora, MOIS_AVANT_SORTIE } from './clients-pur';

/** Ce que le juge lit d'une fiche. */
export type ClienteDeLaCadence = Pick<Client, 'dePassage' | 'diaspora' | 'segments' | 'locksDefaits' | 'jourPrefere'>;

const pad2 = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/* Midi local — jamais UTC, qui coupe la nuit comptable en deux à Cotonou. */
export const fromISO = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
export const addDaysISO = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

export type Cadence = {
  iso: string | null;
  predicted: boolean; // true = estimé, false = vrai RDV à venir
  avgDays: number | null; // intervalle médian de revisite
  confidence: 'haute' | 'moyenne' | 'faible' | null;
  overdueDays: number; // > 0 si la date estimée est déjà passée
  sample: number; // nombre d'intervalles analysés
  template: Appointment | null; // dernier rituel honoré, à dupliquer
};

/* ── DEUX RÈGLES POSÉES LE 16 AOÛT (anomalies vues par Yéman sur Prisca) ──

   ① UNE ESTIMATION NE RESTE PAS DANS LE PASSÉ. La fiche annonçait « ≈ lun.
      29 juin » un 16 août : la cadence ne se posait qu'UNE fois depuis la
      dernière venue, et si la cliente ne venait pas, la date vieillissait sur
      place. Le cycle SE REJOUE désormais jusqu'à retomber devant nous — c'est
      bien ce qu'on attend d'elle, la prochaine fois, pas la fois manquée.
      `overdueDays` continue de compter depuis la PREMIÈRE échéance : la Maison
      doit savoir de combien elle est en retard, même si la proposition, elle,
      regarde devant.

   ② ON NE PROPOSE PAS UN FAUTEUIL PORTE CLOSE. Le 29 juin était un lundi, et
      la Maison ferme le lundi et le dimanche. La date glisse au prochain jour
      ouvert — mêmes réglages que le calendrier de réservation
      (`openingForIso` : jours fermés ET journées exceptionnelles). */

/** Le premier jour ouvert à partir de celui-ci. */
export const prochainJourOuvertSelon = (iso: string, estFerme: (iso: string) => boolean): string => {
  let d = iso;
  /* Quatorze essais : deux semaines fermées d'affilée n'existent pas, et une
     boucle sans fin sur un réglage aberrant serait pire que la date brute. */
  for (let i = 0; i < 14; i += 1) {
    if (!estFerme(d)) return d;
    d = addDaysISO(d, 1);
  }
  return iso;
};

/** La cadence rejouée jusqu'à tomber aujourd'hui ou après. */
const prochaineOccurrence = (depart: string, pas: number, today: string): string => {
  let iso = depart;
  for (let i = 0; i < 200 && iso < today; i += 1) iso = addDaysISO(iso, Math.max(1, pas));
  return iso;
};

/** SON JOUR À ELLE — le premier `jour` (0 = dimanche … 6 = samedi) à partir de
    cette date, celle-ci comprise. « Il y a des clientes qui ne veulent venir
    que le samedi » (Yéman, 16 août) : prédire un mardi à celles-là, c'est
    relancer sur une date qu'elles refuseront. */
const prochainJourDeSemaine = (iso: string, jour: number): string => {
  const ecart = (jour - fromISO(iso).getDay() + 7) % 7;
  return ecart === 0 ? iso : addDaysISO(iso, ecart);
};

/** OÙ SE POSE UNE ESTIMATION — son jour à elle d'abord, la porte ouverte
    ensuite. L'ordre compte : le salon ne s'ouvre pas parce qu'une cliente le
    préfère, donc un jour préféré FERMÉ glisse au premier jour ouvert. La fiche
    prévient au moment de le choisir plutôt que de mentir ici. */
/** LES JOURS D'UNE TÊTE, normalisés : un nombre, une liste, ou rien. */
const sesJours = (j: number | readonly number[] | undefined): number[] => {
  if (j === undefined) return [];
  const l = (typeof j === 'number' ? [j] : [...j]).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(l)].slice(0, 2);
};

/** LE PREMIER DE SES JOURS À PARTIR D'ICI — 6 septembre 2026.

    « La cadence peut se permettre de proposer un rendez-vous l'un ou l'autre de
    ces jours » (Yéman). Avec deux jours, la reprise tombe sur le PLUS PROCHE :
    prendre toujours le premier de la liste ferait attendre jusqu'à six jours de
    plus pour rien, et l'ordre de la liste n'a aucun sens pour la cliente. */
const prochainJourParmi = (iso: string, jours: readonly number[]): string => {
  if (jours.length === 0) return iso;
  let meilleur = '';
  for (const j of jours) {
    const d = prochainJourDeSemaine(iso, j);
    if (!meilleur || d < meilleur) meilleur = d;
  }
  return meilleur;
};

export const poseLaDateSelon = (iso: string, jourPrefere: number | readonly number[] | undefined, estFerme: (iso: string) => boolean): string => {
  const jours = sesJours(jourPrefere);
  return prochainJourOuvertSelon(jours.length === 0 ? iso : prochainJourParmi(iso, jours), estFerme);
};

/** Médiane entière — robuste aux visites exceptionnelles. */
export const medianInt = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/* ══ LA CADENCE OBSERVÉE — 9 septembre 2026 ══════════════════════════
   « Que la cadence ne se remplisse plus à la main, mais automatiquement
   selon le calcul des derniers rendez-vous, sur chaque fiche — tout comme
   les jours favoris » (Yéman). LE JUGE EST ICI, UNIQUE : la fiche l'affiche,
   la reprise s'en sert, predictNextVisit lit le même intervalle — trois
   écrans, zéro divergence. Une série multi-séances compte pour UNE visite,
   la médiane résiste aux venues exceptionnelles, jamais moins de 14 jours. */
export type CadenceObservee = {
  jours: number;
  /** L'arrondi dont parle la Maison — jamais moins de 2 semaines. */
  semaines: number;
  sample: number;
  confidence: 'haute' | 'moyenne' | 'faible';
};

export function cadenceObservee(appts: readonly Appointment[], clientId: string): CadenceObservee | null {
  const joursEntre = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
  const honorees = appts
    .filter((a) => a.clientId === clientId && a.status === 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date));
  const visites = honorees.filter((a) => !(a.seriesIndex && a.seriesIndex > 1));
  if (visites.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < visites.length; i++) gaps.push(joursEntre(visites[i - 1].date, visites[i].date));
  const use = gaps.filter((g) => g > 0);
  const sample = use.length || gaps.length;
  const base = use.length ? use : gaps;
  const jours = Math.max(14, medianInt(base));
  const mean = base.reduce((acc, g) => acc + g, 0) / base.length;
  const variance = base.reduce((acc, g) => acc + (g - mean) ** 2, 0) / base.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const confidence: CadenceObservee['confidence'] =
    sample >= 3 && cv < 0.35 ? 'haute' : sample >= 2 && cv < 0.6 ? 'moyenne' : 'faible';
  return { jours, semaines: Math.max(2, Math.round(jours / 7)), sample, confidence };
}

/** LE JUGE, SANS LES MURS : `estFerme` dit les jours où la Maison est close
    (au Trône, `openingForIso` ; au serveur, les réglages lus en base). */
export function predictNextVisitSelon(
  appts: readonly Appointment[], cliente: ClienteDeLaCadence | undefined, clientId: string, today: string,
  estFerme: (iso: string) => boolean,
): Cadence {
  const none: Cadence = { iso: null, predicted: false, avgDays: null, confidence: null, overdueDays: 0, sample: 0, template: null };
  const mine = appts.filter((a) => a.clientId === clientId);
  const upcoming = mine
    .filter((a) => a.date >= today && a.status !== 'annulé' && a.status !== 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time))[0];
  if (upcoming) return { ...none, iso: upcoming.date, predicted: false };

  /* ON NE PRÉDIT PAS LE RETOUR DE QUI N'A PAS DE RELATION. Une venue unique
     donnait déjà une cadence par défaut à 30 jours et « la maison anticipe sa
     cadence — proposez le fauteuil » : c'est exactement la relance qui part
     vers quelqu'un qui ne reviendra pas, et qui fait ignorer les suivantes.
     Un RDV DÉJÀ PRIS, lui, s'affiche toujours — ci-dessus : c'est un fait,
     pas une prédiction. */
  /* NI CELLE QUI PASSE, NI CELLE QUI VIT AILLEURS. La diaspora vient quand
     elle est au pays : sa cadence ne mesure pas un rythme, elle mesure des
     billets d'avion. Prédire son retour remplissait « celles qui ont glissé »
     de gens qu'on ne relance pas — et noyait celles qu'il fallait rappeler
     (16 août). Un rendez-vous DÉJÀ PRIS s'affiche toujours : il est traité
     plus haut, avant ce garde. */
  /* NI CELLE QUI A DÉFAIT SES LOCKS (9 septembre) : prédire le retour d'une
     tête sans locks, c'est relancer pour un rituel qui n'a plus d'objet. */
  if (cliente && (estDePassage(cliente) || estDiaspora(cliente) || aDefaitSesLocks(cliente))) return none;

  const honored = mine.filter((a) => a.status === 'honoré').sort((a, b) => a.date.localeCompare(b.date));
  if (honored.length === 0) return none;
  const template = honored[honored.length - 1]; // le dernier rituel — à dupliquer

  /* NI CELLE QUI NE VIENT PLUS — 11 septembre 2026, demande de Yéman.
     Passé cinq mois sans s'asseoir, ce n'est plus un retard, c'est un départ :
     « celles qui ont glissé » se remplissait de gens partis depuis l'hiver, et
     ils noyaient les trois qu'un message aurait ramenées. La diaspora est
     épargnée, sa cadence mesure des billets d'avion.
     UN RENDEZ-VOUS DÉJÀ PRIS passe avant ce garde : il est traité tout en
     haut, et c'est un fait, pas une prédiction. */
  if (cliente && dortDepuisLongtemps(cliente, template.date, today, MOIS_AVANT_SORTIE)) return none;

  const daysBetween = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
  // Cadence de revisite : une série multi-séances compte pour une seule visite.
  const visits = honored.filter((a) => !(a.seriesIndex && a.seriesIndex > 1));

  const obs = cadenceObservee(mine, clientId);
  if (visits.length >= 2 && obs) {
    /* LE MÊME JUGE QUE LA FICHE ET LA REPRISE — voir cadenceObservee. */
    const { jours: med, sample, confidence } = obs;
    /* L'échéance MANQUÉE reste la mesure du retard ; la date proposée, elle,
       rejoue le cycle, se pose sur SON jour, puis sur un jour ouvert. */
    const echeance = addDaysISO(visits[visits.length - 1].date, med);
    const iso = poseLaDateSelon(prochaineOccurrence(echeance, med, today), cliente?.jourPrefere, estFerme);
    return { iso, predicted: true, avgDays: med, confidence, overdueDays: Math.max(0, daysBetween(echeance, today)), sample, template };
  }

  // Une seule visite : cadence par défaut, confiance faible.
  const echeance = addDaysISO(template.date, 30);
  const iso = poseLaDateSelon(prochaineOccurrence(echeance, 30, today), cliente?.jourPrefere, estFerme);
  return { iso, predicted: true, avgDays: 30, confidence: 'faible', overdueDays: Math.max(0, daysBetween(echeance, today)), sample: 0, template };
}
