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
    la case de l'agenda d'où l'on vient), sinon AUJOURD'HUI.

    24 octobre 2026 : « la date d'aujourd'hui doit être proposée
    automatiquement quand on ouvre Quand ? » (Yéman). La semaine s'ouvrait sur
    son jour de reprise ; il reste dit (et marqué quand il tombe dans la
    semaine montrée), il n'ouvre plus la semaine. */
export function ancreDeLaSemaine(e: { dateDuRdv?: string; reprise?: string | null; aujourdhui: string }): string {
  return e.dateDuRdv || e.aujourdhui;
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

/** CE QUE L'HEURE CHOISIE DOIT DIRE. Les fauteuils pleins arrêtent la pose
    tant que la main n'a pas dit « Poser quand même » (24 octobre 2026, voir
    `bloqueLaPose`) ; le reste (jour fermé, hors des heures, créneau bloqué,
    maître qui reçoit déjà) se dit en cuivre et se pose quand même. Rien à
    dire : `null`. */
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
    return { bloque: true, texte: `${plein} le ${o.jourDit} à ${o.heure} : cette heure est pleine.${issue}` };
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
    ne bute pas sur un plafond. Un rendez-vous annulé ne prend aucun fauteuil.

    LA MAIN DU TRÔNE PASSE OUTRE — 24 octobre 2026 : « même s'il n'y a pas de
    place à une heure donnée, au Trône on peut réserver cette heure et pouvoir
    overwrite l'horaire » (Yéman). « Poser quand même » (`force`) lève le
    blocage ; les portes en ligne, elles, n'ont pas cette main
    (`PLACES_EN_LIGNE`). */
export function bloqueLaPose(e: {
  raison: Raison | null;
  statut: string;
  date: string;
  time: string;
  dureeMin: number;
  relu?: { date: string; time: string; dureeMin: number };
  force?: boolean;
}): boolean {
  /* UN RITUEL HONORÉ A EU LIEU — 24 octobre 2026. « Les règlements ne
     s'ouvrent pas dans le rendez-vous » (Yéman, sur un SÍNSIN du 28 mars
     2025) : relu, sa durée recalculée dépassait celle d'alors, les deux
     fauteuils de ce matin-là se déclaraient pleins, et l'enregistrement qui
     précède l'ouverture des règlements était refusé. Les fauteuils d'un
     rituel passé ne se rejugent pas. */
  if (e.force || !e.raison?.bloque || e.statut === 'annulé' || e.statut === 'honoré') return false;
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

/* ══ LA MAISON PROPOSE — 28 octobre 2026 ═══════════════════════════════
   « La prise de RDV qui, quoi, quand ne nous convient toujours pas »,
   « simplifié, interactif », « et toujours smart ready » (Yéman). Maquette
   https://claude.ai/artifact/HAgAvCcszQjS1CK8CLPbHN, ses arbitrages : trois
   propositions en tête, la fenêtre au centre, la confirmation WhatsApp
   cochée d'office, le même écran pour modifier.

   Trois rendez-vous tout prêts, chacun sur une place libre aux fauteuils :
   À SA DATE (sa reprise ; un jour fermé ou complet passe au suivant), LE
   PLUS TÔT, SON JOUR (celui où elle vient le plus souvent). Une heure
   habituelle prend la place la plus proche. Deux propositions au même
   moment n'en font qu'une ; une nouvelle venue reçoit les jours suivants. */
export type Proposition = { cle: 'date' | 'tot' | 'jour' | 'autre'; titre: string; iso: string; heure: string; pourquoi: string };

/** Le jour de la semaine d'une date, 0 = dimanche. */
export const jourDeLaSemaine = (iso: string): number => new Date(`${iso}T12:00:00`).getDay();

/** SON HEURE : celle qui revient le plus dans ses venues ; à égalité, la plus
    récente. Aucune venue : `null`. */
export function heureHabituelle(venues: readonly { date: string; time?: string }[]): string | null {
  const compte = new Map<string, { n: number; dernier: string }>();
  for (const v of venues) {
    if (!v.time || !/^\d{2}:\d{2}$/.test(v.time)) continue;
    const c = compte.get(v.time);
    if (!c) compte.set(v.time, { n: 1, dernier: v.date });
    else { c.n += 1; if (v.date > c.dernier) c.dernier = v.date; }
  }
  let mieux: [string, { n: number; dernier: string }] | null = null;
  for (const e of compte) {
    if (!mieux || e[1].n > mieux[1].n || (e[1].n === mieux[1].n && e[1].dernier > mieux[1].dernier)) mieux = e;
  }
  return mieux ? mieux[0] : null;
}

/** La place la plus proche d'une heure voulue ; sans heure, la première. */
export function placeLaPlusProche(heures: readonly string[], voulue?: string | null): string | null {
  if (!heures.length) return null;
  if (!voulue) return heures[0];
  const cible = minutesDeHhmm(voulue);
  return [...heures].sort((a, b) => Math.abs(minutesDeHhmm(a) - cible) - Math.abs(minutesDeHhmm(b) - cible) || minutesDeHhmm(a) - minutesDeHhmm(b))[0];
}

export function propositionsDuRdv(o: {
  aujourdhui: string;
  /** Les places libres d'un jour pour la durée de sa tête ; vide quand il est fermé, complet ou passé. */
  placesDe: (iso: string) => { ferme: boolean; heures: readonly string[] };
  reprise?: string | null;
  heureHabituelle?: string | null;
  /** Son jour, 0 = dimanche ; `null` quand ses venues ne le disent pas. */
  jourHabituel?: number | null;
  /** « lundi 2 novembre 2026 » */
  jourDit: (iso: string) => string;
  /** « samedi » */
  nomDuJour: (jour: number) => string;
  horizonJours?: number;
}): Proposition[] {
  const horizon = o.horizonJours ?? 42;
  const lues = new Map<string, { ferme: boolean; heures: readonly string[] }>();
  const places = (iso: string) => { let p = lues.get(iso); if (!p) { p = o.placesDe(iso); lues.set(iso, p); } return p; };
  const premierJour = (debut: string, garde: (iso: string) => boolean = () => true): string | null => {
    for (let i = 0; i <= horizon; i += 1) {
      const iso = ajouteJours(debut, i);
      if (iso < o.aujourdhui) continue;
      if (places(iso).heures.length > 0 && garde(iso)) return iso;
    }
    return null;
  };
  const props: Proposition[] = [];
  const pose = (p: Omit<Proposition, 'heure'> & { heure: string | null }) => {
    if (!p.heure || props.length >= 3) return;
    if (props.some((x) => x.iso === p.iso && x.heure === p.heure)) return;
    props.push({ ...p, heure: p.heure });
  };
  const sonHeure = (iso: string) => placeLaPlusProche(places(iso).heures, o.heureHabituelle);

  const reprise = o.reprise && /^\d{4}-\d{2}-\d{2}$/.test(o.reprise) ? o.reprise : null;
  if (reprise && reprise >= o.aujourdhui) {
    const iso = premierJour(reprise);
    if (iso) {
      const pourquoi = iso === reprise
        ? (o.heureHabituelle ? 'Le jour de sa reprise, à son heure.' : 'Le jour de sa reprise.')
        : `Sa reprise tombe le ${o.jourDit(reprise)}, ${places(reprise).ferme ? 'jour de fermeture' : 'complet'} : la place suivante.`;
      pose({ cle: 'date', titre: 'À sa date', iso, heure: sonHeure(iso), pourquoi });
    }
  }
  const tot = premierJour(o.aujourdhui);
  /* Sa date est déjà le premier jour libre : elle dit aussi « le plus tôt ». */
  if (tot && !props.some((p) => p.iso === tot)) {
    pose({
      cle: 'tot', titre: 'Le plus tôt', iso: tot, heure: places(tot).heures[0] ?? null,
      pourquoi: reprise && reprise < o.aujourdhui ? `Sa reprise était due le ${o.jourDit(reprise)} : la première place libre.` : 'La première place libre.',
    });
  }
  if (o.jourHabituel !== null && o.jourHabituel !== undefined) {
    const j = o.jourHabituel;
    const iso = premierJour(o.aujourdhui, (x) => jourDeLaSemaine(x) === j && !props.some((p) => p.iso === x));
    if (iso) pose({ cle: 'jour', titre: `Son ${o.nomDuJour(j)}`, iso, heure: sonHeure(iso), pourquoi: `Elle vient le plus souvent le ${o.nomDuJour(j)}.` });
  }
  /* Une nouvelle venue, ou des habitudes qui ne donnent qu'une place : les
     jours suivants, chacun à sa première place. */
  let depuis = props.length ? [...props].sort((a, b) => b.iso.localeCompare(a.iso))[0].iso : o.aujourdhui;
  while (props.length < 3) {
    const iso = premierJour(ajouteJours(depuis, 1), (x) => !props.some((p) => p.iso === x));
    if (!iso) break;
    pose({ cle: 'autre', titre: 'Un autre jour', iso, heure: sonHeure(iso), pourquoi: 'Si les autres dates ne lui vont pas.' });
    depuis = iso;
  }
  return props;
}
