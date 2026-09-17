/* LE NOYAU PUR DES SAISONS — 18 septembre 2026.

   Ce module n'importe RIEN : ni store, ni synchronisation, ni Supabase.
   C'est ce qui lui permet d'être lu par une page PUBLIQUE du site, dont la
   règle est de s'ouvrir vite et de ne jamais télécharger la machinerie de
   l'ERP. Même partage que `agenda-pur` et `catalogue-pur`.

   `offers.ts` le réexporte, de sorte que le Trône et Ma Couronne continuent
   d'importer depuis un seul endroit. */

/** Le jour, dans la graphie des saisons. */
export const isoDuJour = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Écart en jours entre deux graphies ISO, du premier vers le second. */
export function joursEntre(depuisIso: string, versIso: string): number {
  const a = new Date(`${depuisIso}T00:00:00`).getTime();
  const b = new Date(`${versIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

/** L'offre est-elle dans sa saison ? SANS DATES, elle l'est toujours : c'est
    ce qui laisse intactes toutes les offres créées avant ce jour. */
export function dansLaSaison(o: { du?: string; au?: string }, now = new Date()): boolean {
  const j = isoDuJour(now);
  if (o.du && j < o.du) return false;
  if (o.au && j > o.au) return false;
  return true;
}

/** LA VEILLE DE LA MAISON : une saison se présente trois semaines avant son
    premier jour. C'est une PROPOSITION et jamais un ordre, la Maison garde
    la main ; rien ne s'allume tout seul. */
export const FENETRE_PROPOSITION = 21;

/** L'état d'une offre AU REGARD DE SA SAISON, à ne pas confondre avec sa
    visibilité de l'instant. Une offre « en cours » est dans sa saison, ce qui
    ne dit pas qu'elle est visible à cette minute : la fenêtre jour et heure
    tranche cela, et c'est `offerLiveNow` qui la lit. Le Trône affiche les
    deux, pour ne jamais promettre « en ligne » ce qui ne l'est pas. */
export type EtatDOffre = 'cours' | 'venir' | 'activer' | 'dort' | 'passee';

export function etatDeLOffre(
  /* STRUCTUREL, ET JAMAIS UN TYPE EMPRUNTÉ : ce module ne connaît ni
     `InstantOffer` du Trône, ni `OffreDuSite` du site public. Il décrit la
     seule forme dont il a besoin, et les deux s'y reconnaissent. C'est ce
     qui lui permet de rester pur, et de servir les deux rives. */
  o: { active: boolean; du?: string; au?: string },
  now = new Date(),
  fenetre = FENETRE_PROPOSITION,
): EtatDOffre {
  const j = isoDuJour(now);
  if (o.au && j > o.au) return 'passee';
  if (o.active) return o.du && j < o.du ? 'venir' : 'cours';
  if (o.du && joursEntre(j, o.du) <= fenetre) return 'activer';
  return 'dort';
}
