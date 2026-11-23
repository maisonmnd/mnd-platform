import { useEffect, useRef, useState } from 'react';
import { asset } from '../shared/asset';
import { PICTOGRAMME_DU_SCEAU, SCEAU_CUIVRE, TENUE_DU_SCEAU_MS } from '../shared/le-sceau-pur';

/* ══ LE SCEAU — le geste de la page « Régler » · 22 novembre 2026 ════════
   « Un doigt maintenu une seconde » (Yéman, maquette LK7GvACWPzWgJ7WNZeZigp,
   version 9). Le sceau, c'est le pictogramme de la Maison sur un disque de
   cuivre — jamais le tampon de la direction. La jauge fait le tour du disque
   pendant la seconde : rien ne part avant.

   AU CLAVIER, OU PAR UNE AIDE TECHNIQUE, un seul appui suffit : on ne
   demande pas à quelqu'un qui ne peut pas tenir un doigt une seconde de
   renoncer à régler. Le toucher long reste le geste de la main. */

const francs = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;

export function Sceau({ montantXof, disabled, dit, onTenue }: {
  montantXof: number;
  disabled?: boolean;
  /** Ce qui est écrit sous le montant — « Maintenez le sceau une seconde ». */
  dit?: string;
  onTenue: () => void;
}) {
  const [tient, setTient] = useState(false);
  const minuteur = useRef<number | null>(null);

  const lache = () => {
    if (minuteur.current !== null) { window.clearTimeout(minuteur.current); minuteur.current = null; }
    setTient(false);
  };
  useEffect(() => lache, []);

  const prendre = () => {
    if (disabled || tient) return;
    setTient(true);
    minuteur.current = window.setTimeout(() => { minuteur.current = null; setTient(false); onTenue(); }, TENUE_DU_SCEAU_MS);
  };

  return (
    <div className="rg-sceau">
      <div className="rg-du">
        <small>{'À régler'}</small>
        <strong>{francs(montantXof)}</strong>
        <span>{dit ?? 'Maintenez le sceau une seconde'}</span>
      </div>
      <button
        type="button"
        className={tient ? 'rg-sceau__geste tient' : 'rg-sceau__geste'}
        aria-label={`Maintenir pour régler ${francs(montantXof)}`}
        disabled={disabled}
        onPointerDown={(e) => { e.preventDefault(); prendre(); }}
        onPointerUp={lache}
        onPointerCancel={lache}
        onPointerLeave={lache}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => { if (e.detail === 0) onTenue(); }}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true" className="rg-sceau__svg">
          <circle className="rg-sceau__piste" cx="50" cy="50" r="46" fill="none" pathLength={100} />
          <circle className="rg-sceau__tour" cx="50" cy="50" r="46" fill="none" pathLength={100} />
          <circle className="rg-sceau__fond" cx="50" cy="50" r="40" />
          <circle className="rg-sceau__anneau" cx="50" cy="50" r="33" fill="none" />
        </svg>
        <img className="rg-sceau__picto" src={asset(PICTOGRAMME_DU_SCEAU)} alt="" width={30} height={25} />
      </button>
    </div>
  );
}

/** LE SCEAU CUIVRE DE LA MAISON, au moment « Scellé » (et nulle part
    ailleurs) : c'est le sceau de la Maison MND, jamais celui de la direction. */
export function SceauPose({ petit }: { petit?: boolean }) {
  return (
    <img
      className={petit ? 'rg-sceau-pose rg-sceau-pose--petit' : 'rg-sceau-pose'}
      src={asset(SCEAU_CUIVRE)}
      alt="Le sceau cuivre de la Maison MND"
    />
  );
}

