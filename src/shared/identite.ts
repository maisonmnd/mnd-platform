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
  /** LA VILLE DU SIÈGE — celle qui signe le tampon et les documents.

      DISTINCTE DE CELLE DE LA BRANCHE, et c'est le point : L'atelier MND est à
      Suru-Léré, mais la Maison signe Cotonou. Un tampon porte le siège, pas
      l'adresse du fauteuil ; et la même Maison qui ouvrirait une seconde
      branche n'aurait pas deux tampons. */
  ville: string;
  fuseau: string;
  dureeRituel: string;
  fenetreAnnulation: string;
};

export const DEFAULT_IDENTITY: HouseIdentity = {
  nom: 'Maison MND',
  /* 19 septembre 2026 : l'extrait du registre du commerce dit ACIA 1,
     ENTREPRISE INDIVIDUELLE, et non « MND SARL » (valeur d'origine, fausse).
     C'est elle qui nomme l'employeur dans les contrats et les lettres. */
  raison: 'ACIA 1 · RCCM RB/COT/12 A 14509',
  ville: 'Cotonou',
  fuseau: 'Cotonou · GMT+1',
  dureeRituel: '2 h 30',
  fenetreAnnulation: '48 h avant',
};

export const houseIdentityStore = createStore<HouseIdentity>('mnd_house_identity', DEFAULT_IDENTITY);
export const useHouseIdentity = () => useStore(houseIdentityStore);

/** Le nom, jamais vide — un réglage effacé ne doit pas signer des factures en blanc. */
export const maisonNom = (): string => houseIdentityStore.get().nom.trim() || DEFAULT_IDENTITY.nom;
export const maisonRaison = (): string => houseIdentityStore.get().raison.trim() || DEFAULT_IDENTITY.raison;
/** La ville qui signe. Vide sur une fiche ancienne, d'où le repli. */
export const maisonVille = (): string => (houseIdentityStore.get().ville ?? '').trim() || DEFAULT_IDENTITY.ville;

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

/** Sa traduction — pour les écrits publics, lus par qui ne parle pas fon.

    EN FON, « mi » PORTE LES DEUX PERSONNES : « vous » et « nous » se disent
    pareil (Yéman, 25 septembre 2026). La phrase fon ne tranche donc pas, et
    c'est le français qui choisit à qui elle parle. Elle a dit « vous êtes
    belle », puis « nous sommes beaux » le 24 septembre ; elle dit « vous »
    depuis le 25. Aucune de ces versions n'était une faute de traduction :
    c'était à chaque fois un choix de la Maison, et celui-ci est le dernier. */
export const DEVISE_TRADUITE = 'vous êtes beaux, et vous le savez';

/* LA DEVISE ENTIÈRE, telle qu’elle s’écrit.
   Le fon, puis le français QUI LE PROLONGE — 25 septembre 2026. Elle disait
   « mi nyɔ́ ɖɛkpɛ · la maison veille » depuis le 24 août : deux phrases posées
   côte à côte, séparées par le point médian de la Maison. Elle n'en fait plus
   qu'une, qui traverse deux langues : le fon dit ce que vous êtes, le français
   achève. C'est la cadence de « Parce que vous le valez bien », à ceci près
   que la première moitié est en fon.

   ET C'EST UNE VIRGULE, PAS LE POINT MÉDIAN. Le point médian sépare deux
   choses de même rang (« SÍNSÍN™ · La Reprise ») ; ici la seconde moitié
   dépend de la première, et une phrase ne se coupe pas d'un point. */
export const DEVISE_COMPLETE = 'mi nyɔ́ ɖɛkpɛ, et vous le savez';

/** Signature au bas d'un message : le picto de la branche, le nom, la devise.
    ⚠ Un lien wa.me ne transporte QUE du texte — le monogramme dessiné ne peut
    pas voyager. Le picto typographique en tient lieu ; le vrai logo se pose en
    photo de profil du compte WhatsApp, où il signe alors chaque message. */
export const houseSignature = (picto?: string): string =>
  `${picto ?? '◈'} ${maisonNom()} · ${DEVISE_COMPLETE}`;

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

/* LE NOM DE LA MARQUE EST « MAISON MND » — 23 septembre 2026. « Plus de
   L'atelier MND, partout », puis « Fix Maison MND » (Yéman), devant une
   lettre du prêt qui portait l'ancien nom en entête. Le nom qui signe vient
   de CE document, réglé dans Système › Textes de la Maison ; à l'hydratation
   le serveur gagne, donc un champ corrigé à l'écran se propage à tous les
   postes.

   UNE MIGRATION, UNE FOIS, DATÉE : le motif d'`ensureStarterPlanIncluded`
   (`plans_included_seed_2026_07`). Après la descente du document, si le nom
   est encore l'ancien, on le remplace une seule fois par le nom par défaut et
   on pose un marqueur sur ce poste ; la correction repart par la synchro, et
   le marqueur fait que plus rien ne se rejoue jamais. Ce n'est PAS un
   rattrapage permanent : demain, Yéman peut nommer sa Maison comme il veut,
   le code ne le contredira pas, et la migration EXPIRE fin 2026, sinon un
   poste neuf sans marqueur la rejouerait dans un an contre une décision
   prise entre-temps. La ceinture des cinq secondes de la descente peut
   rendre la main avant le serveur : on écoute encore une minute la valeur
   distante, puis on se tait pour de bon.

   ELLE NE SE DÉCLENCHE QUE DEPUIS LE TRÔNE (son main.tsx) : ce module est
   partagé par sept applications, dont Ma Couronne et les pages publiques, où
   une migration des données de la Maison n'a rien à faire. Ici, seulement
   la fonction. */
