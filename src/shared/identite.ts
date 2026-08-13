import { createStore, useStore } from './store';

/* L'IDENTITÉ DE LA MAISON — branchée le 13 août, à la demande de Yéman.

   La carte des Paramètres écrivait dans un magasin que rien ne lisait :
   « Maison MND » et un RCCM vivaient codés en dur dans quatorze fichiers —
   avec DEUX RCCM différents selon l'écran. Désormais UNE vérité, ici :

   — `nom` signe la barre latérale, l'écran de connexion, l'entête des
     factures imprimées, les reçus PDF et les signatures de messages ;
   — `raison` est la ligne légale au pied des factures ;
   — `fuseau` règle l'horloge du Trône (la date affichée en haut) — la
     Souveraine en voyage voit le jour du salon, pas celui de son téléphone.

   Le nom s'insère là où il se tient SEUL (entête, signature, pied). Jamais
   au milieu d'une phrase française : « Toute la Maison MND pense à vous »
   se briserait sur un nom qui ne commence pas par « Maison ».

   `dureeRituel` et `fenetreAnnulation` restent PAS ENCORE RELIÉS (marqués
   « À venir » aux Paramètres). */

export type HouseIdentity = {
  nom: string;
  raison: string;
  fuseau: string;
  dureeRituel: string;
  fenetreAnnulation: string;
};

export const DEFAULT_IDENTITY: HouseIdentity = {
  nom: 'Maison MND',
  raison: 'MND SARL · RCCM COT-B-2021',
  fuseau: 'Cotonou · GMT+1',
  dureeRituel: '2 h 30',
  fenetreAnnulation: '48 h avant',
};

export const houseIdentityStore = createStore<HouseIdentity>('mnd_house_identity', DEFAULT_IDENTITY);
export const useHouseIdentity = () => useStore(houseIdentityStore);

/** Le nom, jamais vide — un réglage effacé ne doit pas signer des factures en blanc. */
export const maisonNom = (): string => houseIdentityStore.get().nom.trim() || DEFAULT_IDENTITY.nom;
export const maisonRaison = (): string => houseIdentityStore.get().raison.trim() || DEFAULT_IDENTITY.raison;

/** Réglage (libellé humain) → fuseau IANA, pour l'horloge du Trône. */
const FUSEAUX_IANA: Record<string, string> = {
  'Cotonou · GMT+1': 'Africa/Porto-Novo',
  'Abidjan · GMT': 'Africa/Abidjan',
  'Lomé · GMT': 'Africa/Lome',
  'Dakar · GMT': 'Africa/Dakar',
  'Lagos · GMT+1': 'Africa/Lagos',
  'Douala · GMT+1': 'Africa/Douala',
  'Paris · GMT+2': 'Europe/Paris',
};
export const fuseauIana = (label?: string): string =>
  FUSEAUX_IANA[label ?? houseIdentityStore.get().fuseau] ?? 'Africa/Porto-Novo';

import { bindDocument } from './sync';
bindDocument(houseIdentityStore, 'mnd_house_identity');
