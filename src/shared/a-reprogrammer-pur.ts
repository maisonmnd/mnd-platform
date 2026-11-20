/* À REPROGRAMMER — 19 novembre 2026.

   « Quand elle a déjà dit qu'elle a une contrainte, il faut absolument qu'on
   mette ce rendez-vous-là en attente… Il ne peut plus rester en confirmé en
   attendant une nouvelle date, ni annuler, mais il faut libérer la place »
   (Yéman, devant une cliente qui ne pouvait plus venir le lendemain).
   Maquette https://claude.ai/artifact/7YX7UtCFusPMJdrjJtfcQr, « construis ».

   CE QUI EST TRANCHÉ :
     · le rendez-vous empêché passe « à reprogrammer » : sa place se rend
       aussitôt, il quitte la grille du Calendrier, il n'est pas annulé ;
     · Opale propose TROIS DATES EN BOUTONS ; le toucher vaut son oui. Une
       autre date, elle l'écrit ;
     · ELLE NE REPART JAMAIS SANS RENDEZ-VOUS (WhatsApp, report ou première
       réservation) : son heure ; sinon une place libre dans l'heure qui suit ;
       sinon, dans l'heure, chez une autre personne de la Maison, au-delà des
       fauteuils, jamais deux têtes de plus de 150 locks ensemble chez Team ;
       l'équipe en est prévenue, la cliente aussi (« la Maison sera un peu
       pleine ») ;
     · « Changer l'heure » libère la place tout de suite ; la veille au soir et
       le jour même, la même règle ;
     · UNE RELANCE INTELLIGENTE, une fois, vers la 23e heure après son dernier
       message (avant que WhatsApp ne ferme la conversation), entre 8 h et
       21 h : trois NOUVELLES dates, choisies selon ce qu'elle a dit, ses
       habitudes, puis la date perdue ; au 7e jour sans choix, l'équipe.

   LE STATUT TECHNIQUE EST « annulé », LA MARQUE DIT LE RESTE. C'est le
   précédent de la place libérée (`placeLibereeLe`, rendez-vous-en-attente-pur) :
   tout ce qui compte une place (creneaux_occupes, les verrous, les rappels,
   les confirmations) ignore déjà un rendez-vous annulé, et aucun message ne
   part à la cliente sur un changement de statut. Les écrans, eux, lisent
   `estAReprogrammer` et disent « À reprogrammer », jamais « Annulé ».

   Entre ses repères ⟨a-reprogrammer⟩, ce module se recopie tel quel dans
   whatsapp-automate (banc des douze lunes, R8). Il ne dépend de rien. */

/* ⟨a-reprogrammer⟩ */
/** Qui l'a mis à reprogrammer : Opale (elle a prévenu), la cliente (« Changer
    l'heure »), le Trône (l'équipe, au téléphone). */
export type ParQuiLeReport = 'opale' | 'cliente' | 'trone';

/** Ce que les règles lisent d'un rendez-vous, sans rien croire. */
export type MarquesDuReport = {
  status?: unknown;
  aReprogrammerDepuis?: unknown;
  aReprogrammerPar?: unknown;
  placesProposees?: unknown;
  relanceDuReportLe?: unknown;
  /** La dernière relance (le modèle du 7e jour) et son « Plus tard ». */
  derniereRelanceDuReportLe?: unknown;
  refusDuReportLe?: unknown;
};

const ecritLe = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

/** Ni confirmé ni annulé : sa place est rendue, il attend sa nouvelle date. */
export function estAReprogrammer(a: MarquesDuReport | null | undefined): boolean {
  return !!a && a.status === 'annulé' && ecritLe(a.aReprogrammerDepuis);
}

/** Ce que le report écrit. La date, l'heure, les soins, le maître et
    l'acompte restent : ils disent ce qu'il faut reposer. */
export function marquesDuReport(maintenantMs: number, par: ParQuiLeReport): {
  status: 'annulé'; aReprogrammerDepuis: string; aReprogrammerPar: ParQuiLeReport;
} {
  return { status: 'annulé', aReprogrammerDepuis: new Date(maintenantMs).toISOString(), aReprogrammerPar: par };
}

