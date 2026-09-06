/* ══ LES TEXTES DE LA MAISON — 6 septembre 2026 ══════════════════════

   « Comment modifier la fiche de poste et le règlement intérieur ? » (Yéman).

   Les deux vivaient dans le code, et c'est moi qui les changeais. Ils passent
   ici, dans un écran. Mais LES DEUX N'OBÉISSENT PAS À LA MÊME RÈGLE, et c'est
   tout le sujet de ce fichier :

   · UNE FICHE DE POSTE DÉCRIT UN MÉTIER et n'engage personne. Elle se corrige
     quand on veut, sans cérémonie. Une seule précaution : les clés de sa
     grille sont les identifiants des entretiens déjà signés, donc une ligne se
     RETIRE, elle ne s'efface pas (voir `enService` dans `postes`).

   · UN RÈGLEMENT INTÉRIEUR ENGAGE et se signe. Il ne se corrige donc jamais en
     place : chaque modification PUBLIE UNE VERSION. Sans cela, les décharges
     déjà signées désigneraient un texte qui n'existe plus, et l'échelle des
     sanctions ne vaudrait rien le jour où elle sert.

   ET CELUI QUI N'A PAS SIGNÉ LA NOUVELLE GARDE LE BÉNÉFICE DE L'ANCIENNE
   (décision de Yéman) : on n'oppose pas à quelqu'un une règle qu'il n'a pas
   encore lue. C'est aussi ce que dit l'article « Entrée en vigueur ».

   TOUT CE QUI JUGE EST PUR ICI, et éprouvé par `verifie-postes`. */

import { createStore, useStore } from './store';
import { FICHES_DE_POSTE, type FicheDePoste } from './postes';
import {
  SOURCE_DU_REGLEMENT, VERSION_REGLEMENT, type SourceDuReglement,
} from './reglement-interieur';
import { enLettres, type SignatureTracee } from './contrats';

/* ══ LES FICHES DE POSTE ═════════════════════════════════════════════
   UN DOCUMENT-OBJET, PAS UNE COLLECTION : après une réinitialisation totale,
   les collections repartent vides, et les douze fiches disparaîtraient. Ce
   sont des textes de la Maison, pas des données de clientes. */
export const fichesStore = createStore<{ fiches: FicheDePoste[] }>(
  'mnd_fiches_postes', { fiches: FICHES_DE_POSTE },
);

/** UNE FICHE VENUE DU DISQUE PEUT ÊTRE PLUS VIEILLE QUE LE CODE : la Maison a
    gagné les pouvoirs de décision après coup, et une fiche enregistrée avant
    n'en porte pas. Sans ce filet, l'écran se casse sur un `undefined.map`. */
export const ficheSaine = (f: FicheDePoste): FicheDePoste => ({
  ...f,
  fait: f.fait ?? [], mesure: f.mesure ?? [], neFaitPas: f.neFaitPas ?? [],
  decide: f.decide ?? [], demandeAvant: f.demandeAvant ?? [],
  competences: f.competences ?? [], objectifs: f.objectifs ?? [],
});

export function useFichesDePoste(): [FicheDePoste[], (f: FicheDePoste[]) => void] {
  const [etat, setEtat] = useStore(fichesStore);
  return [(etat.fiches ?? []).map(ficheSaine), (fiches) => setEtat({ fiches })];
}

/* ══ CE QUI SE VERSIONNE — 6 septembre 2026 ══════════════════════════
   Le règlement d'abord, puis les contrats. TOUT TEXTE QUI SE SIGNE obéit à la
   même règle : il ne se corrige jamais en place, il publie une version, et les
   signatures d'avant continuent de désigner la leur. Écrire cette mécanique
   deux fois lui aurait donné deux comportements au premier correctif, et deux
   papiers de la Maison n'auraient pas valu la même chose. */

export type Publie<T> = T & {
  /** « v1 · 6 septembre 2026 » — ce que porte la signature. */
  version: string;
  /** Le jour où cette version est entrée en vigueur. */
  leIso: string;
};

export type Versionne<T> = {
  /** Dans l'ordre, la plus ancienne d'abord. La dernière est en vigueur. */
  publies: Publie<T>[];
  /** CE QU'ON ÉCRIT SANS ENCORE L'IMPOSER. Un texte se relit à tête reposée,
      souvent à deux : sans brouillon, la seule façon de travailler dessus
      serait de le publier, donc d'engager la Maison sur une phrase qu'on n'est
      pas sûr de garder. */
  brouillon?: T;
};

const sansVersion = <T>(p: Publie<T>): T => {
  const { version, leIso, ...reste } = p;
  void version; void leIso;
  return reste as unknown as T;
};

export const enVigueurDe = <T>(e: Versionne<T>, secours: Publie<T>): Publie<T> =>
  e.publies[e.publies.length - 1] ?? secours;

