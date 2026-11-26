/* ══ L'OCCUPATION DES FAUTEUILS — 26 novembre 2026 ═══════════════════════
   Audit du Trône, point B3, « Remplir la semaine et les fins d'après-midi »,
   validé par Yéman (« construis ») : depuis juin, 95 rituels honorés le
   samedi, 42 le mercredi, 43 le jeudi, et presque rien après 16 h. Le samedi
   est plein quand la semaine ne l'est pas, et rien ne mesurait l'occupation
   réelle des fauteuils.

   CE QUE CE MODULE COMPTE, ET SUR QUOI :
     - la CAPACITÉ d'une heure d'un jour = fauteuils × les minutes de cette
       heure où la Maison reçoit : de l'ouverture (jamais avant 08:30, le
       premier rendez-vous de la Maison, `PREMIER_RENDEZ_VOUS_MIN`) à la
       fermeture. Un jour fermé (la semaine, une journée exceptionnelle, une
       fermeture annoncée) n'offre rien : l'écran passe `ouvertureDe`, qui lit
       les mêmes murs que la réservation (`openingForIso`) ;
     - l'OCCUPATION = les minutes que les rendez-vous comptés passent dans
       cette heure, leur vraie durée (`dureeMin`, posée par l'écran), bornée
       à la capacité de l'heure ce jour-là (deux têtes de plus que de
       fauteuils ne font pas 120 %) ;
     - « Ce qui s'est fait » compte les rituels HONORÉS des semaines passées ;
       « Ce qui est pris » compte ce qui tient une place dans les semaines à
       venir (confirmé, en attente, honoré du jour). Un rendez-vous annulé, ou
       à reprogrammer (statut annulé), ne compte jamais ;
     - le CHIFFRE PAR HEURE DE FAUTEUIL = ce qui a été encaissé sur ces
       rituels (`encaisseXof`, l'écran le calcule par `apptPaidXof`, le juge
       de la Maison), divisé par les heures de fauteuil offertes ce jour de la
       semaine. Aucun prix n'est inventé : un rituel pas encore réglé compte
       zéro franc.

   Les jours de la semaine se lisent à midi UTC sur la date seule : aucun
   fuseau ne fait glisser un mercredi au mardi. « Aujourd'hui » vient de
   l'écran (`momentDuSalon`), jamais de l'horloge du poste.

   Pur : aucun magasin, aucune base. `scripts/verifie-remplir-la-semaine.mjs`
   le prouve. */

import { PREMIER_RENDEZ_VOUS_MIN } from './agenda-pur';

/** Ce que le compte lit d'un rendez-vous. */
export type RdvDeLOccupation = {
  id?: string;
  date: string;
  time: string;
  /** Sa vraie durée, en minutes (`apptDurationMin`). */
  dureeMin: number;
  status: string;
  /** Ce qui a été encaissé sur lui (`apptPaidXof`). */
  encaisseXof?: number;
  codeOffre?: string;
  offreId?: string;
};

export type FenetreDOuverture = { closed: boolean; openMin: number; closeMin: number };

/** Les deux regards : le passé honoré, ou ce qui est déjà pris. */
export type VueDeLOccupation = 'fait' | 'pris';
/** Les périodes proposées, en semaines. */
export const PERIODES_D_OCCUPATION = [4, 8, 12] as const;
export type PeriodeDOccupation = (typeof PERIODES_D_OCCUPATION)[number];

/** Lundi d'abord, comme le planning et les offres. */
export const JOURS_DE_L_OCCUPATION = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;
const midi = (j: string): number => Date.UTC(Number(j.slice(0, 4)), Number(j.slice(5, 7)) - 1, Number(j.slice(8, 10)), 12);
const enIso = (t: number): string => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
/** Un jour plus n jours. */
export const plusJours = (j: string, n: number): string => enIso(midi(j) + n * 86_400_000);
/** Lundi = 0 … dimanche = 6. */
export const rangDuJour = (j: string): number => (new Date(midi(j)).getUTCDay() + 6) % 7;
/** Les jours d'une fenêtre, bornes comprises, au plus 400. */
export function joursEntre(du: string, au: string): string[] {
  if (!JOUR_ISO.test(du) || !JOUR_ISO.test(au)) return [];
  const out: string[] = [];
  for (let j = du; j <= au && out.length < 400; j = plusJours(j, 1)) out.push(j);
  return out;
}

/** LA PÉRIODE D'UN REGARD : les N semaines finies hier, ou aujourd'hui et les
    N semaines qui viennent. */
export function periodeDeLOccupation(vue: VueDeLOccupation, semaines: number, aujourdhui: string): { du: string; au: string } {
  const n = Math.max(1, Math.floor(semaines)) * 7;
  return vue === 'fait'
    ? { du: plusJours(aujourdhui, -n), au: plusJours(aujourdhui, -1) }
    : { du: aujourdhui, au: plusJours(aujourdhui, n - 1) };
}

