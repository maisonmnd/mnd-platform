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
   doigt qui signe fait défiler la page, et la signature part en travers.

   LE TRAIT NE DÉPEND PLUS D'UNE CAPTURE — 23 septembre 2026. « La signature
   sur l'écran de la lettre de prêt et d'engagement ne marche pas : le trait
   ne se dessine pas » (Yéman). La version du 15 septembre posait
   `setPointerCapture` AVANT de dessiner : quand le navigateur refuse la
   capture (un pointeur qu'il ne tient plus pour actif, un stylet, une modale
   ouverte dans une autre), l'exception sortait du gestionnaire et rien ne se
   traçait, sans un mot. Désormais : le trait commence quoi qu'il arrive, la
   capture n'est qu'un confort essayé ensuite, et le geste se suit sur la
   fenêtre entière tant que le doigt est posé, pour finir même hors du cadre.
   Les coordonnées se protègent d'un cadre sans taille, le pinceau se repose
   à chaque trait, et le défilement au toucher est refusé à la source. */

const COTE = { l: 600, h: 200 } as const;

const prepare = (el: HTMLCanvasElement): CanvasRenderingContext2D | null => {
  const c = el.getContext('2d');
  if (!c) return null;
  c.strokeStyle = '#14141B'; c.lineWidth = 3;
  c.lineCap = 'round'; c.lineJoin = 'round';
  return c;
};

const blanchit = (el: HTMLCanvasElement) => {
  const c = el.getContext('2d');
  if (!c) return;
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, COTE.l, COTE.h);
};

export function ToileDeSignature({
  onChange, invite = 'Passez-lui l’écran.',
}: {
  /** Rend l'image de la signature, ou une chaîne vide quand on efface. */
  onChange: (image: string) => void;
  invite?: string;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const dessine = useRef(false);
  const pointeur = useRef<number | null>(null);
  const [signee, setSignee] = useState(false);

  useEffect(() => {
    const el = toile.current;
    if (!el) return;
    el.width = COTE.l; el.height = COTE.h;
    blanchit(el);
    prepare(el);
    /* Le défilement au toucher, refusé à la source : l'écouteur de React est
       passif et ne peut pas l'empêcher ; celui-ci le peut. */
    const refuse = (e: TouchEvent) => { e.preventDefault(); };
    el.addEventListener('touchstart', refuse, { passive: false });
    el.addEventListener('touchmove', refuse, { passive: false });
    return () => {
      el.removeEventListener('touchstart', refuse);
      el.removeEventListener('touchmove', refuse);
    };
  }, []);

  const pointDe = (clientX: number, clientY: number) => {
    const el = toile.current!;
    const r = el.getBoundingClientRect();
    /* Un cadre sans taille donnerait des coordonnées infinies : on retombe
       sur la taille de la toile elle-même. */
    const l = r.width || COTE.l;
    const h = r.height || COTE.h;
    return { x: ((clientX - r.left) / l) * COTE.l, y: ((clientY - r.top) / h) * COTE.h };
  };

  const finit = () => {
    if (!dessine.current) return;
    dessine.current = false;
    const el = toile.current;
    if (el && pointeur.current !== null) {
      try { el.releasePointerCapture(pointeur.current); } catch { /* jamais capturé */ }
    }
    pointeur.current = null;
    window.removeEventListener('pointermove', suitLaFenetre);
    window.removeEventListener('pointerup', finit);
    window.removeEventListener('pointercancel', finit);
    setSignee(true);
    if (el) onChange(el.toDataURL('image/png'));
  };

  const trace = (clientX: number, clientY: number) => {
    const el = toile.current;
    if (!el || !dessine.current) return;
    const c = el.getContext('2d');
    if (!c) return;
    const p = pointDe(clientX, clientY);
    c.lineTo(p.x, p.y); c.stroke();
  };

  /* LE GESTE SE SUIT SUR LA FENÊTRE : si la capture a été refusée, le doigt
     qui sort du cadre continue son trait, et le lever de doigt est vu. */
  const suitLaFenetre = (e: PointerEvent) => {
    if (pointeur.current !== null && e.pointerId !== pointeur.current) return;
    trace(e.clientX, e.clientY);
  };

  const bas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = toile.current;
    if (!el) return;
    if (dessine.current) return;
    const c = prepare(el);
    if (!c) return;
    dessine.current = true;
    pointeur.current = e.pointerId;
    const p = pointDe(e.clientX, e.clientY);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + 0.1, p.y);
    c.stroke();
    /* La capture, essayée APRÈS le premier point, jamais avant. */
    try { el.setPointerCapture(e.pointerId); } catch { /* refusée : la fenêtre prend le relais */ }
    window.addEventListener('pointermove', suitLaFenetre);
    window.addEventListener('pointerup', finit);
    window.addEventListener('pointercancel', finit);
  };

  const bouge = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dessine.current) return;
    if (pointeur.current !== null && e.pointerId !== pointeur.current) return;
    trace(e.clientX, e.clientY);
  };

  const efface = () => {
    const el = toile.current;
    if (!el) return;
    blanchit(el);
    prepare(el);
    setSignee(false);
    onChange('');
  };

  return (
    <div style={{ touchAction: 'none' }}>
      <canvas
        ref={toile}
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={finit}
        onPointerCancel={finit}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Zone de signature"
        style={{
          width: '100%', maxWidth: 480, aspectRatio: `${COTE.l} / ${COTE.h}`,
          border: '1px solid var(--hairline)', borderRadius: 3, background: '#fff',
          touchAction: 'none', cursor: 'crosshair', display: 'block', userSelect: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="ghost" type="button" style={{ flex: 'none' }} onClick={efface}>Effacer</Button>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>{signee ? 'Signée.' : invite}</span>
      </div>
    </div>
  );
}
