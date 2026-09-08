/* ══ LA RECHERCHE D'UNE PRESTATION — 8 septembre 2026 ═════════════════

   « J'ai trop de prestations, ajoute-moi une barre de recherche pour ne pas
   scroller longtemps » (Yéman).

   Le juge vit ICI, pur et sous harnais, parce que la frappe réelle ne
   ressemble pas au catalogue : on tape « sinsin » pour SÍNSIN™, « kloklo »
   pour KLƆKLƆ™, sans accents, sans ™, et dans n'importe quel ordre de mots.
   Un filtre écrit dans un fichier d'écran aurait raté le Ɔ fon au premier
   jour, et personne ne l'aurait su : la barre aurait juste « rien trouvé ». */

/** Réduit un texte à sa chair : minuscules, sans accents, sans ™ ni
    ponctuation. Les lettres fon rejoignent le clavier : Ɔ devient o,
    Ɛ devient e — c'est ce que la main tape. */
export const clefDeRecherche = (texte: string): string =>
  texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ɔ/g, 'o')
    .replace(/ɛ/g, 'e')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();

/** Vrai quand CHAQUE mot tapé se retrouve dans le nom — l'ordre est libre
    (« reprise sinsin » trouve « SÍNSIN™ · La Reprise »). Une saisie vide
    répond vrai : ne rien chercher, c'est tout voir. */
export const prestationRepond = (nom: string, saisie: string): boolean => {
  const cle = clefDeRecherche(nom);
  return clefDeRecherche(saisie)
    .split(' ')
    .filter(Boolean)
    .every((mot) => cle.includes(mot));
};
