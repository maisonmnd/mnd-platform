/* UN MÊME ORDRE SUR TOUS LES POSTES — 1er octobre 2026.

   Les automatismes du Trône calculent des résumés à partir des fiches et des
   rendez-vous, puis comparent leur résultat à ce que la fiche porte déjà. S'il
   diffère, ils réécrivent. Or plusieurs de ces calculs gardent, à égalité,
   l'ordre dans lequel ils ont LU : deux filleules sans date restent dans
   l'ordre des fiches, deux rendez-vous du même jour dans l'ordre du carnet.

   Tant que tous les postes lisaient dans le même ordre, personne ne le voyait.
   Depuis la lecture par pages (le matin même), un poste qui vient de charger a
   ses lignes rangées par identifiant, et un poste ouvert depuis plus longtemps
   a les nouvelles lignes À LA SUITE. Deux postes à jour produisaient donc deux
   résumés différents pour la même fiche, chacun jugeait l'autre faux, et ils
   se la renvoyaient sans fin : « Synchronisation… · clients », écran sourd.

   LA RÈGLE : un calcul qui écrit seul ne dépend jamais de l'ordre de lecture.
   Les automatismes rangent d'abord ce qu'ils lisent, ici, d'une seule façon,
   la même partout. La comparaison est celle des caractères, pas celle d'une
   langue : `localeCompare` change d'un navigateur à l'autre, ce qui referait
   exactement la panne. */

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** Des lignes rangées par identifiant. Rend une copie : le magasin ne bouge pas. */
export function parIdentifiant<T extends { id: string }>(lignes: readonly T[]): T[] {
  return [...lignes].sort((a, b) => cmp(a.id, b.id));
}

/** Des rendez-vous rangés par jour, puis par heure, puis par identifiant. */
export function rendezVousEnOrdre<T extends { id: string; date: string; time?: string }>(rdvs: readonly T[]): T[] {
  return [...rdvs].sort((a, b) => cmp(a.date ?? '', b.date ?? '') || cmp(a.time ?? '', b.time ?? '') || cmp(a.id, b.id));
}
