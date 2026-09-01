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
  /** LE LIEN DE LOCALISATION — 18 août 2026. L'adresse écrite ne suffit pas à
      poser un point sur une carte : « Cotonou, Bénin » cherché tel quel mène au
      centre de la ville, pas à la porte du salon. Yéman a donné le lien court
      de sa fiche Google (`maps.app.goo.gl/…`), qui, lui, pointe l'endroit exact.

      Il vit sur la BRANCHE parce que chaque salon a le sien, et il se saisit
      dans Système › Branches — jamais écrit en dur, jamais deviné. */
  mapsUrl?: string;
  seats: number;
  masters: string[];
  /** ── LE MAÎTRE PAR DÉFAUT — 1er septembre 2026 ──────────────────
      « Quand un client prend RDV au Trône, afficher automatiquement le
      calendrier de Team. Pas celui d'Expert » (Yéman).

      LA MODALE PRENAIT LE PREMIER DE LA LISTE, et l'ordre de cette liste n'est
      qu'un accident de saisie : celui qu'on a écrit en premier le jour de la
      création de la branche. Rien ne permettait de le changer sans détruire et
      recréer un maître, ce qui aurait détaché ses rendez-vous.

      ABSENT = LE PREMIER DE LA LISTE, comme avant. Aucune branche ne change de
      comportement tant que la Maison n'a pas choisi. */
  masterParDefaut?: string;
  status: 'active' | 'paused';
  logo?: string | null;
  pictogram?: string | null;
  phone?: string;
  flagship?: boolean;
};

/** LE MAÎTRE QUI SE PROPOSE D'ABORD sur un nouveau rendez-vous.

    Celui que la Maison a désigné, s'il est toujours au tableau ; sinon le
    premier de la liste. LA VÉRIFICATION D'APPARTENANCE COMPTE : un maître
    renommé ou retiré laisserait sinon la modale sur un nom qui n'existe plus,
    et le rendez-vous partirait sans fauteuil. */
export const maitreParDefaut = (b: Pick<Branch, 'masters' | 'masterParDefaut'>): string => {
  const voulu = (b.masterParDefaut ?? '').trim();
  if (voulu && b.masters.includes(voulu)) return voulu;
  return b.masters[0] ?? '';
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
