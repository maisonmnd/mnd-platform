/* ══ LES OBJECTIFS DES FAUTEUILS — 26 octobre 2026 ══════════════════════
   « Le pourcentage des fauteuils ne dépend de rien de construit. Il calcule
   dans le vide. Prends tous les RDV du passé de 2025 et 2026 et fais des
   estimations de combien de RDV nous pourrions avoir idéalement un jour, un
   mois donné. Je veux des objectifs atteignables avec des prévisions
   atteignables. Pas des chiffres faits au hasard » (Yéman).

   L'ANCIEN CALCUL rapportait les minutes posées à ce que les fauteuils
   offriraient s'ils tournaient de l'ouverture à la fermeture (fauteuils ×
   heures) : une capacité que la Maison n'a jamais vécue, d'où des jours à
   17 % qui étaient de bons jours.

   LE NOUVEAU part de ce qu'elle a VÉCU. Pour chaque jour de la semaine, on
   compte les rendez-vous non annulés de chaque jour ouvert passé (un jour
   ouvert sans rendez-vous compte pour zéro) :
     - l'ORDINAIRE, la médiane : ce qu'un mardi donne d'habitude ;
     - l'OBJECTIF ATTEIGNABLE, le troisième quartile : ce qu'elle a déjà fait
       au moins un mardi sur quatre, donc à sa portée ;
     - le RECORD, le plus haut depuis janvier 2025, dit pour mémoire.
   Les repères se lisent sur les VINGT-SIX DERNIÈRES SEMAINES (la Maison
   d'aujourd'hui, pas celle de janvier 2025) ; un jour de la semaine trop
   peu vu dans ce temps (moins de six fois) se lit sur toute l'histoire.

   LE MOIS : l'objectif est la somme des objectifs de ses jours ouverts ; la
   prévision ajoute à ce qui est déjà fait, pour chaque jour à venir, le plus
   grand de ce qui est déjà posé et de l'ordinaire de ce jour. Rien n'est
   inventé : chaque chiffre se recompose d'ici.

   Pur : aucune lecture de magasin ; les heures d'ouverture arrivent par
   `ouvertLe`. `scripts/verifie-les-objectifs-des-fauteuils.mjs` le prouve. */

/** Ce que le calcul lit d'un rendez-vous. */
export type RdvCompte = { date: string; status: string };

/** Le début de l'histoire retenue. */
export const DEBUT_DE_L_HISTOIRE = '2025-01-01';
/** La fenêtre récente des repères. */
export const SEMAINES_RECENTES = 26;
/** En dessous de tant de jours vus, un jour de la semaine se lit sur toute l'histoire. */
export const JOURS_MIN = 6;

export const NOMS_DES_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;

/** Les repères d'un jour de la semaine. */
export type ReperesDuJour = {
  /** 0 = dimanche … 6 = samedi. */
  jour: number;
  /** Les jours ouverts observés. */
  jours: number;
  ordinaire: number;
  objectif: number;
  record: number;
  /** Combien de ces jours ont atteint l'objectif. */
  atteint: number;
  /** Le premier jour de la fenêtre lue. */
  depuis: string;
};