/** Les marques que la reprise (une nouvelle date) efface. */
export const CLES_DU_REPORT: readonly string[] = ['aReprogrammerDepuis', 'aReprogrammerPar', 'placesProposees', 'relanceDuReportLe', 'derniereRelanceDuReportLe', 'refusDuReportLe'];

/** Le rendez-vous sans ses marques de report (pour une écriture). */
export function sansLeReport<T extends Record<string, unknown>>(a: T): T {
  const copie: Record<string, unknown> = { ...a };
  for (const k of CLES_DU_REPORT) delete copie[k];
  return copie as T;
}

/** La relance part vers la 23e heure après son dernier message. */
export const RELANCE_DU_REPORT_APRES_MS = 23 * 3_600_000;
/** LA DERNIÈRE RELANCE (20 novembre 2026, Yéman : « une dernière relance sept
    jours plus tard… sans embêter le client ») : le 7e jour, le matin, par un
    modèle Meta en deux temps (« Voir des dates », « Plus tard »), une fois. */
export const DERNIERE_RELANCE_DU_REPORT_APRES_MS = 7 * 86_400_000;
export const DERNIERE_RELANCE_DE_MIN = 10 * 60;
export const DERNIERE_RELANCE_A_MIN = 12 * 60;
/** Le modèle Meta de la dernière relance : {{1}} l'appel, deux réponses rapides. */
export const MODELE_DE_LA_DERNIERE_RELANCE = 'rdv_a_reprogrammer';
/** L'équipe : 48 heures après la dernière relance, ou au 9e jour quand elle
    n'a pas pu partir. Jamais annulé tout seul. */
export const EQUIPE_APRES_LA_DERNIERE_MS = 48 * 3_600_000;
export const EQUIPE_DU_REPORT_APRES_MS = 9 * 86_400_000;
/** WhatsApp ferme une conversation 24 h après son dernier message. */
export const FENETRE_DU_REPORT_MS = 24 * 3_600_000;
/** On ne relance pas dans le dernier quart d'heure de la fenêtre. */
export const MARGE_DU_REPORT_MS = 15 * 60_000;
/** Jamais moins de six heures après ce qu'elle a écrit. */
export const RELANCE_DU_REPORT_AU_PLUS_TOT_MS = 6 * 3_600_000;
/** De 8 h à 21 h, à Cotonou. */
export const RELANCE_DU_REPORT_DE_MIN = 8 * 60;
export const RELANCE_DU_REPORT_A_MIN = 21 * 60;

