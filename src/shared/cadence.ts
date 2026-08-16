import type { Appointment } from './agenda';
import { estDePassage, estDiaspora, type Client } from './clients';
import { openingForIso } from './settings';

/* LA CADENCE D'UNE TÊTE — UN SEUL JUGE, POUR LES DEUX SŒURS.

   Prédire le retour d'une cliente sert trois écrans : la fiche du Trône
   (« Prochain rendez-vous · prédit »), son tableau de bord (les relances d'un
   carnet libre) et l'ACCUEIL DE MA COURONNE (« ≈ vendredi 28 août — réservez
   ce rituel »). Deux copies finiraient par dire deux dates à la même tête —
   le juge vit donc ici, dans la couche partagée, et chaque surface l'appelle.

   Côté Ma Couronne, la RLS ne montre à la cliente que SES rendez-vous :
   c'est exactement ce qu'il faut au calcul — sa cadence ne regarde qu'elle. */

const pad2 = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/* Midi local — jamais UTC, qui coupe la nuit comptable en deux à Cotonou. */
const fromISO = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const addDaysISO = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const timeToMin = (t: string) => {
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
const prochainJourOuvert = (iso: string): string => {
  let d = iso;
  /* Quatorze essais : deux semaines fermées d'affilée n'existent pas, et une
     boucle sans fin sur un réglage aberrant serait pire que la date brute. */
  for (let i = 0; i < 14; i += 1) {
    if (!openingForIso(d).closed) return d;
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
const poseLaDate = (iso: string, jourPrefere: number | undefined): string =>
  prochainJourOuvert(jourPrefere === undefined ? iso : prochainJourDeSemaine(iso, jourPrefere));

/** Médiane entière — robuste aux visites exceptionnelles. */
const medianInt = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

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

export function predictNextVisit(appts: Appointment[], clients: Client[], clientId: string, today: string): Cadence {
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
  const cliente = clients.find((c) => c.id === clientId);
  if (cliente && (estDePassage(cliente) || estDiaspora(cliente))) return none;

  const honored = mine.filter((a) => a.status === 'honoré').sort((a, b) => a.date.localeCompare(b.date));
  if (honored.length === 0) return none;
  const template = honored[honored.length - 1]; // le dernier rituel — à dupliquer

  const daysBetween = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
  // Cadence de revisite : une série multi-séances compte pour une seule visite.
  const visits = honored.filter((a) => !(a.seriesIndex && a.seriesIndex > 1));

  if (visits.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < visits.length; i++) gaps.push(daysBetween(visits[i - 1].date, visits[i].date));
    const use = gaps.filter((g) => g > 0);
    const sample = use.length || gaps.length;
    const med = Math.max(14, medianInt(use.length ? use : gaps));
    // Confiance : régularité (écart-type / moyenne) pondérée par le nombre d'intervalles.
    const base = use.length ? use : gaps;
    const mean = base.reduce((s, g) => s + g, 0) / base.length;
    const variance = base.reduce((s, g) => s + (g - mean) ** 2, 0) / base.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const confidence: Cadence['confidence'] =
      sample >= 3 && cv < 0.35 ? 'haute' : sample >= 2 && cv < 0.6 ? 'moyenne' : 'faible';
    /* L'échéance MANQUÉE reste la mesure du retard ; la date proposée, elle,
       rejoue le cycle, se pose sur SON jour, puis sur un jour ouvert. */
    const echeance = addDaysISO(visits[visits.length - 1].date, med);
    const iso = poseLaDate(prochaineOccurrence(echeance, med, today), cliente?.jourPrefere);
    return { iso, predicted: true, avgDays: med, confidence, overdueDays: Math.max(0, daysBetween(echeance, today)), sample, template };
  }

  // Une seule visite : cadence par défaut, confiance faible.
  const echeance = addDaysISO(template.date, 30);
  const iso = poseLaDate(prochaineOccurrence(echeance, 30, today), cliente?.jourPrefere);
  return { iso, predicted: true, avgDays: 30, confidence: 'faible', overdueDays: Math.max(0, daysBetween(echeance, today)), sample: 0, template };
}
