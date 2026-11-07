import { apresSemainesDit, dureeDite, type DetailDuService } from '../../../../shared/le-moment-detail-pur';
import { francsDuTiers } from '../../../../shared/le-moment-en-trois-pur';

/* ══ LE DÉTAIL DE CE QUE LE MOMENT COMPREND — 7 novembre 2026 ═══════════════
   « Quand je prends Le Moment, je dois voir lesquels des services je consomme
   à chaque séance. Je veux le détail de tous les services inclus dans cette
   prestation » (Yéman).

   LECTURE SEULE. Les lignes viennent de `includes` du service en base, dans
   son ordre (shared/le-moment-detail-pur.ts) : chacune avec son nom complet,
   « Offert » quand le catalogue l'offre, sa durée quand elle est connue et,
   hors offert, sa valeur de carte. Un service retiré du catalogue se dit. Le
   prix ne se lit pas ici : il reste celui du rendez-vous (le total, ou la part
   figée de la venue). Repliable, sobre : peu de mots. */
export function DetailDuMoment({ detail, titre, totalXof, replie = false, avecValeurs = true }: {
  detail: DetailDuService;
  titre?: string;
  /** Le total du Moment, en pied (au rendez-vous seulement). */
  totalXof?: number;
  replie?: boolean;
  avecValeurs?: boolean;
}) {
  if (detail.lignes.length === 0) return null;
  const corps = (
    <div style={{ marginTop: 6 }}>
      {detail.lignes.map((l, i) => (
        <div
          key={`${l.serviceId}-${i}`}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--hairline)', fontSize: 12.5 }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={l.retire ? { fontStyle: 'italic' } : undefined}>{l.nom}</span>
            {l.offert && (
              <span style={{ marginLeft: 6, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-copper)', border: '1px solid var(--copper-300)', borderRadius: 99, padding: '1px 7px' }}>Offert</span>
            )}
            <span className="mnd-muted" style={{ marginLeft: 6, fontSize: 11.5 }}>
              {[l.dureeMin ? dureeDite(l.dureeMin) : '', l.apresSemaines ? apresSemainesDit(l.apresSemaines) : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
          {avecValeurs && <span className="mnd-muted">{l.valeurXof && !l.offert ? francsDuTiers(l.valeurXof) : ''}</span>}
        </div>
      ))}
      {(avecValeurs && detail.valeurOfferteXof > 0) || typeof totalXof === 'number' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingTop: 6, fontSize: 12.5 }}>
          {typeof totalXof === 'number' && <span>Le Moment : <b>{francsDuTiers(totalXof)}</b></span>}
          {avecValeurs && detail.valeurOfferteXof > 0 && <span className="mnd-muted">Offert : {francsDuTiers(detail.valeurOfferteXof)}</span>}
        </div>
      ) : null}
    </div>
  );
  return (
    <details open={!replie} style={{ margin: '6px 0' }}>
      <summary style={{ cursor: 'pointer', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--color-copper)' }}>
        {titre ?? 'Ce que comprend Le Moment'}
      </summary>
      {corps}
    </details>
  );
}
