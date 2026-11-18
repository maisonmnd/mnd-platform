/* ══ LES RENDEZ-VOUS CÔTE À CÔTE — 18 novembre 2026 ══════════════════════
   « Il y a le rendez-vous de P. A. qui est également pour le vendredi 20 à
   10 heures. Comment on peut voir ce rendez-vous ? Il est caché en dessous
   du rendez-vous de S. E. Quand les rendez-vous sont à la même heure, il y a
   un rendez-vous qui se cache. Rends-moi tout visible » (Yéman).

   La vue jour du Calendrier pose chaque rendez-vous en position absolue,
   toute la largeur de la colonne du maître : deux rendez-vous qui se
   chevauchent s'empilaient exactement, et le second disparaissait sous le
   premier. On les range comme dans un agenda papier : les rendez-vous qui
   se chevauchent (même en chaîne : A chevauche B, B chevauche C) forment un
   GROUPE ; chacun y prend la première VOIE libre à son heure, et le groupe
   partage la largeur en autant de voies qu'il en a ouvert. Un rendez-vous
   seul garde toute la largeur ; une voie qui se libère resert (A 9 h-10 h
   et C 10 h-11 h, chevauchés tous deux par B 9 h 30-10 h 30 : deux voies,
   pas trois).

   PUR : ni React, ni magasin. Les minutes sont celles de l'écran (la fin
   tient compte de la hauteur minimale d'une carte : un rendez-vous de
   quinze minutes en occupe plus à l'écran). Banc :
   `verifie-les-rendez-vous-cote-a-cote` (et `banc-des-rendez-vous-cote-a-cote`
   dans Chrome). */

export type PlageDuJour = { id: string; debutMin: number; finMin: number };
/** `voie` : 0 à gauche ; `voies` : combien de voies partage son groupe. */
export type VoieDuJour = { voie: number; voies: number };

export function voiesDuJour(plages: readonly PlageDuJour[]): Map<string, VoieDuJour> {
  const out = new Map<string, VoieDuJour>();
  /* L'ordre fait la voie : le plus tôt d'abord ; à heure égale, le plus long
     à gauche ; puis l'identifiant, pour qu'un rendu ne permute jamais deux
     cartes d'un battement à l'autre. */
  const triees = [...plages]
    .filter((p) => Number.isFinite(p.debutMin) && Number.isFinite(p.finMin))
    .sort((a, b) => a.debutMin - b.debutMin || b.finMin - a.finMin || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let groupe: { id: string; voie: number }[] = [];
  let finDesVoies: number[] = [];
  let finDuGroupe = -Infinity;
  const ferme = (): void => {
    for (const g of groupe) out.set(g.id, { voie: g.voie, voies: finDesVoies.length });
    groupe = [];
    finDesVoies = [];
  };
  for (const p of triees) {
    const fin = Math.max(p.finMin, p.debutMin);
    if (p.debutMin >= finDuGroupe) ferme();
    let voie = finDesVoies.findIndex((f) => f <= p.debutMin);
    if (voie < 0) { voie = finDesVoies.length; finDesVoies.push(fin); } else finDesVoies[voie] = fin;
    groupe.push({ id: p.id, voie });
    finDuGroupe = Math.max(finDuGroupe, fin);
  }
  ferme();
  /* Une plage illisible (heure manquante) reste seule, pleine largeur. */
  for (const p of plages) if (!out.has(p.id)) out.set(p.id, { voie: 0, voies: 1 });
  return out;
}
