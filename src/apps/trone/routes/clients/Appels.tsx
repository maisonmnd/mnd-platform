import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageHead } from '../_ui';
import { Input } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { appointmentsStore } from '../../../../shared/agenda';
import { useAppels, appelsAActer, marquerAppelFait, reporterAppel, rouvrirAppel, messageAppel, type AppelRecu } from '../../../../shared/appels';
import { signeLeMessage } from '../../../../shared/identite';
import { RdvModal, todayISO, addDaysISO, frShort } from './_shared';

type Vue = 'a-traiter' | 'traites' | 'tous';

/* LE JOURNAL DES APPELS — le résumé complet, à traiter comme traités. Les appels
   « à traiter » vivent aussi en haut du Tableau de bord ; ici, on garde la trace
   de tout, cherchable, avec de quoi rouvrir un appel refermé trop vite. */
export default function Appels() {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const [appels] = useAppels();
  const [vue, setVue] = useState<Vue>('a-traiter');
  const [q, setQ] = useState('');
  const [rdvPour, setRdvPour] = useState<{ clientId: string; appelId: string; avant: number } | null>(null);
  const demainAppel = addDaysISO(todayISO(), 1);

  const dansLaBranche = useMemo(() => appels.filter((a) => a.branchId === branch.id), [appels, branch.id]);
  const aTraiter = useMemo(() => appelsAActer(appels, branch.id), [appels, branch.id]);
  const traites = useMemo(
    () => dansLaBranche.filter((a) => a.fait).sort((a, b) => b.at.localeCompare(a.at)),
    [dansLaBranche],
  );

  const base = vue === 'a-traiter' ? aTraiter : vue === 'traites' ? traites : [...aTraiter, ...traites];
  const t = q.trim().toLowerCase();
  const tTel = t.replace(/\s/g, '');
  const liste = t
    ? base.filter((a) => a.nom.toLowerCase().includes(t)
      || a.motif.toLowerCase().includes(t)
      || (tTel !== '' && (a.phone ?? '').replace(/\s/g, '').includes(tTel)))
    : base;

  const ouvrirRdv = (clientId: string, appelId: string) =>
    setRdvPour({ clientId, appelId, avant: appointmentsStore.get().filter((x) => x.clientId === clientId).length });

  const chip = { border: '1px solid var(--hairline)', borderRadius: 3, padding: '6px 11px', fontSize: 12, color: 'var(--ink-soft)', background: 'var(--surface, #fff)', cursor: 'pointer' } as const;
  const onglet = (on: boolean) => ({ ...chip, borderColor: on ? 'var(--color-indigo)' : 'var(--hairline)', background: on ? 'var(--color-indigo)' : 'var(--surface, #fff)', color: on ? '#fff' : 'var(--ink-soft)' });

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow={`Le Trône · ${branch.city}`}
        title="Le Journal des Appels"
        sub={`${aTraiter.length} à traiter · ${traites.length} traité${traites.length > 1 ? 's' : ''} · ${dansLaBranche.length} au total`}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '18px 0 12px' }}>
        {/* La loupe cuivre, comme au registre des Clientes et aux Factures. */}
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 280px', minWidth: 0 }}>
          <Search size={17} aria-hidden="true" style={{ position: 'absolute', left: 13, color: 'var(--color-copper)', pointerEvents: 'none' }} />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher (nom, numéro, motif)…"
            aria-label="Chercher un appel"
            style={{ width: '100%', padding: '12px 14px 12px 40px', fontSize: 14.5, border: '1.5px solid var(--copper-300)', borderRadius: 3 }}
          />
        </span>
        <button type="button" style={onglet(vue === 'a-traiter')} onClick={() => setVue('a-traiter')}>À traiter <span style={{ opacity: .6, marginLeft: 4 }}>{aTraiter.length}</span></button>
        <button type="button" style={onglet(vue === 'traites')} onClick={() => setVue('traites')}>Traités <span style={{ opacity: .6, marginLeft: 4 }}>{traites.length}</span></button>
        <button type="button" style={onglet(vue === 'tous')} onClick={() => setVue('tous')}>Tous</button>
      </div>

      {liste.length === 0 ? (
        <div className="mnd-muted" style={{ fontSize: 13, border: '1px dashed var(--hairline)', borderRadius: 4, padding: '18px 20px' }}>
          {q ? 'Aucun appel à ce nom.' : vue === 'traites' ? 'Aucun appel traité pour l’instant.' : 'Aucun appel en attente. Posez-en un depuis « Appel reçu », en haut.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
          {liste.map((a: AppelRecu) => {
            const enRetard = !a.fait && a.suite === 'rappel' && !!a.quand && a.quand < todayISO();
            const tag = a.suite === 'rdv'
              ? { t: 'RDV à caler', bg: '#ECEEF6', c: 'var(--color-indigo)', b: '#C7CCE2' }
              : { t: 'à rappeler', bg: 'var(--copper-50, #FAF1E9)', c: '#8A5A32', b: 'var(--copper-300, #E3C9AE)' };
            return (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--hairline)', opacity: a.fait ? 0.62 : 1 }}>
                <span style={{ width: 30, height: 30, borderRadius: 999, background: a.fait ? 'var(--ink-soft)' : 'var(--color-indigo)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12 }}>{a.nom.slice(0, 1)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    {a.nom}
                    <span style={{ fontSize: 10, borderRadius: 999, padding: '1px 8px', marginLeft: 8, background: tag.bg, color: tag.c, border: `1px solid ${tag.b}` }}>{tag.t}</span>
                    {a.fait && <span style={{ fontSize: 10, borderRadius: 999, padding: '1px 8px', marginLeft: 6, background: '#EEF4EE', color: 'var(--color-vert, #4A6B52)', border: '1px solid #CFE0CF' }}>traité</span>}
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 12.5 }}>{a.motif || 'Sans note'}{a.phone ? ` · ${a.phone}` : ''}</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: enRetard ? 'var(--color-brique, #96412E)' : 'var(--ink-soft)' }}>
                    Reçu le {frShort(a.at.slice(0, 10))}
                    {!a.fait && a.suite === 'rappel' && a.quand ? ` · ${a.quand === todayISO() ? "à rappeler aujourd'hui" : a.quand === demainAppel ? 'à rappeler demain' : `à rappeler le ${frShort(a.quand)}`}${enRetard ? ' · en retard' : ''}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {a.phone && (
                    <a href={`https://wa.me/${a.phone.replace(/\D/g, '')}?text=${encodeURIComponent(signeLeMessage(messageAppel(a)))}`} target="_blank" rel="noreferrer" style={{ ...chip, textDecoration: 'none' }}>WhatsApp</a>
                  )}
                  {!a.fait && a.clientId && a.suite === 'rdv' && (
                    <button type="button" style={{ ...chip, borderColor: 'var(--color-copper)', color: '#8A5A32', background: 'var(--copper-50, #FAF1E9)' }} onClick={() => ouvrirRdv(a.clientId!, a.id)}>Créer le RDV</button>
                  )}
                  {!a.fait && a.clientId && a.suite === 'rappel' && (
                    <button type="button" style={{ ...chip, borderColor: 'var(--color-copper)', color: '#8A5A32', background: 'var(--copper-50, #FAF1E9)' }} onClick={() => navigate(`/customers?id=${a.clientId}`)}>Ouvrir la fiche</button>
                  )}
                  {!a.fait && a.suite === 'rappel' && a.quand !== demainAppel && (
                    <button type="button" style={chip} onClick={() => reporterAppel(a.id, demainAppel)}>Demain</button>
                  )}
                  {a.fait
                    ? <button type="button" style={chip} onClick={() => rouvrirAppel(a.id)}>Rouvrir</button>
                    : <button type="button" style={chip} onClick={() => marquerAppelFait(a.id)}>Fait</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rdvPour && (
        <RdvModal
          title="Rendez-vous depuis un appel"
          initial={{ clientId: rdvPour.clientId }}
          onClose={() => {
            const apres = appointmentsStore.get().filter((x) => x.clientId === rdvPour.clientId).length;
            if (apres > rdvPour.avant) marquerAppelFait(rdvPour.appelId);
            setRdvPour(null);
          }}
        />
      )}
    </div>
  );
}
