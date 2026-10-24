import { useNavigate } from 'react-router-dom';
import { useStaff as useMonProfil } from '../../../../shared/auth';
import { passageAFaire, type Passage, type Processus } from '../../../../shared/processus-pur';
import { todayISO } from '../clients/_shared';
import { useLancePassagesDus, useLesProcessus, useTetesDuProcessus } from './agents-donnees';

/* ═══ « À VALIDER · LES AGENTS » AU TABLEAU DE BORD — 24 octobre 2026 ═══
   Les souverains seuls. Le passage dû d'un processus se fait ici quand on
   ouvre le tableau de bord (le Trône n'a pas de réveil au serveur pour
   eux) ; la lecture des fiches ne tourne QUE s'il y en a un à faire. */
export function AValiderDesAgents() {
  const navigate = useNavigate();
  const monProfil = useMonProfil();
  const { processus, passages } = useLesProcessus();
  if (monProfil?.role !== 'souverain') return null;
  const d = new Date();
  const du = processus.some((p) => !!passageAFaire(p, passages, todayISO(), d.getHours() * 60 + d.getMinutes()));
  const aValider = passages.reduce((n, x) => n + x.lignes.filter((l) => l.statut === 'a-valider').length, 0);
  return (
    <>
      {du && <LanceurDesPassages processus={processus} passages={passages} />}
      {aValider > 0 && (
        <button type="button" className="trp-agents" onClick={() => navigate('/agents')}>
          <span className="trp-prev__sur">À valider · les agents</span>
          <span><b>{aValider}</b> message{aValider > 1 ? 's' : ''} prêt{aValider > 1 ? 's' : ''} à relire avant de partir</span>
          <span className="trp-prev__lien">Les relire ›</span>
        </button>
      )}
    </>
  );
}

function LanceurDesPassages({ processus, passages }: { processus: Processus[]; passages: Passage[] }) {
  const tetes = useTetesDuProcessus(passages);
  useLancePassagesDus(true, processus, passages, tetes);
  return null;
}
