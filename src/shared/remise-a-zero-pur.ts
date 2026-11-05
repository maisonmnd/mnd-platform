/* ══ LA CAISSE AU JOUR LE JOUR — 5 novembre 2026 ═════════════════════════
   « En début de mois il faut ramener le tiroir à 0 F. Comment passer
   l'écriture ? » puis « Je veux savoir clairement combien j'ai en caisse au
   jour le jour » (Yéman, devant la clôture du 4 novembre : 2 752 145 F
   attendus dans Real Money). Maquette « La caisse au jour le jour »
   validée (« construis »).

   CE QUI CLOCHAIT. Le livre du tiroir n'avait jamais vu sortir que ses
   dépenses : aucune clôture, aucun coffre, aucun transfert depuis janvier
   2026. Il additionnait donc dix mois d'espèces. L'argent, lui, était parti,
   dépensé sans justificatif.

   LA REMISE À 0 F. À la main, le dernier soir du mois : on dit où est allé
   l'argent du tiroir (banque ou épargne, coffre, dépense justifiée,
   prélèvement de l'associé, ce qui reste). Le RESTE de ce que dit le livre
   s'écrit « À régulariser », tout seul : c'est son mot, « juste pour les
   soldes qui n'ont pas de justificatif il faut appeler ça à régulariser ».

   « À RÉGULARISER » N'EST NI UNE DÉPENSE NI UN ÉCART. C'est une sortie hors
   activité (le compte d'attente, 47 en OHADA) : le tiroir baisse, le
   résultat du mois ne bouge pas. Dès qu'une pièce se retrouve, une partie
   devient une dépense du bon mois, ou un prélèvement de l'associé, et quitte
   « À régulariser ». Le tiroir, lui, ne bouge pas une seconde fois : la
   dépense née sort du même tiroir, et la sortie « À régulariser » baisse
   d'autant.

   TOUT CE QUI DÉCIDE VIT ICI, sans React ; `verifie-la-caisse-au-jour-le-jour`
   l'éprouve. Les écrans montrent et écrivent. */

export const MOTIF_A_REGULARISER = 'À régulariser' as const;

/** Une part régularisée : la pièce retrouvée, ce qu'elle est devenue. */
export type Regularisation = {
  id: string;
  /** Quand elle s'est régularisée (ISO). */
  le: string;
  par?: string;
  xof: number;
  devient: 'depense' | 'prelevement';
  /** La dépense ou le prélèvement né de cette part. */
  ecritureId: string;
  quoi: string;
  /** Le jour de la dépense ou du prélèvement né (AAAA-MM-JJ). */
  date: string;
};

/** Ce que chaque mois a laissé dans le tiroir. `reste` : ce que la remise
    d'avant y avait laissé. */
export type PartDuMois = { mois: string; xof: number; reste?: true };

/** Posé sur la sortie « À régulariser » née d'une remise à 0 F. */
export type RemiseDuTiroir = {
  /** Le livre au soir de la remise, avant elle. */
  livreXof: number;
  /** Ce que la remise a écrit à régulariser, au départ. */
  initialXof: number;
  /** Ce qui reste dans le tiroir après la remise. */
  resteXof: number;
  parMois: PartDuMois[];
  /** Les autres écritures nées de la remise (transfert, coffre, dépense,
      prélèvement), pour la défaire d'un geste. */
  ecritures: { genre: 'transfert' | 'coffre' | 'depense' | 'prelevement'; id: string }[];
  regularisations: Regularisation[];
  le: string;
  par?: string;
};

export type Destinations = {
  /** Versé à la banque ou à l'épargne : un transfert vers une autre caisse. */
  banque: number;
  coffre: number;
  /** Une dépense avec son justificatif. */
  depense: number;
  /** Pris par la direction : un prélèvement au compte courant. */
  prelevement: number;
  /** Ce qui reste dans le tiroir. 0 F pour commencer le mois à vide. */
  reste: number;
};

const somme = (d: Destinations): number => d.banque + d.coffre + d.depense + d.prelevement + d.reste;

/** Ce qui s'écrit « À régulariser » : le livre, moins tout ce qu'on a su dire. */
export const aRegulariserDeLaRemise = (livreXof: number, d: Destinations): number => livreXof - somme(d);

const p2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** Le dernier jour d'un mois (« 2026-10 » → « 2026-10-31 »). */
export const dernierJourDuMois = (mois: string): string => {
  const [a, m] = mois.split('-').map(Number);
  return iso(new Date(a, m, 0, 12));
};

/** Le jour proposé pour la remise : le dernier jour du mois d'avant jusqu'au
    10 du mois (« en début de mois »), le jour même ensuite. */
