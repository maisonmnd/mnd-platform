import qrcode from 'qrcode-generator';

/* ══ LE QR, DESSINÉ À LA MAIN — 23 novembre 2026 ═════════════════════════
   `qrMatrice` vivait dans `equipe/Comptoir.tsx`, l'écran du salon : il ne
   servait qu'au QR du jour. Le « régler à deux » en a besoin sur la page de
   la cliente (montrer le QR à l'invitée, maquette LK7GvACWPzWgJ7WNZeZigp),
   et une seconde copie aurait fini par diverger. Il vit ici, pur.

   À SAVOIR : `Comptoir.tsx` garde encore sa propre copie de `qrMatrice`
   (le QR du salon). Elles font exactement le même dessin ; le jour où
   quelqu'un touche à cet écran-là, il lit celle-ci et jette la sienne. Le
   banc `verifie-le-sceau` vérifie que la matrice de la page porte le même
   motif pour les mêmes valeurs.

   La matrice se dessine en UN chemin SVG (`M{x} {y}h1v1h-1z` par module
   noir) : pas d'image, pas de bibliothèque de rendu, et le cuivre ne se
   pose pas sur un QR (il se scanne en indigo sur ivoire). */
export function qrMatrice(valeur: string): { path: string; n: number } {
  const qr = qrcode(0, 'M');
  qr.addData(valeur);
  qr.make();
  const n = qr.getModuleCount();
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
  }
  return { path, n };
}
