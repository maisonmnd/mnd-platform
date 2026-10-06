import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import { TABLE_CARTES, type CarteCadeau } from './cartes-cadeaux-pur';

/* LES CARTES CADEAUX AU TRÔNE — 2 octobre 2026. Le registre vit dans la
   table `cartes_cadeaux` (migration 0112) : le site y dépose une commande
   « à régler », le serveur la règle après KkiaPay, le Trône fait le reste.
   La règle est dans `cartes-cadeaux-pur.ts` ; ce fichier n'est que le
   magasin. */

export * from './cartes-cadeaux-pur';

export const cartesCadeauxStore = createStore<CarteCadeau[]>('mnd_cartes_cadeaux', []);
export const useCartesCadeaux = () => useStore(cartesCadeauxStore);

bindCollection(cartesCadeauxStore, TABLE_CARTES);
