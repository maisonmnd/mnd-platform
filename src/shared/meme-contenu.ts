/* DEUX VALEURS DISENT-ELLES LA MÊME CHOSE ? — 2 octobre 2026.

   LA PANNE. Le panneau « Cet appareil » a montré 289 fiches réécrites par
   minute sur un seul poste, pastille « Synchronisation… · clients » sans fin,
   barre de navigation qui rame depuis trois jours. Personne ne se battait :
   le poste se répondait à lui-même.

   La base range les champs d'un objet à SA façon (du nom le plus court au
   plus long, puis par ordre des lettres). Le Trône écrit `{ filleules, echos,
   venues, rang }` ; la base rend `{ rang, echos, venues, filleules }`. Mêmes
   valeurs, autre ordre. Or les automatismes comparaient par
   `JSON.stringify`, qui suit l'ordre des champs : le résumé recalculé ne
   ressemblait jamais à celui revenu du serveur, donc ils réécrivaient la
   fiche, qui revenait rangée autrement, donc ils la réécrivaient.

   LA RÈGLE : un contenu se compare dans UN ordre, toujours le même, qui ne
   doit rien à celui dans lequel il a été écrit ni à celui dans lequel il
   revient. Les listes gardent leur ordre, lui porte un sens. Un champ absent
   et un champ `undefined` se valent, comme pour JSON. Pur, éprouvé par
   `verifie-le-meme-contenu`. */

/** Le texte d'un contenu, champs rangés. Deux contenus égaux rendent le même. */
export function contenuCanonique(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : contenuCanonique(x))).join(',')}]`;
  const o = v as Record<string, unknown>;
  const cles = Object.keys(o).filter((k) => o[k] !== undefined && typeof o[k] !== 'function').sort();
  return `{${cles.map((k) => `${JSON.stringify(k)}:${contenuCanonique(o[k])}`).join(',')}}`;
}

/** Vrai quand les deux valeurs portent le même contenu, quel que soit l'ordre de leurs champs. */
export function memeContenu(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return contenuCanonique(a) === contenuCanonique(b);
}
