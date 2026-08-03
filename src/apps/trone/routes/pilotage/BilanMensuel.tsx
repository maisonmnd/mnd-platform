import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useApprenants } from '../equipe/data';
import { useClients } from '../../../../shared/clients';
import { useInvoices, invoiceTotal } from '../../../../shared/finance';
import {
  apptLabel, apptNetXof, apptServices, apptDiscountFactor, apptPayState, apptDueXof,
  frShort, todayISO, useServicesById, RdvModal, PayStatusPill,
  DrillModal, type Drill, type DrillRow,
} from '../clients/_shared';
import { PayAppointmentModal } from '../clients/actions';
import './pilotage.css';

/* Bilan mensuel — le mois d'un regard : combien de rendez-vous, combien de revenu,
   qui sont les meilleures clientes, et combien de chaque prestation. Même base que
   la Synthèse (source de vérité du CA), donc mêmes chiffres — jamais deux fois :
   revenu = factures payées + rituels honorés NON facturés (la facture d'un rituel
   encaissé le compte déjà). Tout est dérivé des magasins réels. */

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const monthTitle = (mk: string) => { const [y, m] = mk.split('-').map(Number); return `${MONTHS_FR[m - 1]} ${y}`; };
const shiftMonth = (mk: string, dir: 1 | -1) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + dir, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
const daysInMonth = (mk: string) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };


/* Date d'un règlement de formation (jj/mm/aaaa, ou ISO) → jour ISO comparable. */
const payISOLocal = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : d;
};

