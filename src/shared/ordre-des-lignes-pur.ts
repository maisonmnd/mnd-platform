/* MONTER OU DESCENDRE UNE LIGNE — 7 novembre 2026. « Mets-moi des onglets up
   and down » (Y.), dans la composition d'un forfait du Catalogue : chaque
   ligne (prestation ou produit inclus) a une flèche vers le haut et une vers
   le bas. Pur : rend une liste NEUVE, sans toucher à celle qu'on lui passe ;
   au bord (première ligne vers le haut, dernière vers le bas) ou pour une
   ligne qui n'existe pas, la liste rendue est la même, jamais une erreur. */
export function deplaceLaLigne<T>(lignes: readonly T[], i: number, sens: -1 | 1): T[] {
  const neuf = [...lignes];
  const j = i + sens;
  if (!Number.isInteger(i) || i < 0 || i >= neuf.length || j < 0 || j >= neuf.length) return neuf;
  [neuf[i], neuf[j]] = [neuf[j], neuf[i]];
  return neuf;
}