/** LE NUMÉRO QUE PORTERA LA PROCHAINE. Il se compte, il ne se saisit pas :
    une version tapée à la main finit par revenir en arrière.

    IL SE COMPTE DEPUIS CELLE EN VIGUEUR, PAS DEPUIS LE NOMBRE DE VERSIONS
    GARDÉES. Le droit à l'image était déjà en v2 quand il est entré dans ce
    magasin — son texte avait été repris une fois avant que la Maison ne puisse
    le régler. Compter les lignes du magasin aurait produit une SECONDE v2, et
    deux accords signés auraient porté le même nom sans dire la même chose. */
export const prochaineVersionDe = <T>(e: Versionne<T>, jourIso: string, secours?: Publie<T>): string => {
  const actuelle = secours ? enVigueurDe(e, secours).version : e.publies[e.publies.length - 1]?.version;
  const n = Number(/^v([0-9]+)/.exec(actuelle ?? '')?.[1]);
  return `v${(Number.isFinite(n) ? n : e.publies.length) + 1} · ${enLettres(jourIso)}`;
};

/** LE BROUILLON EN COURS, ou une copie de ce qui est en vigueur. */
export const aTravaillerDe = <T>(e: Versionne<T>, secours: Publie<T>): T =>
  e.brouillon ?? sansVersion(enVigueurDe(e, secours));

/** LE BROUILLON DIT-IL AUTRE CHOSE que ce qui est en vigueur ? Publier une
    version identique ferait resigner tout le monde pour rien. */
export const aChangeDe = <T>(e: Versionne<T>, secours: Publie<T>): boolean =>
  JSON.stringify(sansVersion(enVigueurDe(e, secours))) !== JSON.stringify(aTravaillerDe(e, secours));

/** PUBLIER : la version en cours rejoint l'histoire, le brouillon s'efface.
    RIEN NE S'ÉCRASE JAMAIS — une signature d'hier désigne sa version, et sans
    elle on ne saurait plus à quoi cette personne a dit oui. */
export const publieDe = <T>(e: Versionne<T>, secours: Publie<T>, jourIso: string): Versionne<T> => ({
  publies: [...e.publies, {
    ...aTravaillerDe(e, secours), version: prochaineVersionDe(e, jourIso, secours), leIso: jourIso,
  } as Publie<T>],
  brouillon: undefined,
});

/* ══ LE RÈGLEMENT ════════════════════════════════════════════════════ */

export type ReglementPublie = Publie<SourceDuReglement>;
export type EtatDuReglement = Versionne<SourceDuReglement>;

const V1: ReglementPublie = {
  version: VERSION_REGLEMENT, leIso: '2026-09-06', ...SOURCE_DU_REGLEMENT,
};

export const reglementStore = createStore<EtatDuReglement>(
  'mnd_reglement', { publies: [V1] },
);

export const useReglement = () => useStore(reglementStore);

/** CE QUI S'APPLIQUE AUJOURD'HUI. Jamais le brouillon : un texte qu'on est en
    train d'écrire ne s'oppose à personne. */
export const enVigueur = (e: EtatDuReglement): ReglementPublie => enVigueurDe(e, V1);
export const prochaineVersion = (e: EtatDuReglement, jourIso: string): string =>
  prochaineVersionDe(e, jourIso, V1);
export const aTravailler = (e: EtatDuReglement): SourceDuReglement => aTravaillerDe(e, V1);
export const aChange = (e: EtatDuReglement): boolean => aChangeDe(e, V1);

/** ══ OÙ EN EST UNE PERSONNE ══════════════════════════════════════════
    Trois états, et pas deux. « Signé / pas signé » confondait celui à qui l'on
    n'a jamais rien remis avec celui qui a signé la v1 de bonne foi : le
    premier n'est tenu par rien, le second est tenu par ce qu'il a lu. Les
    peindre du même rouge ferait rappeler les deux avec la même urgence, et la
    Maison cesserait de regarder la couleur. */
export type OuEnEst = 'jamais' | 'version-ancienne' | 'a-jour';

export const ouEnEst = (
  signature: SignatureTracee | undefined,
  versionEnVigueur: string,
): OuEnEst => {
  if (!signature?.signature) return 'jamais';
  return signature.version === versionEnVigueur ? 'a-jour' : 'version-ancienne';
};

export const motDeLEtat = (o: OuEnEst): string => ({
  jamais: 'Règlement à remettre',
  'version-ancienne': 'Nouvelle version à signer',
  'a-jour': 'Règlement',
}[o]);

/** QUI RAPPELER APRÈS UNE PUBLICATION. Rendu AVANT de publier, dans l'écran de
    confirmation : on ne publie pas un texte sans savoir combien de personnes
    il faut rasseoir. */
export function aRappeler<T extends { name: string; reglement?: SignatureTracee }>(
  equipe: readonly T[],
  versionApres: string,
): T[] {
  return equipe.filter((m) => ouEnEst(m.reglement, versionApres) !== 'a-jour');
}