export const dateProposeeDeLaRemise = (aujourdhui: string): string => {
  const [a, m, j] = aujourdhui.split('-').map(Number);
  if (j <= 10) return iso(new Date(a, m - 1, 0, 12));
  return aujourdhui;
};

const fr = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;
const jourDit = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

/** Pourquoi la remise ne s'écrit pas encore — `null` quand elle peut partir. */
export function pourquoiPasLaRemise(o: {
  livreXof: number;
  d: Destinations;
  date: string;
  aujourdhui: string;
  /** La dernière clôture de ce tiroir (AAAA-MM-JJ). */
  derniereClotureLe?: string;
  /** La dernière remise de ce tiroir (AAAA-MM-JJ). */
  derniereRemiseLe?: string;
  banqueVers?: string;
  depenseLibelle?: string;
  prelevementPour?: string;
}): string | null {
  const { d } = o;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return 'Choisissez le jour de la remise.';
  if (o.date > o.aujourdhui) return 'La remise ne se date pas dans l’avenir.';
  if (o.derniereRemiseLe && o.date <= o.derniereRemiseLe) {
    return `Ce tiroir a déjà été remis à 0 F le ${jourDit(o.derniereRemiseLe)} : la remise suivante se date après.`;
  }
  /* Une clôture garde le livre de son soir ; une sortie glissée AVANT elle
     fausserait l'attendu du soir suivant. */
  if (o.derniereClotureLe && o.date < o.derniereClotureLe) {
    return `Le tiroir a été clôturé le ${jourDit(o.derniereClotureLe)} : la remise se date ce jour-là ou après.`;
  }
  for (const v of Object.values(d)) {
    if (!Number.isFinite(v) || v < 0) return 'Un montant ne se lit pas : écrivez des chiffres seulement.';
  }
  if (o.livreXof <= 0) return 'Le livre ne dit rien dans ce tiroir : il n’y a rien à remettre à 0 F.';
  const r = aRegulariserDeLaRemise(o.livreXof, d);
  if (r < 0) return `Plus que le livre de ${fr(-r)} : vérifiez les montants.`;
  if (d.banque > 0 && !o.banqueVers) return 'Choisissez la caisse qui a reçu le versement.';
  if (d.depense > 0 && !o.depenseLibelle?.trim()) return 'Dites ce que la dépense a payé.';
  if (d.prelevement > 0 && !o.prelevementPour) return 'Choisissez l’associé du prélèvement.';
  if (somme(d) - d.reste === 0 && r === 0) return 'Rien ne sort : le tiroir garde tout ce que dit le livre.';
  return null;
}

/** Ce que chaque mois a laissé dans le tiroir, depuis la remise d'avant.
    `fins` : le solde du livre au dernier soir de chaque mois (le dernier
    pris au jour de la remise), du plus ancien au plus récent. `depart` : le
    solde juste après la remise d'avant (0 sans remise d'avant, avec les
    mois depuis l'ouverture). La somme des parts tombe toujours sur le
    dernier solde : c'est le livre de la remise. */
export function ceQueChaqueMoisALaisse(fins: readonly { mois: string; xof: number }[], depart: { xof: number; mois?: string } = { xof: 0 }): PartDuMois[] {
  const parts: PartDuMois[] = [];
  if (depart.xof !== 0) parts.push({ mois: depart.mois ?? fins[0]?.mois ?? '', xof: depart.xof, reste: true });
  let avant = depart.xof;
  for (const f of fins) {
    const x = f.xof - avant;
    if (x !== 0) parts.push({ mois: f.mois, xof: x });
    avant = f.xof;
  }
  return parts;
}

