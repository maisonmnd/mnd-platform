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
  rdv: { nombre: number; duXof: number; taux: number; comptesXof: number; peuDHistoire: boolean };
  reprises: { nombre: number; valeurXof: number; taux: number; comptesXof: number };
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
    rdv: { nombre: rdvs.length, duXof, taux, comptesXof: arrondi(duXof * taux), peuDHistoire },
    reprises: { nombre: reprises.length, valeurXof, taux: p, comptesXof: arrondi(valeurXof * p) },
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
