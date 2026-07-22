import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow, Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients } from '../../../../shared/clients';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { useCategories, useProducts } from '../../../../shared/catalog';
import { useInvoices, useExpenses, invoiceTotal } from '../../../../shared/finance';
import { useApprenants } from '../equipe/data';
import {
  Avatar, PayStatusPill, RdvModal, SourceBadge, StatusPill, apptLabel, apptTotalXof, apptNetXof, apptDueXof, addDaysISO, frShort, fromISO,
  timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
  DrillModal, type Drill, type DrillRow,
} from '../clients/_shared';
import { PayAppointmentModal, honorAppointment } from '../clients/actions';
import { useAuth, useStaff } from '../../../../shared/auth';
import './pilotage.css';

/* Tableau de bord — la salle du conseil au matin. Tout est dérivé des magasins,
   filtré par la branche, exprimé dans sa devise. */

const monthKey = (iso: string) => iso.slice(0, 7);
/* Date d'un règlement de scolarité (jj/mm/aaaa, ou ISO) → clé de mois / jour ISO. */
const payMonthKey = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}` : d.slice(0, 7);
};
const payISO = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : d;
};

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
  const [categories] = useCategories();
  const [apprenants] = useApprenants();

  const [breakOpen, setBreakOpen] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);

  const today = todayISO();
  const now = new Date();
  const greeting = now.getHours() >= 17 || now.getHours() < 5 ? 'Bonsoir' : 'Bonjour';
  /* Salutation à la personne connectée — nom du personnel, sinon la partie
     locale de l'e-mail ; jamais un nom en dur. */
  const { session } = useAuth();
  const staff = useStaff();
  const rawWho = (staff?.name?.trim().split(' ')[0]) || (session?.user?.email?.split('@')[0]) || '';
  const who = rawWho ? rawWho.charAt(0).toUpperCase() + rawWho.slice(1) : '';
  const thisMonth = monthKey(today);
  const prevMonth = monthKey(addDaysISO(`${thisMonth}-01`, -1));
  const prevMonthName = fromISO(`${prevMonth}-15`).toLocaleDateString('fr-FR', { month: 'long' });

  const { revenue, prevRevenue, spent, prevSpent, rev7, todayRows, stockAlerts } = useMemo(() => {
    /* Une prestation encaissée porte un invoiceId : sa facture (payée) la compte déjà.
       On ne recompte donc jamais l'appt côté carnet → fini le double comptage carnet+caisse. */
    /* SEUL un rituel HONORÉ est du chiffre. L'ancienne présomption « confirmé et
       daté d'aujourd'hui ou avant = réalisé » comptait les RDV du jour dès le matin
       (avant que la cliente n'arrive) et les no-shows confirmés pour toujours —
       des revenus « réels » qui n'avaient jamais eu lieu. */
    const realized = (a: Appointment) => !a.invoiceId && a.status === 'honoré';
    const realizedAppts = appts.filter(realized);
    const paidInv = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée');

    const apptRev = (mk: string) => realizedAppts.filter((a) => monthKey(a.date) === mk).reduce((s, a) => s + apptTotalXof(a, byId), 0);
    const invRev = (mk: string) => paidInv.filter((i) => monthKey(i.date) === mk).reduce((s, i) => s + invoiceTotal(i), 0);
    const exp = (mk: string) =>
      expenses
        .filter((e) => e.branchId === branch.id && monthKey(e.date) === mk && !e.stopped)
        .reduce((s, e) => s + e.amountXof, 0);

    // Règlements de scolarité (Académie) — revenu réel de la Maison (hors branche).
    const formPays = apprenants.flatMap((ap) =>
      (ap.payments ?? []).map((p) => ({ amount: p.amountXof, mk: payMonthKey(p.date), iso: payISO(p.date) })),
    );
    const formRev = (mk: string) => formPays.filter((p) => p.mk === mk).reduce((s, p) => s + p.amount, 0);

    /* Revenu réel d'un jour — MÊMES composantes que le mois (carnet non encaissé
       + factures payées + scolarité) : le graphe 7 jours reste cohérent avec le KPI. */
    const dayRev = (iso: string) =>
      realizedAppts.filter((a) => a.date === iso).reduce((s, a) => s + apptTotalXof(a, byId), 0)
      + paidInv.filter((i) => i.date === iso).reduce((s, i) => s + invoiceTotal(i), 0)
      + formPays.filter((p) => p.iso === iso).reduce((s, p) => s + p.amount, 0);

    const rev7 = Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO(today, i - 6);
      return { iso, total: dayRev(iso), label: fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase() };
    });

    return {
      revenue: apptRev(thisMonth) + invRev(thisMonth) + formRev(thisMonth),
      prevRevenue: apptRev(prevMonth) + invRev(prevMonth) + formRev(prevMonth),
      spent: exp(thisMonth),
      prevSpent: exp(prevMonth),
      rev7,
      todayRows: appts
        .filter((a) => a.date === today && a.status !== 'annulé')
        .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
      stockAlerts: products.filter((p) => p.stock < 10),
    };
  }, [appts, byId, invoices, expenses, products, apprenants, branch.id, today, thisMonth, prevMonth]);

  /* — décomposition du revenu du mois : rituels par catégorie + encaissements par moyen — */
  const breakdown = useMemo(() => {
    // Même règle que le revenu : un rituel encaissé (invoiceId) est compté par sa facture, pas ici.
    /* SEUL un rituel HONORÉ est du chiffre. L'ancienne présomption « confirmé et
       daté d'aujourd'hui ou avant = réalisé » comptait les RDV du jour dès le matin
       (avant que la cliente n'arrive) et les no-shows confirmés pour toujours —
       des revenus « réels » qui n'avaient jamais eu lieu. */
    const realized = (a: Appointment) => !a.invoiceId && a.status === 'honoré';

    const rit = new Map<string, { count: number; total: number }>();
    for (const a of appts) {
      if (monthKey(a.date) !== thisMonth || !realized(a)) continue;
      for (const sid of a.serviceIds) {
        const sv = byId.get(sid);
        if (!sv) continue;
        const cur = rit.get(sv.categoryId) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += sv.priceXof;
        rit.set(sv.categoryId, cur);
      }
    }
    const rituels = [...rit]
      .map(([catId, v]) => {
        const cat = categories.find((c) => c.id === catId);
        return { id: catId, label: cat ? `${cat.fon} · ${cat.label}` : 'Hors catalogue', ...v };
      })
      .sort((a, b) => b.total - a.total);

    const pay = new Map<string, { count: number; total: number }>();
    for (const i of invoices) {
      if (i.branchId !== branch.id || monthKey(i.date) !== thisMonth || i.kind !== 'facture' || i.status !== 'payée') continue;
      const k = i.payment ?? 'Autre';
      const cur = pay.get(k) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += invoiceTotal(i);
      pay.set(k, cur);
    }
    const encaissements = [...pay].map(([k, v]) => ({ id: k, label: k, ...v }));
    // Scolarité de l'Académie — un encaissement du mois, tous parcours confondus.
    const scol = apprenants
      .flatMap((ap) => ap.payments ?? [])
      .filter((p) => payMonthKey(p.date) === thisMonth)
      .reduce((acc, p) => ({ count: acc.count + 1, total: acc.total + p.amountXof }), { count: 0, total: 0 });
    if (scol.total > 0) encaissements.push({ id: 'academie', label: 'Académie · scolarité', count: scol.count, total: scol.total });
    encaissements.sort((a, b) => b.total - a.total);

    return {
      rituels,
      encaissements,
      rituelsTotal: rituels.reduce((s, r) => s + r.total, 0),
      encTotal: encaissements.reduce((s, e) => s + e.total, 0),
    };
  }, [appts, byId, categories, invoices, apprenants, branch.id, thisMonth, today]);

  /* Rendez-vous impayés — solde restant dû (net − acompte − encaissé), hors annulés.
     Scindés : ÉCHUS (date passée, en retard) d'un côté, À VENIR (aujourd'hui + futur)
     de l'autre. Chaque groupe trié du plus ancien au plus lourd, avec son total. */
  const unpaid = useMemo(() => {
    const rows = appts
      .filter((a) => a.status !== 'annulé' && apptDueXof(a, byId) > 0)
      .map((a) => ({ a, net: apptNetXof(a, byId), due: apptDueXof(a, byId) }));
    const byDate = (x: typeof rows[number], y: typeof rows[number]) =>
      (x.a.date < y.a.date ? -1 : x.a.date > y.a.date ? 1 : y.due - x.due);
    const sum = (rs: typeof rows) => rs.reduce((s, r) => s + r.due, 0);
    const overdue = rows.filter((r) => r.a.date < today).sort(byDate);
    const upcoming = rows.filter((r) => r.a.date >= today).sort(byDate);
    return {
      overdue: { rows: overdue, total: sum(overdue) },
      upcoming: { rows: upcoming, total: sum(upcoming) },
    };
  }, [appts, byId, today]);

  const net = revenue - spent;
  const prevNet = prevRevenue - prevSpent;

  const trend = (cur: number, prev: number): { t: string; down: boolean } => {
    if (prev === 0) return { t: 'premier mois suivi', down: false };
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    return { t: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)} % vs ${prevMonthName}`, down: pct < 0 };
  };

  const kpis = [
    { label: 'Revenus réels du mois', value: fmtMoney(revenue, currency), bar: 'var(--color-indigo)', trend: trend(revenue, prevRevenue), action: () => setBreakOpen(true) },
    { label: 'Dépenses réelles du mois', value: fmtMoney(spent, currency), bar: 'var(--color-copper)', trend: trend(spent, prevSpent), action: () => navigate('/depenses') },
    { label: 'Résultat net du mois', value: fmtMoney(net, currency), bar: 'var(--copper-600)', trend: trend(net, prevNet), action: () => navigate('/synthese') },
  ];

  const revTrend = trend(revenue, prevRevenue);
  const tiles = [
    { label: 'Revenu mois', value: fmtMoney(revenue, currency), cap: revTrend.t, up: !revTrend.down },
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

  /* Rendu d'un groupe d'impayés (échus / à venir) — carte avec total + lignes encaissables. */
  const renderUnpaidGroup = (
    title: string,
    group: { rows: { a: Appointment; net: number; due: number }[]; total: number },
    empty: string,
  ) => (
    <div className="trp-panel">
      <div className="trp-mon__head">
        <div className="trp-panel__title" style={{ marginBottom: 0 }}>{title}</div>
        {group.rows.length > 0 && (
          <div className="trp-mon__headline">
            {group.rows.length} RDV
            <span className="trp-mon__sep">·</span>
            <span style={{ color: 'var(--color-copper)', fontFamily: 'var(--font-serif)', fontSize: 15 }}>
              {fmtMoney(group.total, currency)} dus
            </span>
          </div>
        )}
      </div>
      {group.rows.length === 0 ? (
        <div className="trp-empty">{empty}</div>
      ) : (
        <div className="trp-pay">
          {group.rows.map(({ a, net: rowNet, due }) => (
            <div className="trp-pay__row" key={a.id}>
              <div style={{ minWidth: 0 }}>
                <div className="trp-act__name">{clientOf(a.clientId)?.name ?? 'Cliente'}</div>
                <div className="trp-act__meta">{apptLabel(a, byId)}</div>
              </div>
              <div className="trp-pay__date">{frShort(a.date)}</div>
              <div className="trp-pay__total">{fmtMoney(rowNet, currency)}</div>
              <div className="trp-pay__due">{fmtMoney(due, currency)}</div>
              <div style={{ flex: 'none' }}><StatusPill status={a.status} /></div>
              <button
                className="trp-pay__cta"
                onClick={() => setPayAppt(a)}
                title="Encaisser — paiement partiel ou total"
              >
                Encaisser
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const advance = (a: Appointment) => {
    if (a.status === 'en attente') {
      appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: 'confirmé' } : x)));
    } else {
      honorAppointment(a, byId);
    }
  };

  /* ---------- Ce qu'il y a derrière un chiffre ----------
     Même geste qu'Analytics : un indice s'ouvre sur les lignes qui le composent,
     et une ligne qui a une facture ouvre sa facture. */
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente';

  /** Le revenu d'un jour, ligne à ligne — LES TROIS composantes de `dayRev`, sans
      quoi le détail annoncerait moins que la barre qu'on vient d'ouvrir. */
  const openDay = (iso: string) => {
    const rows: DrillRow[] = [
      ...appts
        // INVARIANT CA : seuls les rituels HONORÉS comptent — un « confirmé daté
        // d'hier » n'est pas du revenu, le détail doit tomber sur la barre.
        .filter((a) => a.date === iso && !a.invoiceId && a.status === 'honoré')
        // Un rituel du carnet n'a pas (encore) de facture : la ligne ouvre son RDV,
        // d'où l'on encaisse — plutôt que de mener à une facture qui n'existe pas.
        .map((a) => ({ who: nameOf(a.clientId), sub: apptLabel(a, byId), amount: apptTotalXof(a, byId), onOpen: () => { setDrill(null); setEditAppt(a); } })),
      ...invoices
        .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée' && i.date === iso)
        .map((i) => ({ who: i.clientName || nameOf(i.clientId), sub: `Facture ${i.number}`, amount: invoiceTotal(i), invoiceId: i.id })),
      // Scolarité de l'Académie — hors branche, mais bien du revenu de la Maison.
      // La ligne s'ouvre sur l'Académie, où vit le dossier de l'apprenant·e.
      ...apprenants.flatMap((ap) =>
        (ap.payments ?? [])
          .filter((p) => payISO(p.date) === iso)
          .map((p) => ({ who: ap.name, sub: 'Scolarité · Académie', amount: p.amountXof, onOpen: () => { setDrill(null); navigate('/academie'); } })),
      ),
    ];
    setDrill({
      title: `Revenu · ${frShort(iso)}`,
      sub: rows.length ? 'Rituels du carnet, factures payées et scolarité de la journée.' : undefined,
      rows,
      total: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
    });
  };

  /** Les 7 jours, ligne à ligne — le détail derrière le total de la semaine. */
  const openWeek = () => {
    const rows: DrillRow[] = [...rev7]
      .reverse()
      .map((d) => ({
        who: frShort(d.iso),
        sub: d.total > 0 ? 'Voir la journée' : 'Aucun mouvement',
        amount: d.total,
        onOpen: d.total > 0 ? () => openDay(d.iso) : undefined,
      }));
    setDrill({ title: 'Revenu · 7 jours', sub: 'Rituels du carnet, factures payées et scolarité.', rows, total: rev7Total });
  };

  /** Les factures d'un moyen de paiement — chacune ouvrable. */
  const openPayMethod = (method: string) => {
    const rows: DrillRow[] = invoices
      .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée'
        && monthKey(i.date) === thisMonth && (i.payment ?? 'Autre') === method)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((i) => ({
        who: i.clientName || nameOf(i.clientId),
        sub: `${i.number}${i.fx ? ` · ${i.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${i.fx.code}` : ''}`,
        date: i.date,
        amount: invoiceTotal(i),
        invoiceId: i.id,
      }));
    setDrill({
      title: `Encaissements · ${method}`,
      sub: `${rows.length} facture${rows.length > 1 ? 's' : ''} ce mois-ci`,
      rows,
      total: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
    });
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
        {greeting}{who ? `, ${who}` : ''}.
      </h2>

      {/* KPI majeurs */}
      <div className="tr-grid tr-grid--3" style={{ marginTop: 24 }}>
        {kpis.map((k) => (
          <div
            className="trp-kpi trp-kpi--click"
            key={k.label}
            role="button"
            tabIndex={0}
            onClick={k.action}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') k.action(); }}
          >
            <span className="trp-kpi__bar" style={{ background: k.bar }} />
            <div className="trp-kpi__label">{k.label}</div>
            <div className="trp-kpi__value">{k.value}</div>
            <div className="trp-kpi__foot">
              <span className={`trp-kpi__trend ${k.trend.down ? 'trp-kpi__trend--down' : ''}`}>{k.trend.t}</span>
              <button className="trp-kpi__link" onClick={(e) => { e.stopPropagation(); k.action(); }}>
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
              <div
                className="trp-day__row trp-day__row--click"
                key={a.id}
                onClick={() => setEditAppt(a)}
                title="Modifier ce rendez-vous"
              >
                <div className="trp-day__time">{a.time}</div>
                {c && <Avatar client={c} size={34} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="trp-day__client">{c?.name ?? 'Cliente de passage'}</div>
                  <div className="trp-day__meta">
                    {apptLabel(a, byId)} · {a.master}
                  </div>
                </div>
                <SourceBadge source={a.source} />
                <PayStatusPill a={a} byId={byId} />
                <StatusPill status={a.status} />
                <button
                  onClick={(e) => { e.stopPropagation(); setPayAppt(a); }}
                  title="Encaisser ce rituel"
                  style={{
                    cursor: 'pointer', flex: 'none', borderRadius: 2, padding: '8px 12px',
                    fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                    background: 'transparent', color: 'var(--copper-700)', border: '1px solid var(--color-copper)',
                  }}
                >
                  Encaisser
                </button>
                {a.status !== 'honoré' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); advance(a); }}
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
          <button className="trp-rev__open" onClick={openWeek} title="Voir le détail des 7 jours">
            <div className="trp-rev__eyebrow">Revenu · 7 jours</div>
            <div className="trp-rev__value">{fmtMoney(rev7Total, currency)}</div>
          </button>
          <svg viewBox="0 0 280 150" style={{ width: '100%', height: 150, marginTop: 18, display: 'block' }} role="group" aria-label="Revenu des 7 derniers jours">
            {rev7.map((d, i) => {
              const h = Math.max(4, Math.round((d.total / rev7Max) * 118));
              const x = 8 + i * 39;
              const isBest = d.iso === best.iso && d.total > 0;
              return (
                <g key={d.iso} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => openDay(d.iso)}>
                  <title>{`${frShort(d.iso)} · ${fmtMoney(d.total, currency)}`}</title>
                  {/* Cible de clic sur toute la colonne : une journée creuse n'a
                      qu'un trait de 4 px, impossible à viser au doigt. */}
                  <rect x={x - 6} y={4} width={38} height={142} fill="transparent" />
                  <rect x={x} y={130 - h} width={26} height={h} rx={2} fill={isBest ? 'var(--color-copper)' : 'rgba(246,241,231,0.28)'} />
                  <text x={x + 13} y={146} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-sans)" fill="var(--indigo-200)">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <button className="trp-rev__foot trp-rev__foot--btn" onClick={() => openDay(best.iso)} title="Voir le meilleur jour">
            <span>Meilleur jour · {bestName}</span>
            <span className="trp-rev__best">{fmtMoney(best.total, currency)}</span>
          </button>
        </div>
      </div>

      {/* Rendez-vous impayés — échus (en retard) d'un côté, à venir de l'autre, chacun son total */}
      <div className="tr-grid tr-grid--2" style={{ marginTop: 18, alignItems: 'start' }}>
        {renderUnpaidGroup('Impayés échus · en retard', unpaid.overdue, 'Aucun impayé échu — rien en retard.')}
        {renderUnpaidGroup('Soldes à venir', unpaid.upcoming, 'Aucun solde à venir.')}
      </div>

      {/* Décomposition du revenu du mois */}
      {breakOpen && (
        <Modal
          title={`Revenus réels · ${fromISO(`${thisMonth}-15`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.`}
          onClose={() => setBreakOpen(false)}
          width={560}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div className="trp-break__head">Rituels honorés · par catégorie</div>
              {breakdown.rituels.length === 0 && (
                <div className="trp-break__empty">Aucun rituel honoré ce mois-ci — le carnet écrira la suite.</div>
              )}
              {breakdown.rituels.map((r) => (
                <button className="trp-break__row" key={r.id} onClick={() => { setBreakOpen(false); navigate('/calendrier'); }}>
                  <span className="trp-break__label">{r.label}</span>
                  <span className="trp-break__count">{r.count} prestation{r.count > 1 ? 's' : ''}</span>
                  <span className="trp-break__num">{fmtMoney(r.total, currency)}</span>
                </button>
              ))}
              {breakdown.rituels.length > 0 && (
                <div className="trp-break__sub">
                  <span>Sous-total rituels</span>
                  <span>{fmtMoney(breakdown.rituelsTotal, currency)}</span>
                </div>
              )}
            </div>

            <div>
              <div className="trp-break__head">Encaissements · par moyen de paiement</div>
              {breakdown.encaissements.length === 0 && (
                <div className="trp-break__empty">Aucune facture payée ce mois-ci.</div>
              )}
              {breakdown.encaissements.map((e) => (
                <button className="trp-break__row" key={e.id} title="Voir les factures" onClick={() => { setBreakOpen(false); openPayMethod(e.id); }}>
                  <span className="trp-break__label">{e.label}</span>
                  <span className="trp-break__count">{e.count} facture{e.count > 1 ? 's' : ''}</span>
                  <span className="trp-break__num">{fmtMoney(e.total, currency)}</span>
                </button>
              ))}
              {breakdown.encaissements.length > 0 && (
                <div className="trp-break__sub">
                  <span>Sous-total encaissements</span>
                  <span>{fmtMoney(breakdown.encTotal, currency)}</span>
                </div>
              )}
            </div>

            <div className="trp-break__total">
              <span>Total du mois</span>
              <span>{fmtMoney(revenue, currency)}</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Modification d’un rendez-vous du carnet du jour */}
      {editAppt && <RdvModal appt={editAppt} onClose={() => setEditAppt(null)} />}

      {/* Encaissement d’un rendez-vous du carnet du jour */}
      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}

      {/* Ce qu’il y a derrière un chiffre — chaque ligne ouvre sa facture */}
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}
