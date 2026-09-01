/* ══ LES MAISONS CHEZ QUI L'ON ACHÈTE — 1er septembre 2026 ═══════════════
   « J'achète dans certains supermarchés de manière très répétitive au fil
   d'une année. Aussi j'ai des fournisseurs chez qui nous achetons très
   souvent. J'aimerais qu'ils aient un suivi de manière très précise et un
   compte que j'interroge facilement » (Yéman).

   L'HISTOIRE EXISTE DÉJÀ, PERSONNE NE L'A NOMMÉE. Un fournisseur n'était qu'un
   mot tapé à la main dans le libellé d'une dépense. « Où va l'argent » les
   regroupait du plus payé au moins payé et s'arrêtait là : pas de fiche, pas
   de rythme, pas de contact, et « Super U » écrit une fois « SuperU » faisait
   deux maisons.

   PAS DE SOLDE, ET C'EST UN CHOIX DE LA MAISON. Elle paie à chaque passage :
   un compte fournisseur n'est donc pas une ardoise, c'est une mémoire.
   Afficher un « reste dû » toujours à zéro ferait douter du chiffre le jour où
   il ne le serait pas.

   CE FICHIER NE LIT QUE. Aucune dépense n'est modifiée : le rattachement vit
   sur la fiche du fournisseur, jamais sur l'écriture. */
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { normName } from './text';
import { compteDansLesChiffres, expenseTotal, type Expense, type ExpenseItem } from './finance';

export type Fournisseur = {
  id: string;
  branchId: string;
  nom: string;
  /** SES AUTRES NOMS. « SuperU », « super u cotonou », « SUPER-U » : la fiche
      les rassemble. C'est ce qui rend l'historique juste sans jamais toucher
      aux écritures. */
  alias?: string[];
  /** Supermarché, matières, local… Libre : la Maison range comme elle parle. */
  famille?: string;
  telephone?: string;
  note?: string;
  archived?: boolean;
};

export const fournisseursStore = createStore<Fournisseur[]>('mnd_fournisseurs', []);
bindDocument(fournisseursStore, 'mnd_fournisseurs');
export const useFournisseurs = () => useStore(fournisseursStore);

/** LE BÉNÉFICIAIRE LU DANS UN LIBELLÉ — « Loyer — Août 2026 » devient
    « Loyer ». Le mois final d'une charge récurrente ferait autant de maisons
    qu'il y a de mois. Même règle que l'onglet « Où va l'argent », d'où elle
    vient : les deux écrans doivent nommer les mêmes maisons. */
export const beneficiaireDuLibelle = (label: string): string =>
  label.replace(/\s+[—-]\s+[A-Za-zÀ-ÿ]+\s+\d{4}\s*$/u, '').trim() || label.trim();

/** Tous les noms sous lesquels une maison se reconnaît. */
export const nomsDe = (f: Fournisseur): string[] =>
  [f.nom, ...(f.alias ?? [])].map((n) => normName(n)).filter(Boolean);

/** Le NOYAU d'un nom : ses lettres et ses chiffres, sans rien d'autre.
    « SUPER-U », « Super U » et « super_u » y deviennent le même mot. Sert à
    RAPPROCHER, jamais à décider : le rattachement reste un geste de la Maison. */
const noyau = (s: string): string => normName(s).replace(/[^a-z0-9]/g, '');

/** LA MAISON D'UNE DÉPENSE, dans l'ordre de la règle validée :
      ① le fournisseur choisi sur la dépense ;
      ② sinon son nom retrouvé dans le libellé ;
      ③ sinon un de ses autres noms.

    LE DEUXIÈME EST CELUI QUI DONNE L'HISTORIQUE dès le premier jour, sans rien
    ressaisir : c'est lui qui fait naître le répertoire plein plutôt que vide. */
export const fournisseurDeLaDepense = (
  e: Pick<Expense, 'label' | 'fournisseurId'>,
  fournisseurs: readonly Fournisseur[],
): Fournisseur | undefined => {
  if (e.fournisseurId) {
    const par = fournisseurs.find((f) => f.id === e.fournisseurId);
    if (par) return par;
  }
  const cle = normName(beneficiaireDuLibelle(e.label));
  if (!cle) return undefined;
  return fournisseurs.find((f) => nomsDe(f).includes(cle));
};

export type CompteFournisseur = {
  fournisseur: Fournisseur;
  totalXof: number;
  n: number;
  premier: string;
  dernier: string;
  /** Jours moyens entre deux passages. `null` sous deux passages : un seul
      achat ne dessine aucun rythme, et annoncer « tous les 0 jour » mentirait. */
  rythmeJours: number | null;
  moyenneXof: number;
  minXof: number;
  maxXof: number;
  /** Dépenses retenues, du plus récent au plus ancien. */
  lignes: Expense[];
};

