import { useEffect } from 'react';
import { Seal, Button } from '../../../ds/components';
import { reprendsLaMain } from '../../../shared/onglet-actif';
import '../auth/auth.css';

/* ══ LE TRÔNE EST OUVERT DANS UN AUTRE ONGLET — 20 novembre 2026 ══════════
   Le choix de Yéman (« A ») : comme WhatsApp Web, un seul onglet du Trône
   travaille à la fois (`shared/onglet-actif.ts`). Cet onglet-ci s'est mis en
   pause : il ne lit rien, n'écrit rien, n'envoie rien. Il le dit, et rend la
   main d'un geste. Le titre de l'onglet le dit aussi, pour qu'on le
   reconnaisse dans la barre du navigateur. */
export function OngletEnPause() {
  useEffect(() => {
    const avant = document.title;
    document.title = 'Le Trône · en pause';
    return () => { document.title = avant; };
  }, []);
  return (
    <div className="tra-shell">
      <div className="tra-card">
        <Seal color="copper" size={40} />
        <div className="mnd-eyebrow" style={{ marginTop: 8 }}>Cet onglet est en pause</div>
        <h1 className="mnd-serif tra-title">Le Trône est ouvert dans un autre onglet.</h1>
        <p className="tra-lede mnd-muted">
          Un seul onglet travaille à la fois : deux onglets ouverts ensemble se répondaient mal,
          et un rendez-vous annulé pouvait revenir. Rien n’a été perdu, tout est dans l’autre onglet.
        </p>
        <Button variant="copper" onClick={reprendsLaMain} className="tra-submit">
          Utiliser ici
        </Button>
        <p className="tra-lede mnd-muted" style={{ marginTop: 10, fontSize: 13 }}>
          L’autre onglet se mettra en pause à son tour.
        </p>
      </div>
    </div>
  );
}
