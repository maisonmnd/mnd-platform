import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { momentDuSalon } from '../../../../shared/calendrier';
import { compteDesAccords, type SourceDeLAccord } from '../../../../shared/accord-des-nouvelles-pur';

/* ══ L'ACCORD DES NOUVELLES, AU TABLEAU DE BORD — 26 novembre 2026 ═══════
   L'audit du Trône (B1) : « le tableau de bord compte les accords obtenus ».
   Sur les fiches vivantes de la branche qui peuvent répondre (ni archivée,
   ni d'essai, ni d'enfant) : oui, non (dont STOP), pas encore demandé ; et
   les « oui » gagnés cette semaine (du lundi à aujourd'hui, au jour du
   salon) et ce mois, avec d'où ils viennent. Le compte est la règle pure
   `compteDesAccords` (shared/accord-des-nouvelles-pur). */

const SOURCE_COURTE: Record<SourceDeLAccord, string> = {
  comptoir: 'comptoir', reglement: 'page Régler', couronne: 'Ma Couronne', whatsapp: 'WhatsApp', site: 'site', stop: 'STOP',
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const ligne: React.CSSProperties = { cursor: 'default' };

export function TuileDeLAccord() {
  const navigate = useNavigate();
  const { branch } = useBranch();
  const [clients] = useClients();
  const aujourdhui = momentDuSalon().jour;
  const c = useMemo(() => compteDesAccords(clients, { branchId: branch.id, aujourdhui }), [clients, branch.id, aujourdhui]);
  const sources = (Object.keys(c.ouiDuMoisParSource) as SourceDeLAccord[]).filter((s) => c.ouiDuMoisParSource[s] > 0);
  const mois = MOIS[Number(aujourdhui.slice(5, 7)) - 1] ?? '';
  return (
    <section className="tdb-carte" aria-labelledby="tdb-t-accord" data-tdb="accord">
      <div className="tdb-carte__t">
        <h2 id="tdb-t-accord">Accord des nouvelles <small>{c.tetes} fiches</small></h2>
        <button type="button" className="tdb-lien" onClick={() => navigate('/customers')}>Les clientes ›</button>
      </div>
      <div className="tdb-lignes">
        <div className="tdb-ligne" style={ligne}><span>Oui</span><b>{c.oui}</b></div>
        <div className="tdb-ligne" style={ligne}><span>Non{c.stop > 0 ? ` (dont ${c.stop} STOP)` : ''}</span><b>{c.non}</b></div>
        <div className="tdb-ligne" style={ligne}>
          <span>Pas encore demandé{c.sansReponse > 0 ? ` (et ${c.sansReponse} sans réponse sur WhatsApp)` : ''}</span><b>{c.pasEncore}</b>
        </div>
        <div className="tdb-ligne" style={ligne}><span>Oui gagnés cette semaine</span><b>+{c.ouiSemaine}</b></div>
        <div className="tdb-ligne" style={ligne}>
          <span>
            Oui gagnés en {mois}
            {sources.length > 0 && <small style={{ display: 'block', color: 'var(--tdb-doux)', fontSize: 12 }}>{sources.map((s) => `${SOURCE_COURTE[s]} ${c.ouiDuMoisParSource[s]}`).join(' · ')}</small>}
          </span>
          <b>+{c.ouiMois}</b>
        </div>
      </div>
    </section>
  );
}
