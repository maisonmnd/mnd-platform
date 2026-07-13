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

export const DEFAULT_BRANCHES: Branch[] = [
  {
    id: 'cotonou-flagship',
    name: 'Cotonou · Flagship',
    city: 'Cotonou',
    country: 'Bénin',
    dial: '+229',
    currency: 'XOF',
    address: 'Haie Vive, Cotonou',
    seats: 6,
    masters: ['Brice', 'Yéman', 'Aïcha', 'Romuald'],
    status: 'active',
    flagship: true,
  },
  {
    id: 'abidjan',
    name: 'Abidjan · Cocody',
    city: 'Abidjan',
    country: "Côte d’Ivoire",
    dial: '+225',
    currency: 'XOF',
    address: 'Riviera Golf, Cocody',
    seats: 4,
    masters: ['Mariam', 'Koffi'],
    status: 'active',
  },
  {
    id: 'paris',
    name: 'Paris · Château d’Eau',
    city: 'Paris',
    country: 'France',
    dial: '+33',
    currency: 'EUR',
    address: '12 rue du Château d’Eau, 75010',
    seats: 3,
    masters: ['Awa', 'Sébastien'],
    status: 'active',
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
