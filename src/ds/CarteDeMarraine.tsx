import { useEffect, useRef, useState } from 'react';
import { dessineLaCarteDeMarraine, CARTE_H, CARTE_L, type DonneesDeCarte } from './carte-marraine';

/* LA CARTE À L'ÉCRAN — 28 septembre 2026. La même peinture que l'image
   partagée et imprimée ; elle se retourne d'une touche (le recto au prénom,
   le verso au QR). Un vrai bouton, pour que le clavier et le lecteur d'écran
   la retournent aussi. */
export function CarteDeMarraine({ donnees, largeur = 350, retournable = true, face: faceImposee }: {
  donnees: DonneesDeCarte;
  largeur?: number;
  retournable?: boolean;
  face?: 'recto' | 'verso';
}) {
  const [face, setFace] = useState<'recto' | 'verso'>(faceImposee ?? 'recto');
  useEffect(() => { if (faceImposee) setFace(faceImposee); }, [faceImposee]);
  const ref = useRef<HTMLCanvasElement>(null);
  const [prete, setPrete] = useState(false);
  const cle = `${donnees.prenom}|${donnees.code}|${donnees.depuis}|${donnees.modele ?? 'indigo'}|${face}`;
  useEffect(() => {
    let vivant = true;
    const canvas = ref.current;
    if (!canvas) return;
    setPrete(false);
    dessineLaCarteDeMarraine(canvas, face, donnees)
      .then(() => { if (vivant) setPrete(true); })
      .catch(() => { if (vivant) setPrete(true); });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  const hauteur = Math.round((largeur * CARTE_H) / CARTE_L);
  const toile = (
    <canvas
      ref={ref}
      aria-label={face === 'recto' ? `Carte de marraine de ${donnees.prenom}, code ${donnees.code}` : `QR code pour réserver avec le code ${donnees.code}`}
      style={{
        width: largeur, height: hauteur, display: 'block', borderRadius: Math.round(largeur * 0.036),
        boxShadow: '0 22px 44px rgba(30,33,80,.24)', background: face === 'recto' ? '#1E2150' : '#F6F1E7',
        opacity: prete ? 1 : 0.6, transition: 'opacity .3s ease',
      }}
    />
  );
  if (!retournable) return toile;
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={() => setFace((f) => (f === 'recto' ? 'verso' : 'recto'))}
        style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', borderRadius: Math.round(largeur * 0.036), WebkitTapHighlightColor: 'transparent' }}
        aria-label={face === 'recto' ? 'Retourner la carte : voir le QR' : 'Retourner la carte : voir le recto'}
      >
        {toile}
      </button>
      <span style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--copper-700, #7C4C2C)' }}>
        {face === 'recto' ? 'Touchez pour voir le QR' : 'Touchez pour revoir le recto'}
      </span>
    </div>
  );
}
