/* LES FICHES DE PROCÉDURE, ÉCRITES — l'outillage (25 novembre 2026).

   « Crée des descriptions pour tous : va faire tes recherches », puis « Je
   veux que tu me montres les 90 fiches créées, pour que je valide » (Yéman).

   CHAQUE LIGNE DIT D'OÙ ELLE VIENT. Une fiche qui mêle sans le dire ce que la
   Maison a écrit et ce qu'une recherche propose ne se relit pas : la
   direction ne saurait pas quoi vérifier. Cinq origines, pas une de plus :

     C  le CATALOGUE de la Maison (la description de la prestation, ce qu'elle
        comprend, sa durée) ;
     L  le LABORATOIRE de la Maison (ses formules et leurs protocoles) ;
     M  la MAISON : ce que la direction a dicté, ou une règle écrite au Trône ;
     N  la NOTICE d'un fabricant, relue sur sa page ;
     P  la PRATIQUE professionnelle, relevée par la recherche du 25 novembre
        2026, avec sa référence (`ref`).

   UN CHIFFRE NE S'ÉCRIT PAS SANS ORIGINE. Une durée, un dosage, un âge, une
   fréquence : la ligne qui le porte vient du catalogue, du laboratoire, d'une
   notice ou d'une pratique RÉFÉRENCÉE. `assemble.mjs` refuse le reste.

   CE QUI N'EST PAS SU RESTE « À VALIDER » (`v`), en toutes lettres : la
   référence exacte d'un produit au salon, un temps que les sources donnent en
   fourchette et que la Maison doit trancher. */

export const ORIGINES = {
  C: 'catalogue',
  L: 'laboratoire',
  M: 'maison',
  N: 'notice',
  P: 'pratique',
};

export const RUBRIQUES = ['objectif', 'public', 'produits', 'arrivee', 'etapes', 'conseils', 'suivi'];

const ligne = (source) => (texte, o = {}) => {
  const opts = typeof o === 'string' ? { ref: o } : o;
  return {
    texte: String(texte).trim(),
    source,
    ...(opts.d ? { detail: String(opts.d).trim() } : {}),
    ...(opts.v ? { aValider: String(opts.v).trim() } : {}),
    ...(opts.ref ? { ref: String(opts.ref).trim() } : {}),
  };
};

/** Une ligne du catalogue, du laboratoire, de la Maison, d'une notice, de la pratique.
    Second argument : `{ d: 'seconde case', v: 'ce qui reste à valider', ref: 'la référence' }`,
    ou une chaîne seule, qui vaut `ref`. */
export const C = ligne('catalogue');
export const L = ligne('laboratoire');
export const M = ligne('maison');
export const N = ligne('notice');
export const P = ligne('pratique');

/** Une fiche : son titre et ses sept rubriques. `pour` : l'identifiant de la
    prestation, ou plusieurs quand elles se rendent de la même façon. */
export const fiche = (pour, titre, contenu) => ({ pour: [].concat(pour), titre, contenu });

const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;
const PORTE_UN_CHIFFRE = /\d/;

/** Ce qui cloche dans une fiche, en toutes lettres. Vide : elle tient. */
export function defautsDeLaFiche(f) {
  const d = [];
  const ou = `${f.titre} [${f.pour.join(', ')}]`;
  if (!f.titre?.trim()) d.push(`${ou} : sans titre`);
  const cles = Object.keys(f.contenu ?? {});
  if (JSON.stringify(cles) !== JSON.stringify(RUBRIQUES)) d.push(`${ou} : rubriques ${cles.join(',')} (attendu ${RUBRIQUES.join(',')})`);
  for (const r of RUBRIQUES) {
    const lignes = f.contenu?.[r] ?? [];
    if (!Array.isArray(lignes) || lignes.length === 0) { d.push(`${ou} : rubrique « ${r} » vide`); continue; }
    lignes.forEach((l, i) => {
      const lieu = `${ou} · ${r} ${i + 1}`;
      if (!l || typeof l.texte !== 'string' || !l.texte.trim()) { d.push(`${lieu} : ligne sans texte`); return; }
      if (!Object.values(ORIGINES).includes(l.source)) d.push(`${lieu} : origine inconnue « ${l.source} »`);
      const tout = `${l.texte} ${l.detail ?? ''} ${l.aValider ?? ''}`;
      if (EMOJI.test(tout)) d.push(`${lieu} : un émoji`);
      if (/—/.test(tout)) d.push(`${lieu} : un tiret cadratin`);
      if (l.detail && r !== 'produits' && r !== 'etapes') d.push(`${lieu} : une seconde case hors produits et étapes`);
      /* UN CHIFFRE DE LA PRATIQUE PORTE SA RÉFÉRENCE ; la Maison ne chiffre que
         ce qu'elle a dicté. « J+7 », « 2 en 1 » et les noms de prestations ne
         sont pas des mesures : seuls le texte utile et la seconde case comptent. */
      const mesure = `${l.texte} ${l.detail ?? ''}`.replace(/J\+\d+/g, '').replace(/[«“][^»”]*[»”]/g, '');
      if (PORTE_UN_CHIFFRE.test(mesure) && l.source === 'pratique' && !l.ref) d.push(`${lieu} : un chiffre de la pratique sans référence`);
    });
  }
  return d;
}
