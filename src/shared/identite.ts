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

/* ── LA DEVISE SIGNE TOUT CE QUI SORT — 22 août 2026 ───────────────
   « Quand l'IA répond aux messages, toujours avoir notre devise à la fin »
   (Yéman). Elle vivait dans les écrans clientes, à côté du rappel WhatsApp ;
   elle remonte ici, où vit déjà le nom qu'elle accompagne — l'écran des avis
   Google devra la poser sans traverser le carnet des clientes.

   ELLE EST POSÉE PAR LE CODE, JAMAIS DEMANDÉE À L'IA. Une consigne dans
   l'instruction d'un modèle tient la plupart du temps : il oublie une fois
   sur vingt, paraphrase (« nous sommes beaux ! »), ou écorche les
   diacritiques — et « mi nyo dekpe » sous un avis public serait pire que
   pas de devise du tout. Une concaténation, elle, n'oublie jamais. */

/** La devise de la Maison, en fon. Le ɖ n'appartient qu'à elle. */
export const DEVISE_MAISON = 'mi nyɔ́ ɖɛkpɛ';

/** Sa traduction — pour les écrits publics, lus par qui ne parle pas fon. */
export const DEVISE_TRADUITE = 'nous sommes beaux, et nous le savons';

/** Signature au bas d'un message : le picto de la branche, le nom, la devise.
    ⚠ Un lien wa.me ne transporte QUE du texte — le monogramme dessiné ne peut
    pas voyager. Le picto typographique en tient lieu ; le vrai logo se pose en
    photo de profil du compte WhatsApp, où il signe alors chaque message. */
export const houseSignature = (picto?: string): string =>
  `${picto ?? '◈'} ${maisonNom()} · ${DEVISE_MAISON}`;

/** Le fon à plat : accents ôtés, ɖ→d, ɛ→e, ɔ→o. Sert UNIQUEMENT à
    reconnaître la devise sous ses orthographes approximatives. */
const aPlat = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/ɖ/g, 'd').replace(/ɛ/g, 'e').replace(/ɔ/g, 'o');

/** Le texte porte-t-il déjà la devise ? « Mi Nyɔ́ Ɖɛkpɛ », « mi nyo dekpe »
    et la forme juste comptent toutes — on ne la posera pas deux fois. */
export const porteLaDevise = (texte: string): boolean => aPlat(texte ?? '').includes('dekpe');

/** Signe un message. Rendu de tout texte écrit par l'IA avant qu'il parte :
    la devise en dernière ligne, une seule fois, jamais deux. */
export const signeLeMessage = (texte: string, picto?: string): string => {
  const t = (texte ?? '').replace(/\s+$/, '');
  if (!t) return houseSignature(picto);
  if (porteLaDevise(t)) return t;
  return `${t}\n\n${houseSignature(picto)}`;
};

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
