import type { GroupeDeComposition, LigneDeFormule } from '../../shared/composition-pur';
import { t } from './i18n';
import './couronne.css';

/* « VOIR LA COMPOSITION » — 8 novembre 2026. Sur chaque carte de formule ou de
   forfait, et sur la fiche d'achat : la liste entière de ce que la cliente
   reçoit, avant de payer. Un <details> : fermé il ne prend qu'une ligne,
   ouvert il se lit sans quitter la carte. Aucun prix, aucun bouton d'achat :
   la composition ne change rien au montant. */

/** « au départ, semaine 4 et semaine 8 ». */
function semainesDites(semaines: readonly number[]): string {
  const dites = semaines.map((w) => (w === 0 ? t('au départ') : t('semaine {n}', { n: w })));
  if (dites.length <= 1) return dites[0] ?? '';
  return `${dites.slice(0, -1).join(', ')}${t(' et ')}${dites[dites.length - 1]}`;
}

/** La composition d'un FORFAIT du catalogue, éventuellement venue par venue. */
export function CompositionDuForfait({ groupes }: { groupes: readonly GroupeDeComposition[] }) {
  if (groupes.length === 0) return null;
  return (
    <details className="cma-compo">
      <summary>{t('Voir la composition')}</summary>
      {groupes.map((g) => (
        <div key={g.venue ?? 'tout'} className="cma-compo__groupe">
          {g.venue !== undefined && <div className="cma-compo__venue">{t('Venue {n}', { n: g.venue })}</div>}
          <ul className="cma-compo__liste">
            {g.lignes.map((l) => (
              <li key={l.cle}>
                <span className="cma-compo__quoi">{l.fois > 1 ? `${l.fois} × ` : ''}{l.quoi}</span>
                {l.offert && <em className="cma-compo__offert">{t('offert')}</em>}
                {l.semaines.length > 0 && <span className="cma-compo__quand">{semainesDites(l.semaines)}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  );
}

/** La composition d'une FORMULE : ses prestations et leur quota. En `cycle`
    le quota se recharge chaque mois ; en `pack` il vaut pour toute la durée. */
export function CompositionDeLaFormule({ lignes, mode }: { lignes: readonly LigneDeFormule[]; mode?: 'cycle' | 'pack' }) {
  if (lignes.length === 0) return null;
  return (
    <details className="cma-compo">
      <summary>{t('Voir la composition')}</summary>
      <ul className="cma-compo__liste">
        {lignes.map((l) => (
          <li key={l.serviceId}>
            <span className="cma-compo__quoi">{l.qty === null ? l.quoi : `${l.qty} × ${l.quoi}`}</span>
            <span className="cma-compo__quand">
              {l.qty === null ? t('à volonté') : mode === 'pack' ? t('pour toute la durée') : t('par mois')}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
