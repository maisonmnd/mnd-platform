import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../ds/components';
import { useStore } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { lienWaMe } from '../../../../shared/conversations';
import { consultationsQueueStore, type OnlineConsultation } from '../../../../shared/bridges';
import { deposeUnTemoin, voirUnTemoin } from '../../../../shared/visios';

/* ══ C · LES CONSULTATIONS PRIVÉES RÉGLÉES — 13 novembre 2026 (lot 3) ══════
   Maquette T1, la file C. Une consultation gratuite du site, dont la cliente
   a réglé les 15 000 F de la consultation privée juste après sa lecture
   (KkiaPay, vérifié par `kkiapay-verify` sur l'identifiant de la
   consultation). Ici, la Maison :
     · fixe le moment avec elle (WhatsApp), et le note ;
     · pose les photos des locks témoins faites devant elle (trois au plus,
       compartiment `temoins`, lu par l'équipe seule) ;
     · prépare le devis ferme, la consultation déduite. */

const lab = { fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-soft)', fontWeight: 600 };
const TEMOINS_AU_PLUS = 3;

/** Une consultation de la file C : déposée sur le site, réglée, pas fermée. */
export const estReglee = (o: OnlineConsultation): boolean => o.modalite === 'auto' && o.paidXof > 0 && o.status !== 'fermée';

const ecris = (id: string, fn: (o: OnlineConsultation) => OnlineConsultation) =>
  consultationsQueueStore.set((prev) => prev.map((o) => (o.id === id ? fn(o) : o)));

export function ConsultationsReglees() {
  const [queue] = useStore(consultationsQueueStore);
  const { currency } = useBranch();
  const navigate = useNavigate();
  const reglees = queue.filter(estReglee).sort((a, b) => (b.payeLe ?? b.createdAt).localeCompare(a.payeLe ?? a.createdAt));
  if (!reglees.length) return null;
  const argent = (n: number) => fmtMoney(n, currency);

  return (
    <section style={{ marginBottom: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>C · Consultations privées réglées</span>
        <span className="mnd-muted" style={{ fontSize: 12 }}>{reglees.length} · réglées en ligne après leur lecture · le montant est déduit du rituel</span>
      </div>
      {reglees.map((o) => {
        const e = o.estimation;
        const prenom = o.client.name.trim().split(/\s+/)[0] ?? '';
        const wa = lienWaMe(o.client.phone, `Bonjour ${prenom}, ici la Maison MND. Votre consultation privée est bien réglée, merci. Quel moment vous convient pour venir à la Maison ?`);
        return (
          <article key={o.id} style={{ border: '1px solid var(--hairline)', borderLeft: `2px solid ${o.momentFixe ? 'var(--hairline)' : 'var(--copper-500)'}`, borderRadius: 3, background: 'var(--surface-card)', padding: '14px 16px', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>
                <b style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 400, color: 'var(--color-indigo)' }}>{o.client.name}</b>
                <span className="mnd-muted" style={{ fontSize: 12, marginLeft: 8 }}>{o.client.phone}{o.payeLe ? ` · réglée le ${new Date(o.payeLe).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="trv-status trv-status--payee">{argent(o.paidXof)} réglés</span>
                {o.garde === 'peau' && <span className="trv-status trv-status--envoyee">garde médicale</span>}
                {!o.momentFixe && <span className="trv-status trv-status--avalider">moment à fixer</span>}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <div style={lab}>Ce qu’elle a coché</div>
                <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>{(o.besoins ?? []).map((b) => b.mots).join(' · ') || 'rien de coché'}</p>
              </div>
              <div>
                <div style={lab}>Lecture du moteur</div>
                <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>
                  {(e?.lignes.filter((l) => l.retenue) ?? []).map((l) => l.nom).join(' · ') || 'rien de retenu'}
                  {e ? ` · ${e.min === e.max ? argent(e.min) : `${argent(e.min)} à ${argent(e.max)}`}` : ''}
                </p>
              </div>
              <MomentFixe o={o} />
            </div>
            <Temoins o={o} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {wa && <Button size="sm" variant="ghost" onClick={() => window.open(wa, '_blank', 'noopener')}>Écrire pour fixer le moment</Button>}
              <Button size="sm" onClick={() => navigate(`/factures?nouveau=devis&consultation=${encodeURIComponent(o.id)}&ferme=1`)}>Préparer le devis ferme</Button>
              <Button size="sm" variant="ghost" onClick={() => ecris(o.id, (x) => ({ ...x, status: 'fermée' }))}>Fermer</Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function MomentFixe({ o }: { o: OnlineConsultation }) {
  const [texte, setTexte] = useState(o.momentFixe ?? '');
  useEffect(() => { setTexte(o.momentFixe ?? ''); }, [o.momentFixe]);
  return (
    <div>
      <label style={lab} htmlFor={`mf-${o.id}`}>Le moment fixé</label>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <input id={`mf-${o.id}`} className="mnd-input" style={{ flex: 1, minWidth: 0 }} placeholder="mercredi 18 novembre, 10 h" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <Button size="sm" variant="ghost" disabled={texte.trim() === (o.momentFixe ?? '')} onClick={() => ecris(o.id, (x) => ({ ...x, momentFixe: texte.trim() || undefined, status: texte.trim() ? 'traitée' : x.status }))}>Noter</Button>
      </div>
    </div>
  );
}

function Temoins({ o }: { o: OnlineConsultation }) {
  const chemins = o.temoins ?? [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [mot, setMot] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    for (const c of chemins) {
      if (urls[c]) continue;
      void voirUnTemoin(c).then((u) => { if (vivant && u) setUrls((x) => ({ ...x, [c]: u })); });
    }
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chemins.join('|')]);
  const ajoute = async (f: File | undefined) => {
    if (!f || envoi) return;
    setEnvoi(true);
    setMot(null);
    const chemin = await deposeUnTemoin(o.id, f);
    setEnvoi(false);
    if (!chemin) { setMot('La photo n’est pas partie. Le compartiment des témoins arrive avec la migration 0209.'); return; }
    ecris(o.id, (x) => ({ ...x, temoins: [...(x.temoins ?? []), chemin].slice(0, TEMOINS_AU_PLUS) }));
  };
  return (
    <div>
      <div style={lab}>Locks témoins</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
        {chemins.map((c, i) => (
          <a key={c} href={urls[c]} target="_blank" rel="noopener" style={{ width: 72, height: 72, borderRadius: 2, border: '1px solid var(--hairline)', background: urls[c] ? `center / cover no-repeat url("${urls[c]}")` : 'var(--indigo-50)', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--ink-soft)', textDecoration: 'none' }} aria-label={`Témoin ${i + 1}`}>
            {urls[c] ? '' : `témoin ${i + 1}`}
          </a>
        ))}
        {chemins.length < TEMOINS_AU_PLUS && (
          <label style={{ width: 72, height: 72, borderRadius: 2, border: '1px dashed var(--hairline)', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--ink-soft)', cursor: 'pointer', textAlign: 'center' }}>
            {envoi ? 'envoi' : `témoin ${chemins.length + 1}`}
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { void ajoute(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {mot && <p className="mnd-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{mot}</p>}
    </div>
  );
}