/** LES COMPTES D'UNE PÉRIODE, du plus payé au moins payé.

    CE QUI ATTEND UN OUI N'EST PAS UNE DÉPENSE : `compteDansLesChiffres` écarte
    les soumissions en attente et les refus, comme partout ailleurs. Un
    fournisseur ne doit pas peser de ce que la Maison n'a pas accepté. */
export function comptesFournisseurs(o: {
  expenses: readonly Expense[];
  fournisseurs: readonly Fournisseur[];
  branchId: string;
  /** Bornes ISO incluses. Absentes = tout l'historique. */
  du?: string;
  au?: string;
}): CompteFournisseur[] {
  const retenues = o.expenses.filter((e) => e.branchId === o.branchId
    && !e.stopped
    && compteDansLesChiffres(e)
    && (!o.du || e.date >= o.du)
    && (!o.au || e.date <= o.au));

  const par = new Map<string, Expense[]>();
  for (const e of retenues) {
    const f = fournisseurDeLaDepense(e, o.fournisseurs);
    if (!f || f.archived) continue;
    par.set(f.id, [...(par.get(f.id) ?? []), e]);
  }

  const out: CompteFournisseur[] = [];
  for (const f of o.fournisseurs) {
    const lignes = par.get(f.id);
    if (!lignes?.length) continue;
    const montants = lignes.map((e) => expenseTotal(e));
    const dates = lignes.map((e) => e.date).sort();
    const premier = dates[0];
    const dernier = dates[dates.length - 1];
    /* LE RYTHME SE COMPTE SUR L'ÉTENDUE, pas sur la moyenne des écarts : deux
       passages le même jour et un troisième six mois plus tard donnent bien
       « tous les 90 jours », et non « tous les 60 ». */
    const jours = (Date.parse(`${dernier}T00:00:00`) - Date.parse(`${premier}T00:00:00`)) / 86_400_000;
    out.push({
      fournisseur: f,
      totalXof: montants.reduce((a, b) => a + b, 0),
      n: lignes.length,
      premier,
      dernier,
      rythmeJours: lignes.length >= 2 && jours > 0 ? Math.max(1, Math.round(jours / (lignes.length - 1))) : null,
      moyenneXof: Math.round(montants.reduce((a, b) => a + b, 0) / lignes.length),
      minXof: Math.min(...montants),
      maxXof: Math.max(...montants),
      lignes: [...lignes].sort((a, b) => (a.date < b.date ? 1 : -1)),
    });
  }
  return out.sort((a, b) => b.totalXof - a.totalXof);
}

export type ArticleSuivi = {
  label: string;
  n: number;
  dernierPrixXof: number;
  dernierLe: string;
  /** Le prix le plus ancien de la période lue. `null` s'il n'y en a qu'un :
      un article vu une seule fois n'a pas d'écart, et en inventer un ferait
      lire une hausse là où il n'y a qu'un achat. */
  premierPrixXof: number | null;
  premierLe: string | null;
  ecartPct: number | null;
};

/** CE QU'ON ACHÈTE CHEZ EUX, ET À QUEL PRIX.

    ELLE NE PARAÎT QUE SI L'ON DÉTAILLE — décision de Yéman : l'achat est
    toujours suivi, l'article ne l'est que quand il a été saisi. Une fiche sans
    articles ne montre pas un tableau vide, elle n'en montre aucun.

    LE PRIX SUIVI EST CELUI DE L'UNITÉ quand la quantité est là : deux litres à
    1 450 F ne sont pas un litre à 2 900 F, et comparer des paniers ferait
    passer une commande double pour une flambée. */
export function articlesDuFournisseur(lignes: readonly Expense[]): ArticleSuivi[] {
  const par = new Map<string, { label: string; vus: { prix: number; date: string }[] }>();
  for (const e of lignes) {
    for (const it of e.items ?? []) {
      const nom = (it.label ?? '').trim();
      const cle = normName(nom);
      if (!cle) continue;
      const prix = prixUnitaire(it);
      if (prix <= 0) continue;
      const d = par.get(cle);
      if (d) d.vus.push({ prix, date: e.date });
      else par.set(cle, { label: nom, vus: [{ prix, date: e.date }] });
    }
  }
  const out: ArticleSuivi[] = [];
  for (const { label, vus } of par.values()) {
    const tri = [...vus].sort((a, b) => (a.date < b.date ? -1 : 1));
    const premier = tri[0];
    const dernier = tri[tri.length - 1];
    const aUnEcart = tri.length >= 2 && premier.prix > 0;
    out.push({
      label,
      n: tri.length,
      dernierPrixXof: dernier.prix,
      dernierLe: dernier.date,
      premierPrixXof: aUnEcart ? premier.prix : null,
      premierLe: aUnEcart ? premier.date : null,
      ecartPct: aUnEcart
        ? Math.round(((dernier.prix - premier.prix) / premier.prix) * 1000) / 10
        : null,
    });
  }
  return out.sort((a, b) => b.n - a.n || b.dernierPrixXof - a.dernierPrixXof);
}

