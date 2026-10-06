/* LES RETOUCHES DU SITE, DANS LA BASE — 4 octobre 2026.
   Deux documents : le BROUILLON (le personnel, rien n'est en ligne) et ce qui
   est PUBLIÉ (lisible du générateur, écrit par la direction seule, 0114).
   La règle vit dans `site-retouches.ts`. */
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { LigneDuRegistre, Retouches, RetouchesDePage } from './site-retouches';

export type BrouillonDuSite = { pages: Record<string, RetouchesDePage>; photos?: LigneDuRegistre[] };
export type PublieDuSite = Retouches & { precedent?: Retouches };

export const brouillonDuSiteStore = createStore<BrouillonDuSite>('mnd_site_brouillon', { pages: {} });
export const publieDuSiteStore = createStore<PublieDuSite>('mnd_site_publie', { pages: {} });
export const useBrouillonDuSite = () => useStore(brouillonDuSiteStore);
export const usePublieDuSite = () => useStore(publieDuSiteStore);

bindDocument(brouillonDuSiteStore, 'mnd_site_brouillon');
bindDocument(publieDuSiteStore, 'mnd_site_publie');

/** Combien de champs attendent d'être publiés. */
export const changementsEnAttente = (b: BrouillonDuSite): number =>
  Object.values(b.pages ?? {}).reduce((n, r) => n + Object.keys(r).length, 0);
