import { Mic } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

/* ── DICTER — 31 octobre 2026 ──────────────────────────────────────────────
   Le bouton de la barre du haut qui mène à la Dictée MND depuis n'importe
   quel écran : l'écran est hors menu, c'est lui qui le tient. Il porte la
   tenue du bouton « Rechercher » (rc-bouton, recherche.css) : même cuivre,
   même place, le mot disparaît au téléphone et l'icône reste. */
export default function BoutonDictee() {
  const navigate = useNavigate();
  const ici = useLocation().pathname === '/dictee';
  return (
    <button
      type="button"
      className="rc-bouton"
      onClick={() => navigate('/dictee')}
      title="Dicter : tenez, parlez, Claude met au propre"
      aria-current={ici ? 'page' : undefined}
    >
      <Mic size={14} /><span>Dicter</span>
    </button>
  );
}