/** Le prix d'UNE unité : le montant de la ligne divisé par sa quantité. */
export const prixUnitaire = (it: ExpenseItem): number => {
  if (typeof it.unitXof === 'number' && it.unitXof > 0) return Math.round(it.unitXof);
  const q = typeof it.qty === 'number' && it.qty > 0 ? it.qty : 1;
  return Math.round((it.amountXof ?? 0) / q);
};

export type LibelleVoisin = { libelle: string; n: number; totalXof: number };

/** LES LIBELLÉS QUI LUI RESSEMBLENT, et qu'elle ne porte pas encore.

    ELLE PROPOSE, ELLE NE RATTACHE JAMAIS D'OFFICE. « Super U Godomey » est
    peut-être une autre boutique, avec d'autres prix, que la Maison veut suivre
    à part. Deviner mélangerait deux comptes, et l'erreur ne se verrait qu'au
    moment de comparer des chiffres devenus faux.

    LA RESSEMBLANCE EST SIMPLE ET SE DIT EN UNE PHRASE : l'un des noms connus
    est contenu dans le libellé, ou l'inverse. Une distance d'édition serait
    plus savante et beaucoup moins prévisible ; ici, on doit pouvoir répondre
    « pourquoi celui-là ? » sans ouvrir le code.

    ON COMPARE LE NOYAU DES LETTRES, pas la ponctuation : « SUPER-U » et
    « Super U » ne se ressemblaient pas, faute d'un trait d'union. C'est
    précisément le genre de variante qu'une caisse écrit un jour sur deux, et
    la manquer laisserait la maison la plus fréquentée hors de sa propre
    fiche. */
export function libellesVoisins(
  f: Fournisseur,
  expenses: readonly Expense[],
  fournisseurs: readonly Fournisseur[],
  branchId: string,
): LibelleVoisin[] {
  const siens = nomsDe(f).map(noyau).filter(Boolean);
  if (siens.length === 0) return [];
  const par = new Map<string, LibelleVoisin>();
  for (const e of expenses) {
    if (e.branchId !== branchId || e.stopped || !compteDansLesChiffres(e)) continue;
    /* Déjà rattaché quelque part : on ne vole pas la maison d'un autre. */
    if (fournisseurDeLaDepense(e, fournisseurs)) continue;
    const brut = beneficiaireDuLibelle(e.label);
    const noy = noyau(brut);
    /* ON NE REJETTE PAS CE QUI LUI RESSEMBLE TROP. « SUPER-U » a exactement le
       même noyau que « Super U » : l'écarter comme « déjà sien » le laissait
       hors de toute fiche, alors que c'est justement la variante à rattacher.
       La seule garde nécessaire est celle du dessus : ce qui est DÉJÀ porté par
       une fiche ne se propose pas. */
    if (!noy) continue;
    if (!siens.some((n) => noy.includes(n) || n.includes(noy))) continue;
    /* Les variantes se regroupent sur leur noyau : « SUPER-U » et « super u »
       ne font qu'une proposition, pas deux. */
    const d = par.get(noy);
    if (d) { d.n += 1; d.totalXof += expenseTotal(e); }
    else par.set(noy, { libelle: brut, n: 1, totalXof: expenseTotal(e) });
  }
  return [...par.values()].sort((a, b) => b.totalXof - a.totalXof);
}

/** LES MAISONS QU'AUCUNE FICHE NE PORTE ENCORE — « à ranger ».

    LE RÉPERTOIRE NAÎT PLEIN, PAS VIDE : il se construit des libellés déjà
    écrits, exactement comme « Où va l'argent ». La Maison n'a rien à saisir
    pour qu'il serve dès le premier jour, elle n'a qu'à nommer ceux qui
    comptent. */
export function maisonsARanger(o: {
  expenses: readonly Expense[];
  fournisseurs: readonly Fournisseur[];
  branchId: string;
  du?: string;
}): LibelleVoisin[] {
  const par = new Map<string, LibelleVoisin>();
  for (const e of o.expenses) {
    if (e.branchId !== o.branchId || e.stopped || !compteDansLesChiffres(e)) continue;
    if (o.du && e.date < o.du) continue;
    if (fournisseurDeLaDepense(e, o.fournisseurs)) continue;
    const brut = beneficiaireDuLibelle(e.label);
    const cle = normName(brut);
    if (!cle) continue;
    const d = par.get(cle);
    if (d) { d.n += 1; d.totalXof += expenseTotal(e); }
    else par.set(cle, { libelle: brut, n: 1, totalXof: expenseTotal(e) });
  }
  return [...par.values()].sort((a, b) => b.totalXof - a.totalXof);
}
