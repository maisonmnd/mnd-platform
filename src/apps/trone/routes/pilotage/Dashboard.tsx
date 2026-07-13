import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtMoneyCompact } from '../../../../shared/currency';
import { useClients } from '../../../../shared/clients';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { useProducts } from '../../../../shared/catalog';
import { useInvoices, useExpenses, invoiceTotal } from '../../../../shared/finance';
import {
  Avatar, SourceBadge, StatusPill, apptLabel, apptTotalXof, addDaysISO, frShort, fromISO,
  timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
} from '../clients/_shared';
import './pilotage.css';

/* Tableau de bord — la salle du conseil au matin. Tout est dérivé des magasins,
   filtré par la branche, exprimé dans sa devise. */

const monthKey = (iso: string) => iso.slice(0, 7);

export default function Dashboard() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const [allClients] = useClients();
  const byId = useServicesById();
  const [products] = useProducts();
  const [invoices] = useInvoices();
  const [expenses] = useExpenses();

  const today = todayISO();
  const now = new Date();
  const greeting = now.getHours() >= 17 || now.getHours() < 5 ? 'Bonsoir' : 'Bonjour';
  const thisMonth = monthKey(today);
  const prevMonth = monthKey(addDaysISO(`${thisMonth}-01`, -1));
  const prevMonthName = fromISO(`${prevMonth}-15`).toLocaleDateString('fr-FR', { month: 'long' });

  const { revenue, prevRevenue, spent, prevSpent, rev7, todayRows, stockAlerts } = useMemo(() => {
    const realized = (a: Appointment) => a.status === 'honoré' || (a.status === 'confirmé' && a.date <= today);
    const apptRev = (mk: string) =>
      appts.filter((a) => monthKey(a.date) === mk && realized(a)).reduce((s, a) => s + apptTotalXof(a, byId), 0);
    const invRev = (mk: string) =>
      invoices
        .filter((i) => i.branchId === branch.id && monthKey(i.date) === mk && i.kind === 'facture' && i.status === 'payée')
        .reduce((s, i) => s + invoiceTotal(i), 0);
    const exp = (mk: string) =>
      expenses
        .filter((e) => e.branchId === branch.id && monthKey(e.date) === mk && !e.stopped)
        .reduce((s, e) => s + e.amountXof, 0);

    const rev7 = Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO(today, i - 6);
      const total = appts
        .filter((a) => a.date === iso && (a.status === 'honoré' || a.status === 'confirmé'))
        .reduce((s, a) => s + apptTotalXof(a, byId), 0);
      return { iso, total, label: fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase() };
    });

    return {
      revenue: apptRev(thisMonth) + invRev(thisMonth),
      prevRevenue: apptRev(prevMonth) + invRev(prevMonth),
      spent: exp(thisMonth),
      prevSpent: exp(prevMonth),
      rev7,
      todayRows: appts
        .filter((a) => a.date === today && a.status !== 'annulé')
        .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
      stockAlerts: products.filter((p) => p.stock < 10),
    };
  }, [appts, byId, invoices, expenses, products, branch.id, today, thisMonth, prevMonth]);

  const net = revenue - spent;
  const prevNet = prevRevenue - prevSpent;

  const trend = (cur: number, prev: number): { t: string; down: boolean } => {
    if (prev === 0) return { t: 'premier mois suivi', down: false };
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    return { t: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)} % vs ${prevMonthName}`, down: pct < 0 };
  };

  const kpis = [
    { label: 'Revenus réels du mois', value: fmtMoney(revenue, currency), bar: 'var(--color-indigo)', trend: trend(revenue, prevRevenue) },
    { label: 'Dépenses réelles du mois', value: fmtMoney(spent, currency), bar: 'var(--color-copper)', trend: trend(spent, prevSpent) },
    { label: 'Résultat net du mois', value: fmtMoney(net, currency), bar: 'var(--copper-600)', trend: trend(net, prevNet) },
  ];

  const revTrend = trend(revenue, prevRevenue);
  const tiles = [
    { label: 'Revenu mois', value: fmtMoneyCompact(revenue, currency), cap: revTrend.t, up: !revTrend.down },
    { label: 'RDV aujourd’hui', value: String(todayRows.length), cap: 'au carnet de la branche', up: false },
    { label: 'Têtes couronnées', value: String(clients.length), cap: 'rattachées à cette branche', up: false },
    {
      label: 'Alertes stock',
      value: String(stockAlerts.length),
      cap: stockAlerts.length ? `${stockAlerts.map((p) => p.name).slice(0, 2).join(' · ')} — réassort` : 'gamme au complet',
      up: false,
    },
  ];

  const clientOf = (id: string) => allClients.find((c) => c.id === id);

  const advance = (a: Appointment) => {
    const next: Appointment['status'] = a.status === 'en attente' ? 'confirmé' : 'honoré';
    appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
  };

  /* — revenu 7 jours, barres SVG — */
  const rev7Total = rev7.reduce((s, d) => s + d.total, 0);
  const rev7Max = Math.max(...rev7.map((d) => d.total), 1);
  const best = rev7.reduce((a, b) => (b.total >= a.total ? b : a), rev7[0]);
  const bestName = fromISO(best.iso).toLocaleDateString('fr-FR', { weekday: 'long' });

  return (
    <div className="mnd-rise">
      <Eyebrow>
        Le Trône · {branch.city} · {frShort(today)} {now.getFullYear()}
      </Eyebrow>
      <h2
        style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}
      >
        {greeting}, Yéman.
      </h2>

      {/* KPI majeurs */}
      <div className="tr-grid tr-grid--3" style={{ marginTop: 24 }}>
        {kpis.map((k) => (
          <div className="trp-kpi" key={k.label}>
            <span className="trp-kpi__bar" style={{ background: k.bar }} />
            <div className="trp-kpi__label">{k.label}</div>
            <div className="trp-kpi__value">{k.value}</div>
            <div className="trp-kpi__foot">
              <span className={`trp-kpi__trend ${k.trend.down ? 'trp-kpi__trend--down' : ''}`}>{k.trend.t}</span>
              <button className="trp-kpi__link" onClick={() => navigate('/synthese')}>
                Voir le détail →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Tuiles secondaires */}
      <div className="tr-grid tr-grid--4" style={{ marginTop: 14 }}>
        {tiles.map((t) => (
          <div className="trp-tile" key={t.label}>
            <div className="trp-tile__label">{t.label}</div>
            <div className="trp-tile__value">{t.value}</div>
            <div className={`trp-tile__cap ${t.up ? 'trp-tile__cap--up' : ''}`}>{t.cap}</div>
          </div>
        ))}
      </div>

      {/* Carnet du jour + revenu 7 jours */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, marginTop: 24, alignItems: 'start' }}>
        <div className="trp-day">
          <div className="trp-day__head">
            <span className="trp-day__title">Le carnet du jour</span>
            <button className="trp-kpi__link" onClick={() => navigate('/carnet')}>
              Tout voir →
            </button>
          </div>
          {todayRows.length === 0 && <div className="trp-day__empty">Le carnet est libre aujourd’hui.</div>}
          {todayRows.map((a) => {
            const c = clientOf(a.clientId);
            return (
              <div className="trp-day__row" key={a.id}>
                <div className="trp-day__time">{a.time}</div>
                {c && <Avatar client={c} size={34} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="trp-day__client">{c?.name ?? 'Cliente de passage'}</div>
                  <div className="trp-day__meta">
                    {apptLabel(a, byId)} · {a.master}
                  </div>
                </div>
                <SourceBadge source={a.source} />
                <StatusPill status={a.status} />
                {a.status !== 'honoré' && (
                  <button
                    onClick={() => advance(a)}
                    style={{
                      cursor: 'pointer', flex: 'none', borderRadius: 2, padding: '8px 12px',
                      fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                      background: a.status === 'en attente' ? 'var(--color-copper)' : 'transparent',
                      color: a.status === 'en attente' ? 'var(--color-ivoire)' : 'var(--color-indigo)',
                      border: a.status === 'en attente' ? '1px solid transparent' : '1px solid var(--color-indigo)',
                    }}
                  >
                    {a.status === 'en attente' ? 'Confirmer' : 'Honorer'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="trp-rev">
          <div className="trp-rev__eyebrow">Revenu · 7 jours</div>
          <div className="trp-rev__value">{fmtMoneyCompact(rev7Total, currency)}</div>
          <svg viewBox="0 0 280 150" style={{ width: '100%', height: 150, marginTop: 18, display: 'block' }} aria-hidden>
            {rev7.map((d, i) => {
              const h = Math.max(4, Math.round((d.total / rev7Max) * 118));
              const x = 8 + i * 39;
              const isBest = d.iso === best.iso && d.total > 0;
              return (
                <g key={d.iso}>
                  <rect x={x} y={130 - h} width={26} height={h} rx={2} fill={isBest ? 'var(--color-copper)' : 'rgba(246,241,231,0.28)'} />
                  <text x={x + 13} y={146} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-sans)" fill="var(--indigo-200)">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="trp-rev__foot">
            <span>Meilleur jour · {bestName}</span>
            <span className="trp-rev__best">{fmtMoneyCompact(best.total, currency)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
