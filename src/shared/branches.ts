import { createStore, useStore } from './store';

/* Branches — règle centrale multi-branches du Trône :
   la branche sélectionnée filtre TOUTES les données et impose sa devise.
   Clé partagée `mnd_branches` (même contrat que les prototypes). */

export type Branch = {
  id: string;
  name: string;
  city: string;
  country: string;
  dial: string;
  currency: string;
  address: string;
  seats: number;
  masters: string[];
  status: 'active' | 'paused';
  logo?: string | null;
  pictogram?: string | null;
  phone?: string;
  flagship?: boolean;
};

/* Maison neuve — une seule branche neutre à configurer (Système → Branches).
   Le socle a besoin d'au moins une branche pour fonctionner ; celle-ci ne porte
   aucune donnée de démonstration (ni ville, ni maître, ni siège fictif). */
export const DEFAULT_BRANCHES: Branch[] = [
  {
    id: 'maison',
    name: 'Ma Maison',
    city: '',
    country: 'Bénin',
    dial: '+229',
    currency: 'XOF',
    address: '',
    seats: 1,
    masters: [],
    status: 'active',
    flagship: true,
  },
];

export const branchesStore = createStore<Branch[]>('mnd_branches', DEFAULT_BRANCHES);
/* `currentBranchStore` reste local : c'est une préférence par utilisateur/onglet,
   pas une donnée partagée — elle n'est donc pas synchronisée. */
export const currentBranchStore = createStore<string>('mnd_current_branch', DEFAULT_BRANCHES[0].id);

import { bindCollection } from './sync';
bindCollection(branchesStore, 'branches');

export function useBranches() {
  return useStore(branchesStore);
}

/** Branche courante + sa devise — tous les montants s'affichent dans cette devise. */
export function useBranch(): { branch: Branch; branches: Branch[]; setBranch: (id: string) => void; currency: string } {
  const [branches] = useStore(branchesStore);
  const [currentId, setCurrentId] = useStore(currentBranchStore);
  const branch = branches.find((b) => b.id === currentId) ?? branches[0] ?? DEFAULT_BRANCHES[0];
  return { branch, branches, setBranch: setCurrentId, currency: branch.currency };
}
