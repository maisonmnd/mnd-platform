/* ══ LES CONTRATS DE LA MAISON — 6 septembre 2026 ════════════════════

   « Tout comme le contrat du droit à l'image, je dois construire les contrats
   des prestataires MND et les contrats de formation à l'Académie » (Yéman).

   TROIS CONTRATS, UNE SEULE OSSATURE. Le droit à l'image a fait la mécanique :
   des articles numérotés, une signature tracée, une version, une réimpression
   fidèle. Les clauses changent, la charpente non. La recopier trois fois
   garantirait que la troisième oublie la numérotation, ou la version, ou le
   cas de la mineure.

   CE QUI EST ICI EST COMMUN ET PUR. Les textes vivent à côté, un fichier par
   contrat, et ils ne savent rien de l'écran qui les affiche.

   CE N'EST PAS UN AVIS JURIDIQUE. La mécanique tient ; chaque texte devrait
   être relu par quelqu'un qui connaît le droit béninois avant d'être présenté
   à qui que ce soit. */

import { DEVISE_COMPLETE } from './identite';

export type ArticleDuContrat = { n: string; titre: string; lignes: string[] };

/** UN ARTICLE ÉCRIT SANS SON NUMÉRO. C'est la numérotation automatique qui
    évite le contrat qui saute de 7 à 9 quand une clause conditionnelle ne
    paraît pas — et un contrat qui saute un numéro se fait renvoyer par le
    premier juriste qui le lit. */
export type ArticleSansNumero = { titre: string; lignes: string[] };

/** LES ARTICLES SE NUMÉROTENT À LA FIN, jamais à l'écriture. Une clause qui
    n'existe que dans certains cas déplace toutes celles d'après : les compter
    à la main est une faute qui arrive au troisième contrat. */
export const numerote = (articles: (ArticleSansNumero | null | false | undefined)[]): ArticleDuContrat[] =>
  articles
    .filter((a): a is ArticleSansNumero => !!a)
    .map((a, i) => ({ n: String(i + 1), titre: a.titre, lignes: a.lignes }));

/** LA SIGNATURE TRACÉE — la même partout. Un contrat sans elle est une note. */
export type SignatureTracee = {
  /** Le jour de la signature (ISO). */
  at: string;
  /** Le nom écrit sur le document. */
  signePar: string;
  /** Le tracé, en image. Un dessin au trait pèse quelques kilo-octets. */
  signature: string;
  /** La version du texte signé. Sans elle, on ne saurait plus à quoi la
      personne a dit oui. */
  version: string;
  /** Renseigné quand le signataire signe POUR quelqu'un d'autre : un parent
      pour une mineure, un employeur pour son employée. */
  pourQui?: string;
};

/** CE QUI MANQUE À UNE SIGNATURE. Le même juge pour les trois contrats : trois
    vérifications séparées finiraient par diverger, et l'une accepterait ce que
    l'autre refuse. */
export function signatureInvalide(
  a: Partial<SignatureTracee> | undefined,
  o: { pourAutrui?: boolean } = {},
): string | undefined {
  if (!a) return 'Aucun document signé.';
  /* UN TRAIT DE DEUX PIXELS N'EST PAS UNE SIGNATURE : un doigt posé par erreur
     sur l'écran produit une image, et elle vaudrait engagement. */
  if (!a.signature || a.signature.length < 64) return 'Sans signature, ce n’est pas un contrat.';
  if (!(a.signePar ?? '').trim()) return 'Le document ne nomme personne.';
  if (o.pourAutrui && !(a.pourQui ?? '').trim()) return 'Le document doit nommer la personne pour qui l’on signe.';
  if (!a.at) return 'Un contrat sans date ne se défend pas.';
  return undefined;
}

/** « CINQ ANS », PAS « 60 MOIS ». Un terme qu'on doit diviser de tête pour le
    comprendre n'est pas un terme qu'on a compris. */
export function dureeEnClair(mois: number): string {
  if (mois % 12 === 0) {
    const ans = mois / 12;
    const mots = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
    return ans === 1 ? 'un an' : `${mots[ans] ?? ans} ans`;
  }
  return `${mois} mois`;
}

export const enFrancais = (iso: string): string => iso.split('-').reverse().join('/');

/** LE MONTANT ÉCRIT EN TOUTES LETTRES N'EST PAS UN LUXE sur un contrat : un
    chiffre se rature, une somme écrite se conteste. On garde les deux. */
export const sommeLisible = (xof: number): string =>
  `${Math.round(xof).toLocaleString('fr-FR').replace(/ | /g, ' ')} F CFA`;

export type Contrat = {
  titre: string;
  sousTitre?: string;
  entete: string[];
  articles: ArticleDuContrat[];
  pied: string;
};

/** Le pied commun : la Maison, son siège, sa devise, et la version du texte. */
export const piedDuContrat = (o: { maison: string; ville?: string; version: string }): string =>
  `${o.maison}${o.ville ? ` · ${o.ville}` : ''} · ${DEVISE_COMPLETE} · texte ${o.version}`;

/** L'EN-TÊTE « ENTRE … ET … ». Deux parties nommées, toujours, et la qualité
    de qui signe pour autrui. Un contrat dont on ne sait pas qui l'a passé ne
    vaut rien, quelle que soit la qualité de ses clauses. */
export function entreLesParties(o: {
  maison: string;
  raison?: string;
  ville?: string;
  qualiteMaison?: string;
  autre: string;
  qualiteAutre: string;
  pourQui?: string;
}): string[] {
  const m = o.raison?.trim() ? `${o.maison} (${o.raison.trim()})` : o.maison;
  const siege = o.ville?.trim() ? `, dont le siège est à ${o.ville.trim()}` : '';
  return [
    `Entre ${m}${siege}, ci-après « la Maison »,`,
    o.pourQui
      ? `et ${o.autre}, agissant pour ${o.pourQui}, ci-après « ${o.qualiteAutre} ».`
      : `et ${o.autre}, ci-après « ${o.qualiteAutre} ».`,
  ];
}
