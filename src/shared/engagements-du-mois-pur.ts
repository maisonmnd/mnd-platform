/* ══ LES ENGAGEMENTS DE CHAQUE MOIS · 5 novembre 2026 ═════════════════════
   Maquette « Les dépenses préparées par Grenat » (FyXznPQfTLKnL5MQgbn4C1),
   validée : « Le loyer, les salaires, internet, l'électricité, les
   abonnements se posent une seule fois, avec leur jour du mois et leur
   caisse. Le jour venu, Grenat prépare la dépense. »

   UNE FOIS PAR MOIS ET PAR ENGAGEMENT. La clé est stable,
   `engagement:<id>:<aaaa-mm>`, et l'identifiant de la dépense en est tiré
   (`eng-<id>-<aaaa-mm>`) : deux postes qui préparent le même mois écrivent la
   même ligne, jamais deux. Le mois préparé s'inscrit aussi sur l'engagement
   (`faits`) : une dépense préparée puis retirée ne revient pas d'elle-même.

   ELLE ARRIVE « À VALIDER » (la validation de toujours, `soumisPar` Grenat) :
   rien ne sort d'une caisse avant le oui de la direction, et la clôture du
   soir la met sous les yeux. Jamais deux fois : une dépense déjà saisie à la
   main le même jour, au même montant, pour le même bénéficiaire, ferme le
   mois sans rien poser.

   CE FICHIER EST PUR ET SANS IMPORT, pour que la fonction `cloture-du-jour`
   (qui tourne chaque heure de 8 h à 23 h à Cotonou) puisse le recopier tel
   quel entre ses repères ⟨engagements-du-mois⟩ et l'appeler :
     const r = depensesAPreparer({ engagements, existantes, aujourdhui, maintenantISO });
     → insérer r.aPoser dans `expenses` (id, branch_id, data) en
       « on conflict do nothing », puis écrire r.engagements dans
       `documents` (clé `mnd_engagements_du_mois`).
   En attendant (la fonction est l'ouvrage d'une autre copie), le Trône le
   fait à l'ouverture de Finances › Dépenses par un poste de la direction,
   en ligne, une fois les dépenses et les engagements descendus. */

/* ⟨engagements-du-mois⟩ */
export const VERSION_DES_ENGAGEMENTS = '2026-11-05-a';
/** La clé du document qui les garde (`documents`). */
export const CLE_DES_ENGAGEMENTS = 'mnd_engagements_du_mois';
/** Celui qui prépare. */
export const GRENAT = 'Grenat';
/** Le rattrapage : jamais plus de trois mois en arrière (le mois en cours compris). */
export const MOIS_DE_RATTRAPAGE = 3;
/** Les mois préparés gardés sur un engagement : deux ans. */
export const FAITS_GARDES = 24;

export type EngagementDuMois = {
  id: string;
  branchId: string;
  libelle: string;
  montantXof: number;
  categorie: string;
  sousCategorie?: string;
  caisse: string;
  /** Qui paie, quand ce n'est pas la Maison elle-même (repris d'une ancienne dépense mensuelle). */
  porteur?: string;
  /** Le jour du mois (1 à 31) ; un mois plus court prend son dernier jour. */
  jour: number;
  actif: boolean;
  /** Le premier mois préparé, aaaa-mm. */
  depuis: string;
  /** Les mois déjà préparés (aaaa-mm), les plus récents. */
  faits?: string[];
  /** La pièce de l'engagement (le bail, le contrat), jointe à chaque dépense préparée. */
  piece?: { chemin: string; nom: string; type: string; taille: number };
  /** L'ancienne dépense mensuelle dont il est né (`recurring: 'mensuel'`). */
  reprisDe?: string;
  creeLe?: string;
  creePar?: string;
};

/** Une dépense telle que la préparation la lit. */
export type DepenseVue = {
  id: string; branchId?: string; label?: string; amountXof?: number; date?: string;
  recurring?: string | null; stopped?: boolean; paused?: boolean; cashbox?: string; category?: string; subcategory?: string; porteur?: string;
  validation?: { etat?: string } | null;
};

export const cleDeLEngagement = (id: string, mois: string): string => `engagement:${id}:${mois}`;
/** L'identifiant de la dépense préparée, tiré de la clé : la même ligne sur tous les postes. */
export const idDeLaDepensePreparee = (id: string, mois: string): string =>
  `eng-${String(id).replace(/[^A-Za-z0-9_-]+/g, '-')}-${mois}`;

const MOIS_ECRITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « novembre 2026 ». */
export const moisEcrit = (mois: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(mois);
  return m ? `${MOIS_ECRITS[Number(m[2]) - 1] ?? ''} ${m[1]}` : mois;
};
/** « le 5 de chaque mois », « le 1er de chaque mois ». */
export const jourEcrit = (jour: number): string => `le ${jour}${jour === 1 ? 'er' : ''} de chaque mois`;

