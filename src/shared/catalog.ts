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

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const SERVICES_SEED: Service[] = [];

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const PRODUCTS_SEED: Product[] = [];

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
