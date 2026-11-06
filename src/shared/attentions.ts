import { createStore, uid, useStore } from './store';
import { bindCollection } from './sync';
import { categoriesStore, productsStore } from './catalog';
import {
  ARTICLES_DICTES, ecartesDe, marqueLArrivee, pourquoiPasCetArticle, remetLePanier,
  type ArticleDAttention, type PanierDAttention, type ReglageDAttention,
} from './attentions-pur';

/* ══ L'ATTENTION, CE QUE LA MAISON GARDE · 6 novembre 2026 ════════════════
   Les trois collections de l'attention (migration 0170), à la Maison seule :
   la base ne les ouvre à aucune cliente, et Ma Couronne n'importe JAMAIS ce
   fichier. Elle demande `mes_attentions`, qui garde la surprise.

   Les règles sont dans `attentions-pur.ts` ; ici, seulement les magasins et
   les gestes qui écrivent. Un panier porte l'identifiant de son rendez-vous :
   l'écrire deux fois réécrit le même, jamais un second. Rien ne s'efface : un
   article se retire, un panier reste. */

export const articlesDAttentionStore = createStore<ArticleDAttention[]>('mnd_attention_articles', []);
export const useArticlesDAttention = () => useStore(articlesDAttentionStore);
bindCollection(articlesDAttentionStore, 'attention_articles');

export const paniersDAttentionStore = createStore<PanierDAttention[]>('mnd_attention_paniers', []);
export const usePaniersDAttention = () => useStore(paniersDAttentionStore);
bindCollection(paniersDAttentionStore, 'attention_paniers');

export const reglagesDAttentionStore = createStore<ReglageDAttention[]>('mnd_attention_reglages', []);
export const useReglagesDAttention = () => useStore(reglagesDAttentionStore);
bindCollection(reglagesDAttentionStore, 'attention_reglages');

const ecrit = <T extends { id: string }>(liste: readonly T[], x: T): T[] =>
  (liste.some((y) => y.id === x.id) ? liste.map((y) => (y.id === x.id ? x : y)) : [...liste, x]);

/** Un article neuf, ou repris. */
export function enregistreLArticle(a: Omit<ArticleDAttention, 'id'> & { id?: string }): ArticleDAttention {
  const article: ArticleDAttention = { ...a, id: a.id ?? `att-${uid()}` };
  articlesDAttentionStore.set((prev) => ecrit(prev, article));
  return article;
}

/** LES ARTICLES DICTÉS, posés d'un toucher dans une boutique vide. Une boutique
    qui a déjà un article ne les reçoit pas : rien ne se pose deux fois. */
export function poseLesArticlesDictes(branchId: string): number {
  const deja = articlesDAttentionStore.get().some((a) => a.branchId === branchId);
  if (deja) return 0;
  const neufs: ArticleDAttention[] = ARTICLES_DICTES.map((a, i) => ({ ...a, id: `att-${uid()}`, branchId, ordre: i + 1 }));
  articlesDAttentionStore.set((prev) => [...prev, ...neufs]);
  return neufs.length;
}

/** Le panier tel qu'il est : proposé qu'on change, ou validé qu'on reprend. */
export function ecritLePanier(p: PanierDAttention): void {
  paniersDAttentionStore.set((prev) => ecrit(prev, p));
}

/** VALIDER : le panier devient celui de la séance, et l'abonnée voit son pli scellé. */
export function valideLePanier(p: PanierDAttention, quand: string, par?: string): PanierDAttention {
  const valide: PanierDAttention = { ...p, etat: 'valide', valideLe: quand, ...(par ? { validePar: par } : {}) };
  ecritLePanier(valide);
  return valide;
}

/** Rouvrir un panier validé pas encore remis, pour le changer. */
export function rouvreLePanier(id: string): void {
  paniersDAttentionStore.set((prev) => prev.map((p) => (p.id === id && !p.remiseLe ? { ...p, etat: 'propose' as const } : p)));
}

/** « ARRIVÉE ». */
export function arriveeAuFauteuil(id: string, quand: string, par?: string): void {
  paniersDAttentionStore.set((prev) => prev.map((p) => (p.id === id ? marqueLArrivee(p, quand, par) : p)));
}

