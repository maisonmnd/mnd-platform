import { ouvertureDuJour, type ExceptionDHoraire, type HeureDeLaSemaine } from './agenda-pur';

/* LA FERMETURE ANNONCÉE AUX CLIENTES — 6 novembre 2026.

   « Il faut notifier sur le site internet et sur Ma Couronne que le salon est
   fermé du [vendredi] 1er au mardi 5, qu'on reprend le mercredi 6 janvier,
   donc le calendrier doit être fermé pour la prise de rendez-vous » (Yéman).

   LE CALENDRIER SE FERME DÉJÀ TOUT SEUL : les journées exceptionnelles de
   toute la Maison (Paramètres, « Fermer la Maison un jour ») ferment la
   réservation du site, de Ma Couronne et de WhatsApp. Ce module ne fait que
   DIRE la fermeture, avant qu'on la découvre en cherchant une place.

   CE QUI S'ANNONCE : une suite de jours fermés POUR TOUTE LA MAISON (une
   journée d'une seule personne ne regarde que le pointage), les jours que la
   semaine ferme toujours (dimanche, lundi) recousant la suite. Une vraie
   fermeture, deux jours exceptionnels ou plus, s'annonce soixante jours
   avant ; un seul jour, quatorze jours avant. Une fermeture en cours se dit
   jusqu'à son dernier jour. La première seulement : le bandeau annonce, il ne
   dresse pas la liste.

   RIEN DE TOUT CELA NE LIT UN MAGASIN : le site et Ma Couronne passent leurs
   heures, le banc pose les siennes. */

export const HORIZON_D_UNE_FERMETURE = 60;
export const HORIZON_D_UN_JOUR = 14;

export type FermetureAnnoncee = {
  /** Le premier jour fermé exprès, AAAA-MM-JJ. */
  du: string;
  /** Le dernier jour fermé de la suite. */
  au: string;
  /** Le premier jour ouvert après, `null` s'il n'y en a pas dans le mois. */
  reprise: string | null;
  /** Combien de journées exceptionnelles la composent. */
  exceptionnels: number;
  /** La note commune des journées (« Fermeture annuelle »), si elles la partagent. */
  note?: string;
};

const ajoute = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ecart = (de: string, a: string): number =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

export function fermetureAnnoncee(o: {
  aujourdhui: string;
  semaine: readonly HeureDeLaSemaine[];
  exceptions: readonly (ExceptionDHoraire & { note?: string })[];
}): FermetureAnnoncee | null {
  const fermees = new Map<string, string>();
  for (const x of o.exceptions) {
    if (!x || x.staffId || !x.closed || !/^\d{4}-\d{2}-\d{2}$/.test(x.date ?? '')) continue;
    if (!fermees.has(x.date)) fermees.set(x.date, (x.note ?? '').trim());
  }
  const dates = [...fermees.keys()].sort();
  const fermeLe = (iso: string) => ouvertureDuJour(iso, o.semaine, o.exceptions).closed;
  let i = 0;
  while (i < dates.length) {
    /* LA SUITE : d'un jour exceptionnel au suivant, tant que les jours entre
       eux sont fermés par la semaine elle-même. */
    const suite = [dates[i]];
    let j = i + 1;
    while (j < dates.length) {
      const precedent = suite[suite.length - 1];
      let cousu = true;
      for (let d = ajoute(precedent, 1); d < dates[j]; d = ajoute(d, 1)) {
        if (!fermeLe(d)) { cousu = false; break; }
      }
      if (!cousu) break;
      suite.push(dates[j]);
      j += 1;
    }
    i = j;
    const du = suite[0];
    const au = suite[suite.length - 1];
    if (au < o.aujourdhui) continue;
    const horizon = suite.length >= 2 ? HORIZON_D_UNE_FERMETURE : HORIZON_D_UN_JOUR;
    /* Trop loin pour SA règle : un jour seul à vingt jours ne cache pas une
       vraie fermeture à cinquante, on regarde la suivante. */
    if (ecart(o.aujourdhui, du) > horizon) continue;
    let reprise: string | null = null;
    for (let d = ajoute(au, 1), n = 0; n < 31; d = ajoute(d, 1), n += 1) {
      if (!fermeLe(d)) { reprise = d; break; }
    }
    const notes = [...new Set(suite.map((d) => fermees.get(d) ?? ''))];
    return { du, au, reprise, exceptionnels: suite.length, ...(notes.length === 1 && notes[0] ? { note: notes[0] } : {}) };
  }
  return null;
}

