/* ═══════════════════════════════════════════════════════════════════
   LA PRÉVISION DU MOIS — 24 octobre 2026.

   « Build an AI driven predictive forecasting » (Yéman, inspirée de Workday),
   maquette VJ5PJEGUPDbYKUgEdMUNbS (vue 1), « construis » le même soir. Choix
   au sélecteur : LE TRÔNE CALCULE, CLAUDE EXPLIQUE. Le chiffre ne sort donc
   jamais d'un modèle de langage : il se recompose ici, ligne à ligne, depuis
   ce que la Maison a déjà vécu, et chaque ligne se dit en clair.

   LA RECETTE, QUATRE PARTS :
     ① ce qui est DÉJÀ entré ce mois (la règle des « Revenus du mois ») ;
     ② les rendez-vous POSÉS d'ici la fin du mois, pour ce qu'ils doivent
        encore, comptés au taux de venues honorées des douze derniers mois ;
     ③ les REPRISES que le juge de la Cadence attend avant la fin du mois,
        chez les clientes sans rendez-vous, comptées à la justesse mesurée du
        juge (la part des retours tombés à deux semaines près) ;
     ④ les CRÉANCES : ce qui, d'habitude, rentre après ce jour-là sur des
        pièces plus anciennes (médiane des six derniers mois).

   LA FOURCHETTE dit la marge de chaque part, pas une erreur de statistique
   inventée : bas = honneur moins dix points, reprises à moitié, créances au
   plus faible des six mois ; haut = honneur plus cinq points, reprises une
   fois et demie, créances au plus fort.

   Ce module est PUR ; `scripts/verifie-la-prevision-du-mois.mjs` le prouve. */

export type EntreesDeLaPrevision = {
  aujourdhui: string;
  /** Le dernier jour du mois (YYYY-MM-DD). */
  dernierJour: string;
  /** L'argent entré chaque jour du mois, du 1er à aujourd'hui inclus. */
  encaisseParJour: { iso: string; xof: number }[];
  /** Les rendez-vous à venir (aujourd'hui compris), non honorés, non annulés,
      pour ce qu'ils doivent ENCORE (acompte déduit). */
  rdvs: { date: string; duXof: number }[];
  /** Les rendez-vous passés des douze derniers mois. */
  honneur: { honores: number; annules: number };
  /** Les reprises estimées par la Cadence entre aujourd'hui et la fin du mois. */
  reprises: { iso: string; valeurXof: number }[];
  /** La justesse du juge : part des retours tombés à 14 jours près (0 à 1),
      `null` quand l'historique ne permet pas de la mesurer. */
  justesse: number | null;
  /** Pour chacun des derniers mois : ce qui est rentré après le même jour du
      mois, sur des pièces datées de ce jour ou d'avant. */
  creancesPassees: number[];
  /** Des versements déjà inscrits, datés après aujourd'hui. */
  versementsAVenirXof: number;
};

export type LigneDeLaPrevision = { cle: 'encaisse' | 'rdv' | 'reprises' | 'creances' | 'versements'; dit: string; xof: number };

export type Prevision = {
  encaisseXof: number;
  rdv: { nombre: number; duXof: number; taux: number; comptesXof: number; peuDHistoire: boolean; basXof: number; hautXof: number };
  reprises: { nombre: number; valeurXof: number; taux: number; comptesXof: number; basXof: number; hautXof: number };
  creances: { medianeXof: number; basXof: number; hautXof: number; mois: number };
  versementsXof: number;
  centraleXof: number;
  basXof: number;
  hautXof: number;
  jours: { iso: string; encaisseXof: number; prevuXof: number }[];
};

/** Sous dix rendez-vous passés, le taux ne dit rien : on prend 90 %, et on
    le dit. */
export const TAUX_D_HONNEUR_PAR_DEFAUT = 0.9;
/** Sans justesse mesurable, une reprise attendue compte pour 40 %. */
export const JUSTESSE_PAR_DEFAUT = 0.4;

const arrondi = (x: number, pas = 1000): number => Math.round(x / pas) * pas;
const borne = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mediane = (xs: readonly number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const ajouteJours = (iso: string, k: number): string => {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + k)).toISOString().slice(0, 10);
};