/** Les minutes du jour à Cotonou (UTC+1, sans heure d'été). */
const minutesACotonouDuReport = (ms: number): number => {
  const d = new Date(ms + 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

export type EtatDuReport = 'attend' | 'relancee' | 'derniere' | 'plus-tard' | 'equipe';

/** Où en est le report : il attend son choix, il a été relancé (le
    lendemain, puis la dernière relance du 7e jour), elle a dit « Plus tard »,
    ou il est à l'équipe (48 heures après la dernière relance, ou au 9e jour).
    `null` : pas à reprogrammer. */
export function etatDuReport(a: MarquesDuReport | null | undefined, maintenantMs: number): EtatDuReport | null {
  if (!estAReprogrammer(a)) return null;
  if (ecritLe(a!.refusDuReportLe)) return 'plus-tard';
  const depuis = Date.parse(String(a!.aReprogrammerDepuis));
  const derniere = Date.parse(String(a!.derniereRelanceDuReportLe ?? ''));
  if (Number.isFinite(derniere) && maintenantMs - derniere >= EQUIPE_APRES_LA_DERNIERE_MS) return 'equipe';
  if (Number.isFinite(depuis) && maintenantMs - depuis >= EQUIPE_DU_REPORT_APRES_MS) return 'equipe';
  if (Number.isFinite(derniere)) return 'derniere';
  return ecritLe(a!.relanceDuReportLe) ? 'relancee' : 'attend';
}

/** LA DERNIÈRE RELANCE EST-ELLE DUE ? Le 7e jour après le report, entre 10 h
    et 12 h à Cotonou, une fois ; jamais si elle a dit « Plus tard », ni si
    elle a écrit dans les dernières 24 heures (la conversation vit : Opale y
    répond). Le « stop » de sa fiche se juge à côté. */
export function derniereRelanceDuReportDue(o: {
  a: MarquesDuReport; dernierEntrantMs: number | null; maintenantMs: number;
}): boolean {
  if (!estAReprogrammer(o.a) || ecritLe(o.a.derniereRelanceDuReportLe) || ecritLe(o.a.refusDuReportLe)) return false;
  const depuis = Date.parse(String(o.a.aReprogrammerDepuis));
  if (!Number.isFinite(depuis) || o.maintenantMs - depuis < DERNIERE_RELANCE_DU_REPORT_APRES_MS) return false;
  if (o.dernierEntrantMs !== null && o.maintenantMs - o.dernierEntrantMs < FENETRE_DU_REPORT_MS) return false;
  const m = minutesACotonouDuReport(o.maintenantMs);
  return m >= DERNIERE_RELANCE_DE_MIN && m < DERNIERE_RELANCE_A_MIN;
}

/** Les deux réponses du modèle : « Voir des dates », « Plus tard ». */
export type GesteDuReport = 'dates' | 'plus-tard';
export const idDuBoutonDuReport = (geste: GesteDuReport, rdvId: string): string => `MND:report|${geste}|${rdvId}`.slice(0, 256);
export function lisLeBoutonDuReport(id: unknown): { geste: GesteDuReport; rdv: string } | null {
  if (typeof id !== 'string') return null;
  const m = /^MND:report\|(dates|plus-tard)\|([A-Za-z0-9_.:-]{1,160})$/.exec(id);
  return m ? { geste: m[1] as GesteDuReport, rdv: m[2] } : null;
}

/** Le texte du modèle, tel que Meta l'approuve ({{1}} l'appel). Il ne finit
    pas par une variable. */
export const texteDeLaDerniereRelance = (appel: string): string =>
  `Bonjour ${appel}, votre rendez-vous vous attend toujours à la Maison MND. Souhaitez-vous que nous vous proposions de nouvelles dates ?`;

/** L'INSTANT DE LA RELANCE : 23 h après ce qu'elle a écrit en dernier (ou
    après le report, s'il est plus récent), avant la fin de la fenêtre de
    WhatsApp ; tombée la nuit, ramenée à 20 h 55. Trop près de ce qu'elle a
    écrit (moins de six heures) : pas de relance, l'équipe verra. */
export function momentDeLaRelanceDuReport(depuisMs: number, dernierEntrantMs: number): number | null {
  const base = Math.max(depuisMs, dernierEntrantMs);
  const fermeture = dernierEntrantMs + FENETRE_DU_REPORT_MS;
  let c = Math.min(base + RELANCE_DU_REPORT_APRES_MS, fermeture - MARGE_DU_REPORT_MS);
  const m = minutesACotonouDuReport(c);
  const soir = RELANCE_DU_REPORT_A_MIN - 5;
  if (m >= RELANCE_DU_REPORT_A_MIN) c -= (m - soir) * 60_000;
  else if (m < RELANCE_DU_REPORT_DE_MIN) c -= (m + 24 * 60 - soir) * 60_000;
  return c - base >= RELANCE_DU_REPORT_AU_PLUS_TOT_MS ? c : null;
}

/** LA RELANCE EST-ELLE DUE ? Une fois, au moment dit, de jour, la fenêtre
    encore ouverte. Sans message d'elle, pas de fenêtre : pas de boutons. */
export function relanceDuReportDue(o: {
  a: MarquesDuReport; dernierEntrantMs: number | null; maintenantMs: number;
}): boolean {
  if (!estAReprogrammer(o.a) || ecritLe(o.a.relanceDuReportLe) || o.dernierEntrantMs === null) return false;
  const depuis = Date.parse(String(o.a.aReprogrammerDepuis));
  if (!Number.isFinite(depuis)) return false;
  if (o.maintenantMs >= o.dernierEntrantMs + FENETRE_DU_REPORT_MS - MARGE_DU_REPORT_MS) return false;
  const quand = momentDeLaRelanceDuReport(depuis, o.dernierEntrantMs);
  if (quand === null || o.maintenantMs < quand) return false;
  const m = minutesACotonouDuReport(o.maintenantMs);
  return m >= RELANCE_DU_REPORT_DE_MIN && m < RELANCE_DU_REPORT_A_MIN;
}

/* ── LES BOUTONS ──────────────────────────────────────────────────────── */

/** Une place : un jour (AAAA-MM-JJ) et une heure (HH:MM). */
export type PlaceDuReport = { iso: string; heure: string };

const JOURS_COURTS_DU_REPORT = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const MOIS_COURTS_DU_REPORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ISO_DU_REPORT = /^(\d{4})-(\d{2})-(\d{2})$/;
const HEURE_DU_REPORT = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Lundi = 0 … dimanche = 6. */
export function rangDuJourDuReport(iso: string): number {
  const m = ISO_DU_REPORT.exec(iso);
  if (!m) return -1;
  return (new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() + 6) % 7;
}

/** « 18 h », « 8 h 30 ». */
export function heureDuReportDite(heure: string): string {
  const m = HEURE_DU_REPORT.exec(heure);
  if (!m) return heure;
  return `${Number(m[1])} h${m[2] === '00' ? '' : ` ${m[2]}`}`;
}

/** LE TITRE D'UN BOUTON : « Ven. 20 nov., 18 h » ; vingt signes au plus (la
    limite de WhatsApp), sinon « Mer. 30/09, 10 h 30 ». */
export function titreDuBoutonDePlace(p: PlaceDuReport): string {
  const m = ISO_DU_REPORT.exec(p.iso);
  if (!m) return heureDuReportDite(p.heure).slice(0, 20);
  const jour = JOURS_COURTS_DU_REPORT[rangDuJourDuReport(p.iso)] ?? '';
  const long = `${jour} ${Number(m[3])} ${MOIS_COURTS_DU_REPORT[Number(m[2]) - 1]}, ${heureDuReportDite(p.heure)}`;
  if (long.length <= 20) return long;
  return `${jour} ${m[3]}/${m[2]}, ${heureDuReportDite(p.heure)}`.slice(0, 20);
}

/** L'IDENTIFIANT D'UN BOUTON : « MND:place|r:<rendez-vous>|AAAA-MM-JJ|HH:MM »
    pour un rendez-vous à reposer, « MND:place|n:<fiche ou nouvelle>|… » pour
    une première réservation. « MND: » : la réception le confie à Opale
    (l'automate ne lit que ces boutons-là). */
export function idDuBoutonDePlace(cible: { rdv: string } | { pour: string }, p: PlaceDuReport): string {
  const qui = 'rdv' in cible ? `r:${cible.rdv}` : `n:${cible.pour}`;
  return `MND:place|${qui}|${p.iso}|${p.heure}`.slice(0, 256);
}

export type BoutonDePlaceLu = { rdv: string; pour?: undefined; place: PlaceDuReport } | { pour: string; rdv?: undefined; place: PlaceDuReport };

/** Le bouton touché, relu sans rien croire. */
export function lisLeBoutonDePlace(id: unknown): BoutonDePlaceLu | null {
  if (typeof id !== 'string') return null;
  const m = /^MND:place\|([rn]):([A-Za-z0-9_.:-]{1,160})\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})$/.exec(id);
  if (!m || !ISO_DU_REPORT.test(m[3]) || !HEURE_DU_REPORT.test(m[4])) return null;
  const place = { iso: m[3], heure: m[4] };
  return m[1] === 'r' ? { rdv: m[2], place } : { pour: m[2], place };
}

