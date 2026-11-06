import { createStore, uid, useStore } from './store';
import { bindCollection } from './sync';
import {
  ARTICLES_DICTES, ecartesDe, marqueLArrivee, remetLePanier,
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