/** « REMISE » : le panier se fige, la réserve comptée baisse. */
export function remiseAuFauteuil(id: string, quand: string, par?: string): boolean {
  const p = paniersDAttentionStore.get().find((x) => x.id === id);
  if (!p || p.etat !== 'valide' || p.remiseLe) return false;
  const r = remetLePanier(p, articlesDAttentionStore.get(), quand, par);
  ecritLePanier(r.panier);
  articlesDAttentionStore.set(() => r.articles);
  return true;
}

/* ── À LA CARTE : LE PRODUIT QUI PORTE L'ARTICLE À L'ENCAISSEMENT ─────────
   Un article à la carte se vend : le ticket, la caisse et la pièce passent
   par « La Gamme » de l'encaissement, qui ne connaît que les produits du
   catalogue. Chaque article à la carte a donc SON produit, créé et tenu à
   jour ici (nom, prix), rangé dans une catégorie « Les attentions » fermée
   aux vitrines : Ma Couronne et le site ne la montrent pas. */

export const CATEGORIE_DES_ATTENTIONS = 'attentions';

function garantitLaCategorie(): void {
  if (categoriesStore.get().some((c) => c.id === CATEGORIE_DES_ATTENTIONS)) return;
  categoriesStore.set((prev) => [...prev, {
    id: CATEGORIE_DES_ATTENTIONS, fon: 'Les attentions', label: 'À la carte, en fin de rendez-vous', enabled: false, produits: true,
    order: prev.reduce((m, c) => Math.max(m, c.order ?? 0), 0) + 1,
  }]);
}

/** L'article, avec son produit du catalogue : créé s'il manque, repris si le
    nom ou le prix ont changé. Un article offert, ou à la carte sans prix
    valable, n'a pas de produit. */
export function avecSonProduit(a: ArticleDAttention): ArticleDAttention {
  if (a.niveau !== 'carte' || a.prixXof === undefined || pourquoiPasCetArticle(a)) return a;
  const prixXof = a.prixXof;
  const deja = a.produitId ? productsStore.get().find((p) => p.id === a.produitId) : undefined;
  if (deja) {
    if (deja.name !== a.nom || deja.priceXof !== prixXof) {
      productsStore.set((prev) => prev.map((p) => (p.id === deja.id ? { ...p, name: a.nom, priceXof: prixXof } : p)));
    }
    return a;
  }
  garantitLaCategorie();
  const id = `prod-att-${uid()}`;
  productsStore.set((prev) => [...prev, {
    id, categoryId: CATEGORIE_DES_ATTENTIONS, name: a.nom, priceXof: prixXof, stock: 0,
    order: prev.reduce((m, p) => Math.max(m, p.order ?? 0), 0) + 1,
  }]);
  return { ...a, produitId: id };
}

/** CE QUI VIENT D'ÊTRE VENDU À L'ENCAISSEMENT sort de la réserve comptée des
    articles à la carte. Appelé une fois, après la vente, avec les lignes de
    produits de la pièce. */
export function sortLesArticlesVendus(lignes: readonly { produitId?: string; qty: number }[]): void {
  const vendus = new Map<string, number>();
  for (const l of lignes) if (l.produitId && l.qty > 0) vendus.set(l.produitId, (vendus.get(l.produitId) ?? 0) + l.qty);
  if (vendus.size === 0) return;
  const concernes = articlesDAttentionStore.get().some((a) => a.produitId && vendus.has(a.produitId) && typeof a.reserve === 'number');
  if (!concernes) return;
  articlesDAttentionStore.set((prev) => prev.map((a) => (a.produitId && vendus.has(a.produitId) && typeof a.reserve === 'number'
    ? { ...a, reserve: Math.max(0, a.reserve - (vendus.get(a.produitId) ?? 0)) } : a)));
}

/** Un réglage (programme, collection, coût visé, écarts d'une tête). */
export function ecritLeReglage(r: ReglageDAttention): void {
  reglagesDAttentionStore.set((prev) => ecrit(prev, r));
}

/** « NE PLUS LUI PROPOSER » : l'article sort des propositions pour cette tête. */
export function nePlusLuiProposer(clientId: string, articleId: string, branchId?: string): void {
  const deja = ecartesDe(reglagesDAttentionStore.get(), clientId);
  if (deja.includes(articleId)) return;
  ecritLeReglage({ id: `ecarts:${clientId}`, ...(branchId ? { branchId } : {}), type: 'ecarts', clientId, articles: [...deja, articleId] });
}
