import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../ds/components';

/* ══ LA TOILE DE SIGNATURE — 15 septembre 2026 ══════════════════════════

   Un trait noir sur fond blanc, au doigt. Elle finit dans un PDF et dans un
   dossier : une signature stylisée serait un dessin, pas un engagement.

   ELLE REPREND LE GESTE DU DROIT À L'IMAGE (6 septembre), où la toile vivait
   à l'intérieur de sa propre modale. Les engagements en ont besoin pour la
   décharge d'une avance ; plutôt que de recopier le dessin une seconde fois,
   il devient un composant. La modale du droit à l'image garde encore sa
   copie — elle la rejoindra le jour où on la touchera, pas en passant.

   `touchAction: 'none'` N'EST PAS UN DÉTAIL : sans lui, sur une tablette, le
   doigt qui signe fait défiler la page, et la signature part en travers. */

const COTE = { l: 600, h: 200 } as const;

export function ToileDeSignature({
  onChange, invite = 'Passez-lui l’écran.',
}: {
  /** Rend l'image de la signature, ou une chaîne vide quand on efface. */
  onChange: (image: string) => void;
  invite?: string;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const dessine = useRef(false);
  const [signee, setSignee] = useState(false);

  useEffect(() => {
    const el = toile.current;
    if (!el) return;
    el.width = COTE.l; el.height = COTE.h;
    const c = el.getContext('2d');
    if (!c) return;
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, COTE.l, COTE.h);
    c.strokeStyle = '#14141B'; c.lineWidth = 3;
    c.lineCap = 'round'; c.lineJoin = 'round';
  }, []);

  const pointDe = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = toile.current!;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * COTE.l, y: ((e.clientY - r.top) / r.height) * COTE.h };
  };

  const bas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = toile.current!;
    const c = el.getContext('2d')!;
    el.setPointerCapture(e.pointerId);
    dessine.current = true;
    const p = pointDe(e);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + 0.1, p.y);
    c.stroke();
  };

  const bouge = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dessine.current) return;
    const c = toile.current!.getContext('2d')!;
    const p = pointDe(e);
    c.lineTo(p.x, p.y); c.stroke();
  };

  const haut = () => {
    if (!dessine.current) return;
    dessine.current = false;
    setSignee(true);
    onChange(toile.current!.toDataURL('image/png'));
  };

  const efface = () => {
    const el = toile.current;
    if (!el) return;
    const c = el.getContext('2d')!;
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, COTE.l, COTE.h);
    setSignee(false);
    onChange('');
  };

  return (
    <div>
      <canvas
        ref={toile}
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={haut}
        onPointerCancel={haut}
        aria-label="Zone de signature"
        style={{
          width: '100%', maxWidth: 480, aspectRatio: `${COTE.l} / ${COTE.h}`,
          border: '1px solid var(--hairline)', borderRadius: 3, background: '#fff',
          touchAction: 'none', cursor: 'crosshair', display: 'block',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="ghost" style={{ flex: 'none' }} onClick={efface}>Effacer</Button>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>{signee ? 'Signée.' : invite}</span>
      </div>
    </div>
  );
}
