/* LA PASTILLE DE LA COURONNE (7 novembre 2026). « La couronne mini prend trop
   de place » (Yéman) : la carte du statut devient une pastille d'une ligne
   dans le haut de l'accueil, calibre et fourchette de locks. Jamais le compte
   exact (16 octobre 2026) : la fourchette vient de fourchetteDuModele. Sans
   calibre connu, pas de pastille : rien ne se devine. */
export function pastilleDeLaCouronne(nomDuCalibre: string | undefined | null, fourchette: string | undefined | null): { calibre: string; fourchette: string } | null {
  const calibre = (nomDuCalibre ?? '').trim();
  if (!calibre) return null;
  return { calibre, fourchette: (fourchette ?? '').trim() };
}
