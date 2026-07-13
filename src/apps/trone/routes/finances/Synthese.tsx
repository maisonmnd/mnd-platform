import { useMemo, useState, type CSSProperties } from 'react';
import { Eyebrow } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtMoneyCompact } from '../../../../shared/currency';
import { useInvoices, useExpenses, invoiceTotal, expenseTotal } from '../../../../shared/finance';
import { useAppointments } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import { apptLabel, apptNetXof, useServicesById } from '../clients/_shared';
import { todayISO, monthKey, monthLabel, shiftMonth, lastMonths } from './_shared';
import './finances.css';

/* Synthèse & résultat — le compte de résultat de la branche, mois par mois.
   Tout est dérivé des factures encaissées, des rituels honorés et des dépenses
   non suspendues, filtré par la branche courante et exprimé dans sa devise. */

/** Date ISO → « 12 juil. » pour les pastilles de journal. */
const fmtDay = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

export default function Synthese() {
  const { branch, currency } = useBranch();
  const [invoices] = useInvoices();
  const [expenses] = useExpenses();
  const [appts] = useAppointments();
  const [clients] = useClients();
  const byId = useServicesById();

  const [showRev, setShowRev] = useState(false);
  const [showExp, setShowExp] = useState(false);

  const thisMonth = monthKey(todayISO());
  const prevMonth = shiftMonth(thisMonth, -1);

  const { revenueOf, expenseOf, series, byCashbox, byMethod, revSources, expenseGroups } = useMemo(() => {
    const nameOf = (id: string) => clients.find((c) => c.id === id)?.name;

    const paidInv = invoices.filter(
      (i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée',
    );
    // Rituels honorés non facturés : la facture d'encaissement, quand elle existe,
    // les compte déjà — on ne retient donc que ceux sans invoiceId (jamais deux fois).
    const honored = appts.filter(
      (a) => a.branchId === branch.id && a.status === 'honoré' && !a.invoiceId,
    );
    const liveExp = expenses.filter((e) => e.branchId === branch.id && !e.stopped);

    const revenueOf = (mk: string) =>
      paidInv.filter((i) => monthKey(i.date) === mk).reduce((s, i) => s + invoiceTotal(i), 0) +
      honored.filter((a) => monthKey(a.date) === mk).reduce((s, a) => s + apptNetXof(a, byId), 0);
    const expenseOf = (mk: string) =>
      liveExp.filter((e) => monthKey(e.date) === mk).reduce((s, e) => s + expenseTotal(e), 0);

    const series = lastMonths(thisMonth, 6).map((mk) => {
      const rev = revenueOf(mk);
      const exp = expenseOf(mk);
      return { mk, rev, exp, net: rev - exp, label: monthLabel(mk).slice(0, 1).toUpperCase() };
    });

    // — Détail du mois courant —
    const invM = paidInv.filter((i) => monthKey(i.date) === thisMonth);
    const ritM = honored.filter((a) => monthKey(a.date) === thisMonth);

    const bump = (m: Map<string, { value: number; count: number }>, key: string, v: number) => {
      const cur = m.get(key) ?? { value: 0, count: 0 };
      m.set(key, { value: cur.value + v, count: cur.count + 1 });
    };
    const spread = (m: Map<string, { value: number; count: number }>) =>
      Array.from(m.entries())
        .map(([name, { value, count }]) => ({ name, value, count }))
        .sort((a, b) => b.value - a.value);

    // Revenus par caisse créditée — factures + rituels honorés (pseudo-caisse)
    const caisseMap = new Map<string, { value: number; count: number }>();
    invM.forEach((i) => bump(caisseMap, i.cashbox ?? 'Autres', invoiceTotal(i)));
    ritM.forEach((a) => bump(caisseMap, 'Rituels honorés', apptNetXof(a, byId)));
    const byCashbox = spread(caisseMap);

    // Revenus par mode de paiement
    const methodMap = new Map<string, { value: number; count: number }>();
    invM.forEach((i) => bump(methodMap, i.payment ?? 'Non précisé', invoiceTotal(i)));
    ritM.forEach((a) => bump(methodMap, 'Rituel · carnet', apptNetXof(a, byId)));
    const byMethod = spread(methodMap);

    // Sources itemisées — factures payées + rituels honorés, du plus récent
    const revSources = [
      ...invM.map((i) => ({
        key: `f-${i.id}`,
        date: i.date,
        who: i.clientName ?? nameOf(i.clientId) ?? 'Cliente',
        title: `Facture ${i.number}`,
        meta: [i.payment ?? 'Paiement non précisé', i.cashbox ?? 'Caisse —'].join(' · '),
        amount: invoiceTotal(i),
      })),
      ...ritM.map((a) => ({
        key: `r-${a.id}`,
        date: a.date,
        who: nameOf(a.clientId) ?? 'Cliente',
        title: apptLabel(a, byId),
        meta: ['Rituel honoré', a.master].filter(Boolean).join(' · '),
        amount: apptNetXof(a, byId),
      })),
    ].sort((x, y) => (x.date < y.date ? 1 : -1));

    // Dépenses du mois groupées par catégorie, sous-total décroissant
    const expM = liveExp.filter((e) => monthKey(e.date) === thisMonth);
    const groupMap = new Map<string, typeof expM>();
    expM.forEach((e) => {
      const key = e.category || 'Sans catégorie';
      groupMap.set(key, [...(groupMap.get(key) ?? []), e]);
    });
    const expenseGroups = Array.from(groupMap.entries())
      .map(([category, rows]) => ({
        category,
        total: rows.reduce((s, e) => s + expenseTotal(e), 0),
        rows: [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
      .sort((a, b) => b.total - a.total);

    return { revenueOf, expenseOf, series, byCashbox, byMethod, revSources, expenseGroups };
  }, [invoices, expenses, appts, clients, branch.id, thisMonth, byId]);

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

      {/* Détail des revenus — sources, mode de paiement, caisse */}
      <div className="trf-panel" style={{ marginTop: 18 }}>
        <div className="trf-detail__head">
          <div className="trf-panel__title" style={{ marginBottom: 0 }}>Détail des revenus · {monthLabel(thisMonth)}</div>
          <button className="trf-iconbtn" onClick={() => setShowRev((v) => !v)}>
            {showRev ? 'Masquer le détail' : 'Voir le détail'} · {fmtMoney(revenue, currency)}
          </button>
        </div>
        {showRev && (
          revSources.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 14 }}>Aucun encaissement ce mois — ni facture payée, ni rituel honoré.</div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div className="trf-detail__grid">
                <div>
                  <div className="trf-detail__sub">Par mode de paiement</div>
                  {byMethod.map((m) => (
                    <div className="trf-tally" key={m.name}>
                      <span className="trf-tally__k">{m.name}<span className="trf-tally__n">{m.count} encaissement{m.count > 1 ? 's' : ''}</span></span>
                      <span className="trf-tally__v">{fmtMoney(m.value, currency)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="trf-detail__sub">Par caisse créditée</div>
                  {byCashbox.map((c) => (
                    <div className="trf-tally" key={c.name}>
                      <span className="trf-tally__k">{c.name}<span className="trf-tally__n">{c.count} encaissement{c.count > 1 ? 's' : ''}</span></span>
                      <span className="trf-tally__v">{fmtMoney(c.value, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="trf-detail__sub" style={{ marginTop: 22 }}>Sources · {revSources.length}</div>
              {revSources.map((s) => (
                <div className="trf-exprow" key={s.key}>
                  <span className="trf-datepill">{fmtDay(s.date)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="trf-exprow__vendor">{s.who}</div>
                    <div className="trf-exprow__meta">{s.title} · {s.meta}</div>
                  </div>
                  <span className="trf-exprow__amt">{fmtMoney(s.amount, currency)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Détail des dépenses — groupées par catégorie */}
      <div className="trf-panel" style={{ marginTop: 18 }}>
        <div className="trf-detail__head">
          <div className="trf-panel__title" style={{ marginBottom: 0 }}>Détail des dépenses · {monthLabel(thisMonth)}</div>
          <button className="trf-iconbtn" onClick={() => setShowExp((v) => !v)}>
            {showExp ? 'Masquer le détail' : 'Voir le détail'} · {fmtMoney(spent, currency)}
          </button>
        </div>
        {showExp && (
          expenseGroups.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 14 }}>Aucune dépense engagée ce mois — la maison tient ses comptes au clair.</div>
          ) : (
            <div style={{ marginTop: 14 }}>
              {expenseGroups.map((g) => (
                <div className="trf-catgroup" key={g.category}>
                  <div className="trf-catgroup__head">
                    <span className="trf-catgroup__name">{g.category}</span>
                    <span className="trf-catgroup__sum">{fmtMoney(g.total, currency)}</span>
                  </div>
                  {g.rows.map((e) => (
                    <div key={e.id}>
                      <div className="trf-exprow">
                        <span className="trf-datepill">{fmtDay(e.date)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="trf-exprow__vendor">{e.label || 'Dépense'}</div>
                          <div className="trf-exprow__meta">{[e.subcategory, e.cashbox].filter(Boolean).join(' · ') || '—'}</div>
                        </div>
                        <span className="trf-exprow__amt">{fmtMoney(expenseTotal(e), currency)}</span>
                      </div>
                      {e.items && e.items.length > 0 && (
                        <div className="trf-itembreak trf-itembreak--inline">
                          {e.items.map((it) => (
                            <div className="trf-itembreak__row" key={it.id}>
                              <span className="trf-itembreak__label">{it.label}</span>
                              <span className="trf-itembreak__val">{fmtMoney(it.amountXof, currency)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