/** La clé d'une place, pour se souvenir de celles déjà proposées. */
export const cleDeLaPlaceDuReport = (p: PlaceDuReport): string => `${p.iso} ${p.heure}`;

/** Les places déjà proposées, relues. */
export function placesDejaProposees(a: MarquesDuReport | null | undefined): string[] {
  const l = a?.placesProposees;
  return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(x)).slice(-30) : [];
}

/* ── LES TROIS PLACES, CHOISIES POUR ELLE ─────────────────────────────── */

/** Ses habitudes : les jours qui reviennent (lundi = 0) et son heure (médiane). */
export type HabitudesDuReport = { jours: number[]; minutes: number | null };

const minutesDuReport = (heure: string): number => {
  const m = HEURE_DU_REPORT.exec(heure);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
};

/** Ses venues passées (honorées) disent ses habitudes : un jour qui revient
    au moins deux fois, son heure médiane. Une seule venue ne fait pas une
    habitude de jour. */
export function habitudesDuReport(venues: readonly { date?: unknown; time?: unknown }[]): HabitudesDuReport {
  const compte = new Map<number, number>();
  const minutes: number[] = [];
  for (const v of venues) {
    const iso = typeof v.date === 'string' ? v.date : '';
    const r = rangDuJourDuReport(iso);
    if (r < 0) continue;
    compte.set(r, (compte.get(r) ?? 0) + 1);
    const m = minutesDuReport(typeof v.time === 'string' ? v.time : '');
    if (Number.isFinite(m)) minutes.push(m);
  }
  const max = Math.max(0, ...compte.values());
  const jours = max >= 2 ? [...compte.entries()].filter(([, n]) => n === max).map(([r]) => r).sort() : [];
  minutes.sort((a, b) => a - b);
  return { jours, minutes: minutes.length ? minutes[Math.floor((minutes.length - 1) / 2)] : null };
}

