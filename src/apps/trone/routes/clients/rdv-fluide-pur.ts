/* ══ LE « + RDV » EN TROIS QUESTIONS — 24 octobre 2026 ═══════════════
   « Create a smart and intelligent system to make appointments. There are
   too many info and it must be easy to navigate and smart ready » (Yéman).
   Maquette https://claude.ai/artifact/X5FzkB4mZN57y83JdS3DUJ
   (`public/maquette-prendre-un-rendez-vous.html`), ses arbitrages :

   1. QUI, QUOI, QUAND, puis « Plus d'options » : une rangée ouverte à la
      fois, chaque rangée fermée garde son résumé, une barre collante en bas.
   2. LA SEMAINE DIRECTEMENT : « Quand » ouvre la semaine de son jour de
      reprise, ses places libres jour par jour, pour la durée de sa tête.
   3. UNE HEURE PRISE SE POSE QUAND MÊME, la raison dite en cuivre ; seul le
      plafond des fauteuils bloque, comme sur le site.
   4. CRÉER ET MODIFIER ensemble : un rendez-vous relu s'ouvre replié.
   5. UNE SEULE CASE en tête : un nom, un numéro ou une prestation.

   LES PLACES SE COMPTENT AUX FAUTEUILS. Le maître d'un rendez-vous est
   souvent un calendrier commun (« Team ») qui tient plusieurs fauteuils à la
   fois : le juger pris dès qu'il reçoit une cliente fermerait la Maison au
   premier rendez-vous du jour. Le maître pris se DIT, il ne ferme rien, et
   le Trône ne change jamais de maître tout seul.

   Le moteur est celui du site et de Ma Couronne (`creneauxLibres`), sans les
   plafonds du jour : le comptoir n'est pas bridé. Sans magasin ni React :
   `scripts/verifie-le-rdv-fluide` l'éprouve. */

import { creneauxLibres, hhmmDeMinutes, minutesDeHhmm, type FenetreDuJour } from '../../../../shared/agenda-pur';

/** Ce qui occupe un fauteuil ce jour-là : un rendez-vous non annulé, autre que
    celui qu'on relit. `qui` sert seulement à dire la raison. */
export type Occupant = { maitre: string; debutMin: number; dureeMin: number; qui?: string };
export type Plage = readonly [number, number];

/** La grille des places : la demi-heure, comme la liste des heures du Trône. */
export const PAS_DES_PLACES_MIN = 30;

/* Un maître que personne ne porte : les places ne se jugent pas au maître
   (voir l'en-tête), et un rendez-vous ancien sans maître (« ») ne doit pas
   passer pour le sien. */
const PERSONNE = '\u0000personne';

const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const ajouteJours = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDe(d);
};
export const lundiDe = (iso: string): string => ajouteJours(iso, -((new Date(`${iso}T12:00:00`).getDay() + 6) % 7));
export const septJours = (debut: string): string[] => Array.from({ length: 7 }, (_, i) => ajouteJours(debut, i));

/** LE JOUR AUTOUR DUQUEL LA SEMAINE S'OUVRE : celui du rendez-vous (relu, ou
    la case de l'agenda d'où l'on vient), sinon son jour de reprise s'il est
    devant nous, sinon aujourd'hui. */
export function ancreDeLaSemaine(e: { dateDuRdv?: string; reprise?: string | null; aujourdhui: string }): string {
  if (e.dateDuRdv) return e.dateDuRdv;
  if (e.reprise && e.reprise >= e.aujourdhui) return e.reprise;
  return e.aujourdhui;
}

/** LE PREMIER JOUR MONTRÉ : le lundi de la semaine de l'ancre. À la création,
    jamais avant aujourd'hui (on ne propose pas un jour passé) ; un rendez-vous
    relu montre sa semaine entière, même ancienne. */
export function debutDeLaSemaine(ancre: string, aujourdhui: string, edition: boolean): string {
  const lundi = lundiDe(ancre);
  return !edition && lundi < aujourdhui ? aujourdhui : lundi;
}

export type JourDesPlaces = { iso: string; ferme: boolean; passe: boolean; heures: string[] };

/** LES PLACES D'UN JOUR : les heures de départ où un fauteuil reste libre
    pendant toute la durée de sa tête, dans l'ouverture, hors des murs posés
    pour son maître, et pas déjà passées. */
export function placesDuJour(o: {
  iso: string;
  aujourdhui: string;
  maintenantMin: number;
  ouverture: FenetreDuJour;
  durationMin: number;
  occupes: readonly Occupant[];
  bloques: readonly Plage[];
  sieges: number;
  pasMin?: number;
}): JourDesPlaces {
  const passe = o.iso < o.aujourdhui;
  if (o.ouverture.closed || passe) return { iso: o.iso, ferme: o.ouverture.closed, passe, heures: [] };
  const heures = creneauxLibres({
    opening: o.ouverture,
    durationMin: Math.max(15, Math.round(o.durationMin)),
    occupes: o.occupes,
    bloques: o.bloques,
    master: PERSONNE,
    capSimultane: Math.max(0, Math.floor(o.sieges)),
    maintenantMin: o.iso === o.aujourdhui ? o.maintenantMin : null,
    pasMin: o.pasMin ?? PAS_DES_PLACES_MIN,
  });
  return { iso: o.iso, ferme: false, passe: false, heures };
}

export type Raison = { bloque: boolean; texte: string };

