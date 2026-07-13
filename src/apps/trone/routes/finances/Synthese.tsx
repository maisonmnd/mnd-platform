import { useMemo, type CSSProperties } from 'react';
import { Eyebrow } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtMoneyCompact } from '../../../../shared/currency';
import { useInvoices, useExpenses, invoiceTotal } from '../../../../shared/finance';
import { todayISO, monthKey, monthLabel, shiftMonth, lastMonths } from './_shared';
import './finances.css';

/* Synthèse & résultat — le compte de résultat de la branche, mois par mois.
   Tout est dérivé des factures encaissées et des dépenses non suspendues,
   filtré par la branche courante et exprimé dans sa devise. */

export default function Synthese() {
  const { branch, currency } = useBranch();
  const [invoices] = useInvoices();
  const [expenses] = useExpenses();

  const thisMonth = monthKey(todayISO());
  const prevMonth = shiftMonth(thisMonth, -1);

  const { revenueOf, expenseOf, series, byCashbox } = useMemo(() => {
    const paidInv = invoices.filter(
      (i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée',
    );
    const liveExp = expenses.filter((e) => e.branchId === branch.id && !e.stopped);

    const revenueOf = (mk: string) =>
      paidInv.filter((i) => monthKey(i.date) === mk).reduce((s, i) => s + invoiceTotal(i), 0);
    const expenseOf = (mk: string) =>
      liveExp.filter((e) => monthKey(e.date) === mk).reduce((s, e) => s + e.amountXof, 0);

    const series = lastMonths(thisMonth, 6).map((mk) => {
      const rev = revenueOf(mk);
      const exp = expenseOf(mk);
      return { mk, rev, exp, net: rev - exp, label: monthLabel(mk).slice(0, 1).toUpperCase() };
    });

    // Revenus par caisse créditée — ce mois
    const map = new Map<string, number>();
    paidInv
      .filter((i) => monthKey(i.date) === thisMonth)
      .forEach((i) => {
        const key = i.cashbox ?? 'Autres';
        map.set(key, (map.get(key) ?? 0) + invoiceTotal(i));
      });
    const byCashbox = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { revenueOf, expenseOf, series, byCashbox };
  }, [invoices, expenses, branch.id, thisMonth]);

  const revenue = revenueOf(thisMonth);
  const spent = expenseOf(thisMonth);
  const net = revenue - spent;
  const prevRevenue = revenueOf(prevMonth);
  const prevSpent = expenseOf(prevMonth);
  const prevNet = prevRevenue - prevSpent;
  const margin = revenue > 0 ? Math.round((net / revenue) * 100) : 0;

  const prevName = monthLabel(prevMonth);
  const trend = (cur: number, prev: number): { t: string; down: boolean } => {
    if (prev === 0) return { t: 'premier mois suivi', down: false };
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    return { t: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)} % vs ${prevName}`, down: pct < 0 };
  };

  const kpis = [
    { l: 'Revenus encaissés · ce mois', v: fmtMoney(revenue, currency), a: 'var(--color-indigo)', col: 'var(--color-indigo)', tr: trend(revenue, prevRevenue) },
    { l: 'Dépenses engagées · ce mois', v: fmtMoney(spent, currency), a: 'var(--color-copper)', col: 'var(--color-indigo)', tr: trend(spent, prevSpent) },
    { l: 'Résultat net · ce mois', v: fmtMoney(net, currency), a: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)', col: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)', tr: trend(net, prevNet) },
  ];

  // Compte de résultat
  const pnl = [
    { label: 'Chiffre d’affaires encaissé', value: fmtMoney(revenue, currency), strong: true, col: 'var(--color-indigo)' },
    { label: 'Charges & dépenses', value: `− ${fmtMoney(spent, currency)}`, strong: false, col: 'var(--ink)' },
    { label: 'Résultat net', value: fmtMoney(net, currency), strong: true, col: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)' },
    { label: 'Marge nette', value: `${margin} %`, strong: false, col: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)' },
  ];

  const cashMax = Math.max(...byCashbox.map((c) => c.value), 1);
  const cashFills = ['var(--color-indigo)', 'var(--color-copper)', 'var(--indigo-400)', 'var(--copper-400)', 'var(--indigo-300)'];

  // Graphe 6 mois — revenus vs dépenses, barres jumelées + ligne de résultat
  const chartMax = Math.max(...series.flatMap((d) => [d.rev, d.exp]), 1);
  const W = 520, H = 200, padL = 8, padB = 26, top = 12;
  const plot = H - padB - top;
  const step = (W - padL * 2) / series.length;
  const y = (v: number) => top + plot - (Math.max(0, v) / chartMax) * plot;
  const netMax = Math.max(...series.map((d) => Math.abs(d.net)), 1);
  const netY = (v: number) => top + plot / 2 - (v / netMax) * (plot / 2);

  return (
    <div className="mnd-rise">
      <Eyebrow>Finances · Synthèse & résultat</Eyebrow>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 24px', lineHeight: 1 }}>
        Le résultat.
      </h2>

      <div className="tr-grid tr-grid--3">
        {kpis.map((k) => (
          <div className="trf-kpi" key={k.l} style={{ '--accent': k.a } as CSSProperties}>
            <div className="l">{k.l}</div>
            <div className="v" style={{ color: k.col }}>{k.v}</div>
            <div className={`c ${k.tr.down ? '' : 'up'}`}>{k.tr.t}</div>
          </div>
        ))}
      </div>

      {/* Compte de résultat · 6 mois — barres jumelées */}
      <div className="trf-panel" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
          <div className="trf-panel__title" style={{ marginBottom: 0 }}>Revenus vs dépenses · 6 mois</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[['Revenus', 'var(--color-indigo)'], ['Dépenses', 'var(--color-copper)'], ['Résultat net', 'var(--trf-success)']].map(([l, f]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: f }} />
                {l}
              </span>
            ))}
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, marginTop: 16, display: 'block' }} aria-hidden>
          <line x1={padL} y1={top + plot} x2={W - padL} y2={top + plot} stroke="var(--hairline)" strokeWidth={1} />
          {series.map((d, i) => {
            const cx = padL + i * step + step / 2;
            const bw = Math.min(18, step / 3.2);
            return (
              <g key={d.mk}>
                <rect x={cx - bw - 2} y={y(d.rev)} width={bw} height={top + plot - y(d.rev)} rx={2} fill="var(--color-indigo)" />
                <rect x={cx + 2} y={y(d.exp)} width={bw} height={top + plot - y(d.exp)} rx={2} fill="var(--color-copper)" />
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-sans)" fill="var(--ink-soft)">{d.label}</text>
              </g>
            );
          })}
          <polyline
            fill="none"
            stroke="var(--trf-success)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={series.map((d, i) => `${padL + i * step + step / 2},${netY(d.net)}`).join(' ')}
          />
          {series.map((d, i) => (
            <circle key={d.mk} cx={padL + i * step + step / 2} cy={netY(d.net)} r={2.6} fill="var(--trf-success)" />
          ))}
        </svg>
      </div>

      <div className="tr-grid tr-grid--2" style={{ marginTop: 18, alignItems: 'start' }}>
        {/* Revenus par caisse */}
        <div className="trf-panel">
          <div className="trf-panel__title">Revenus par caisse · {monthLabel(thisMonth)}</div>
          {byCashbox.length === 0 && <div className="trf-empty">Aucun encaissement ce mois pour l’instant.</div>}
          {byCashbox.map((c, i) => (
            <div className="trf-linerow" key={c.name}>
              <div className="trf-linerow__top">
                <span className="trf-linerow__cat">{c.name}</span>
                <span className="trf-linerow__val">{fmtMoney(c.value, currency)}</span>
              </div>
              <div className="trf-bar" style={{ marginTop: 6 }}>
                <div style={{ width: `${Math.round((c.value / cashMax) * 100)}%`, background: cashFills[i % cashFills.length] }} />
              </div>
            </div>
          ))}
        </div>

        {/* Compte de résultat */}
        <div className="trf-panel">
          <div className="trf-panel__title">Compte de résultat · {monthLabel(thisMonth)}</div>
          {pnl.map((p, i) => (
            <div
              key={p.label}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '13px 0', borderBottom: i < pnl.length - 1 ? '1px solid var(--hairline)' : 'none',
              }}
            >
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: p.strong ? 13.5 : 13, fontWeight: p.strong ? 500 : 300, color: 'var(--ink)' }}>{p.label}</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: p.strong ? 22 : 17, color: p.col }}>{p.value}</span>
            </div>
          ))}
          <div style={{ marginTop: 14, background: 'var(--color-sable)', borderRadius: 4, padding: '13px 15px', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}>
            {net >= 0
              ? <>La maison dégage <strong style={{ fontWeight: 500, color: 'var(--trf-success)' }}>{fmtMoneyCompact(net, currency)}</strong> de résultat ce mois. La discipline paie.</>
              : <>Le mois est encore jeune : les charges fixes précèdent les encaissements. Le carnet comblera l’écart.</>}
          </div>
        </div>
      </div>
    </div>
  );
}