/** Les mois du livre, du mois de départ à celui de la remise (« AAAA-MM »). */
export function lesMoisDe(deMois: string, aMois: string): string[] {
  const out: string[] = [];
  let [a, m] = deMois.split('-').map(Number);
  const [fa, fm] = aMois.split('-').map(Number);
  while (a < fa || (a === fa && m <= fm)) {
    out.push(`${a}-${p2(m)}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
    if (out.length > 600) break;
  }
  return out;
}

/** Pourquoi une part ne se régularise pas encore — `null` quand elle peut. */
export function pourquoiPasLaRegularisation(o: {
  resteXof: number; xof: number; quoi: string; devient: 'depense' | 'prelevement';
  date: string; remiseLe: string; associe?: string;
}): string | null {
  if (!o.quoi.trim()) return o.devient === 'depense' ? 'Dites ce qui a été payé.' : 'Dites pour quoi la direction l’a pris.';
  if (!Number.isFinite(o.xof) || o.xof <= 0) return 'Le montant manque.';
  if (o.xof > o.resteXof) return `Plus que ce qui reste à régulariser (${fr(o.resteXof)}).`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return 'Choisissez le jour.';
  /* La part est sortie du tiroir au plus tard le soir de la remise. */
  if (o.date > o.remiseLe.slice(0, 10)) return `La part est sortie du tiroir au plus tard le ${jourDit(o.remiseLe)}.`;
  if (o.devient === 'prelevement' && !o.associe) return 'Choisissez l’associé.';
  return null;
}

/** Le reste à régulariser d'une sortie, après une part retrouvée. Le tiroir
    ne bouge pas : la dépense née sort du même tiroir que la sortie. */
export function apresLaRegularisation<T extends { amountXof: number; remise?: RemiseDuTiroir }>(m: T, r: Regularisation): T {
  const remise = m.remise
    ? { ...m.remise, regularisations: [...(m.remise.regularisations ?? []), r] }
    : m.remise;
  return { ...m, amountXof: m.amountXof - r.xof, ...(remise ? { remise } : {}) };
}

type Mvt = { branchId: string; sens?: 'entree' | 'sortie'; motif: string; amountXof: number; date: string; cashbox: string };
export const estARegulariser = (m: Pick<Mvt, 'sens' | 'motif'>): boolean =>
  m.sens === 'sortie' && m.motif === MOTIF_A_REGULARISER;

/** Tout ce qui reste à régulariser dans une branche, toutes caisses. */
export const resteARegulariser = (l: readonly Mvt[], branchId: string): number =>
  l.reduce((s, m) => (m.branchId === branchId && estARegulariser(m) ? s + m.amountXof : s), 0);

/** La dernière remise d'un tiroir (AAAA-MM-JJ), s'il en a une. */
export const derniereRemiseDe = (l: readonly (Mvt & { remise?: RemiseDuTiroir })[], branchId: string, cashbox: string): string | undefined =>
  l.filter((m) => m.branchId === branchId && m.cashbox === cashbox && estARegulariser(m) && !!m.remise)
    .map((m) => m.date.slice(0, 10)).sort().at(-1);

/** Une remise ne se défait que tant qu'aucune part n'est régularisée : une
    dépense née d'elle vivrait sans sa sortie d'origine. */
export const seDefait = (m: { remise?: RemiseDuTiroir }): boolean =>
  !!m.remise && (m.remise.regularisations ?? []).length === 0;

/* ── LE TIROIR JOUR PAR JOUR ─────────────────────────────────────────────
   Une ligne par jour : ce qu'il y avait le matin, ce qui est entré, ce qui
   est sorti, ce que dit le livre le soir, puis ce que la main a compté. Le
   chiffre vrai est celui du comptage ; sans clôture, le Trône dit « selon
   le livre ». */
export type JourDuTiroir = {
  jour: string;
  matinXof: number;
  entreesXof: number;
  sortiesXof: number;
  soirXof: number;
  /** La part « À régulariser » écrite ce jour-là, s'il y a eu une remise. */
  remiseXof: number;
  /** Le comptage du soir, quand le tiroir a été clôturé ce jour-là. */
  compte?: { compteXof: number; ecartXof: number; laisseXof: number };
};

export function lesJoursDuTiroir(o: {
  de: string;
  a: string;
  /** Le livre au matin du premier jour. */
  departXof: number;
  moves: readonly { date: string; delta: number; remise?: boolean }[];
  clotures: readonly { date: string; compteXof: number; ecartXof: number; laisseXof: number; le?: string }[];
}): JourDuTiroir[] {
  const jours: JourDuTiroir[] = [];
  const [a, m, j] = o.de.split('-').map(Number);
  const curseur = new Date(a, m - 1, j, 12);
  let matin = o.departXof;
  for (let n = 0; n < 400; n++) {
    const jour = iso(curseur);
    if (jour > o.a) break;
    const ceJour = o.moves.filter((x) => x.date.slice(0, 10) === jour);
    const entrees = ceJour.filter((x) => x.delta > 0).reduce((s, x) => s + x.delta, 0);
    const sorties = ceJour.filter((x) => x.delta < 0).reduce((s, x) => s - x.delta, 0);
    const remise = ceJour.filter((x) => x.remise && x.delta < 0).reduce((s, x) => s - x.delta, 0);
    const soir = matin + entrees - sorties;
    /* Une clôture reprise : la plus récente du jour dit le compte. */
    const clo = o.clotures.filter((c) => c.date === jour).sort((x, y) => (x.le ?? '').localeCompare(y.le ?? '')).at(-1);
    jours.push({
      jour, matinXof: matin, entreesXof: entrees, sortiesXof: sorties, soirXof: soir, remiseXof: remise,
      ...(clo ? { compte: { compteXof: clo.compteXof, ecartXof: clo.ecartXof, laisseXof: clo.laisseXof } } : {}),
    });
    matin = soir;
    curseur.setDate(curseur.getDate() + 1);
  }
  return jours;
}