/** CE QUE L'HEURE CHOISIE DOIT DIRE. Les fauteuils pleins bloquent ; le reste
    (jour fermé, hors des heures, créneau bloqué, maître qui reçoit déjà) se
    dit en cuivre et se pose quand même. Rien à dire : `null`. */
export function raisonDeLHeure(o: {
  heure: string;
  durationMin: number;
  maitre: string;
  ouverture: FenetreDuJour;
  occupes: readonly Occupant[];
  bloques: readonly Plage[];
  sieges: number;
  /** « mercredi 28 octobre 2026 » : la date se dit avec son année. */
  jourDit: string;
  /** La première place libre de ce jour, pour proposer une issue. */
  premiereLibre?: string | null;
}): Raison | null {
  const debut = minutesDeHhmm(o.heure);
  const fin = debut + Math.max(15, Math.round(o.durationMin));
  const ensemble = o.occupes.filter((a) => debut < a.debutMin + a.dureeMin && fin > a.debutMin);
  const sieges = Math.max(0, Math.floor(o.sieges));
  if (sieges > 0 && ensemble.length >= sieges) {
    const plein = sieges === 1 ? 'Le fauteuil est occupé' : `Les ${sieges} fauteuils sont occupés`;
    const issue = o.premiereLibre ? ` Première place libre ce jour-là : ${o.premiereLibre}.` : ' Plus aucune place ce jour-là.';
    return { bloque: true, texte: `${plein} le ${o.jourDit} à ${o.heure} : cette heure ne se pose pas.${issue}` };
  }
  const dits: string[] = [];
  if (o.ouverture.closed) {
    dits.push(`La Maison est fermée le ${o.jourDit}.`);
  } else if (debut < o.ouverture.openMin || fin > o.ouverture.closeMin) {
    dits.push(`Hors des heures d’ouverture : la Maison ouvre de ${hhmmDeMinutes(o.ouverture.openMin)} à ${hhmmDeMinutes(o.ouverture.closeMin)}, le rituel irait de ${o.heure} à ${hhmmDeMinutes(fin)}.`);
  }
  if (o.bloques.some(([s, e]) => debut < e && fin > s)) {
    dits.push(`Un créneau est bloqué au planning à cette heure${o.maitre ? ` pour ${o.maitre}` : ''}.`);
  }
  const chezLui = o.maitre ? ensemble.filter((a) => a.maitre === o.maitre).sort((a, b) => a.debutMin - b.debutMin) : [];
  if (chezLui.length) {
    const a = chezLui[0];
    dits.push(`${o.maitre} reçoit déjà ${a.qui || 'une cliente'} de ${hhmmDeMinutes(a.debutMin)} à ${hhmmDeMinutes(a.debutMin + a.dureeMin)}${chezLui.length > 1 ? `, et ${chezLui.length - 1} autre${chezLui.length > 2 ? 's' : ''}` : ''}.`);
  }
  if (!dits.length) return null;
  return { bloque: false, texte: `${dits.join(' ')} Le rendez-vous se pose quand même.` };
}

/** LE BLOCAGE NE VAUT QUE POUR CE QUI BOUGE. Un rendez-vous relu qui garde
    son jour, son heure et sa durée s'enregistre toujours : corriger une note
    ne bute pas sur un plafond. Un rendez-vous annulé ne prend aucun fauteuil. */
export function bloqueLaPose(e: {
  raison: Raison | null;
  statut: string;
  date: string;
  time: string;
  dureeMin: number;
  relu?: { date: string; time: string; dureeMin: number };
}): boolean {
  if (!e.raison?.bloque || e.statut === 'annulé') return false;
  if (!e.relu) return true;
  return e.relu.date !== e.date || e.relu.time !== e.time || e.dureeMin > e.relu.dureeMin;
}

export type Rangee = 'qui' | 'quoi' | 'quand' | 'plus' | '';

/** LA RANGÉE À OUVRIR : la première question sans réponse. Tout est répondu,
    tout se replie et la barre dit le rendez-vous. */
export function rangeeSuivante(e: { qui: boolean; quoi: boolean; quand: boolean }): Rangee {
  if (!e.qui) return 'qui';
  if (!e.quoi) return 'quoi';
  if (!e.quand) return 'quand';
  return '';
}

/** CE QUI RESTE À DIRE, dans la barre. Rien ne manque : `null`. */
export function ceQuiReste(e: { qui: boolean; quoi: boolean; quand: boolean }): string | null {
  const manque = [!e.qui && 'la cliente', !e.quoi && 'les prestations', !e.quand && 'le moment']
    .filter((x): x is string => !!x);
  if (!manque.length) return null;
  if (manque.length === 1) return `Reste : ${manque[0]}.`;
  return `Reste : ${manque.slice(0, -1).join(', ')}, puis ${manque[manque.length - 1]}.`;
}

/** LA CASE UNIQUE TROUVE AUSSI LES PRESTATIONS : deux lettres au moins, pas
    un numéro (des chiffres cherchent une cliente), au plus six réponses. */
export function prestationsDeLaCase<T extends { id: string; name: string }>(
  q: string,
  proposables: readonly T[],
  repond: (sv: T, q: string) => boolean,
  dejaPosees: readonly string[],
): T[] {
  const t = q.trim();
  if (t.length < 2 || /^[\d\s+().-]+$/.test(t)) return [];
  return proposables.filter((sv) => !dejaPosees.includes(sv.id) && repond(sv, t)).slice(0, 6);
}