/* ══ LA PHRASE ═══════════════════════════════════════════════════════════
   « La Maison MND est fermée du vendredi 1er au mardi 5 janvier 2027.
   Réouverture le mercredi 6 janvier 2027. » Le nom entier de la Maison,
   l'année sur chaque date, le « 1er », jamais de tiret cadratin. */
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const morceaux = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const n = d.getUTCDate();
  return { jour: JOURS[d.getUTCDay()], quantieme: n === 1 ? '1er' : String(n), mois: MOIS[d.getUTCMonth()], annee: d.getUTCFullYear() };
};

/** « vendredi 1er janvier 2027 » */
export const dateDite = (iso: string): string => {
  const m = morceaux(iso);
  return `${m.jour} ${m.quantieme} ${m.mois} ${m.annee}`;
};

/** « du vendredi 1er au mardi 5 janvier 2027 », le mois et l'année dits une
    fois quand ils sont communs. */
export const periodeDite = (du: string, au: string): string => {
  const a = morceaux(du);
  const b = morceaux(au);
  if (a.annee !== b.annee) return `du ${dateDite(du)} au ${dateDite(au)}`;
  if (a.mois !== b.mois) return `du ${a.jour} ${a.quantieme} ${a.mois} au ${dateDite(au)}`;
  return `du ${a.jour} ${a.quantieme} au ${dateDite(au)}`;
};

export function phraseDeLaFermeture(f: FermetureAnnoncee, aujourdhui: string): { ferme: string; reprise: string | null } {
  const ferme = f.du === f.au
    ? `La Maison MND est fermée le ${dateDite(f.du)}.`
    : f.du <= aujourdhui
      ? `La Maison MND est fermée jusqu’au ${dateDite(f.au)}.`
      : `La Maison MND est fermée ${periodeDite(f.du, f.au)}.`;
  return { ferme, reprise: f.reprise ? `Réouverture le ${dateDite(f.reprise)}.` : null };
}

/* ══ EN ANGLAIS, POUR MA COURONNE ════════════════════════════════════════
   Ma Couronne parle anglais à qui l'a choisi (fermé tant que la relecture
   n'est pas faite) : la même phrase, les dates à l'anglaise, le nom de la
   Maison inchangé. */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { day: DAYS[d.getUTCDay()], n: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear() };
};
const dateSaid = (iso: string): string => { const p = parts(iso); return `${p.day} ${p.n} ${p.month} ${p.year}`; };
const periodSaid = (du: string, au: string): string => {
  const a = parts(du);
  const b = parts(au);
  if (a.year !== b.year) return `from ${dateSaid(du)} to ${dateSaid(au)}`;
  if (a.month !== b.month) return `from ${a.day} ${a.n} ${a.month} to ${dateSaid(au)}`;
  return `from ${a.day} ${a.n} to ${dateSaid(au)}`;
};

export function phraseDeLaFermetureEn(f: FermetureAnnoncee, aujourdhui: string): { ferme: string; reprise: string | null } {
  const ferme = f.du === f.au
    ? `Maison MND is closed on ${dateSaid(f.du)}.`
    : f.du <= aujourdhui
      ? `Maison MND is closed until ${dateSaid(f.au)}.`
      : `Maison MND is closed ${periodSaid(f.du, f.au)}.`;
  return { ferme, reprise: f.reprise ? `Reopening on ${dateSaid(f.reprise)}.` : null };
}
