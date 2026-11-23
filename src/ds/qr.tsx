import { useMemo, type CSSProperties } from 'react';
import { qrMatrice } from '../shared/qr-pur';

/* ══ LE QR DE LA MAISON, À L'ÉCRAN — 23 novembre 2026 ═══════════════════
   Un seul dessin pour le QR du salon (`Comptoir`) et celui de l'invitation
   (« Régler à deux »). Indigo sur ivoire, jamais le cuivre : un QR se
   scanne, il ne se décore pas. `style` s'impose à la taille — chaque écran
   choisit la sienne. */
export function QrSvg({ valeur, style, dit }: { valeur: string; style?: CSSProperties; dit?: string }) {
  const d = useMemo(() => qrMatrice(valeur), [valeur]);
  return (
    <svg viewBox={`-2 -2 ${d.n + 4} ${d.n + 4}`} style={style} role="img" aria-label={dit ?? 'Code à scanner'}>
      <rect x={-2} y={-2} width={d.n + 4} height={d.n + 4} fill="#F6F1E7" />
      <path d={d.path} fill="#1E2150" shapeRendering="crispEdges" />
    </svg>
  );
}