/** Le rendez-vous compte-t-il dans ce regard ? */
export const compteDansLaVue = (status: string, vue: VueDeLOccupation): boolean =>
  vue === 'fait' ? status === 'honoré' : status === 'confirmé' || status === 'en attente' || status === 'honoré';

const minutesDe = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
};
const chevauche = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** La fenêtre où la Maison reçoit ce jour-là : l'ouverture, jamais avant le
    premier rendez-vous (08:30), jusqu'à la fermeture. `null` : fermé. */
export function fenetreQuiRecoit(o: FenetreDOuverture | null | undefined): { debut: number; fin: number } | null {
  if (!o || o.closed) return null;
  const debut = Math.max(o.openMin, PREMIER_RENDEZ_VOUS_MIN);
  return o.closeMin > debut ? { debut, fin: o.closeMin } : null;
}

/** Une case de la carte : un jour de la semaine, une heure. */
export type CaseDOccupation = {
  /** Lundi = 0 … dimanche = 6. */
  jour: number;
  /** L'heure de début (8 pour 08:00–09:00). */
  heure: number;
  capaciteMin: number;
  occupeMin: number;
  /** De 0 à 1 ; `null` quand l'heure n'offre rien. */
  taux: number | null;
};

/** Une ligne de la semaine : ce que ce jour a offert, porté, rapporté. */
export type LigneDuJour = {
  jour: number;
  /** Combien de ces jours étaient ouverts dans la période. */
  joursOuverts: number;
  rdv: number;
  capaciteMin: number;
  occupeMin: number;
  taux: number | null;
  encaisseXof: number;
  /** Les francs encaissés par heure de fauteuil offerte ; `null` sans capacité. */
  xofParHeure: number | null;
};

export type OccupationDesFauteuils = {
  du: string;
  au: string;
  vue: VueDeLOccupation;
  sieges: number;
  /** La première et la dernière heure de la carte (8 et 20 pour 08:00–20:30). */
  premiereHeure: number;
  derniereHeure: number;
  cases: CaseDOccupation[];
  jours: LigneDuJour[];
  total: { rdv: number; capaciteMin: number; occupeMin: number; taux: number | null; encaisseXof: number; xofParHeure: number | null };
  /** Des rendez-vous comptés sur un jour fermé : jamais dans la capacité. */
  surFerme: number;
};

