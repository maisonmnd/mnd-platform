import { useNavigate } from 'react-router-dom';
import { useStaff as useMaTete } from '../../../../../shared/auth';
import { useCeQuiAttend } from './Aujourdhui';

/* ══ LES RESSOURCES HUMAINES DANS « À FAIRE » — 14 octobre 2026 ══════════
   La même liste qu'« Aujourd'hui » des RH, en une ligne : les trois plus
   pressées, et le compte du reste. Le souverain seul (choix : la direction
   seule) ; les autres n'y lisent de toute façon rien (0130). */
export default function RappelDesRh() {
  const me = useMaTete();
  const navigate = useNavigate();
  const items = useCeQuiAttend();
  if (me?.role !== 'souverain' || items.length === 0) return null;
  const premiers = items.slice(0, 3).map((i) => `${i.quoi} · ${i.titre}`);
  const reste = items.length > 3 ? ` · et ${items.length - 3} autre${items.length - 3 > 1 ? 's' : ''}` : '';
  return (
    <div className={`sec-bandeau${items.some((i) => i.urgent) ? ' sec-bandeau--alerte' : ''}`} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <span style={{ flex: 1, minWidth: 220 }}><b>Les ressources humaines · </b>{premiers.join(' · ')}{reste}</span>
      <button type="button" className="trp-af-pill" onClick={() => navigate('/personnel')}>Ouvrir les RH</button>
    </div>
  );
}
