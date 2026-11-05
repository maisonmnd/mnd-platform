import { useNavigate } from 'react-router-dom';
import { momentDit } from '../../../../shared/cloture-du-jour';
import { todayISO } from './_shared';
import { useClotureDuJour } from './useClotureDuJour';
import './la-journee.css';

/* ══ LA JOURNÉE, EN TÊTE DU TABLEAU DE BORD — 4 novembre 2026 ═══════════
   Maquette 9KCMgAb1… : « une carte en tête du tableau de bord ». Le verdict
   du jour (la même règle que Grenat, relue à l'écran), le dernier passage
   de Grenat, et le chemin vers « La journée ». Des nombres, jamais un nom. */
export function CarteDeLaJournee() {
  const navigate = useNavigate();
  const jour = todayISO();
  const { cloture, passage, close, reste, verdictDit } = useClotureDuJour(jour);
  /* Un jour sans rien (Maison fermée, matin vide) ne prend pas la place ;
     une dépense à valider du jour, qui retient le comptage, la prend. */
  const retenue = (cloture.depenses?.comptes.aValiderDuJour ?? 0) > 0;
  if (cloture.rdvs.length === 0 && cloture.caisse.versements === 0 && !passage && !retenue) return null;
  return (
    <div className="lj-carte lj-carte--tdb" data-lj="carte-du-tableau-de-bord" style={{ marginTop: 22, marginBottom: 0 }}>
      <div className="lj-carte__tete">
        <span className="lj-carte__titre">La journée · la clôture de Grenat</span>
        <span className="lj-passage">{passage ? `Dernier passage : ${momentDit(passage.moment)}` : 'Grenat passe aux heures réglées'}</span>
      </div>
      <p className={`lj-verdict ${close ? 'ok' : 'ko'}`}>{close ? cloture.verdict.dit : verdictDit}</p>
      {!close && reste.length > 0 && <p className="lj-regle" style={{ marginTop: -6 }}>{reste.join(' · ')}</p>}
      <div style={{ padding: '0 18px 14px' }}>
        <button type="button" className="lj-g plein" onClick={() => navigate('/la-journee')}>Ouvrir La journée</button>
      </div>
    </div>
  );
}
