import { createStore, useStore, uid } from './store';
import {
  mouvementsStockStore, produitsStockStore, stockDe, stocksParProduit,
  type MouvementStock, type ProduitStock,
} from './stock';
import type { StockMap } from '../apps/trone/routes/vente/lab';

/* LE LABORATOIRE, BRANCHÉ AU RÉEL.

   Le formulateur connaissait les formules mais pas la maison : sa réserve était
   une liste de bascules à la main — et même pas persistée, un rechargement
   effaçait tout. Désormais :

   ── L'INGRÉDIENT EST UNE FICHE D'INVENTAIRE. Chaque ingrédient des formules se
   LIE à une fiche du module Stock & Achats (le champ `labIngredient` de la
   fiche porte le nom exact de l'ingrédient). La disponibilité cesse d'être une
   opinion : un ingrédient lié est disponible si son stock dérivé est positif.
   Un ingrédient jamais lié reste réputé disponible — comme avant — le chemin
   pour dire « épuisé » est de créer sa fiche, pas de basculer un interrupteur.

   ── LA PRÉPARATION EST POUR UNE CLIENTE. On compose depuis son besoin, avec
   des quantités, et FABRIQUER CONSOMME LE STOCK : un mouvement `fabrication`
   par ingrédient, référencé `prep:<id>`, idempotent et rembobinable — le même
   patron que les rituels honorés.

   ── L'ARGENT EST OPTIONNEL. Une préparation peut être facturée à son nom
   (elle rejoint alors les circuits existants — impayés, encaissements) ou
   simplement remise, offerte pendant le rituel. Les deux existent au salon. */

export type LignePreparation = {
  produitId: string;
  quantite: number;
};

export type StatutPreparation = 'proposee' | 'fabriquee' | 'remise';

export const PREPARATION_NOMS: Record<StatutPreparation, string> = {
  proposee: 'Proposée',
  fabriquee: 'Fabriquée',
  remise: 'Remise',
};

export type Preparation = {
  id: string;
  branchId: string;
  /** LA CLIENTE — une préparation sans tête n'existe pas : c'est tout l'objet. */
  clientId: string;
  /** Le besoin qui a guidé la formule (clé de LAB_CONCERNS). */
  concernK: string;
  /** Le nom de la formule au moment de la composition — « … · recomposé » si
      des ingrédients ont été substitués. Figé : la formule de référence peut
      évoluer, pas ce qu'on a réellement préparé pour elle. */
  nomFormule: string;
  forme?: string;
  /** Ce qui sera consommé à la fabrication — les fiches liées seulement. */
  lignes: LignePreparation[];
  /** Les ingrédients en toutes lettres, substitutions comprises — la mémoire
      complète de la composition, même pour ce qui n'a pas de fiche. */
  ingredientsTexte: string[];
  prixXof: number;
  notes?: string;
  statut: StatutPreparation;
  composeeLe: string;
  fabriqueeLe?: string;
  remiseLe?: string;
  /** Posé par « Facturer » — la préparation rejoint les circuits d'argent. */
  invoiceId?: string;
};

export const preparationsLabStore = createStore<Preparation[]>('mnd_lab_preparations', []);
export const usePreparationsLab = () => useStore(preparationsLabStore);

/* ---------- La liaison ingrédient ↔ fiche ---------- */

export const fichePourIngredient = (nom: string, produits: ProduitStock[]): ProduitStock | undefined =>
  produits.find((p) => p.labIngredient === nom && p.actif);

/** Lie une fiche à un ingrédient du Laboratoire. Une fiche ne porte qu'UN
    ingrédient, et un ingrédient qu'UNE fiche — relier déplace le lien. */
export function lierIngredient(produitId: string, nomIngredient: string): void {
  produitsStockStore.set((prev) => prev.map((p) => {
    if (p.id === produitId) return { ...p, labIngredient: nomIngredient };
    if (p.labIngredient === nomIngredient) return { ...p, labIngredient: undefined };
    return p;
  }));
}

export function delierIngredient(nomIngredient: string): void {
  produitsStockStore.set((prev) => prev.map((p) => (
    p.labIngredient === nomIngredient ? { ...p, labIngredient: undefined } : p
  )));
}

/** La réserve VUE PAR LES FORMULES : le pont vers la logique existante du
    formulateur (substitutions, correspondances). Lié → stock dérivé positif ;
    jamais lié → disponible, comme avant. */
export function stockReelDuLab(
  ingredients: string[],
  produits: ProduitStock[],
  mouvements: MouvementStock[],
): StockMap {
  const stocks = stocksParProduit(mouvements);
  const map: StockMap = {};
  for (const nom of ingredients) {
    const fiche = fichePourIngredient(nom, produits);
    if (fiche) map[nom] = (stocks.get(fiche.id) ?? 0) > 0;
  }
  return map;
}

/* ---------- La préparation ---------- */

export function composerPreparation(
  branchId: string,
  clientId: string,
  champs: Pick<Preparation, 'concernK' | 'nomFormule' | 'ingredientsTexte' | 'prixXof'>
    & Partial<Pick<Preparation, 'forme' | 'notes'>>,
  lignes: LignePreparation[],
  date: string,
): { ok: boolean; erreur?: string; id?: string } {
  if (!clientId) return { ok: false, erreur: 'Il faut une cliente — une préparation se compose pour quelqu’un.' };
  if (!champs.nomFormule.trim()) return { ok: false, erreur: 'Il manque le nom de la formule.' };
  const propres = lignes.filter((l) => l.produitId && Number.isFinite(l.quantite) && l.quantite > 0);
  if (!propres.length) {
    return { ok: false, erreur: 'Aucun ingrédient lié avec une quantité — rien ne serait consommé à la fabrication. Reliez les fiches dans La réserve.' };
  }
  const id = `prep-${uid()}`;
  preparationsLabStore.set((prev) => [...prev, {
    id, branchId, clientId,
    concernK: champs.concernK,
    nomFormule: champs.nomFormule.trim(),
    forme: champs.forme,
    lignes: propres,
    ingredientsTexte: champs.ingredientsTexte,
    prixXof: Math.max(0, Math.round(champs.prixXof)),
    notes: champs.notes?.trim() || undefined,
    statut: 'proposee',
    composeeLe: date,
  }]);
  return { ok: true, id };
}

