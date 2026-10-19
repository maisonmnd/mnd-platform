import { useNavigate } from 'react-router-dom';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import { CHANTIER_CAPTURE, capturesAInscrire } from '../../../../shared/ia-capture-pur';
import { useCapturesLues } from '../../../../shared/ia-capture';
import { cheminDeLaConversation } from '../../../../shared/conversations';
import { staffAccessStore } from '../equipe/data';

/* ══ « CAPTURES À INSCRIRE » DANS À FAIRE — 19 octobre 2026 ══════════════
   Sa décision : « "Captures à inscrire" apparaît dans À faire. » Une
   pastille-chiffre comme les autres de l'en-tête, qui mène aux Conversations
   (au fil même quand il n'y en a qu'une). Muette quand rien n'attend. */
export function TuileCapturesAInscrire() {
  const [captures] = useCapturesLues();
  const staff = useStaff();
  const [acces] = useStore(staffAccessStore);
  const navigate = useNavigate();
  const attendent = capturesAInscrire(captures);
  if (!attendent.length || !peutDemander(staff?.role, CHANTIER_CAPTURE, staff ? acces[staff.user_id] : undefined)) return null;
  const n = attendent.length;
  const cible = (n === 1 && cheminDeLaConversation(attendent[0].numero)) || '/conversations';
  return (
    <button type="button" className="trp-af-pill trp-af-pill--attente" onClick={() => navigate(cible)}>
      <b>{n}</b> capture{n > 1 ? 's' : ''} à inscrire
    </button>
  );
}

export default TuileCapturesAInscrire;
