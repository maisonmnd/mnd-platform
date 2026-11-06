import type { LigneDeSeances, ReleveDuContrat, SeanceDuContrat } from './abonnee-pur';

/* ══ LE CHEMIN DE SCEAUX · 6 novembre 2026 ════════════════════════════════
   « L'abonnement : à revisiter. Toutes ses pages et toutes ses rubriques […]
   pro, intelligente, structurée et facile à suivre » (Yéman ; maquette
   `public/maquette-l-abonnement-refait.html`, « construis » le 6 novembre).

   UN SCEAU PAR SÉANCE, DANS L'ORDRE OÙ ELLE LES VIT. La barre d'hier rangeait
   les séances par matière : on y lisait un compte, pas un parcours. Le chemin
   les pose à leur date, puis les disponibles : elle voit où elle en est sans
   rien compter.

   PAS DE SCEAU « MANQUÉE » (6 novembre 2026, Yéman : « On ne perd pas les
   séances qu'on a manquées, donc je préfère ne même pas comptabiliser.
   J'annule et je reprogramme seulement. ») : une séance annulée ou absente
   revient à la formule, son sceau reste disponible.

   RIEN NE SE RECOMPTE ICI. Le nombre de sceaux de chaque matière est celui du
   relevé (`LigneDeSeances` : faites, réservées, disponibles), les
   mêmes chiffres que la légende écrite dessous. Les séances datées
   (`attribuees`) ne donnent que l'ORDRE et la date : si un jour elles ne
   disaient pas le même compte que la ligne, le chemin reprendrait l'ordre
   d'hier, par matière, plutôt que de contredire la légende.

   « PERDUE » N'EST PAS UN ÉTAT DU JUGE : c'est l'écran qui sait que la formule
   est terminée, et qui le dit en appelant. */

export type EtatDuPas = 'faite' | 'reservee' | 'disponible' | 'perdue';

export type Pas = {
  /** Son rang sur le chemin, à partir de 1. */
  n: number;
  etat: EtatDuPas;
  /** Le rendez-vous, sa date et son heure : seulement pour une séance réelle. */
  id?: string;
  date?: string;
  time?: string;
};

/** Au-delà, un chemin ne se lit plus d'un coup d'œil : la page dit le compte en mots. */
export const PLUS_LONG_CHEMIN = 12;

/** La matière d'une séance qui compte : faite, ou encore à venir. */
export const etatDuPas = (s: Pick<SeanceDuContrat, 'etat'>): EtatDuPas =>
  (s.etat === 'faite' ? 'faite' : 'reservee');

/** Le chemin d'une prestation de la formule. `null` : sans limite, donc sans chemin. */
export function cheminDeLaLigne(
  c: Pick<ReleveDuContrat, 'attribuees'>,
  l: LigneDeSeances,
  perdue: boolean,
): Pas[] | null {
  if (l.incluses === null) return null;
  const total = Math.max(0, l.incluses);
  const reelles = c.attribuees.filter((s) => s.compte && l.seances.includes(s.id));
  const compte = (e: EtatDuPas) => reelles.filter((s) => etatDuPas(s) === e).length;
  const daccord = compte('faite') === l.faites && compte('reservee') === l.reservees;
  const pas: Pas[] = [];
  if (daccord) {
    for (const s of reelles) pas.push({ n: pas.length + 1, etat: etatDuPas(s), id: s.id, date: s.date, time: s.time });
  } else {
    for (let i = 0; i < l.faites; i += 1) pas.push({ n: pas.length + 1, etat: 'faite' });
    for (let i = 0; i < l.reservees; i += 1) pas.push({ n: pas.length + 1, etat: 'reservee' });
  }
  /* Jamais plus de sceaux que de séances vendues : un dépassement est une
     anomalie que le Trône montre, pas la cliente. */
  pas.length = Math.min(pas.length, total);
  while (pas.length < total) pas.push({ n: pas.length + 1, etat: perdue ? 'perdue' : 'disponible' });
  return pas;
}
