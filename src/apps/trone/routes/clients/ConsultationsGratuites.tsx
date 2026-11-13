import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../ds/components';
import { useStore } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { consultationsQueueStore, type OnlineConsultation } from '../../../../shared/bridges';

/* ══ A · LES CONSULTATIONS GRATUITES À RELIRE — 13 novembre 2026 (lot 2) ═══
   Ce que le site a déposé (/consultation/) : les besoins cochés, la couronne
   décrite, la lecture et l'estimation. La Maison relit, prépare le devis
   « estimé » d'un geste, puis confirme en visio ou en consultation privée. */

const lab = { fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-soft)', fontWeight: 600 };

export function ConsultationsGratuites() {
  const [queue] = useStore(consultationsQueueStore);
  const { currency } = useBranch();
  const navigate = useNavigate();
  const aRelire = queue.filter((o) => o.modalite === 'auto' && o.status !== 'fermée')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!aRelire.length) return null;
  const argent = (n: number) => fmtMoney(n, currency);
  const statut = (id: string, status: OnlineConsultation['status']) =>
    consultationsQueueStore.set((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));

  return (
    <section style={{ marginBottom: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>A · Consultations gratuites à relire</span>
        <span className="mnd-muted" style={{ fontSize: 12 }}>{aRelire.length} déposée{aRelire.length > 1 ? 's' : ''} sur le site · la lecture et l’estimation sont celles du moteur, à confirmer</span>
      </div>
      {aRelire.map((o) => {
        const e = o.estimation;
        const c = o.couronne;
        const retenues = e?.lignes.filter((l) => l.retenue) ?? [];
        const fourchette = (min: number | null, max: number | null) => (min === null || max === null ? 'chiffrée par la Maison' : min === max ? argent(min) : `${argent(min)} à ${argent(max)}`);
        return (
          <article key={o.id} style={{ border: '1px solid var(--hairline)', borderLeft: `2px solid ${o.status === 'nouvelle' ? 'var(--copper-500)' : 'var(--hairline)'}`, borderRadius: 3, background: 'var(--surface-card)', padding: '14px 16px', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>
                <b style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 400, color: 'var(--color-indigo)' }}>{o.client.name}</b>
                <span className="mnd-muted" style={{ fontSize: 12, marginLeft: 8 }}>{o.client.phone} · {new Date(o.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {o.status === 'nouvelle' && <span className="trv-status trv-status--avalider">à relire</span>}
                {o.garde === 'peau' && <span className="trv-status trv-status--envoyee">garde médicale</span>}
                {o.paidXof > 0 && <span className="trv-status trv-status--payee">{argent(o.paidXof)} réglés</span>}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              <div>
                <div style={lab}>Ce qu’elle a coché</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 13.5 }}>{(o.besoins ?? []).map((b) => <li key={b.id}>{b.mots} <span className="mnd-muted">· {b.points} pts</span></li>)}</ul>
              </div>
              <div>
                <div style={lab}>Sa couronne</div>
                <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>
                  {c?.pour === 'enfant' ? 'Pour son enfant · ' : ''}
                  {c?.nees === 'aucune' ? 'pas encore de locks' : c?.nees === 'ailleurs' ? 'locks faites ailleurs' : c?.nees === 'maison' ? 'locks de la Maison' : ''}
                  {c?.locks ? ` · ${c.locks} locks` : c?.calibreDit ? ` · calibre ${c.calibreDit}` : ''}
                  {c?.longueur ? ` · ${c.longueur}` : ' · longueur non dite'}
                </p>
                {c?.sensibilites && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--copper-800)' }}>Sensibilité : {c.sensibilites}</p>}
              </div>
              <div>
                <div style={lab}>L’estimation</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 13.5 }}>
                  {retenues.map((l) => <li key={l.serviceId}>{l.nom} · {fourchette(l.min, l.max)}</li>)}
                </ul>
                {e && <p style={{ margin: '4px 0 0', fontSize: 13.5 }}><b>Total : {fourchette(e.min, e.max)}</b>{e.aChiffrer ? ' + à chiffrer' : ''}</p>}
                {e && e.aConfirmer.length > 0 && <p className="mnd-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>À confirmer : {e.aConfirmer.map((x) => x.nom).join(', ')}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => navigate(`/factures?nouveau=devis&consultation=${encodeURIComponent(o.id)}`)}>Préparer le devis estimé</Button>
              {o.status === 'nouvelle' && <Button size="sm" variant="ghost" onClick={() => statut(o.id, 'traitée')}>Marquer relue</Button>}
              <Button size="sm" variant="ghost" onClick={() => statut(o.id, 'fermée')}>Fermer</Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
