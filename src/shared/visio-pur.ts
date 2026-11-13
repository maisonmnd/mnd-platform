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
   le site et le Trône lisent les mêmes règles. Rien d'autre n'est importé. */

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
  /** Visios à venir au plus, par numéro. */
  parTelephone: number;
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

export type ResumeDeLaVisio = {
  niveau?: NiveauConstate;
  longueur?: LongueurConstatee;
  suite?: SuiteDeLaVisio;
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

export function resumeSur(x: unknown): ResumeDeLaVisio | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const r: ResumeDeLaVisio = {};
  const niveau = dans(o.niveau, NIVEAUX); if (niveau) r.niveau = niveau;
  const longueur = dans(o.longueur, LONGUEURS); if (longueur) r.longueur = longueur;
  const suite = dans(o.suite, SUITES); if (suite) r.suite = suite;
  const e = Math.round(Number(o.estimationXof));
  if (Number.isFinite(e) && e > 0) r.estimationXof = e;
  if (typeof o.mot === 'string' && o.mot.trim()) r.mot = o.mot.trim().slice(0, 400);
  if (typeof o.par === 'string') r.par = o.par.slice(0, 60);
  if (typeof o.le === 'string') r.le = o.le;
  return Object.keys(r).length ? r : null;
}

/** La lecture confirmée, en une phrase pour la cliente (« Réparation intensive · mi-longue »). */
export function lectureDite(r: ResumeDeLaVisio): string {
  const n = NIVEAUX.find((x) => x.id === r.niveau);
  const l = LONGUEURS.find((x) => x.id === r.longueur);
  const niveau = !n ? '' : n.id === 'aucune' ? 'Pas de réparation' : n.id === 'alala' ? 'ÀLÀLÀ™ · Repose partielle et reconstruction complète' : `Réparation ${n.dit.toLowerCase()}`;
  return [niveau, l ? `locks ${l.dit.toLowerCase()}s` : ''].filter(Boolean).join(' · ');
}