/** LA CARTE DE L'OCCUPATION d'une période. */
export function occupationDesFauteuils(o: {
  rdvs: readonly RdvDeLOccupation[];
  du: string;
  au: string;
  vue: VueDeLOccupation;
  sieges: number;
  ouvertureDe: (jour: string) => FenetreDOuverture | null | undefined;
}): OccupationDesFauteuils {
  const sieges = Math.max(1, Math.floor(Number(o.sieges) || 1));
  const jours = joursEntre(o.du, o.au);
  const fenetres = new Map(jours.map((j) => [j, fenetreQuiRecoit(o.ouvertureDe(j))]));
  let premiere = 24;
  let derniere = 0;
  for (const f of fenetres.values()) {
    if (!f) continue;
    premiere = Math.min(premiere, Math.floor(f.debut / 60));
    derniere = Math.max(derniere, Math.ceil(f.fin / 60) - 1);
  }
  if (premiere > derniere) { premiere = 8; derniere = 19; }

  const parJour = new Map<string, RdvDeLOccupation[]>();
  let surFerme = 0;
  for (const r of o.rdvs) {
    const j = String(r?.date ?? '').slice(0, 10);
    if (!fenetres.has(j) || !compteDansLaVue(String(r.status ?? ''), o.vue)) continue;
    if (!fenetres.get(j)) { surFerme++; continue; }
    const l = parJour.get(j);
    if (l) l.push(r); else parJour.set(j, [r]);
  }

  const cle = (jour: number, heure: number) => jour * 24 + heure;
  const cases = new Map<number, CaseDOccupation>();
  for (let jour = 0; jour < 7; jour++) {
    for (let h = premiere; h <= derniere; h++) cases.set(cle(jour, h), { jour, heure: h, capaciteMin: 0, occupeMin: 0, taux: null });
  }
  const lignes: LigneDuJour[] = Array.from({ length: 7 }, (_, jour) => ({
    jour, joursOuverts: 0, rdv: 0, capaciteMin: 0, occupeMin: 0, taux: null, encaisseXof: 0, xofParHeure: null,
  }));

  for (const j of jours) {
    const f = fenetres.get(j);
    if (!f) continue;
    const rang = rangDuJour(j);
    const ligne = lignes[rang];
    ligne.joursOuverts++;
    const rdvs = parJour.get(j) ?? [];
    ligne.rdv += rdvs.length;
    for (const r of rdvs) ligne.encaisseXof += Math.max(0, Math.round(Number(r.encaisseXof) || 0));
    for (let h = premiere; h <= derniere; h++) {
      const capacite = sieges * chevauche(h * 60, h * 60 + 60, f.debut, f.fin);
      if (capacite <= 0) continue;
      let pris = 0;
      for (const r of rdvs) {
        const debut = minutesDe(r.time);
        const duree = Math.max(0, Math.round(Number(r.dureeMin) || 0));
        if (!Number.isFinite(debut) || duree <= 0) continue;
        /* Le temps passé hors de la fenêtre qui reçoit ne compte pas. */
        pris += chevauche(debut, debut + duree, Math.max(h * 60, f.debut), Math.min(h * 60 + 60, f.fin));
      }
      const occupe = Math.min(capacite, pris);
      const c = cases.get(cle(rang, h))!;
      c.capaciteMin += capacite;
      c.occupeMin += occupe;
      ligne.capaciteMin += capacite;
      ligne.occupeMin += occupe;
    }
  }
  for (const c of cases.values()) c.taux = c.capaciteMin > 0 ? c.occupeMin / c.capaciteMin : null;
  for (const l of lignes) {
    l.taux = l.capaciteMin > 0 ? l.occupeMin / l.capaciteMin : null;
    l.xofParHeure = l.capaciteMin > 0 ? Math.round(l.encaisseXof / (l.capaciteMin / 60)) : null;
  }
  const capaciteMin = lignes.reduce((s, l) => s + l.capaciteMin, 0);
  const occupeMin = lignes.reduce((s, l) => s + l.occupeMin, 0);
  const encaisseXof = lignes.reduce((s, l) => s + l.encaisseXof, 0);
  return {
    du: o.du, au: o.au, vue: o.vue, sieges, premiereHeure: premiere, derniereHeure: derniere,
    cases: [...cases.values()],
    jours: lignes,
    total: {
      rdv: lignes.reduce((s, l) => s + l.rdv, 0),
      capaciteMin, occupeMin, taux: capaciteMin > 0 ? occupeMin / capaciteMin : null,
      encaisseXof, xofParHeure: capaciteMin > 0 ? Math.round(encaisseXof / (capaciteMin / 60)) : null,
    },
    surFerme,
  };
}

/** « 17 h », « 8 h ». */
export const heureDite = (h: number): string => `${h} h`;
/** « 34 % », borné à l'entier. */
export const tauxDit = (t: number | null): string => (t === null ? '—' : `${Math.round(t * 100)} %`);

/** LES CINQ HEURES LES PLUS VIDES de la semaine : les cases qui offrent
    quelque chose, de la plus vide à la moins vide ; à taux égal, celle qui
    offre le plus de fauteuil d'abord (c'est là qu'il y a le plus à remplir),
    puis dans l'ordre de la semaine. */
export function heuresLesPlusVides(occ: Pick<OccupationDesFauteuils, 'cases'>, combien = 5): CaseDOccupation[] {
  return occ.cases
    .filter((c) => c.capaciteMin > 0 && c.taux !== null)
    .sort((a, b) => (a.taux as number) - (b.taux as number) || b.capaciteMin - a.capaciteMin || a.jour - b.jour || a.heure - b.heure)
    .slice(0, Math.max(0, combien));
}

/** La phrase des heures vides : « mardi 18 h (0 %), mercredi 17 h (4 %)… ». */
export function phraseDesHeuresVides(cases: readonly CaseDOccupation[]): string {
  if (cases.length === 0) return '';
  return cases.map((c) => `${JOURS_DE_L_OCCUPATION[c.jour]} ${heureDite(c.heure)} (${tauxDit(c.taux)})`).join(', ');
}

/** LA TEINTE D'UNE CASE, en cinq marches : 0 vide, 4 pleine. La carte n'a
    qu'une teinte (indigo) qui fonce avec l'occupation. */
export const MARCHES_DE_LA_CARTE = [0.15, 0.35, 0.55, 0.75] as const;
export function marcheDuTaux(t: number | null): number {
  if (t === null) return -1;
  let m = 0;
  for (const s of MARCHES_DE_LA_CARTE) if (t >= s) m++;
  return m;
}

