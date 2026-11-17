/* ══ LA VISIO DE QUINZE MINUTES — 13 novembre 2026 (la Consultation, lot 3) ══
   Maquette « La Consultation MND », onglet La visio (V1 à V4). « Prendre le
   RDV pour la visio, au bout de 15 min un minuteur se met en marche les 120
   dernières secondes et coupe la conversation à la fin » (Yéman).

   LE SERVEUR COUPE, PAS LE NAVIGATEUR. La salle est ouverte chez le service de
   visio avec une fin fixée d'avance (début du créneau + 15 minutes) ; à
   l'heure dite, il ferme la salle pour les deux côtés. Fermer l'onglet ou
   recharger n'y change rien.

   LA FIN SUIT LE CRÉNEAU, PAS L'ARRIVÉE : créneau de 10:15, fin à 10:30. Une
   cliente en retard a moins de temps ; la visio suivante n'est pas décalée.

   LE COMPTE À REBOURS EST LE MÊME DES DEUX CÔTÉS : la cliente et la Maison
   lisent l'heure du serveur (`maintenant` dans chaque réponse), pas celle de
   leur téléphone.

   MODULE PUR : la fonction `visio-salle` (regroupée par esbuild), Ma Couronne,
   le site et le Trône lisent les mêmes règles. Un seul import, pur lui
   aussi : le jeton du lien de réservation préparé (`lien-reservation`). */
import { jetonDuLien } from './lien-reservation';

/** Durée d'une visio, en minutes. */
export const DUREE_MIN = 15;
/** Le compte à rebours des deux dernières minutes, en secondes. */
export const COMPTE_A_REBOURS_S = 120;
/** La salle s'ouvre quelques minutes avant le créneau. */
export const AVANT_L_ENTREE_MIN = 5;
/** Cotonou vit à UTC+1 toute l'année. */
export const DECALAGE_DE_COTONOU_MS = 60 * 60_000;

/* ── LES RÉGLAGES (document `mnd_visio`, écrit par la direction) ────────── */

export type ReglagesDeLaVisio = {
  version: 1;
  /** La Maison propose-t-elle la visio ? (il faut aussi la clé du service de visio) */
  actif: boolean;
  /** Les jours ouverts : 1 = lundi … 7 = dimanche. */
  jours: number[];
  /** Les quarts d'heure ouverts, à l'heure de Cotonou (« 10:15 »). */
  heures: string[];
  /** Combien de jours à l'avance on propose. */
  horizonJours: number;
  /** Aucun créneau à moins de … minutes. */
  delaiMin: number;
  /** Visios par numéro, au plus, sur la période `limiteJours` (à venir comprises). */
  parTelephone: number;
  /** LA VISIO LIMITÉE (17 novembre 2026) : la période, en jours. 0 : seules les
      visios à venir comptent. */
  limiteJours: number;
  /** Changer l'heure, ou annuler sans que la visio compte : jusqu'à … minutes avant. */
  changementAvantMin: number;
  /** Changements d'heure par la cliente, au plus. */
  changementsMax: number;
  /** Inscrire chaque visio au Carnet. Son quart d'heure y prend alors une
      place, comme tout rendez-vous : éteint au départ. */
  auCarnet: boolean;
  /** La durée de la consultation privée au Carnet, en minutes. */
  priveeDureeMin: number;
  modifieLe?: string;
  modifiePar?: string;
};

export const REGLAGES_DE_DEPART = (): ReglagesDeLaVisio => ({
  version: 1,
  actif: false,
  jours: [2, 3, 4, 5, 6],
  heures: ['10:00', '10:15', '10:30', '10:45'],
  horizonJours: 7,
  delaiMin: 120,
  parTelephone: 1,
  limiteJours: 90,
  changementAvantMin: 120,
  changementsMax: 2,
  auCarnet: false,
  priveeDureeMin: 60,
});

const HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const entier = (x: unknown, min: number, max: number, defaut: number): number => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
};

