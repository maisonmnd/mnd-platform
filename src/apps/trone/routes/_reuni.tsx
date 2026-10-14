import { Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMaTete } from '../../../shared/auth';
import { useStore } from '../../../shared/store';
import { staffAccessStore } from './equipe/data';
import { ecranDAvant, peutVoir, reunionDe } from './index';

/* ══ L'ÉCRAN RÉUNI — 14 octobre 2026 ══════════════════════════════════════
   Une barre d'onglets au-dessus de l'écran d'avant, montré tel quel. Chaque
   onglet est une adresse (`/fil`, `/tableau`) : toucher un onglet, c'est aller
   à son adresse, et la garde d'écran du Shell le juge comme avant. On ne
   montre que les onglets que la personne peut ouvrir ; seul, un onglet ne
   fait pas de barre. Voir REUNIONS (routes/index.tsx). */
export default function EcranReuni() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { tete } = useMaTete();
  const [acces] = useStore(staffAccessStore);
  const mesDomaines = acces[tete?.user_id ?? ''] ?? {};
  const reunion = reunionDe(pathname);
  const Ecran = ecranDAvant(pathname);
  const onglets = (reunion?.onglets ?? []).filter((o) => peutVoir(tete?.role, o.path, mesDomaines));
  if (!Ecran) return null;
  return (
    <>
      {onglets.length > 1 && (
        <nav className="trc-tabs" aria-label={reunion?.titre} style={{ flexWrap: 'wrap', marginBottom: 16 }}>
          {onglets.map((o) => (
            <button
              key={o.path}
              type="button"
              className={`trc-tab ${o.path === pathname ? 'is-active' : ''}`}
              aria-current={o.path === pathname ? 'page' : undefined}
              onClick={() => { if (o.path !== pathname) navigate(o.path); }}
            >
              {o.label}
            </button>
          ))}
        </nav>
      )}
      <Suspense fallback={null}>
        <Ecran key={pathname} />
      </Suspense>
    </>
  );
}