const iso = (d: Date): string => d.toISOString().slice(0, 10);
export function ajouteJours(j: string, n: number): string {
  const d = new Date(`${j}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export const jourDeSemaine = (j: string): number => new Date(`${j}T12:00:00Z`).getUTCDay();

/** Le nombre de rendez-vous non annulés de chaque jour. */
export function rdvParJour(rdvs: readonly RdvCompte[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of rdvs) {
    if (a.status === 'annulé' || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.date))) continue;
    m.set(a.date, (m.get(a.date) ?? 0) + 1);
  }
  return m;
}

/** Le rang de la liste triée pour une part donnée (rang le plus proche). */
function quantile(tries: readonly number[], part: number): number {
  if (tries.length === 0) return 0;
  const k = Math.min(tries.length - 1, Math.max(0, Math.ceil(part * tries.length) - 1));
  return tries[k];
}

/** LES REPÈRES DES SEPT JOURS, lus sur les jours passés (hier compris). */
export function reperesParJour(o: {
  parJour: ReadonlyMap<string, number>;
  aujourdhui: string;
  ouvertLe: (j: string) => boolean;
}): ReperesDuJour[] {
  const hier = ajouteJours(o.aujourdhui, -1);
  const recent = ajouteJours(o.aujourdhui, -7 * SEMAINES_RECENTES);
  const vus: number[][] = [[], [], [], [], [], [], []];
  const tous: number[][] = [[], [], [], [], [], [], []];
  for (let j = DEBUT_DE_L_HISTOIRE; j <= hier; j = ajouteJours(j, 1)) {
    const n = o.parJour.get(j) ?? 0;
    if (!o.ouvertLe(j) && n === 0) continue;
    const s = jourDeSemaine(j);
    tous[s].push(n);
    if (j >= recent) vus[s].push(n);
  }
  return vus.map((recents, s) => {
    const lus = recents.length >= JOURS_MIN ? recents : tous[s];
    const depuis = recents.length >= JOURS_MIN ? (recent > DEBUT_DE_L_HISTOIRE ? recent : DEBUT_DE_L_HISTOIRE) : DEBUT_DE_L_HISTOIRE;
    const tries = [...lus].sort((a, b) => a - b);
    const objectif = quantile(tries, 0.75);
    return {
      jour: s,
      jours: tries.length,
      ordinaire: quantile(tries, 0.5),
      objectif,
      record: tous[s].length ? Math.max(...tous[s]) : 0,
      atteint: tries.filter((n) => n >= objectif).length,
      depuis,
    };
  });
}

/** Les repères du jour de la semaine d'une date. */
export const reperesDe = (reperes: readonly ReperesDuJour[], j: string): ReperesDuJour => reperes[jourDeSemaine(j)];

/** Ce que la barre d'un jour dit : posés sur objectif, et son ton. */
export function chargeSurObjectif(poses: number, r: ReperesDuJour | undefined): { objectif: number; part: number; ton: 'plein' | 'creux' | 'normal' | 'sans' } {
  if (!r || r.jours === 0 || r.objectif <= 0) return { objectif: 0, part: 0, ton: 'sans' };
  const part = poses / r.objectif;
  return { objectif: r.objectif, part, ton: poses >= r.objectif ? 'plein' : poses < r.ordinaire ? 'creux' : 'normal' };
}

/** La phrase chiffrée de la bulle d'un jour. */
export function calculDuJour(r: ReperesDuJour, poses: number): string {
  const nom = NOMS_DES_JOURS[r.jour];
  return `${poses} posé${poses > 1 ? 's' : ''} sur un objectif de ${r.objectif} : `
    + `un ${nom} ordinaire en fait ${r.ordinaire}, l'objectif a été atteint ${r.atteint} ${nom}s sur ${r.jours} ouverts depuis le ${r.depuis.split('-').reverse().join('/')}, `
    + `le record est de ${r.record}.`;
}

/** LE MOIS : objectif, déjà fait, posé, prévision. */
export type BilanDuMois = {
  objectif: number;
  realise: number;
  poses: number;
  prevision: number;
  joursOuverts: number;
  joursRestants: number;
};

export function bilanDuMois(o: {
  mois: string;
  aujourdhui: string;
  parJour: ReadonlyMap<string, number>;
  ouvertLe: (j: string) => boolean;
  reperes: readonly ReperesDuJour[];
}): BilanDuMois {
  const b: BilanDuMois = { objectif: 0, realise: 0, poses: 0, prevision: 0, joursOuverts: 0, joursRestants: 0 };
  const premier = `${o.mois}-01`;
  for (let j = premier; j.slice(0, 7) === o.mois; j = ajouteJours(j, 1)) {
    const n = o.parJour.get(j) ?? 0;
    if (!o.ouvertLe(j) && n === 0) continue;
    const r = reperesDe(o.reperes, j);
    b.joursOuverts += 1;
    b.objectif += r.objectif;
    if (j < o.aujourdhui) {
      b.realise += n;
    } else {
      b.joursRestants += 1;
      b.poses += n;
      b.prevision += Math.max(n, r.ordinaire);
    }
  }
  b.prevision += b.realise;
  return b;
}