export function prevoisLeMois(e: EntreesDeLaPrevision): Prevision {
  const encaisseXof = e.encaisseParJour.reduce((s, j) => s + j.xof, 0);

  const totalPasses = e.honneur.honores + e.honneur.annules;
  const peuDHistoire = totalPasses < 10;
  const taux = peuDHistoire ? TAUX_D_HONNEUR_PAR_DEFAUT : e.honneur.honores / totalPasses;
  const rdvs = e.rdvs.filter((r) => r.duXof > 0 && r.date >= e.aujourdhui && r.date <= e.dernierJour);
  const duXof = rdvs.reduce((s, r) => s + r.duXof, 0);

  const p = e.justesse ?? JUSTESSE_PAR_DEFAUT;
  const reprises = e.reprises.filter((r) => r.valeurXof > 0 && r.iso >= e.aujourdhui && r.iso <= e.dernierJour);
  const valeurXof = reprises.reduce((s, r) => s + r.valeurXof, 0);

  const creances = e.creancesPassees.filter((x) => Number.isFinite(x));
  const medianeXof = mediane(creances);
  const basC = creances.length ? Math.min(...creances) : 0;
  const hautC = creances.length ? Math.max(...creances) : 0;

  const v = Math.max(0, e.versementsAVenirXof);
  const centraleXof = arrondi(encaisseXof + duXof * taux + valeurXof * p + medianeXof + v);
  const basXof = arrondi(encaisseXof + duXof * borne(taux - 0.1) + valeurXof * (p / 2) + basC + v);
  const hautXof = arrondi(encaisseXof + duXof * borne(taux + 0.05) + valeurXof * borne(p * 1.5) + hautC + v);

  /* Les jours : l'argent entré jusqu'à aujourd'hui ; ce qu'on attend des
     rendez-vous et des reprises ensuite (aujourd'hui porte les deux). Les
     créances ne se dessinent pas jour par jour : on ne sait pas quand. */
  const parJour = new Map<string, { encaisseXof: number; prevuXof: number }>();
  const premier = `${e.dernierJour.slice(0, 7)}-01`;
  for (let d = premier; d <= e.dernierJour; d = ajouteJours(d, 1)) parJour.set(d, { encaisseXof: 0, prevuXof: 0 });
  for (const j of e.encaisseParJour) { const c = parJour.get(j.iso); if (c) c.encaisseXof += j.xof; }
  for (const r of rdvs) { const c = parJour.get(r.date); if (c) c.prevuXof += r.duXof * taux; }
  for (const r of reprises) { const c = parJour.get(r.iso); if (c) c.prevuXof += r.valeurXof * p; }

  return {
    encaisseXof,
    rdv: { nombre: rdvs.length, duXof, taux, comptesXof: arrondi(duXof * taux), peuDHistoire, basXof: arrondi(duXof * borne(taux - 0.1)), hautXof: arrondi(duXof * borne(taux + 0.05)) },
    reprises: { nombre: reprises.length, valeurXof, taux: p, comptesXof: arrondi(valeurXof * p), basXof: arrondi(valeurXof * (p / 2)), hautXof: arrondi(valeurXof * borne(p * 1.5)) },
    creances: { medianeXof: arrondi(medianeXof), basXof: arrondi(basC), hautXof: arrondi(hautC), mois: creances.length },
    versementsXof: v,
    centraleXof, basXof, hautXof,
    jours: [...parJour.entries()].map(([iso, c]) => ({ iso, encaisseXof: Math.round(c.encaisseXof), prevuXof: Math.round(c.prevuXof) })),
  };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** CE QUI FAIT LA PRÉVISION, EN CLAIR. `fmt` met le montant à la devise de
    la branche ; `jourDeFin` est la date lisible du dernier jour (« le 31 »). */
export function ceQuiFaitLaPrevision(p: Prevision, fmt: (xof: number) => string, jourDeFin: string): LigneDeLaPrevision[] {
  const lignes: LigneDeLaPrevision[] = [
    { cle: 'encaisse', dit: `Déjà entré ce mois : ${fmt(p.encaisseXof)}.`, xof: p.encaisseXof },
  ];
  lignes.push({
    cle: 'rdv',
    dit: p.rdv.nombre === 0
      ? `Aucun rendez-vous posé d’ici ${jourDeFin} ne doit encore quelque chose.`
      : `${p.rdv.nombre} rendez-vous posé${p.rdv.nombre > 1 ? 's' : ''} d’ici ${jourDeFin} doivent encore ${fmt(p.rdv.duXof)}, comptés à ${pct(p.rdv.taux)}${p.rdv.peuDHistoire ? ' (trop peu d’historique pour mesurer vos venues : 90 % par défaut)' : ' (vos venues honorées des douze derniers mois)'} : ${fmt(p.rdv.comptesXof)}.`,
    xof: p.rdv.comptesXof,
  });
  lignes.push({
    cle: 'reprises',
    dit: p.reprises.nombre === 0
      ? 'Aucune reprise attendue d’ici la fin du mois chez les clientes sans rendez-vous.'
      : `${p.reprises.nombre} reprise${p.reprises.nombre > 1 ? 's' : ''} attendue${p.reprises.nombre > 1 ? 's' : ''} selon le rythme de chaque cliente, sans rendez-vous encore : ${fmt(p.reprises.valeurXof)}, comptées à ${pct(p.reprises.taux)} (la justesse mesurée de la Cadence) : ${fmt(p.reprises.comptesXof)}.`,
    xof: p.reprises.comptesXof,
  });
  lignes.push({
    cle: 'creances',
    dit: p.creances.mois === 0
      ? 'Pas encore d’historique pour les créances qui rentrent en fin de mois.'
      : `Créances : d’habitude ${fmt(p.creances.medianeXof)} rentrent d’ici la fin du mois sur des pièces plus anciennes (médiane de ${p.creances.mois} mois, de ${fmt(p.creances.basXof)} à ${fmt(p.creances.hautXof)}).`,
    xof: p.creances.medianeXof,
  });
  if (p.versementsXof > 0) {
    lignes.push({ cle: 'versements', dit: `Des versements déjà inscrits, datés plus tard ce mois : ${fmt(p.versementsXof)}.`, xof: p.versementsXof });
  }
  return lignes;
}

/* ── LE CALCUL MONTRÉ — 24 octobre 2026 ─────────────────────────────
   « Moins de textes, je veux des démonstrations de calculs, de chiffres,
   avec des totaux prévisionnels » (Yéman, devant le tableau de bord). La
   prévision se montre en TABLEAU : chaque part, sa base, son taux, ce qui
   est compté, sa fourchette ; la dernière ligne fait les totaux. */
export type LigneDuCalcul = {
  cle: 'encaisse' | 'rdv' | 'reprises' | 'creances' | 'versements';
  libelle: string;
  /** Le montant de départ (dû, valeur des rituels, médiane…). */
  baseXof: number;
  /** Le taux appliqué, de 0 à 1 ; `null` quand la part se prend telle quelle. */
  taux: number | null;
  compteXof: number;
  basXof: number;
  hautXof: number;
};

export function calculDeLaPrevision(p: Prevision): { lignes: LigneDuCalcul[]; total: { compteXof: number; basXof: number; hautXof: number } } {
  const lignes: LigneDuCalcul[] = [
    { cle: 'encaisse', libelle: 'Déjà entré', baseXof: p.encaisseXof, taux: null, compteXof: p.encaisseXof, basXof: p.encaisseXof, hautXof: p.encaisseXof },
    { cle: 'rdv', libelle: `${p.rdv.nombre} rendez-vous posés`, baseXof: p.rdv.duXof, taux: p.rdv.taux, compteXof: p.rdv.comptesXof, basXof: p.rdv.basXof, hautXof: p.rdv.hautXof },
    { cle: 'reprises', libelle: `${p.reprises.nombre} reprises attendues`, baseXof: p.reprises.valeurXof, taux: p.reprises.taux, compteXof: p.reprises.comptesXof, basXof: p.reprises.basXof, hautXof: p.reprises.hautXof },
    { cle: 'creances', libelle: p.creances.mois > 0 ? `Créances (médiane ${p.creances.mois} mois)` : 'Créances', baseXof: p.creances.medianeXof, taux: null, compteXof: p.creances.medianeXof, basXof: p.creances.basXof, hautXof: p.creances.hautXof },
  ];
  if (p.versementsXof > 0) lignes.push({ cle: 'versements', libelle: 'Versements déjà inscrits', baseXof: p.versementsXof, taux: null, compteXof: p.versementsXof, basXof: p.versementsXof, hautXof: p.versementsXof });
  return { lignes, total: { compteXof: p.centraleXof, basXof: p.basXof, hautXof: p.hautXof } };
}

/* ══ LA PRÉVISION QUI DÉCIDE — 27 octobre 2026 ═══════════════════════════
   « Le graphe des prévisions doit absolument être professionnel avec les
   calculs. Rendre cliquable chaque jour. Dans le calcul, c'est quoi bas et
   haut ? D'où viennent les écarts ? Que chaque bouton serve à prendre des
   décisions : la finalité est de grandir » (Yéman). Maquette
   Q9Nkir2cdF4jSP6QDTH3cG ; au sélecteur : fourchette MESURÉE sur les mois
   rejoués, le détail d'un jour sous le graphe, un objectif qu'elle fixe
   chaque mois, le mois et les leviers en haut de la page. */

/** Un mois passé rejoué au même jour du mois : ce qui restait prévu ce
    jour-là (au-delà de l'entré), et ce qui est réellement rentré ensuite. */
export type MoisRejoueEnArgent = { mois: string; resteprevuXof: number; resteRealiseXof: number };
/** Sous trois mois jugés, la fourchette garde ses règles, et le dit. */
export const MOIS_POUR_MESURER = 3;

export type Fourchette =
  | { mode: 'regles'; moisJuges: number }
  | { mode: 'mesuree'; moisJuges: number; ratioBas: number; ratioHaut: number };

/** LA FOURCHETTE MESURÉE : le rapport « rentré ensuite / restait prévu » de
    chaque mois rejoué ; bas = le plus faible, haut = le plus fort (au-delà
    de dix mois, le 10e et le 90e centile). Un mois où rien ne restait
    prévu ne dit rien et ne compte pas. */
export function fourchetteMesuree(rejeux: readonly MoisRejoueEnArgent[]): Fourchette {
  const r = rejeux.filter((m) => m.resteprevuXof > 0).map((m) => Math.max(0, m.resteRealiseXof) / m.resteprevuXof).sort((a, b) => a - b);
  if (r.length < MOIS_POUR_MESURER) return { mode: 'regles', moisJuges: r.length };
  const centile = (q: number) => r[Math.min(r.length - 1, Math.max(0, Math.round(q * (r.length - 1))))];
  return r.length >= 10
    ? { mode: 'mesuree', moisJuges: r.length, ratioBas: centile(0.1), ratioHaut: centile(0.9) }
    : { mode: 'mesuree', moisJuges: r.length, ratioBas: r[0], ratioHaut: r[r.length - 1] };
}

/** LA PRÉVISION, SA FOURCHETTE MESURÉE POSÉE : l'entré ne bouge pas ; le
    reste prévu se multiplie par le plus faible et le plus fort rapport
    constatés. En mode « règles », la prévision reste telle quelle. */
export function avecLaFourchette(p: Prevision, f: Fourchette): Prevision {
  if (f.mode !== 'mesuree') return p;
  const reste = p.centraleXof - p.encaisseXof;
  const part = (x: number, ratio: number) => arrondi(x * ratio);
  return {
    ...p,
    basXof: arrondi(p.encaisseXof + reste * f.ratioBas),
    hautXof: arrondi(p.encaisseXof + reste * f.ratioHaut),
    rdv: { ...p.rdv, basXof: part(p.rdv.comptesXof, f.ratioBas), hautXof: part(p.rdv.comptesXof, f.ratioHaut) },
    reprises: { ...p.reprises, basXof: part(p.reprises.comptesXof, f.ratioBas), hautXof: part(p.reprises.comptesXof, f.ratioHaut) },
    creances: { ...p.creances, basXof: part(p.creances.medianeXof, f.ratioBas), hautXof: part(p.creances.medianeXof, f.ratioHaut) },
  };
}

/** D'OÙ VIENT L'ÉCART ENTRE BAS ET HAUT : la part de chaque morceau, du plus lourd au plus léger. */
export type PartDeLEcart = { cle: 'rdv' | 'reprises' | 'creances'; xof: number; pct: number };
export function ecartDecompose(p: Prevision): { totalXof: number; parts: PartDeLEcart[] } {
  const parts = ([
    { cle: 'creances', xof: Math.max(0, p.creances.hautXof - p.creances.basXof) },
    { cle: 'reprises', xof: Math.max(0, p.reprises.hautXof - p.reprises.basXof) },
    { cle: 'rdv', xof: Math.max(0, p.rdv.hautXof - p.rdv.basXof) },
  ] as const).map((x) => ({ ...x }));
  const somme = parts.reduce((s, x) => s + x.xof, 0);
  return {
    totalXof: Math.max(0, p.hautXof - p.basXof),
    parts: parts.map((x) => ({ ...x, pct: somme > 0 ? Math.round((x.xof / somme) * 100) : 0 })).sort((a, b) => b.xof - a.xof),
  };
}

/** LE CUMUL DU MOIS, jour par jour : entré jusqu'à hier, prévu ensuite (les
    créances tombent le dernier jour, on ne sait pas quand), et la
    fourchette qui s'ouvre d'aujourd'hui jusqu'au dernier jour. */
export type PointDuCumul = { iso: string; entreXof: number | null; prevuXof: number | null; basXof: number | null; hautXof: number | null };
export function cumulDuMois(p: Prevision, aujourdhui: string): PointDuCumul[] {
  const avant = p.jours.filter((j) => j.iso < aujourdhui);
  const apres = p.jours.filter((j) => j.iso >= aujourdhui);
  let c = 0;
  const out: PointDuCumul[] = avant.map((j) => { c += j.encaisseXof; return { iso: j.iso, entreXof: c, prevuXof: null, basXof: null, hautXof: null }; });
  const depart = c;
  /* L'argent déjà entré aujourd'hui compte dans le prévu du jour. */
  let prevu = depart;
  const n = apres.length;
  apres.forEach((j, i) => {
    prevu += j.encaisseXof + j.prevuXof + (i === n - 1 ? p.creances.medianeXof + p.versementsXof : 0);
    const k = (i + 1) / n;
    out.push({ iso: j.iso, entreXof: null, prevuXof: arrondi(prevu, 1), basXof: arrondi(depart + (p.basXof - depart) * k, 1), hautXof: arrondi(depart + (p.hautXof - depart) * k, 1) });
  });
  return out;
}

/** LES LEVIERS D'ICI LA FIN DU MOIS, rangés par ce qu'ils rapportent. Le
    montant dit ce que la prévision gagnerait si le geste réussit en entier. */
export type LevierDuMois = { cle: 'reprises' | 'creances' | 'places' | 'garder'; gainXof: number; nombre: number };
export function leviersDuMois(p: Prevision, o: { placesLibres: number; rdvAGarder: number }): LevierDuMois[] {
  const l: LevierDuMois[] = [
    { cle: 'reprises', gainXof: Math.max(0, p.reprises.valeurXof - p.reprises.comptesXof), nombre: p.reprises.nombre },
    { cle: 'creances', gainXof: Math.max(0, p.creances.hautXof - p.creances.medianeXof), nombre: p.creances.mois },
    { cle: 'places', gainXof: 0, nombre: o.placesLibres },
    { cle: 'garder', gainXof: Math.max(0, p.rdv.comptesXof - p.rdv.basXof), nombre: o.rdvAGarder },
  ];
  return l.filter((x) => x.nombre > 0).sort((a, b) => b.gainXof - a.gainXof);
}

/** L'OBJECTIF DU MOIS : celui qu'elle a fixé pour ce mois, sinon le dernier
    fixé avant ; il tient d'un mois sur l'autre jusqu'à ce qu'elle le change.
    Un 0 posé pour un mois dit « pas d'objectif » à partir de ce mois. */
export type ObjectifsDuMois = Record<string, number>;
export function objectifDuMois(doc: ObjectifsDuMois | null | undefined, mk: string): number | null {
  const cles = Object.keys(doc ?? {}).filter((k) => /^\d{4}-\d{2}$/.test(k) && k <= mk).sort();
  if (!cles.length) return null;
  const v = Number((doc as ObjectifsDuMois)[cles[cles.length - 1]]);
  return Number.isFinite(v) && v > 0 ? v : null;
}
