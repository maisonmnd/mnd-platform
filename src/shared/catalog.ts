import { createStore, useStore } from './store';

/* Catalogue — double nomenclature fon™ de la maison.
   Chaque catégorie porte un nom fon (marque déposée) + un descripteur français.
   La visibilité front (Vitrine / Ma Couronne) respecte `enabled` + vitrineConfig. */

export type CatalogCategory = {
  id: string;
  fon: string; // VÈKPÈ™, SÍNSIN™…
  label: string; // descripteur français
  enabled: boolean; // visible côté front (Vitrine / Ma Couronne)
  order: number;
};

export type Service = {
  id: string;
  categoryId: string;
  name: string;
  palier: 'Fondation' | 'Élévation' | 'Souveraineté';
  priceXof: number;
  hidePrice: boolean;
  sessions: number; // nombre de séances
  master: string; // maître assigné
  durationMin: number;
  order: number;
  description?: string;
  /** Couverture des quatre temps : Purifier · Nourrir · Sceller · Couronner (1 = couvert). */
  temps?: number[];
};

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  priceXof: number;
  stock: number;
  order: number;
};

export const CATEGORIES_SEED: CatalogCategory[] = [
  { id: 'vekpe', fon: 'VÈKPÈ™', label: 'Création de couronne', enabled: true, order: 1 },
  { id: 'sinsin', fon: 'SÍNSIN™', label: 'Entretien & resserrage', enabled: true, order: 2 },
  { id: 'finfin', fon: 'FÍNFÍN™', label: 'Soin profond & rituel', enabled: true, order: 3 },
  { id: 'gbeza', fon: 'GBÈZÀ™', label: 'Coiffure & style', enabled: true, order: 4 },
  { id: 'agbo', fon: 'ÀGBÓ™', label: 'Restauration & SOS', enabled: true, order: 5 },
  { id: 'dodo', fon: 'DÒDÒ™', label: 'Gamme & produits', enabled: true, order: 6 },
];

export const SERVICES_SEED: Service[] = [
  { id: 'sv-microlocks', categoryId: 'vekpe', name: 'Création microlocks', palier: 'Souveraineté', priceXof: 180000, hidePrice: false, sessions: 2, master: 'Brice', durationMin: 360, order: 1, temps: [1, 1, 1, 1], description: 'L’œuvre fondatrice — une couronne née mèche à mèche, pensée pour dix ans.' },
  { id: 'sv-locks-fines', categoryId: 'vekpe', name: 'Création locks fines', palier: 'Élévation', priceXof: 120000, hidePrice: false, sessions: 1, master: 'Yéman', durationMin: 300, order: 2, temps: [1, 1, 1, 1] },
  { id: 'sv-locks-moyennes', categoryId: 'vekpe', name: 'Création locks moyennes', palier: 'Fondation', priceXof: 80000, hidePrice: false, sessions: 1, master: 'Aïcha', durationMin: 240, order: 3, temps: [1, 1, 1, 1] },
  { id: 'sv-resserrage', categoryId: 'sinsin', name: 'Resserrage racines', palier: 'Fondation', priceXof: 25000, hidePrice: false, sessions: 1, master: 'Aïcha', durationMin: 120, order: 1, temps: [1, 1, 1, 0] },
  { id: 'sv-entretien-complet', categoryId: 'sinsin', name: 'Entretien complet', palier: 'Élévation', priceXof: 40000, hidePrice: false, sessions: 1, master: 'Romuald', durationMin: 150, order: 2, temps: [1, 1, 1, 1] },
  { id: 'sv-rituel-quatre-temps', categoryId: 'finfin', name: 'Rituel des quatre temps', palier: 'Souveraineté', priceXof: 60000, hidePrice: false, sessions: 1, master: 'Brice', durationMin: 180, order: 1, description: 'Purifier, Nourrir, Sceller, Couronner.', temps: [1, 1, 1, 1] },
  { id: 'sv-bain-vapeur', categoryId: 'finfin', name: 'Bain vapeur & huiles', palier: 'Fondation', priceXof: 20000, hidePrice: false, sessions: 1, master: 'Aïcha', durationMin: 60, order: 2, temps: [1, 1, 0, 0] },
  { id: 'sv-coiffure-event', categoryId: 'gbeza', name: 'Coiffure cérémonie', palier: 'Élévation', priceXof: 35000, hidePrice: false, sessions: 1, master: 'Yéman', durationMin: 90, order: 1, temps: [0, 1, 1, 1] },
  { id: 'sv-style-conseil', categoryId: 'gbeza', name: 'Style & conseil', palier: 'Fondation', priceXof: 15000, hidePrice: false, sessions: 1, master: 'Romuald', durationMin: 45, order: 2, temps: [0, 0, 0, 1] },
  { id: 'sv-sos-restauration', categoryId: 'agbo', name: 'SOS restauration couronne', palier: 'Souveraineté', priceXof: 90000, hidePrice: true, sessions: 3, master: 'Brice', durationMin: 240, order: 1, temps: [1, 1, 1, 1], description: 'Trois séances liées — la couronne revient de loin, la maison veille.' },
  { id: 'sv-reprise-locks', categoryId: 'agbo', name: 'Reprise de locks abîmées', palier: 'Élévation', priceXof: 55000, hidePrice: false, sessions: 2, master: 'Yéman', durationMin: 180, order: 2, temps: [1, 1, 1, 0] },
];

export const PRODUCTS_SEED: Product[] = [
  { id: 'pr-huile-couronne', categoryId: 'dodo', name: 'Huile Couronne', priceXof: 12000, stock: 34, order: 1 },
  { id: 'pr-shampoing', categoryId: 'dodo', name: 'Shampoing Naturel', priceXof: 8000, stock: 52, order: 2 },
  { id: 'pr-beurre-locks', categoryId: 'dodo', name: 'Beurre Locks', priceXof: 9500, stock: 18, order: 3 },
  { id: 'pr-serum-racines', categoryId: 'dodo', name: 'Sérum Racines', priceXof: 14000, stock: 7, order: 4 },
];

export const categoriesStore = createStore<CatalogCategory[]>('mnd_catalog_categories', CATEGORIES_SEED);
export const servicesStore = createStore<Service[]>('mnd_catalog_services', SERVICES_SEED);
export const productsStore = createStore<Product[]>('mnd_catalog_products', PRODUCTS_SEED);

import { bindCollection } from './sync';
bindCollection(categoriesStore, 'catalog_categories');
bindCollection(servicesStore, 'catalog_services');
bindCollection(productsStore, 'catalog_products');

export const useCategories = () => useStore(categoriesStore);
export const useServices = () => useStore(servicesStore);
export const useProducts = () => useStore(productsStore);

/** Les quatre temps de la méthode — chaque prestation les honore en tout ou partie. */
export const QUATRE_TEMPS = ['Purifier', 'Nourrir', 'Sceller', 'Couronner'] as const;

/** Format maison d’une durée en minutes : `2 h`, `1 h 30`, `45 min`. */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