export type MomentDuReport = 'matin' | 'apres-midi' | 'soir';
export const momentDuReport = (heure: string): MomentDuReport => {
  const m = minutesDuReport(heure);
  return m < 12 * 60 ? 'matin' : m < 17 * 60 ? 'apres-midi' : 'soir';
};

const JOURS_LONGS_DU_REPORT = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MOMENTS_DITS_DU_REPORT: Record<MomentDuReport, string> = { matin: 'matin', 'apres-midi': 'après-midi', soir: 'soir' };

/** « du samedi matin », « du samedi », ou rien : ce que la relance peut dire
    de ses habitudes, sans jamais inventer. */
export function habitudesDites(h: HabitudesDuReport): string {
  if (h.jours.length !== 1) return '';
  const jour = JOURS_LONGS_DU_REPORT[h.jours[0]];
  if (h.minutes === null) return `du ${jour}`;
  const heure = `${String(Math.floor(h.minutes / 60)).padStart(2, '0')}:${String(h.minutes % 60).padStart(2, '0')}`;
  return `du ${jour} ${MOMENTS_DITS_DU_REPORT[momentDuReport(heure)]}`;
}

const joursEntreDuReport = (a: string, b: string): number => {
  const x = ISO_DU_REPORT.exec(a);
  const y = ISO_DU_REPORT.exec(b);
  if (!x || !y) return 0;
  return Math.round((Date.UTC(+y[1], +y[2] - 1, +y[3]) - Date.UTC(+x[1], +x[2] - 1, +x[3])) / 86_400_000);
};

/** TROIS PLACES, CHOISIES POUR ELLE : jamais une déjà proposée ; d'abord le
    jour ou le moment qu'elle a dits, puis ses habitudes (son jour, son
    heure), puis la date perdue, au plus près ; trois jours différents quand
    c'est possible ; rendues dans l'ordre du temps. */
