import { useRouteError } from 'react-router-dom';
import { codeIntrouvable, rechargeUneFois } from '../../../shared/preload-guard';

/* ══ UN ÉCRAN QUI NE S'OUVRE PAS — 4 octobre 2026 ═════════════════════
   « Sur la version hors ligne, Analytics ne s'ouvre pas : unexpected error »
   (Yéman). Le routeur attrapait l'échec de chargement d'un écran AVANT le
   garde de `preload-guard` et montrait sa page anglaise par défaut, sans
   rien proposer.

   ICI : un fichier de code d'une autre version manque, on recharge une fois
   (la page gardée et son code vont ensemble). Sinon, ou si le rechargement
   n'y a rien fait, on le dit en français, la barre du Trône reste là, et un
   bouton recharge. */
export function ErreurDEcran() {
  const erreur = useRouteError() as { message?: string } | undefined;
  const message = String(erreur?.message ?? erreur ?? '');
  const code = codeIntrouvable(message);
  if (code && rechargeUneFois()) return null;
  const horsLigne = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <div role="alert" style={{ padding: '48px 24px', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--color-indigo)', lineHeight: 1.2 }}>
        Cet écran ne s’est pas ouvert.
      </div>
      <p className="mnd-muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
        {code && horsLigne
          ? 'Il n’est pas encore gardé sur cet appareil. Il s’ouvrira au retour du réseau ; les autres écrans restent à votre disposition.'
          : 'Rechargez la page. Si cela recommence, dites-nous quel écran et ce que vous faisiez.'}
      </p>
      <button className="mnd-btn" style={{ alignSelf: 'flex-start' }} onClick={() => window.location.reload()}>
        Recharger
      </button>
    </div>
  );
}
