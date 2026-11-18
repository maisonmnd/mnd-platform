import { lazy, Suspense, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useStore } from '../../../shared/store';
import { useStaff } from '../../../shared/auth';
import { staffAccessStore } from '../routes/equipe/data';
import { versionDeIaMaison } from '../../../shared/ia-maison';
import { peutDemander, saitLAgentDesRendezVous } from '../../../shared/ia-maison-pur';
import { CHANTIER_DE_L_AGENT } from '../../../shared/agent-des-rendez-vous-pur';
import './agent-des-rendez-vous.css';

/* ══ L'AGENT DES RENDEZ-VOUS, DANS LA BARRE DU HAUT — 18 novembre 2026 ════
   « Dites-le. C'est posé. » Un bouton à côté de « Créer », sur chaque
   écran du Trône. La fenêtre se charge au premier toucher (elle porte la
   carte « Son prochain rituel » et la recherche des clientes).

   LE BOUTON N'APPARAÎT QUE SI : la fonction ia-maison posée connaît le
   chantier (`saitLAgentDesRendezVous`), et la personne y a droit (la
   direction, ou la clientèle et la vente, `peutDemander`). */

const FenetreDeLAgent = lazy(() => import('./FenetreDeLAgent'));

export default function AgentDesRendezVous() {
  const moi = useStaff();
  const accesTous = useStore(staffAccessStore)[0];
  const mesDomaines = accesTous[moi?.user_id ?? ''] ?? {};
  const [saitFaire, setSaitFaire] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    let vivant = true;
    void versionDeIaMaison().then((v) => { if (vivant) setSaitFaire(saitLAgentDesRendezVous(v)); });
    return () => { vivant = false; };
  }, []);

  if (!saitFaire || !peutDemander(moi?.role, CHANTIER_DE_L_AGENT, mesDomaines)) return null;
  return (
    <>
      <button
        type="button"
        className="tra-agent__bouton"
        onClick={() => setOuvert(true)}
        title="L’agent des rendez-vous : dites-le, c’est posé"
      >
        <Sparkles size={14} aria-hidden />
        <span>Agent</span>
      </button>
      {ouvert && (
        <Suspense fallback={null}>
          <FenetreDeLAgent onClose={() => setOuvert(false)} />
        </Suspense>
      )}
    </>
  );
}