/** Des réglages lus en base, rendus sûrs : rien d'étrange ne passe. */
export function reglagesSurs(x: unknown): ReglagesDeLaVisio {
  const d = REGLAGES_DE_DEPART();
  if (!x || typeof x !== 'object') return d;
  const o = x as Partial<Record<keyof ReglagesDeLaVisio, unknown>>;
  const jours = Array.isArray(o.jours)
    ? [...new Set(o.jours.map((j) => Math.round(Number(j))).filter((j) => j >= 1 && j <= 7))].sort((a, b) => a - b)
    : d.jours;
  const heures = Array.isArray(o.heures)
    ? [...new Set(o.heures.map(String).filter((h) => HEURE.test(h)))].sort()
    : d.heures;
  return {
    version: 1,
    actif: o.actif === true,
    jours,
    heures: heures.slice(0, 48),
    horizonJours: entier(o.horizonJours, 1, 30, d.horizonJours),
    delaiMin: entier(o.delaiMin, 0, 2880, d.delaiMin),
    parTelephone: entier(o.parTelephone, 1, 5, d.parTelephone),
    limiteJours: entier(o.limiteJours, 0, 365, d.limiteJours),
    changementAvantMin: entier(o.changementAvantMin, 0, 2880, d.changementAvantMin),
    changementsMax: entier(o.changementsMax, 0, 5, d.changementsMax),
    auCarnet: o.auCarnet === true,
    priveeDureeMin: entier(o.priveeDureeMin, 15, 240, d.priveeDureeMin),
    ...(typeof o.modifieLe === 'string' ? { modifieLe: o.modifieLe } : {}),
    ...(typeof o.modifiePar === 'string' ? { modifiePar: o.modifiePar } : {}),
  };
}

/* ── LES CRÉNEAUX ─────────────────────────────────────────────────────── */

export type Creneau = { debut: string; fin: string };

/** Le jour de Cotonou d'un instant (« 2026-11-17 »). */
export const jourDeCotonou = (ms: number): string => new Date(ms + DECALAGE_DE_COTONOU_MS).toISOString().slice(0, 10);

/** L'instant (ISO UTC) d'un jour de Cotonou à une heure « 10:15 ». */
export const instantDeCotonou = (jour: string, hhmm: string): string =>
  new Date(Date.parse(`${jour}T${hhmm}:00.000Z`) - DECALAGE_DE_COTONOU_MS).toISOString();

/** 1 = lundi … 7 = dimanche. */
export const jourDeLaSemaine = (jour: string): number => {
  const j = new Date(`${jour}T12:00:00Z`).getUTCDay();
  return j === 0 ? 7 : j;
};

const plusDesJours = (jour: string, n: number): string => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** La fin d'une visio qui commence à `debut`. */
export const finDe = (debut: string): string => new Date(Date.parse(debut) + DUREE_MIN * 60_000).toISOString();

/** Les créneaux libres, dans l'ordre : les jours et les quarts d'heure ouverts, moins ceux pris et ceux trop proches. */
export function creneauxOuverts(r: ReglagesDeLaVisio, maintenantMs: number, pris: readonly string[]): Creneau[] {
  const prisMs = new Set(pris.map((p) => Date.parse(p)));
  const premier = maintenantMs + r.delaiMin * 60_000;
  const aujourdhui = jourDeCotonou(maintenantMs);
  const tous: Creneau[] = [];
  for (let i = 0; i < r.horizonJours; i += 1) {
    const jour = plusDesJours(aujourdhui, i);
    if (!r.jours.includes(jourDeLaSemaine(jour))) continue;
    for (const h of r.heures) {
      const debut = instantDeCotonou(jour, h);
      const ms = Date.parse(debut);
      if (ms < premier || prisMs.has(ms)) continue;
      tous.push({ debut, fin: finDe(debut) });
    }
  }
  return tous;
}

/** Ce créneau est-il proposable à cet instant ? Le serveur le revérifie toujours. */
export const creneauValide = (r: ReglagesDeLaVisio, maintenantMs: number, pris: readonly string[], debut: string): boolean =>
  creneauxOuverts(r, maintenantMs, pris).some((c) => Date.parse(c.debut) === Date.parse(debut));

/** Les créneaux rangés par jour de Cotonou, pour le sélecteur. */
export function parJour(c: readonly Creneau[]): { jour: string; creneaux: Creneau[] }[] {
  const m = new Map<string, Creneau[]>();
  for (const x of c) {
    const j = jourDeCotonou(Date.parse(x.debut));
    m.set(j, [...(m.get(j) ?? []), x]);
  }
  return [...m.entries()].map(([jour, creneaux]) => ({ jour, creneaux }));
}