export const estUnMois = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const moisDe = (iso: string): string => String(iso ?? '').slice(0, 7);
export const moisSuivant = (mois: string, de = 1): string => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + de, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const dernierJour = (mois: string): number => { const [a, m] = mois.split('-').map(Number); return new Date(Date.UTC(a, m, 0, 12)).getUTCDate(); };
/** Le jour de l'engagement dans ce mois : le 31 d'un mois de trente jours est le 30. */
export const dateDuMois = (jour: number, mois: string): string =>
  `${mois}-${String(Math.min(Math.max(1, Math.floor(jour)), dernierJour(mois))).padStart(2, '0')}`;

/** Le premier mois d'un engagement nouveau : ce mois-ci si son jour n'est pas passé, sinon le suivant. */
export const premierMois = (jour: number, aujourdhui: string): string => {
  const mois = moisDe(aujourdhui);
  return dateDuMois(jour, mois) >= aujourdhui ? mois : moisSuivant(mois);
};

/** UN ENGAGEMENT BIEN FORMÉ : un libellé, un montant positif, une catégorie, un jour de 1 à 31, un mois de départ. */
export function engagementValide(e: Partial<EngagementDuMois>): string | null {
  if (!String(e.libelle ?? '').trim()) return 'Il manque le libellé.';
  if (!(Number.isInteger(e.montantXof) && (e.montantXof as number) > 0)) return 'Il manque le montant, en francs entiers.';
  if (!String(e.categorie ?? '').trim()) return 'Choisissez la catégorie.';
  if (!(Number.isInteger(e.jour) && (e.jour as number) >= 1 && (e.jour as number) <= 31)) return 'Le jour du mois va de 1 à 31.';
  if (!estUnMois(e.depuis)) return 'Le mois de départ manque.';
  return null;
}

/** LES MOIS À PRÉPARER : du départ (ou du rattrapage) au mois en cours, ceux
    dont le jour est venu, que l'engagement n'a pas encore faits. */
export function moisAPreparer(e: Pick<EngagementDuMois, 'actif' | 'depuis' | 'jour' | 'faits'>, aujourdhui: string): string[] {
  if (!e.actif || !estUnMois(e.depuis) || !(e.jour >= 1)) return [];
  const courant = moisDe(aujourdhui);
  const plusTot = moisSuivant(courant, -(MOIS_DE_RATTRAPAGE - 1));
  const faits = new Set(e.faits ?? []);
  const out: string[] = [];
  for (let m = e.depuis > plusTot ? e.depuis : plusTot; m <= courant; m = moisSuivant(m)) {
    if (faits.has(m)) continue;
    if (dateDuMois(e.jour, m) > aujourdhui) continue;
    out.push(m);
  }
  return out;
}

const motsDe = (t: string): string[] => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !/^(les|des|pour|avec|une|aux|sur|par|dans|chez|caisse|principale|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|\d+)$/.test(m));

/** LA MÊME DÉPENSE DÉJÀ SAISIE : même maison, même jour, même montant, un mot du libellé en commun, non refusée. */
export function dejaSaisie(n: { branchId: string; date: string; amountXof: number; label: string }, existantes: readonly DepenseVue[]): DepenseVue | null {
  const siens = new Set(motsDe(n.label));
  for (const e of existantes) {
    if (String(e.branchId ?? '') !== n.branchId || e.date !== n.date) continue;
    if (Math.round(Number(e.amountXof ?? -1)) !== n.amountXof) continue;
    if (e.validation?.etat === 'refusee') continue;
    const leurs = motsDe(String(e.label ?? ''));
    if (siens.size === 0 || leurs.length === 0 || leurs.some((m) => siens.has(m))) return e;
  }
  return null;
}

/** La dépense préparée d'un mois : à valider, soumise par Grenat, avec la pièce de l'engagement. */
export function depenseDuMois(e: EngagementDuMois, mois: string, maintenantISO: string) {
  return {
    id: idDeLaDepensePreparee(e.id, mois),
    branchId: e.branchId,
    label: `${e.libelle.trim()}, ${moisEcrit(mois)}`,
    amountXof: e.montantXof,
    date: dateDuMois(e.jour, mois),
    cashbox: e.caisse,
    category: e.categorie,
    ...(e.sousCategorie ? { subcategory: e.sousCategorie } : {}),
    ...(e.porteur ? { porteur: e.porteur } : { laMaisonAPaye: true }),
    ...(e.piece ? { fichier: e.piece } : {}),
    recurring: null,
    validation: { etat: 'attente' as const, soumisLe: maintenantISO, soumisPar: GRENAT },
    preparee: { par: GRENAT, source: 'engagement' as const, cle: cleDeLEngagement(e.id, mois), engagementId: e.id },
  };
}
export type DepensePreparee = ReturnType<typeof depenseDuMois>;