export default function BilanMensuel() {
  const { branch, currency } = useBranch();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const [clients] = useClients();
  const [apprenants] = useApprenants();
  const byId = useServicesById();
  const today = todayISO();

  const [month, setMonth] = useState(today.slice(0, 7));
  const [drill, setDrill] = useState<Drill | null>(null);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);
  /* Carnet intégré : périmètre (ce mois / tout) et filtre de règlement. */
  const [carnetScope, setCarnetScope] = useState<'mois' | 'tout'>('mois');
  const [carnetStatus, setCarnetStatus] = useState<'tous' | 'impayes' | 'payes'>('tous');

  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente';

  /* Rendre une ligne de rituel cliquable : si le rituel a été encaissé, la ligne
     OUVRE SA FACTURE ; sinon (honoré non encaissé, RDV à venir…) elle ouvre le
     rendez-vous, d'où l'on peut l'encaisser. `onOpen` prime sur `invoiceId` dans
     le DrillModal : on ne le pose donc QUE lorsqu'il n'y a pas de facture. */
  const apptLink = (a: Appointment): Pick<DrillRow, 'invoiceId' | 'onOpen'> => ({
    invoiceId: a.invoiceId,
    onOpen: a.invoiceId ? undefined : () => { setDrill(null); setEditAppt(a); },
  });

  const d = useMemo(() => {
    const inMonth = (iso: string) => iso.slice(0, 7) === month;
    const paidInv = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée' && inMonth(i.date));
    /* Rituels honorés NON facturés : la facture d'encaissement, quand elle existe,
       les compte déjà — on ne retient donc que ceux sans invoiceId (jamais deux fois). */
    const honoredNoInv = appts.filter((a) => a.branchId === branch.id && a.status === 'honoré' && !a.invoiceId && inMonth(a.date));
    const monthAppts = appts.filter((a) => a.branchId === branch.id && a.status !== 'annulé' && inMonth(a.date));
    /* Rituels honorés porteurs de valeur (séances 2..N d'une série = 0). */
    const honoredValue = monthAppts.filter((a) => a.status === 'honoré' && !(a.seriesIndex && a.seriesIndex > 1));

    const revInv = paidInv.reduce((s, i) => s + invoiceTotal(i), 0);
    const revRit = honoredNoInv.reduce((s, a) => s + apptNetXof(a, byId), 0);
    /* Meme correction qu'a l'Analytics : le Bilan annoncait « meme base que la
       Synthese » tout en omettant les reglements de formation. */
    const revForm = apprenants
      .flatMap((ap) => ap.payments ?? [])
      .filter((pm) => inMonth(payISOLocal(pm.date)))
      .reduce((s2, pm) => s2 + pm.amountXof, 0);
    const revenue = revInv + revRit + revForm;
    const honoredNet = honoredValue.reduce((s, a) => s + apptNetXof(a, byId), 0);
    const honoredCount = monthAppts.filter((a) => a.status === 'honoré').length;
    const totalRdv = monthAppts.length;
    const basket = honoredValue.length > 0 ? Math.round(honoredNet / honoredValue.length) : 0;
    const heads = new Set(monthAppts.map((a) => a.clientId)).size;
    const nouvelles = clients.filter((c) => c.branchId === branch.id && (c.since ?? '').slice(0, 7) === month).length;

    /* — revenu jour par jour du mois — */
    const dim = daysInMonth(month);
    const days = Array.from({ length: dim }, (_, i) => {
      const iso = `${month}-${pad2(i + 1)}`;
      const inv = paidInv.filter((x) => x.date === iso).reduce((s, x) => s + invoiceTotal(x), 0);
      const rit = honoredNoInv.filter((a) => a.date === iso).reduce((s, a) => s + apptNetXof(a, byId), 0);
      return { day: i + 1, iso, total: inv + rit };
    });
    const dayMax = Math.max(...days.map((x) => x.total), 1);

    /* — meilleures clientes du mois (revenu) — */
    const cliMap = new Map<string, { value: number; count: number }>();
    const bumpCli = (k: string, v: number) => { const c = cliMap.get(k) ?? { value: 0, count: 0 }; cliMap.set(k, { value: c.value + v, count: c.count + 1 }); };
    paidInv.forEach((i) => bumpCli(i.clientName ?? nameOf(i.clientId), invoiceTotal(i)));
    honoredNoInv.forEach((a) => bumpCli(nameOf(a.clientId), apptNetXof(a, byId)));
    const topClients = Array.from(cliMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value).slice(0, 8);
    const cliMax = Math.max(...topClients.map((c) => c.value), 1);

    /* — résumé des prestations réalisées : combien de CHAQUE, et le revenu —
       part de la prestation dans le rituel, remise répercutée au prorata (une
       prestation à deux nomenclatures n'est jamais comptée deux fois pleine). */
    const svcMap = new Map<string, { value: number; count: number }>();
    honoredValue.forEach((a) => {
      const disc = apptDiscountFactor(a, byId);
      apptServices(a, byId).forEach((s) => {
        const amt = Math.round(s.priceXof * disc);
        const c = svcMap.get(s.name) ?? { value: 0, count: 0 };
        svcMap.set(s.name, { value: c.value + amt, count: c.count + 1 });
      });
    });
    const services = Array.from(svcMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count || b.value - a.value);
    const svcCountMax = Math.max(...services.map((s) => s.count), 1);
    const svcTotalCount = services.reduce((s, x) => s + x.count, 0);

    return {
      paidInv, honoredNoInv, monthAppts, honoredValue,
      revenue, revInv, revRit, honoredNet, honoredCount, totalRdv, basket, heads, nouvelles,
      days, dayMax, topClients, cliMax, services, svcCountMax, svcTotalCount,
    };
  }, [appts, invoices, branch.id, month, byId, clients, apprenants]);

  const hasLife = d.totalRdv > 0 || d.revenue > 0;

  /* — Carnet des rendez-vous : la liste (ce mois ou tout le carnet), avec l'état de
     règlement et l'encaissement d'un geste. Les annulés sortent ; tri du plus
     récent au plus ancien. On calcule l'état une fois, puis on filtre. */
  const carnet = useMemo(() => {
    const base = appts.filter((a) => a.branchId === branch.id && a.status !== 'annulé'
      && (carnetScope === 'tout' || a.date.slice(0, 7) === month));
    const rows = base
      .map((a) => ({ a, state: apptPayState(a, byId), due: apptDueXof(a, byId) }))
      .sort((x, y) => (x.a.date < y.a.date ? 1 : x.a.date > y.a.date ? -1 : (y.a.time ?? '').localeCompare(x.a.time ?? '')));
    const unpaid = rows.filter((r) => r.state === 'impayé' || r.state === 'partiel').length;
    const paid = rows.filter((r) => r.state === 'payé').length;
    const shown = rows.filter((r) =>
      carnetStatus === 'tous' ? true
      : carnetStatus === 'impayes' ? (r.state === 'impayé' || r.state === 'partiel')
      : r.state === 'payé');
    const dueTotal = rows.reduce((s, r) => s + r.due, 0);
    return { rows, shown, unpaid, paid, total: rows.length, dueTotal };
  }, [appts, branch.id, month, carnetScope, carnetStatus, byId]);

  /* ---------- Détails cliquables ---------- */
  const revenueRows = (from: string, to: string): DrillRow[] =>
    [
      ...d.honoredNoInv
        .filter((a) => a.date >= from && a.date <= to)
        .map((a) => ({ date: a.date, who: nameOf(a.clientId), sub: apptLabel(a, byId), amount: apptNetXof(a, byId), ...apptLink(a) })),
      ...d.paidInv
        .filter((i) => i.date >= from && i.date <= to)
        .map((i) => ({ date: i.date, who: i.clientName ?? nameOf(i.clientId), sub: `Facture ${i.number}`, amount: invoiceTotal(i), invoiceId: i.id })),
    ].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));

  const openRevenueMonth = () => {
    const rows = revenueRows(`${month}-01`, `${month}-31`);
    setDrill({ title: `Revenu · ${monthTitle(month)}`, sub: 'Factures payées et rituels honorés du mois', rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
  };
  const openDay = (iso: string) => {
    const rows = revenueRows(iso, iso);
    setDrill({ title: `Revenu · ${frShort(iso)}`, sub: rows.length ? `${rows.length} encaissement${rows.length > 1 ? 's' : ''}` : 'aucun encaissement ce jour', rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
  };
  const openTotalRdv = () => {
    const rows: DrillRow[] = d.monthAppts
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((a) => ({ date: a.date, who: nameOf(a.clientId), sub: `${apptLabel(a, byId)} · ${a.status}`, amount: a.status === 'honoré' ? apptNetXof(a, byId) : undefined, ...apptLink(a) }));
    setDrill({ title: `Rendez-vous · ${monthTitle(month)}`, sub: `${rows.length} rendez-vous (hors annulés)`, rows });
  };
  const openClient = (name: string) => {
    const rows: DrillRow[] = [
      ...d.honoredNoInv.filter((a) => nameOf(a.clientId) === name).map((a) => ({ date: a.date, who: name, sub: apptLabel(a, byId), amount: apptNetXof(a, byId), ...apptLink(a) })),
      ...d.paidInv.filter((i) => (i.clientName ?? nameOf(i.clientId)) === name).map((i) => ({ date: i.date, who: name, sub: `Facture ${i.number}`, amount: invoiceTotal(i), invoiceId: i.id })),
    ].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
    setDrill({ title: name, sub: `Le mois de ${monthTitle(month)}`, rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
  };
  const openService = (svcName: string) => {
    const rows: DrillRow[] = [];
    d.honoredValue
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((a) => {
        const part = apptServices(a, byId).filter((s) => s.name === svcName);
        if (part.length === 0) return;
        const gross = part.reduce((s, sv) => s + sv.priceXof, 0);
        rows.push({ date: a.date, who: nameOf(a.clientId), sub: svcName, amount: Math.round(gross * apptDiscountFactor(a, byId)), ...apptLink(a) });
      });
    setDrill({ title: `Prestation · ${svcName}`, sub: `${rows.length} fois en ${monthTitle(month)}`, rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
  };

  const kpis = [
    { l: 'Rendez-vous du mois', v: String(d.totalRdv), cap: `${d.heads} cliente${d.heads > 1 ? 's' : ''} · ${d.nouvelles} nouvelle${d.nouvelles > 1 ? 's' : ''}`, a: 'var(--color-indigo)', pct: d.totalRdv > 0 ? Math.round((d.honoredCount / d.totalRdv) * 100) : 0, open: d.totalRdv > 0 ? openTotalRdv : undefined },
    { l: 'Rituels honorés', v: String(d.honoredCount), cap: d.totalRdv > 0 ? `${Math.round((d.honoredCount / d.totalRdv) * 100)} % des rendez-vous` : 'aucun rituel honoré', a: 'var(--copper-600)', pct: d.totalRdv > 0 ? Math.round((d.honoredCount / d.totalRdv) * 100) : 0, open: undefined },
    { l: 'Revenu du mois', v: d.revenue > 0 ? fmtMoney(d.revenue, currency) : '—', cap: d.revenue > 0 ? 'factures payées + rituels honorés' : 'en attente d’encaissement', a: 'var(--color-copper)', pct: d.revenue > 0 ? Math.round((d.revRit / d.revenue) * 100) : 0, open: d.revenue > 0 ? openRevenueMonth : undefined },
    { l: 'Panier moyen', v: d.basket > 0 ? fmtMoney(d.basket, currency) : '—', cap: d.basket > 0 ? 'par rituel honoré' : 'se calcule à l’usage', a: 'var(--indigo-400)', pct: d.basket > 0 && d.revenue > 0 ? Math.min(100, Math.round((d.basket / (d.revenue || 1)) * 100)) : 0, open: undefined },
  ];

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Pilotage · Le mois"
        title="Bilan mensuel."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 12px' }}>
            <button onClick={() => setMonth((m) => shiftMonth(m, -1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }} aria-label="Mois précédent">‹</button>
            <button
              onClick={() => setMonth(today.slice(0, 7))}
              title="Revenir au mois en cours"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, letterSpacing: '.04em', color: 'var(--color-indigo)', textTransform: 'capitalize', minWidth: 120 }}
            >
              {monthTitle(month)}
            </button>
            <button onClick={() => setMonth((m) => shiftMonth(m, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }} aria-label="Mois suivant">›</button>
          </div>
        }
      />

      {!hasLife && (
        <div className="trp-panel" style={{ marginTop: 18 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            Aucun rendez-vous ni encaissement en {monthTitle(month)} — le bilan se remplira avec l’activité du mois.
          </div>
        </div>
      )}

      {/* Indices du mois */}
      <div className="tr-grid tr-grid--4" style={{ marginTop: 18 }}>
        {kpis.map((i) => {
          const inner = (
            <>
              <span className="trp-kpi__bar" style={{ background: i.a }} />
              <div className="trp-index__label">{i.l}</div>
              <div className="trp-index__value">{i.v}</div>
              <svg viewBox="0 0 100 8" style={{ width: '100%', height: 8, marginTop: 12, display: 'block' }} aria-hidden>
                <line x1="0" y1="4" x2="100" y2="4" stroke="var(--hairline)" strokeWidth="2" />
                <line x1="0" y1="4" x2={i.pct} y2="4" stroke={i.a} strokeWidth="4" strokeLinecap="round" />
              </svg>
              <div className="trp-index__cap">{i.cap}</div>
            </>
          );
          return i.open ? (
            <button type="button" key={i.l} className="trp-index trp-index--click" onClick={i.open} title="Voir le détail">{inner}</button>
          ) : (
            <div className="trp-index" key={i.l}>{inner}</div>
          );
        })}
      </div>

      {/* Revenu · jour par jour du mois */}
      <div className="trp-rev" style={{ marginTop: 18, borderRadius: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="trp-rev__eyebrow">Revenu · jour par jour</div>
            <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 4 }}>
              Chaque barre = l’encaissement d’un jour (factures payées + rituels honorés). Touchez un jour pour le détail.
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mnd-serif" style={{ fontSize: 28, lineHeight: 1, color: 'var(--color-ivoire)' }}>{d.revenue > 0 ? fmtMoney(d.revenue, currency) : '—'}</div>
            <div style={{ fontSize: 10.5, color: 'var(--indigo-200)', marginTop: 4, letterSpacing: '.04em', textTransform: 'uppercase' }}>total du mois</div>
          </div>
        </div>
        {d.revenue > 0 ? (
          <svg viewBox="0 0 480 190" style={{ width: '100%', height: 190, marginTop: 18, display: 'block' }} aria-hidden>
            {d.days.map((x) => {
              const bw = 460 / d.days.length;
              const bx = 10 + x.day * bw - bw;
              const h = (x.total / d.dayMax) * 150;
              const showLabel = x.day === 1 || x.day % 5 === 0 || x.day === d.days.length;
              const isToday = x.iso === today;
              return (
                <g key={x.iso} onClick={x.total > 0 ? () => openDay(x.iso) : undefined} style={{ cursor: x.total > 0 ? 'pointer' : 'default' }}>
                  <rect x={bx} y={10} width={bw} height={158} fill="transparent" />
                  <rect
                    x={bx + Math.max(1, bw * 0.14)}
                    y={168 - h}
                    width={Math.max(2, bw * 0.72)}
                    height={Math.max(1, h)}
                    rx={1}
                    fill={x.total > 0 ? (isToday ? 'var(--copper-200)' : 'var(--color-copper)') : 'rgba(246,241,231,0.10)'}
                  />
                  {showLabel && (
                    <text x={bx + bw / 2} y={184} textAnchor="middle" fontSize={8.5} fontFamily="var(--font-sans)" fill="var(--indigo-200)">{x.day}</text>
                  )}
                  {x.total > 0 && <title>{`${frShort(x.iso)} · ${fmtMoney(x.total, currency)}`}</title>}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ padding: '38px 0 26px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--indigo-100)' }}>
            Aucun encaissement ce mois-ci — le premier rituel honoré posera la première barre.
          </div>
        )}
        <div className="trp-rev__foot">
          <span>{d.honoredCount} rituel{d.honoredCount > 1 ? 's' : ''} honoré{d.honoredCount > 1 ? 's' : ''} · {d.paidInv.length} facture{d.paidInv.length > 1 ? 's' : ''} payée{d.paidInv.length > 1 ? 's' : ''}</span>
          <span className="trp-rev__best">{d.days.some((x) => x.total > 0) ? `meilleur jour ${fmtMoney(d.dayMax, currency)}` : '—'}</span>
        </div>
      </div>

      {/* Top clientes + Résumé des prestations */}
      <div className="tr-grid tr-grid--2" style={{ marginTop: 18 }}>
        <div className="trp-panel">
          <div className="trp-panel__title">Meilleures clientes · {monthTitle(month)}</div>
          {d.topClients.length === 0 ? (
            <div className="mnd-muted" style={{ fontSize: 13, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Aucune cliente encaissée ce mois — le classement attend ses lauréates.</div>
          ) : (
            d.topClients.map((c, i) => (
              <button type="button" key={c.name} className="trp-drill" onClick={() => openClient(c.name)} title="Voir le détail de la cliente">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <span className="mnd-serif" style={{ fontSize: 15, color: 'var(--color-indigo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--copper-600)', marginRight: 8 }}>{i + 1}.</span>{c.name}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--color-indigo)', fontFamily: 'var(--font-serif)', flex: 'none' }}>{fmtMoney(c.value, currency)}</span>
                </div>
                <div className="trp-bar" style={{ marginTop: 5 }}>
                  <div style={{ width: `${Math.round((c.value / d.cliMax) * 100)}%`, background: i === 0 ? 'var(--color-copper)' : 'var(--indigo-400)' }} />
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 3 }}>{c.count} passage{c.count > 1 ? 's' : ''}</div>
              </button>
            ))
          )}
        </div>

        <div className="trp-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div className="trp-panel__title" style={{ marginBottom: 0 }}>Résumé des prestations · combien de chaque</div>
            {d.svcTotalCount > 0 && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{d.svcTotalCount} au total</span>}
          </div>
          <div style={{ marginTop: 12 }}>
            {d.services.length === 0 ? (
              <div className="mnd-muted" style={{ fontSize: 13, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Aucune prestation réalisée ce mois — le résumé se dessinera avec le carnet.</div>
            ) : (
              d.services.map((s) => (
                <button type="button" key={s.name} className="trp-drill" onClick={() => openService(s.name)} title="Voir les rituels de cette prestation">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="mnd-serif" style={{ fontSize: 17, color: 'var(--color-indigo)' }}>{s.count}×</span>
                      <span style={{ fontSize: 12, color: 'var(--copper-700)' }}>{fmtMoney(s.value, currency)}</span>
                    </span>
                  </div>
                  <div className="trp-bar" style={{ marginTop: 5 }}>
                    <div style={{ width: `${Math.round((s.count / d.svcCountMax) * 100)}%`, background: 'var(--color-indigo)' }} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Carnet des rendez-vous — la liste, l'état de règlement, l'encaissement d'ici. */}
      <div className="trp-panel" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <div>
            <div className="trp-panel__title" style={{ marginBottom: 2 }}>Carnet des rendez-vous</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
              {carnetScope === 'mois' ? `${monthTitle(month)} — ` : 'Tout le carnet — '}
              {carnet.total} rendez-vous · <b style={{ color: 'var(--copper-700)' }}>{carnet.unpaid} à encaisser</b>
              {carnet.dueTotal > 0 ? ` · reste ${fmtMoney(carnet.dueTotal, currency)}` : ''}
            </div>
          </div>
          <Segs<'mois' | 'tout'>
            options={[{ value: 'mois', label: 'Ce mois' }, { value: 'tout', label: 'Tout le carnet' }]}
            value={carnetScope}
            onChange={setCarnetScope}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 6px' }}>
          {([['tous', `Tous · ${carnet.total}`], ['impayes', `Impayés · ${carnet.unpaid}`], ['payes', `Payés · ${carnet.paid}`]] as const).map(([k, lbl]) => (
            <button key={k} className={`trp-chip ${carnetStatus === k ? 'is-active' : ''}`} onClick={() => setCarnetStatus(k)}>{lbl}</button>
          ))}
        </div>

        {carnet.shown.length === 0 ? (
          <div className="trp-empty">
            {carnet.total === 0
              ? (carnetScope === 'mois' ? `Aucun rendez-vous en ${monthTitle(month)}.` : 'Le carnet est encore vierge.')
              : carnetStatus === 'impayes' ? 'Rien à encaisser — tout est réglé.' : 'Aucun rendez-vous dans ce filtre.'}
          </div>
        ) : (
          <div className="trp-carnet">
            {carnet.shown.slice(0, 200).map(({ a, state, due }) => (
              <div
                key={a.id}
                className="trp-carnet__row"
                onClick={() => setEditAppt(a)}
                title={`${nameOf(a.clientId)} — ouvrir le rendez-vous`}
              >
                <span className="trp-carnet__date">
                  <b>{frShort(a.date)}</b>
                  <span>{a.time}</span>
                </span>
                <span className="trp-carnet__main">
                  <span className="trp-carnet__who">{nameOf(a.clientId)}</span>
                  <span className="trp-carnet__svc">{apptLabel(a, byId)}{a.master ? ` · ${a.master}` : ''}</span>
                </span>
                <span className="trp-carnet__side" onClick={(e) => e.stopPropagation()}>
                  <PayStatusPill a={a} byId={byId} />
                  {state !== 'payé' && state !== 'gratuit' && (
                    <button
                      type="button"
                      className="trp-carnet__pay"
                      onClick={(e) => { e.stopPropagation(); setPayAppt(a); }}
                      title={`Encaisser ${due > 0 ? fmtMoney(due, currency) : ''}`.trim()}
                    >
                      Encaisser{due > 0 ? ` · ${fmtMoney(due, currency)}` : ''}
                    </button>
                  )}
                </span>
              </div>
            ))}
            {carnet.shown.length > 200 && (
              <div className="mnd-muted" style={{ fontSize: 11.5, padding: '10px 2px 2px', fontStyle: 'italic' }}>
                200 rendez-vous affichés sur {carnet.shown.length} — affinez avec le filtre ou le mois.
              </div>
            )}
          </div>
        )}
      </div>

      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
      {/* Rituel sans facture ouvert depuis un détail — on peut l'encaisser d'ici. */}
      {editAppt && (
        <RdvModal
          onClose={() => setEditAppt(null)}
          appt={editAppt}
          onEncaisser={(a) => { setEditAppt(null); setPayAppt(a); }}
        />
      )}
      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
    </div>
  );
}