/* ── LES MOTS DE L'HEURE ──────────────────────────────────────────────── */

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 10:15 », à l'heure de Cotonou. */
export const heureDite = (iso: string): string => new Date(Date.parse(iso) + DECALAGE_DE_COTONOU_MS).toISOString().slice(11, 16);

/** « mardi 17 novembre 2026 », un jour de Cotonou. L'année toujours, sur une date montrée à une cliente. */
export function jourDit(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** « mar. 17 », pour un onglet de jour. */
export function jourCourtDit(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return `${JOURS_COURTS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** « novembre 2026 », un mois « 2026-11 » : le titre d'un calendrier. */
export function moisDit(mois: string): string {
  const d = new Date(`${mois}-01T12:00:00Z`);
  return `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Les cases d'un mois « 2026-11 », lundi en tête : des vides, puis ses jours (« 2026-11-01 »…). */
export function casesDuMois(mois: string): (string | null)[] {
  const premier = new Date(`${mois}-01T12:00:00Z`);
  const vides = (premier.getUTCDay() + 6) % 7;
  const n = new Date(Date.UTC(premier.getUTCFullYear(), premier.getUTCMonth() + 1, 0, 12)).getUTCDate();
  return [...Array.from({ length: vides }, () => null), ...Array.from({ length: n }, (_, i) => `${mois}-${String(i + 1).padStart(2, '0')}`)];
}

/** « mardi 17 novembre 2026 · 10:15 ». */
export const creneauDit = (debut: string): string => `${jourDit(jourDeCotonou(Date.parse(debut)))} · ${heureDite(debut)}`;

/** « 3:07 » : minutes et secondes. */
export function minutesSecondes(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** « dans 3 minutes », « dans 2 h 10 », « dans 4 jours ». */
export function attenteDite(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  if (min <= 1) return 'dans un instant';
  if (min < 60) return `dans ${min} minutes`;
  const h = Math.floor(min / 60);
  if (h < 24) return `dans ${h} h ${String(min % 60).padStart(2, '0')}`;
  const j = Math.round(h / 24);
  return j <= 1 ? 'demain' : `dans ${j} jours`;
}

/* ── OÙ EN EST LA VISIO ───────────────────────────────────────────────── */

/** attente : trop tôt · ouverte : on peut entrer · echange : de 0 à 13 min · rebours : les 120 dernières secondes · fermee. */
export type Phase = 'attente' | 'ouverte' | 'echange' | 'rebours' | 'fermee';

export function phaseDe(debutMs: number, finMs: number, maintenantMs: number): Phase {
  if (maintenantMs >= finMs) return 'fermee';
  if (maintenantMs >= finMs - COMPTE_A_REBOURS_S * 1000) return 'rebours';
  if (maintenantMs >= debutMs) return 'echange';
  if (maintenantMs >= debutMs - AVANT_L_ENTREE_MIN * 60_000) return 'ouverte';
  return 'attente';
}

/** Le résumé ne s'écrit qu'une fois la visio commencée (15 novembre 2026) : le
    14 au soir, un résumé posé sur une visio du mardi suivant l'a marquée
    « tenue » avant l'heure, et la cliente l'aurait reçu à la fin. Avant le
    début, il n'y a rien à résumer ; la base refuse aussi (0212). */
export const resumeOuvert = (phase: Phase): boolean => phase === 'echange' || phase === 'rebours' || phase === 'fermee';

/** Le temps écoulé depuis le début du créneau, borné à 0 et 15:00 (« 13:36 »). */
export const ecouleDit = (debutMs: number, maintenantMs: number): string =>
  minutesSecondes(Math.min(DUREE_MIN * 60, Math.max(0, (maintenantMs - debutMs) / 1000)));

/** Les secondes qui restent avant la fermeture. */
export const resteS = (finMs: number, maintenantMs: number): number => Math.max(0, Math.ceil((finMs - maintenantMs) / 1000));

/** La part de l'anneau encore allumée : 1 au début du compte à rebours, 0 à la fermeture. */
export const anneauAllume = (reste: number): number => Math.min(1, Math.max(0, reste / COMPTE_A_REBOURS_S));

/* ── LE LIEN D'ENTRÉE ─────────────────────────────────────────────────── */

export const FORME_DE_L_ID = /^vz-[a-z0-9]{6,24}$/;
export const FORME_DU_JETON = /^[A-Za-z0-9_-]{32}$/;
export const FORME_DE_LA_CONSULTATION = /^[A-Za-z0-9_-]{1,80}$/;

/** Le chemin (relatif à l'origine) de la salle : Ma Couronne, sans compte, par son jeton. */
export const cheminDeLaSalle = (id: string, jeton: string): string => `/couronne/#/visio/${id}.${jeton}`;

/** La salle demandée par le fragment de Ma Couronne, ou rien. */
export function salleDuFragment(hash: string): { id: string; jeton: string } | null {
  const m = /^#\/visio\/(vz-[a-z0-9]{6,24})\.([A-Za-z0-9_-]{32})$/.exec(hash.trim());
  return m ? { id: m[1], jeton: m[2] } : null;
}

/** Un numéro réduit à ses huit derniers chiffres : la même cliente, quel que soit l'indicatif. */
export const numeroCourt = (tel: string): string => String(tel ?? '').replace(/\D/g, '').slice(-8);

/* ── LA VISIO LIMITÉE — 17 novembre 2026 (« La consultation en affiches », arbitrage C) ──
   « La visio reste gratuite, limitée : une par numéro tous les 90 jours, les
   manquées comptent, le lien ne part que par WhatsApp. » Une visio annulée à
   temps ne compte pas ; « à temps », c'est le délai du changement d'heure
   (deux heures avant, réglable) : passé ce délai, le quart d'heure est perdu
   pour la Maison, comme une visio manquée. Annulée par la Maison, jamais. */

const UN_JOUR_MS = 86_400_000;

/** Ce que la limite lit d'une visio de ce numéro. */
export type VisioDuNumero = { debut: string; statut: string; annuleeLe?: string | null; annuleePar?: string | null };

/** Annulée par la Maison, ou par elle avant le délai : elle ne compte pas. Sans
    heure d'annulation connue (les visios d'avant le 17 novembre 2026), le doute lui profite. */
export function annuleeATemps(v: VisioDuNumero, avantMin: number): boolean {
  if (v.statut !== 'annulée') return false;
  if (v.annuleePar === 'maison') return true;
  const le = Date.parse(String(v.annuleeLe ?? ''));
  if (!Number.isFinite(le)) return true;
  return le <= Date.parse(v.debut) - avantMin * 60_000;
}

/** Cette visio compte-t-elle dans la limite ? Réservée, tenue, manquée, ou annulée trop tard. */
export const comptePourLaLimite = (v: VisioDuNumero, r: Pick<ReglagesDeLaVisio, 'changementAvantMin'>): boolean =>
  v.statut !== 'annulée' || !annuleeATemps(v, r.changementAvantMin);

export type VerdictDeLaLimite =
  | { ok: true }
  /** `prochaineLe` : le premier jour (de Cotonou, « 2027-02-15 ») où une visio redevient possible ; vide sans période. */
  | { ok: false; prochaineLe: string; aVenir: boolean };

/** LA LIMITE : `parTelephone` visios par numéro sur `limiteJours` jours, à venir
    comprises. La visio qui ferme la porte la rouvre `limiteJours` jours après son heure. */
export function limiteDe(visios: readonly VisioDuNumero[], r: ReglagesDeLaVisio, maintenantMs: number): VerdictDeLaLimite {
  const enCours = (v: VisioDuNumero): boolean => v.statut === 'réservée' && Date.parse(v.debut) + DUREE_MIN * 60_000 >= maintenantMs;
  const aVenir = visios.some(enCours);
  if (r.limiteJours <= 0) {
    return visios.filter(enCours).length >= r.parTelephone ? { ok: false, prochaineLe: '', aVenir: true } : { ok: true };
  }
  const depuis = maintenantMs - r.limiteJours * UN_JOUR_MS;
  const comptees = visios
    .filter((v) => comptePourLaLimite(v, r) && Date.parse(v.debut) > depuis)
    .map((v) => Date.parse(v.debut))
    .sort((a, b) => b - a);
  if (comptees.length < r.parTelephone) return { ok: true };
  return { ok: false, prochaineLe: jourDeCotonou(comptees[r.parTelephone - 1] + r.limiteJours * UN_JOUR_MS), aVenir };
}

/* ── CHANGER L'HEURE D'UNE VISIO CONFIRMÉE — 17 novembre 2026 ──────────────
   « Permets de modifier l'heure d'une visio qui a été confirmée » (Yéman).
   Par elle : jusqu'à deux heures avant, deux fois au plus (réglables). Par la
   Maison, depuis la file des visios : tant que la visio n'a pas commencé, sans
   compter dans ses deux fois. L'ancien quart d'heure se libère aussitôt (la
   ligne change d'heure, l'index unique le rend). */

export type RefusDuChangement = 'pas-reservee' | 'trop-tard' | 'trop-de-fois';

export function changementPermis(
  v: { debut: string; statut: string; deplacements?: number | null },
  r: Pick<ReglagesDeLaVisio, 'changementAvantMin' | 'changementsMax'>,
  maintenantMs: number,
  parLaMaison = false,
): 'permis' | RefusDuChangement {
  if (v.statut !== 'réservée') return 'pas-reservee';
  const debutMs = Date.parse(v.debut);
  if (parLaMaison) return maintenantMs < debutMs ? 'permis' : 'trop-tard';
  if (maintenantMs > debutMs - r.changementAvantMin * 60_000) return 'trop-tard';
  if ((v.deplacements ?? 0) >= r.changementsMax) return 'trop-de-fois';
  return 'permis';
}

/** Combien de changements il lui reste. */
export const changementsRestants = (v: { deplacements?: number | null }, r: Pick<ReglagesDeLaVisio, 'changementsMax'>): number =>
  Math.max(0, r.changementsMax - (v.deplacements ?? 0));

/** Le quart d'heure visé tient-il ? La grille de la Maison, libre, et pour elle
    le délai de réservation ; la Maison, elle, pose dans la grille sans délai. */
export const creneauDuChangement = (r: ReglagesDeLaVisio, maintenantMs: number, pris: readonly string[], debut: string, parLaMaison = false): boolean =>
  creneauValide(parLaMaison ? { ...r, delaiMin: 0 } : r, maintenantMs, pris, debut);

/** Le nom de la salle chez le service de visio : la visio ET son heure, pour
    qu'une visio déplacée après l'ouverture de sa salle en reçoive une neuve. */
export const nomDeLaSalle = (id: string, debut: string): string => `mnd-${id}-${Math.floor(Date.parse(debut) / 60_000).toString(36)}`;

/* ── LE RÉSUMÉ EN TROIS TOUCHES (V4) ──────────────────────────────────── */

export type NiveauConstate = 'aucune' | 'douce' | 'essentielle' | 'intensive' | 'alala';
export type LongueurConstatee = 'courte' | 'mi-longue' | 'longue';
export type SuiteDeLaVisio = 'privee' | 'devis' | 'soins';
export type StatutDeLaVisio = 'réservée' | 'annulée' | 'tenue' | 'manquée';

export const NIVEAUX: readonly { id: NiveauConstate; dit: string }[] = [
  { id: 'aucune', dit: 'Pas de réparation' },
  { id: 'douce', dit: 'Douce' },
  { id: 'essentielle', dit: 'Essentielle' },
  { id: 'intensive', dit: 'Intensive' },
  { id: 'alala', dit: 'ÀLÀLÀ™' },
];
export const LONGUEURS: readonly { id: LongueurConstatee; dit: string }[] = [
  { id: 'courte', dit: 'Courte' }, { id: 'mi-longue', dit: 'Mi-longue' }, { id: 'longue', dit: 'Longue' },
];
export const SUITES: readonly { id: SuiteDeLaVisio; dit: string; pourElle: string }[] = [
  { id: 'privee', dit: 'Consultation privée', pourElle: 'La consultation privée, à la Maison : locks témoins faites devant vous et devis ferme.' },
  { id: 'devis', dit: 'Devis', pourElle: 'Votre devis arrive dans votre espace : il ne reste qu’à le valider.' },
  { id: 'soins', dit: 'Soins', pourElle: 'Des soins suffisent : réservez votre rituel quand vous le souhaitez.' },
];

/** LE RITUEL QUE LE MAÎTRE PROPOSE (17 novembre 2026) : des prestations du
    catalogue qui se réservent en ligne, leurs noms tels qu'il les a choisis. */
export type RituelPropose = { besoin: 'entretien' | 'enfant'; serviceIds: string[]; noms: string[] };

export type ResumeDeLaVisio = {
  niveau?: NiveauConstate;
  longueur?: LongueurConstatee;
  suite?: SuiteDeLaVisio;
  /** APRÈS LA VISIO (17 novembre 2026) : ce que le maître propose, en un geste. */
  rituel?: RituelPropose;
  /** La consultation privée proposée (ou imposée dès la réparation intensive). */
  privee?: boolean;
  estimationXof?: number;
  /** Un mot de la Maison, court. */
  mot?: string;
  par?: string;
  le?: string;
};

/** « Consultation privée obligatoire à partir de la réparation intensive. » */
export const priveeObligatoire = (n: NiveauConstate | undefined): boolean => n === 'intensive' || n === 'alala';

/** La suite qui s'impose : la privée dès la réparation intensive, quoi qu'on ait touché. */
export const suiteRetenue = (r: ResumeDeLaVisio): SuiteDeLaVisio | undefined => (priveeObligatoire(r.niveau) ? 'privee' : r.suite);

const dans = <T extends string>(x: unknown, l: readonly { id: T }[]): T | undefined =>
  l.some((v) => v.id === x) ? (x as T) : undefined;

const ID_DE_PRESTATION = /^[A-Za-z0-9_-]{1,80}$/;
/** Six prestations au plus, comme le lien de réservation préparé. */
export const RITUEL_AU_PLUS = 6;

/** Un rituel proposé, rendu sûr : des identifiants du catalogue, des noms courts, rien d'autre. */
export function rituelSur(x: unknown): RituelPropose | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const ids = Array.isArray(o.serviceIds) ? o.serviceIds : [];
  const noms = Array.isArray(o.noms) ? o.noms : [];
  const serviceIds: string[] = [];
  const dits: string[] = [];
  ids.forEach((id, i) => {
    if (typeof id !== 'string' || !ID_DE_PRESTATION.test(id) || serviceIds.includes(id) || serviceIds.length >= RITUEL_AU_PLUS) return;
    serviceIds.push(id);
    dits.push(typeof noms[i] === 'string' ? (noms[i] as string).trim().slice(0, 120) : '');
  });
  if (!serviceIds.length) return null;
  return { besoin: o.besoin === 'enfant' ? 'enfant' : 'entretien', serviceIds, noms: dits };
}

export function resumeSur(x: unknown): ResumeDeLaVisio | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const r: ResumeDeLaVisio = {};
  const niveau = dans(o.niveau, NIVEAUX); if (niveau) r.niveau = niveau;
  const longueur = dans(o.longueur, LONGUEURS); if (longueur) r.longueur = longueur;
  const suite = dans(o.suite, SUITES); if (suite) r.suite = suite;
  const rituel = rituelSur(o.rituel); if (rituel) r.rituel = rituel;
  if (o.privee === true) r.privee = true;
  const e = Math.round(Number(o.estimationXof));
  if (Number.isFinite(e) && e > 0) r.estimationXof = e;
  if (typeof o.mot === 'string' && o.mot.trim()) r.mot = o.mot.trim().slice(0, 400);
  if (typeof o.par === 'string') r.par = o.par.slice(0, 60);
  if (typeof o.le === 'string') r.le = o.le;
  return Object.keys(r).length ? r : null;
}

/* ── APRÈS LA VISIO : LES AFFICHES — 17 novembre 2026 ──────────────────────
   « Après avoir fini une visio, possibilité d'avoir un call to action de
   rendez-vous privé à prendre, ou en une étape qui suit un RDV normal pour un
   service à la Maison MND » (Yéman). Le maître propose un rituel (prestations
   du catalogue) ou la consultation privée ; la cliente voit l'affiche « Votre
   rituel » (sa réservation déjà remplie) et/ou « Consultation privée ». Dès la
   réparation intensive, la consultation privée seule s'affiche. Aucun prix
   n'est inventé : le seul nombre est celui que le maître a écrit. */

export type AffichesDeLaSuite = {
  /** « Votre rituel » : son nom d'affiche, les prestations proposées, le chemin (relatif à l'origine) de sa réservation déjà remplie, et son mot. */
  rituel?: { nom: string; noms: string[]; chemin: string; jeton: string };
  /** « Consultation privée » : son nom, sa ligne, ce que dit son prix, et le chemin de sa réservation. */
  privee?: { nom: string; ligne: string; unite: string; chemin: string };
};

/** ELLE N'A PAS ENCORE DE LOCKS : ce que sa consultation a dit de sa couronne
    (`couronne.nees === 'aucune'`). Ses affiches parlent alors de ses cheveux
    et de sa création, pas de locks ni de rituel. */
export function sansLocksEncore(consultation: unknown): boolean {
  const c = consultation && typeof consultation === 'object' ? (consultation as { couronne?: unknown }).couronne : null;
  return !!c && typeof c === 'object' && (c as { nees?: unknown }).nees === 'aucune';
}

/** « JE NE SAIS PAS » NE SE REMET JAMAIS TEL QUEL (17 novembre 2026) : dans
    un bilan ou un résumé remis par la Maison, c'est « À voir avec la Maison ». */
export const A_VOIR_AVEC_LA_MAISON = 'À voir avec la Maison';
export const pourLeBilan = (texte: string): string =>
  /^je ne sais pas\.?$/i.test(String(texte ?? '').trim()) ? A_VOIR_AVEC_LA_MAISON : String(texte ?? '');

/** Le mot du bouton `reservation_preparee`, et de l'adresse `reserver/?r=` : `besoin.geste~geste`. */
export const jetonDuRituel = (r: RituelPropose): string => jetonDuLien({ besoin: r.besoin, gestes: r.serviceIds });

/** Le chemin de la consultation privée d'une consultation déposée (l'entrée directe `?privee=`). */
export const cheminDeLaPrivee = (consultationId: string | null | undefined): string =>
  `/consultation/${consultationId && FORME_DE_LA_CONSULTATION.test(consultationId) ? `?privee=${encodeURIComponent(consultationId)}` : ''}`;

/** CE QUE LA PAGE DE LA CLIENTE, SON WHATSAPP ET LE MESSAGE DE LA MAISON
    AFFICHENT APRÈS LA VISIO. Une seule fonction écrit ces affiches, pour que
    leurs mots ne divergent pas : ils suivent son parcours. Sans locks encore
    (`sansLocks`), la consultation privée se tient « devant vos cheveux » et
    ses 15 000 F sont « déduits de votre création » ; sinon « devant vos
    locks », « déduits de votre rituel ». */
export function affichesDeLaSuite(r: ResumeDeLaVisio | null | undefined, consultationId?: string | null, sansLocks = false): AffichesDeLaSuite {
  if (!r) return {};
  const privee = r.privee === true || suiteRetenue(r) === 'privee';
  const a: AffichesDeLaSuite = {};
  if (r.rituel && !priveeObligatoire(r.niveau)) {
    const jeton = jetonDuRituel(r.rituel);
    a.rituel = { nom: 'Votre rituel', noms: r.rituel.noms.filter(Boolean).map(pourLeBilan), chemin: `/reserver/?r=${jeton}`, jeton };
  }
  if (privee) {
    a.privee = {
      nom: 'Consultation privée',
      ligne: sansLocks ? 'À la Maison, devant vos cheveux' : 'À la Maison, devant vos locks',
      unite: sansLocks ? 'déduits de votre création' : 'déduits de votre rituel',
      chemin: cheminDeLaPrivee(consultationId),
    };
  }
  return a;
}

/** La lecture confirmée, en une phrase pour la cliente (« Réparation intensive · mi-longue »). */
export function lectureDite(r: ResumeDeLaVisio): string {
  const n = NIVEAUX.find((x) => x.id === r.niveau);
  const l = LONGUEURS.find((x) => x.id === r.longueur);
  const niveau = !n ? '' : n.id === 'aucune' ? 'Pas de réparation' : n.id === 'alala' ? 'ÀLÀLÀ™ · Repose partielle et reconstruction complète' : `Réparation ${n.dit.toLowerCase()}`;
  return [niveau, l ? `locks ${l.dit.toLowerCase()}s` : ''].filter(Boolean).join(' · ');
}