/** LA PRÉPARATION, d'un trait. Pure : ce qu'il faut poser, ce qui était
    déjà là, et les engagements avec leurs mois faits. Rien ne s'écrit ici. */
export function depensesAPreparer(o: {
  engagements: readonly EngagementDuMois[];
  existantes: readonly DepenseVue[];
  aujourdhui: string;
  maintenantISO: string;
}): { aPoser: DepensePreparee[]; dejaLa: { cle: string; id: string; pourquoi: 'meme-ligne' | 'saisie-a-la-main' }[]; engagements: EngagementDuMois[]; change: boolean } {
  const ids = new Set(o.existantes.map((x) => x.id));
  const aPoser: DepensePreparee[] = [];
  const dejaLa: { cle: string; id: string; pourquoi: 'meme-ligne' | 'saisie-a-la-main' }[] = [];
  let change = false;
  const engagements = o.engagements.map((e) => {
    const mois = moisAPreparer(e, o.aujourdhui);
    if (!mois.length) return e;
    const faits = [...(e.faits ?? [])];
    for (const m of mois) {
      const d = depenseDuMois(e, m, o.maintenantISO);
      const cle = cleDeLEngagement(e.id, m);
      if (ids.has(d.id)) dejaLa.push({ cle, id: d.id, pourquoi: 'meme-ligne' });
      else {
        const main = dejaSaisie({ branchId: d.branchId, date: d.date, amountXof: d.amountXof, label: d.label }, o.existantes);
        if (main) dejaLa.push({ cle, id: main.id, pourquoi: 'saisie-a-la-main' });
        else { aPoser.push(d); ids.add(d.id); }
      }
      faits.push(m);
    }
    change = true;
    return { ...e, faits: [...new Set(faits)].sort().slice(-FAITS_GARDES) };
  });
  return { aPoser, dejaLa, engagements, change };
}

/* ── LA REPRISE D'UNE ANCIENNE DÉPENSE MENSUELLE ──────────────────────────
   Une dépense `recurring: 'mensuel'` compte chaque mois dans les chiffres,
   sans validation et sans pièce, et ne sort de sa caisse qu'une fois. La
   reprendre : elle redevient la dépense de son premier mois, et l'engagement
   prend la suite dès le mois d'après, chaque mois à valider (le rattrapage
   s'arrête à trois mois). La direction refuse ce qui n'a pas eu lieu. */

/** Les anciennes dépenses mensuelles qui courent encore, pas encore reprises. */
export function mensuellesAReprendre<T extends DepenseVue>(depenses: readonly T[], engagements: readonly EngagementDuMois[], branchId: string): T[] {
  const reprises = new Set(engagements.map((e) => e.reprisDe).filter(Boolean));
  return depenses.filter((d) => d.branchId === branchId && d.recurring === 'mensuel' && !d.stopped && !d.paused
    && d.validation?.etat !== 'refusee' && d.validation?.etat !== 'attente' && !reprises.has(d.id));
}

/** L'ENGAGEMENT NÉ D'UNE ANCIENNE DÉPENSE MENSUELLE, et ce qu'elle devient. */
export function repriseDeLaMensuelle(d: DepenseVue, o: { id: string; aujourdhui: string; parQui: string; maintenantISO: string }): {
  engagement: EngagementDuMois; devient: { recurring: null };
} {
  const jour = Number(String(d.date ?? '').slice(8, 10)) || 1;
  const premier = moisSuivant(moisDe(String(d.date ?? o.aujourdhui)));
  const plusTot = moisSuivant(moisDe(o.aujourdhui), -(MOIS_DE_RATTRAPAGE - 1));
  return {
    engagement: {
      id: o.id,
      branchId: String(d.branchId ?? ''),
      libelle: String(d.label ?? '').trim() || 'Engagement',
      montantXof: Math.round(Number(d.amountXof) || 0),
      categorie: String(d.category ?? '').trim() || 'Divers',
      ...(d.subcategory ? { sousCategorie: d.subcategory } : {}),
      caisse: String(d.cashbox ?? ''),
      ...(String(d.porteur ?? '').trim() ? { porteur: String(d.porteur).trim() } : {}),
      jour,
      actif: true,
      depuis: premier > plusTot ? premier : plusTot,
      reprisDe: d.id,
      creeLe: o.maintenantISO,
      creePar: o.parQui,
    },
    devient: { recurring: null },
  };
}

/** Ce que l'engagement coûte par mois, les actifs seulement. */
export const totalDesEngagements = (l: readonly EngagementDuMois[], branchId: string): number =>
  l.filter((e) => e.branchId === branchId && e.actif).reduce((s, e) => s + e.montantXof, 0);
/* ⟨/engagements-du-mois⟩ */
