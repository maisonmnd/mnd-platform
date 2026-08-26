import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageHead, WaLien } from '../_ui';
import { Input } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { normName } from '../../../../shared/text';
import { creancesDeLaMaison, trancheDe, TRANCHES, type Tranche } from '../../../../shared/compte';
import { apptDueXof, todayISO, useBranchAppointments, useBranchClients, useServicesById } from '../clients/_shared';
import './finances.css';

/* ── LES CRÉANCES DE LA MAISON (26 août) ──────────────────────────────
   « Bien suivre les mouvements impayés et depuis quand date une créance »
   (Yéman). Le dû se lisait rituel par rituel, éparpillé dans le Carnet : on
   savait qu'on attendait de l'argent, jamais depuis quand ni de qui d'abord.

   L'ÂGE COMMANDE LE GESTE. Une dette de huit jours et une de quatre mois
   n'appellent pas la même chose : la première se laisse vivre, la dernière se
   tranche. Les quatre tranches sont donc l'ossature de l'écran, pas une
   décoration — et le total de chacune dit ce qu'elle pèse.

   LA DATE QUI FAIT FOI est celle du RITUEL, jamais celle de la dernière
   relance : une créance ne rajeunit pas parce qu'on en a reparlé. */

export default function Creances() {
  const { branch, currency } = useBranch();
  const navigate = useNavigate();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const aujourdhui = todayISO();
  const [q, setQ] = useState('');
  const [tranche, setTranche] = useState<Tranche | ''>('');

  const creances = useMemo(
    () => creancesDeLaMaison({ appts, aujourdhui, dûDuRituel: (a) => apptDueXof(a, byId) }),
    [appts, aujourdhui, byId],
  );

  const parTranche = useMemo(() => {
    const m = new Map<Tranche, { n: number; xof: number }>();
    for (const t of TRANCHES) m.set(t.k, { n: 0, xof: 0 });
    for (const c of creances) {
      const cur = m.get(trancheDe(c.depuisJours))!;
      cur.n += 1;
      cur.xof += c.duXof;
    }
    return m;
  }, [creances]);

  const total = creances.reduce((s, c) => s + c.duXof, 0);
  const nomDe = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Tête retirée du carnet';
  const teteDe = (id: string) => clients.find((c) => c.id === id);

  const needle = normName(q);
  const liste = creances
    .filter((c) => (tranche ? trancheDe(c.depuisJours) === tranche : true))
    .filter((c) => (needle ? normName(nomDe(c.clientId)).includes(needle) : true));

  const chip = (on: boolean) => ({
    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 11.5, letterSpacing: '.04em',
    padding: '7px 13px', borderRadius: 999, whiteSpace: 'nowrap' as const,
    border: `1px solid ${on ? 'var(--copper-600)' : 'var(--line)'}`,
    background: on ? 'var(--copper-600)' : 'transparent',
    color: on ? '#fff' : 'var(--ink-soft)',
  });

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow={`Finances · ${branch.city}`}
        title="Les créances."
        sub={creances.length === 0
          ? 'La Maison n’attend rien : tout est réglé.'
          : `${fmtMoney(total, currency)} attendus · ${creances.length} tête${creances.length > 1 ? 's' : ''} · la plus ancienne remonte à ${creances[0].depuisJours} jours.`}
      />

      {/* Les tranches — l'ossature de l'écran : chacune dit son poids, et se
          filtre d'un clic. */}
      <div className="tr-grid tr-grid--4" style={{ marginTop: 20 }}>
        {TRANCHES.map((t) => {
          const s = parTranche.get(t.k)!;
          const chaude = t.k === '60-90' || t.k === '90+';
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => setTranche(tranche === t.k ? '' : t.k)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '16px 18px', borderRadius: 3,
                background: 'var(--surface-card)',
                border: `1px solid ${tranche === t.k ? 'var(--color-copper)' : 'var(--hairline)'}`,
                boxShadow: tranche === t.k ? 'inset 3px 0 0 var(--color-copper)' : undefined,
              }}
            >
              <div className="mnd-stat__label">{t.label}</div>
              <div className="mnd-stat__value" style={{ fontSize: 26, color: chaude && s.xof > 0 ? 'var(--color-brique, #96412E)' : undefined }}>
                {fmtMoney(s.xof, currency)}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 5 }}>
                {s.n} tête{s.n > 1 ? 's' : ''} · {t.sous}
              </div>
            </button>
          );
        })}
      </div>

      <div className="trc-toolbar" style={{ marginTop: 20 }}>
        <div className="trc-searchwrap">
          <Search size={17} aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une tête…" aria-label="Chercher une tête qui doit" />
        </div>
        {tranche && (
          <button type="button" style={chip(true)} onClick={() => setTranche('')}>
            {TRANCHES.find((t) => t.k === tranche)?.label} · tout revoir
          </button>
        )}
      </div>

      {liste.length === 0 ? (
        <div className="mnd-muted" style={{ fontSize: 13, border: '1px dashed var(--hairline)', borderRadius: 4, padding: '18px 20px' }}>
          {creances.length === 0
            ? 'Rien à recouvrer, tout est réglé.'
            : 'Aucune créance ne répond à cette recherche.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
          {liste.map((c) => {
            const t = trancheDe(c.depuisJours);
            const chaude = t === '60-90' || t === '90+';
            const tete = teteDe(c.clientId);
            return (
              <div
                key={c.clientId}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center',
                  padding: '13px 16px', borderTop: '1px solid var(--hairline)', cursor: 'pointer',
                }}
                onClick={() => navigate(`/customers?id=${c.clientId}`)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{nomDe(c.clientId)}</div>
                  <div style={{ fontSize: 12, color: chaude ? 'var(--color-brique, #96412E)' : 'var(--ink-soft)' }}>
                    impayé depuis <b style={{ fontWeight: 600 }}>{c.depuisJours} jours</b>
                    {tete?.plafondCreditXof ? ` · plafond ${fmtMoney(tete.plafondCreditXof, currency)}` : ''}
                  </div>
                </div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', whiteSpace: 'nowrap' }}>
                  {fmtMoney(c.duXof, currency)}
                </span>
                <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
                  <WaLien
                    phone={tete?.phone}
                    message={`Bonjour ${(tete?.name ?? '').split(' ')[0]}, la Maison MND revient vers vous : il reste ${fmtMoney(c.duXof, currency)} à régler sur votre compte. Nous restons à votre écoute.`}
                    style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)' }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>
        La date qui fait foi est celle du <b>rituel</b>, jamais celle de la dernière relance : une créance ne rajeunit pas
        parce qu’on en a reparlé. Un rituel annulé n’est pas une créance — personne ne l’encaissera.
      </div>
    </div>
  );
}