/** Le coût matière RÉEL — au prix d'achat du jour des fiches consommées. */
export function coutPreparationXof(prep: Pick<Preparation, 'lignes'>, produits: ProduitStock[]): number {
  return prep.lignes.reduce((s, l) => {
    const p = produits.find((x) => x.id === l.produitId);
    return s + (p ? l.quantite * p.prixAchatXof : 0);
  }, 0);
}

const REF_PREP = (id: string): string => `prep:${id}`;

/** FABRIQUER CONSOMME. Un mouvement par ingrédient, référencé sur la
    préparation — idempotent : refabriquer ne reconsomme pas. On ne borne pas à
    zéro : fabriquer avec une réserve trop courte laisse un stock négatif, qui
    dit la vérité mieux qu'un refus. */
export function fabriquerPreparation(prep: Preparation, date: string): { ok: boolean; erreur?: string } {
  if (prep.statut !== 'proposee') return { ok: false, erreur: 'Cette préparation est déjà fabriquée.' };
  const ref = REF_PREP(prep.id);
  if (!mouvementsStockStore.get().some((m) => m.reference === ref)) {
    const nouveaux: MouvementStock[] = prep.lignes.map((l) => ({
      id: `mvt-${uid()}`, branchId: prep.branchId, date, type: 'fabrication' as const,
      produitId: l.produitId, quantite: -l.quantite, reference: ref,
    }));
    mouvementsStockStore.set((prev) => [...prev, ...nouveaux]);
  }
  preparationsLabStore.set((prev) => prev.map((p) => (
    p.id === prep.id ? { ...p, statut: 'fabriquee', fabriqueeLe: date } : p
  )));
  return { ok: true };
}

/** L'annulation rembobine — sauf si une facture existe : l'argent d'abord.
    On annule la facture par le circuit des factures, puis la fabrication. */
export function annulerFabrication(prep: Preparation): { ok: boolean; erreur?: string } {
  if (prep.statut === 'proposee') return { ok: false, erreur: 'Cette préparation n’est pas fabriquée.' };
  if (prep.invoiceId) {
    return { ok: false, erreur: 'Elle porte une facture — annulez la facture d’abord, la fabrication ensuite.' };
  }
  const ref = REF_PREP(prep.id);
  mouvementsStockStore.set((prev) => prev.filter((m) => m.reference !== ref));
  preparationsLabStore.set((prev) => prev.map((p) => (
    p.id === prep.id ? { ...p, statut: 'proposee', fabriqueeLe: undefined, remiseLe: undefined } : p
  )));
  return { ok: true };
}

/** Remise en main propre — offerte, ou réglée ailleurs. La facture reste
    possible après coup : remettre n'efface pas l'argent. */
export function remettrePreparation(prep: Preparation, date: string): { ok: boolean; erreur?: string } {
  if (prep.statut === 'proposee') return { ok: false, erreur: 'Fabriquez-la d’abord.' };
  preparationsLabStore.set((prev) => prev.map((p) => (
    p.id === prep.id ? { ...p, statut: 'remise', remiseLe: date } : p
  )));
  return { ok: true };
}

/** « Facturer » pose le lien — la facture elle-même se crée côté écran, avec
    le numéroteur des factures. Un seul lien : refacturer est refusé. */
export function poserFacture(prep: Preparation, invoiceId: string): { ok: boolean; erreur?: string } {
  if (prep.statut === 'proposee') return { ok: false, erreur: 'Fabriquez-la avant de la facturer.' };
  if (prep.invoiceId) return { ok: false, erreur: 'Elle est déjà facturée.' };
  preparationsLabStore.set((prev) => prev.map((p) => (
    p.id === prep.id ? { ...p, invoiceId } : p
  )));
  return { ok: true };
}

export function supprimerPreparation(prep: Preparation): { ok: boolean; erreur?: string } {
  if (prep.statut !== 'proposee') {
    return { ok: false, erreur: 'Une préparation fabriquée ne se supprime pas — annulez d’abord sa fabrication.' };
  }
  preparationsLabStore.set((prev) => prev.filter((p) => p.id !== prep.id));
  return { ok: true };
}

/** Ce qui manquerait à la fabrication — pour prévenir AVANT le geste. */
export function manquesPourFabrication(
  prep: Pick<Preparation, 'lignes'>,
  produits: ProduitStock[],
  mouvements: MouvementStock[],
): { produit: ProduitStock; stock: number; manque: number }[] {
  const out: { produit: ProduitStock; stock: number; manque: number }[] = [];
  for (const l of prep.lignes) {
    const p = produits.find((x) => x.id === l.produitId);
    if (!p) continue;
    const s = stockDe(p.id, mouvements);
    if (s < l.quantite) out.push({ produit: p, stock: s, manque: l.quantite - s });
  }
  return out;
}

/* ---------- Synchronisation ---------- */

import { bindCollection } from './sync';
bindCollection(preparationsLabStore, 'lab_preparations');