/* ══ L'OFFRE DE SEMAINE, MESURÉE ══════════════════════════════════════════
   « Une offre de semaine dont on mesure le résultat » (audit B3). Le système
   des offres sait déjà dire le JOUR DE LA VENUE (`joursDeLaVenue`, 2
   novembre 2026, « Le mercredi de la Maison ») et les places limitées (4
   novembre 2026) : une offre de semaine s'écrit donc dans l'éditeur des
   offres, sans rien de neuf. Ce qui manquait, c'est sa mesure.

   LA MESURE compare deux fenêtres de même longueur, sur les seuls jours de
   la venue de l'offre (et, si la direction le demande, les seules heures à
   partir d'une heure donnée) : PENDANT, de son premier jour (`du`) à hier
   (ou à son dernier jour s'il est passé) ; AVANT, autant de jours juste
   avant. Les rituels honorés, en nombre et en francs encaissés, et combien
   portaient son code. Une offre sans premier jour ne se mesure pas : on ne
   devine pas quand elle a commencé. */

export type OffreAMesurer = {
  id?: string;
  title?: string;
  code?: string;
  active?: boolean;
  joursDeLaVenue?: readonly string[];
  du?: string;
  au?: string;
  discountPct?: number;
};

/** Les jours des offres (« Lun »…), dans l'ordre de la semaine. */
export const JOURS_DES_OFFRES_MESUREES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

export type FenetreMesuree = { du: string; au: string; jours: number; rdv: number; encaisseXof: number; avecLeCode: number };

export type MesureDeLOffre =
  | { etat: 'mesuree'; pendant: FenetreMesuree; avant: FenetreMesuree; ecartRdv: number; ecartXof: number; apresMin: number | null }
  | { etat: 'sans-jours' | 'sans-debut' | 'pas-commencee' };

const codeNu = (c: unknown): string => String(c ?? '').replace(/\s+/g, '').toUpperCase();

/** LA MESURE D'UNE OFFRE DU JOUR DE LA VENUE. `apresMin` : ne compter que
    les rituels qui commencent à cette minute ou après (« après 15 h » : 900). */
export function mesureDeLOffre(o: {
  offre: OffreAMesurer;
  rdvs: readonly RdvDeLOccupation[];
  aujourdhui: string;
  apresMin?: number | null;
}): MesureDeLOffre {
  const jours = (o.offre.joursDeLaVenue ?? []).filter((j) => (JOURS_DES_OFFRES_MESUREES as readonly string[]).includes(j));
  if (jours.length === 0) return { etat: 'sans-jours' };
  if (!o.offre.du || !JOUR_ISO.test(o.offre.du)) return { etat: 'sans-debut' };
  const hier = plusJours(o.aujourdhui, -1);
  if (o.offre.du > hier) return { etat: 'pas-commencee' };
  const fin = o.offre.au && JOUR_ISO.test(o.offre.au) && o.offre.au < hier ? o.offre.au : hier;
  const longueur = joursEntre(o.offre.du, fin).length;
  const avantAu = plusJours(o.offre.du, -1);
  const avantDu = plusJours(o.offre.du, -longueur);
  const rangs = new Set(jours.map((j) => (JOURS_DES_OFFRES_MESUREES as readonly string[]).indexOf(j)));
  const apres = o.apresMin === null || o.apresMin === undefined ? null : Math.max(0, Math.round(o.apresMin));
  const code = codeNu(o.offre.code);
  const compte = (du: string, au: string): FenetreMesuree => {
    const f: FenetreMesuree = { du, au, jours: longueur, rdv: 0, encaisseXof: 0, avecLeCode: 0 };
    for (const r of o.rdvs) {
      const j = String(r?.date ?? '').slice(0, 10);
      if (!JOUR_ISO.test(j) || j < du || j > au || r.status !== 'honoré' || !rangs.has(rangDuJour(j))) continue;
      if (apres !== null && !(minutesDe(r.time) >= apres)) continue;
      f.rdv++;
      f.encaisseXof += Math.max(0, Math.round(Number(r.encaisseXof) || 0));
      if ((!!o.offre.id && r.offreId === o.offre.id) || (!!code && codeNu(r.codeOffre) === code)) f.avecLeCode++;
    }
    return f;
  };
  const pendant = compte(o.offre.du, fin);
  const avant = compte(avantDu, avantAu);
  return { etat: 'mesuree', pendant, avant, ecartRdv: pendant.rdv - avant.rdv, ecartXof: pendant.encaisseXof - avant.encaisseXof, apresMin: apres };
}

/** Les offres qu'on peut mesurer ici : celles qui disent leurs jours de la
    venue ; la plus récente d'abord, celles en ligne avant les éteintes. */
export function offresDeSemaine<T extends OffreAMesurer & { branchId?: string }>(offres: readonly T[], branchId: string): T[] {
  return offres
    .filter((x) => !!x && (x.joursDeLaVenue?.length ?? 0) > 0 && (!x.branchId || x.branchId === branchId))
    .sort((a, b) => Number(!!b.active) - Number(!!a.active) || String(b.du ?? '').localeCompare(String(a.du ?? '')));
}
