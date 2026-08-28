import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/* Le carré à scanner, dessiné ici plutôt qu'importé du Comptoir : la carte est
   une entrée PUBLIQUE et ne doit rien tirer du Trône. Vingt lignes valent mieux
   qu'une dépendance qui ferait entrer du code de gestion dans un écran posé
   sur un comptoir.

   La zone de silence (2 modules) est dans le viewBox : sans elle, un lecteur
   posé contre l'écran ne trouve pas les repères d'angle. */
export function QrSvg({ valeur }: { valeur: string }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(valeur);
    qr.make();
    const taille = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < taille; r++) {
      for (let c = 0; c < taille; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
    return { path: d, n: taille };
  }, [valeur]);

  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label="Scanner pour réserver">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path d={path} fill="#1E2150" shapeRendering="crispEdges" />
    </svg>
  );
}
