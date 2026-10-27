import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { OngletAudience } from '../equipe/MarketingBranche';
import { useAbonnesAuxNotifications } from '../equipe/useAudiences';
import '../equipe/equipe.css';

/* L'AUDIENCE, 27 octobre 2026, lot 3 de l'Assistant Maison (spec §3 :
   « audience en onglet de Clientes »). L'onglet du Marketing est repris tel
   quel (`OngletAudience`, inchangé) sous son propre toit : le Marketing quitte
   la barre, et la question « à qui la Maison peut écrire » vit avec les
   Clientes, dans la réunion « Clientes » (REUNIONS, routes/index.tsx).

   « Écrire » ne prépare plus une campagne à texte libre, il n'y en a plus :
   il mène à Offres et remises de l'Assistant, le seul qui écrit aux clientes.
   L'écran s'ouvre sans réseau et sans données : les abonnés aux
   notifications sont vides hors ligne, et le reste vient des magasins. */
export default function Audience() {
  const navigate = useNavigate();
  const abonnes = useAbonnesAuxNotifications();
  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Clientèle · Clientes"
        title="L’audience."
        sub="À qui la Maison peut écrire : segments posés à la main, audiences calculées, accords WhatsApp et notifications. « Écrire » ouvre Offres et remises de l’Assistant Maison."
      />
      <OngletAudience abonnes={abonnes} onEcrire={() => navigate('/gerard?vue=offres')} />
    </div>
  );
}