export function troisPlacesDuReport(candidats: readonly PlaceDuReport[], o: {
  deja?: readonly string[];
  perdue?: PlaceDuReport;
  habitudes?: HabitudesDuReport;
  souhait?: { jour?: string; moment?: MomentDuReport };
  combien?: number;
} = {}): PlaceDuReport[] {
  const deja = new Set(o.deja ?? []);
  const vues = new Set<string>();
  const libres = candidats.filter((p) => {
    const k = cleDeLaPlaceDuReport(p);
    if (deja.has(k) || vues.has(k) || !ISO_DU_REPORT.test(p.iso) || !HEURE_DU_REPORT.test(p.heure)) return false;
    vues.add(k);
    return true;
  });
  const note = (p: PlaceDuReport): number => {
    let s = 0;
    if (o.souhait?.jour && p.iso === o.souhait.jour) s += 60;
    if (o.souhait?.moment && momentDuReport(p.heure) === o.souhait.moment) s += 40;
    if (o.habitudes?.jours.includes(rangDuJourDuReport(p.iso))) s += 25;
    if (o.habitudes && o.habitudes.minutes !== null) s -= Math.min(20, Math.abs(minutesDuReport(p.heure) - o.habitudes.minutes) / 30);
    if (o.perdue) s -= Math.min(30, Math.abs(joursEntreDuReport(o.perdue.iso, p.iso)) * 2);
    return s;
  };
  const tries = libres
    .map((p, i) => ({ p, s: note(p), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const n = Math.max(1, Math.min(3, o.combien ?? 3));
  const choisies: PlaceDuReport[] = [];
  const jours = new Set<string>();
  for (const { p } of tries) {
    if (choisies.length >= n) break;
    if (jours.has(p.iso)) continue;
    choisies.push(p);
    jours.add(p.iso);
  }
  for (const { p } of tries) {
    if (choisies.length >= n) break;
    if (!choisies.includes(p)) choisies.push(p);
  }
  return choisies.sort((a, b) => cleDeLaPlaceDuReport(a).localeCompare(cleDeLaPlaceDuReport(b)));
}

/* ── ELLE NE REPART JAMAIS SANS RENDEZ-VOUS ────────────────────────────── */

/** Ce que sa demande donne : son heure ; des places dans l'heure qui suit ;
    une place dans l'heure, au-delà des fauteuils, chez une personne qui peut
    la recevoir ; ou rien (un jour fermé, hors des heures, ou aucune personne
    possible), et alors les places les plus proches. */
export type SuiteDeSaDemande =
  | { genre: 'son-heure'; heure: string; maitres: string[] }
  | { genre: 'dans-l-heure'; heures: string[] }
  | { genre: 'au-dela'; heure: string; maitre: string }
  | { genre: 'aucune' };

/** L'heure qui suit, au plus une heure plus tard, de demi-heure en demi-heure. */
export const DANS_L_HEURE_MIN = 60;
const hhmmDuReport = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** LA SUITE DE SA DEMANDE. Les juges sont donnés : `libre(heure)` rend les
    maîtres qui la tiennent selon les règles (fauteuils, deux têtes chez
    Team) ; `auDela(heure)` le maître qui peut la tenir au-delà des fauteuils
    (jamais deux têtes lourdes chez Team), ou `null`. */
export function suiteDeSaDemande(heure: string, juges: {
  libre: (heure: string) => readonly string[];
  auDela: (heure: string) => string | null;
}): SuiteDeSaDemande {
  const m0 = minutesDuReport(heure);
  if (!Number.isFinite(m0)) return { genre: 'aucune' };
  const ici = juges.libre(heure);
  if (ici.length > 0) return { genre: 'son-heure', heure, maitres: [...ici] };
  const heures: string[] = [];
  for (let d = 30; d <= DANS_L_HEURE_MIN; d += 30) {
    const h = hhmmDuReport(m0 + d);
    if (m0 + d < 24 * 60 && juges.libre(h).length > 0) heures.push(h);
  }
  if (heures.length > 0) return { genre: 'dans-l-heure', heures };
  for (let d = 0; d <= DANS_L_HEURE_MIN; d += 30) {
    if (m0 + d >= 24 * 60) break;
    const h = hhmmDuReport(m0 + d);
    const maitre = juges.auDela(h);
    if (maitre !== null) return { genre: 'au-dela', heure: h, maitre };
  }
  return { genre: 'aucune' };
}

/** La ligne de la Maison quand elle est pleine : la cliente est prévenue, le
    rendez-vous reste confirmé. */
export const MOT_DE_LA_MAISON_PLEINE = 'La Maison MND sera un peu pleine à ce moment-là ; nous vous recevons avec plaisir.';
/** La note pour l'équipe sur un rendez-vous posé au-delà des fauteuils. */
export const NOTE_AU_DELA_DES_FAUTEUILS = 'Posé au-delà des fauteuils : la Maison est pleine à cette heure, à organiser';
/* ⟨/a-reprogrammer⟩ */