import { quandDocumentDescendu, quandTablePrete } from './sync';
import { branchesStore } from './branches';
const ANCIEN_NOM = /^\s*l\s*[’']\s*atelier\s+mnd\s*$/i;
/** LE NOM CORRIGÉ, ou null s'il n'y a rien à corriger. Pur, et exporté pour
    être éprouvé (`verifie-le-nom-de-la-maison`) : « L'atelier MND » sous
    toutes ses graphies devient le nom par défaut ; tout autre nom reste. */
export const corrigeLAncienNom = (nom: unknown): string | null =>
  ANCIEN_NOM.test(String(nom ?? '')) ? DEFAULT_IDENTITY.nom : null;
/** CE PAPIER, CET ÉCRAN, SONT-ILS BIEN CEUX DE LA MAISON ? — 25 septembre
    2026. Le verrou (pictogramme + MAISON MND) ne se pose que là où le nom est
    celui de la Maison : ailleurs, il nommerait une maison qui n'est pas la
    sienne, et l'on repose le pictogramme avec le nom écrit. « L'atelier MND »,
    l'ancien nom, compte pour oui : c'est la même maison, et la migration
    ci-dessous le corrigera. */
export const estLaMaisonMND = (nom: unknown): boolean =>
  (corrigeLAncienNom(nom) ?? String(nom ?? '')).trim().toLowerCase()
    === DEFAULT_IDENTITY.nom.toLowerCase();

const MARQUEUR_NOM = 'mnd_nom_maison_2026_09';
const EXPIRE_LE = Date.parse('2026-12-31T23:59:59+01:00');
const dejaMigre = (marqueur = MARQUEUR_NOM): boolean => { try { return !!localStorage.getItem(marqueur); } catch { return false; } };
const marqueMigre = (marqueur = MARQUEUR_NOM) => { try { localStorage.setItem(marqueur, new Date().toISOString()); } catch { /* sans stockage, on rejouera : sans effet si le nom est déjà juste */ } };
const remplaceLAncienNom = (): boolean => {
  const i = houseIdentityStore.get();
  const nom = corrigeLAncienNom(i.nom);
  if (!nom) return false;
  houseIdentityStore.set({ ...i, nom });
  return true;
};
/** À appeler une fois, au démarrage du Trône seulement. */
export function migreLeNomDeLaMaison(): void {
  if (Date.now() > EXPIRE_LE) return;
  if (dejaMigre()) return;
  void quandDocumentDescendu('mnd_house_identity').then(() => {
    if (remplaceLAncienNom()) { marqueMigre(); return; }
    let arret: () => void = () => {};
    const off = houseIdentityStore.subscribe(() => {
      /* Différé d'un tour : pendant l'application d'une valeur distante, la
         synchro ignore les écritures ; un tour plus tard, elle les porte. */
      setTimeout(() => { if (remplaceLAncienNom()) { marqueMigre(); arret(); } }, 0);
    });
    const fin = setTimeout(() => { arret(); marqueMigre(); }, 60_000);
    arret = () => { off(); clearTimeout(fin); };
  });
}

/* ── LE NOM DE LA BRANCHE — 24 septembre 2026 ──────────────────────────
   Le nom des documents vient de `mnd_house_identity` et a suivi le 23. Mais
   le sélecteur de branche du Trône lit `mnd_branches`, et la branche
   s'appelait encore « L'atelier MND » : la capture d'écran de Yéman le
   montrait (vu par le-trone-35). Même geste que le nom de la Maison : une
   fois, daté, sans effet si le nom est déjà juste, mort au 31 décembre.
   Seul le NOM change ; identifiant, maîtres, adresse et rendez-vous restent
   attachés à la même ligne. Depuis le Trône seulement, comme l'autre. */
const MARQUEUR_BRANCHE = 'mnd_nom_branche_2026_09';
const renommeLesBranches = (): boolean => {
  let touche = false;
  const corrigees = branchesStore.get().map((b) => {
    const nom = corrigeLAncienNom(b.name);
    if (!nom) return b;
    touche = true;
    return { ...b, name: nom };
  });
  if (touche) branchesStore.set(corrigees);
  return touche;
};
/** À appeler une fois, au démarrage du Trône seulement. */
export function migreLeNomDeLaBranche(): void {
  if (Date.now() > EXPIRE_LE) return;
  if (dejaMigre(MARQUEUR_BRANCHE)) return;
  quandTablePrete('branches', () => {
    if (renommeLesBranches()) { marqueMigre(MARQUEUR_BRANCHE); return; }
    let arret: () => void = () => {};
    const off = branchesStore.subscribe(() => {
      setTimeout(() => { if (renommeLesBranches()) { marqueMigre(MARQUEUR_BRANCHE); arret(); } }, 0);
    });
    const fin = setTimeout(() => { arret(); marqueMigre(MARQUEUR_BRANCHE); }, 60_000);
    arret = () => { off(); clearTimeout(fin); };
  });
}
