/* Appariement de NOMS de personnes entre magasins (maître d'un RDV ↔ dossier du
   personnel). Ces liens se font par chaîne de caractères : une majuscule, un
   accent ou une espace de trop suffisaient à découpler un rituel de son maître —
   et la commission ou le pourboire tombaient à zéro EN SILENCE. On normalise
   (accents, casse, espaces) avant de comparer. Un vrai renommage reste
   détectable en aval (avertissement « maître sans dossier » au run de paie). */

/** Forme canonique d'un nom : accents retirés, espaces réduites, minuscules. */
export const normName = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Deux noms désignent-ils la même personne (comparaison normalisée) ? */
export const sameName = (a?: string, b?: string): boolean =>
  !!a && !!b && normName(a) === normName(b);
