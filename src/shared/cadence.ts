import type { Appointment } from './agenda';
import { estDePassage, type Client } from './clients';

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
  const cliente = clients.find((c) => c.id === clientId);
  if (cliente && estDePassage(cliente)) return none;

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
    const iso = addDaysISO(visits[visits.length - 1].date, med);
    return { iso, predicted: true, avgDays: med, confidence, overdueDays: Math.max(0, daysBetween(iso, today)), sample, template };
  }

  // Une seule visite : cadence par défaut, confiance faible.
  const iso = addDaysISO(template.date, 30);
  return { iso, predicted: true, avgDays: 30, confidence: 'faible', overdueDays: Math.max(0, daysBetween(iso, today)), sample: 0, template };
}
