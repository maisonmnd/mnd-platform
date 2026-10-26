import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import type { CodePromo } from './promos-pur';

/* LES CODES DE PROMOTION : le juge vit dans `promos-pur.ts` (27 octobre
   2026) ; ici, le magasin et sa synchronisation. */
export * from './promos-pur';

export const codesPromoStore = createStore<CodePromo[]>('mnd_codes_promo', []);
export const useCodesPromo = () => useStore(codesPromoStore);

bindCollection(codesPromoStore, 'codes_promo');
