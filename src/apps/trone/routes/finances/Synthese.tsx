import { useMemo, useState, type CSSProperties } from 'react';
import { Eyebrow, Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, convertFromXof } from '../../../../shared/currency';
import { useInvoices, useExpenses, invoiceTotal, expenseTotal, cashboxLabel } from '../../../../shared/finance';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useCategories } from '../../../../shared/catalog';
import { splitByWeights } from '../../../../shared/pricing';
import { totalsOf, splitByMaison, MAISON_BUCKETS, sumTotals, type MaisonBucket, type Part } from '../../../../shared/maisons';
import { useClients } from '../../../../shared/clients';
import { useApprenants, useFormations } from '../equipe/data';
import { apptDiscountFactor, apptLabel, apptNetXof, apptServices, useServicesById } from '../clients/_shared';
import { todayISO, monthKey, monthLabel, monthShort, shiftMonth, lastMonths, MonthNav, downloadCsv } from './_shared';
import './finances.css';

/* Synthèse & résultat — le compte de résultat de la branche, mois par mois.
   Tout est dérivé des factures encaissées, des rituels honorés et des dépenses
   non suspendues, filtré par la branche courante et exprimé dans sa devise.
   Le mois affiché se navigue ‹ mois › — chaque chiffre suit le mois choisi. */

/** Date ISO → « 12 juil. » pour les pastilles de journal. */
const fmtDay = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

/* Date d'un règlement de formation (jj/mm/aaaa, ou ISO) → clé de mois « aaaa-mm ». */
const payMonthKey = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}`;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[1]}-${iso[2]}` : '';
};
/* … et → ISO « aaaa-mm-jj » pour l'affichage/tri du journal. */
const payISO = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : d;
};

const MIX_FILLS = [
  'var(--color-indigo)', 'var(--color-copper)', 'var(--indigo-400)', 'var(--copper-400)',
  'var(--indigo-300)', 'var(--copper-200)', 'var(--indigo-600)', 'var(--color-argile)',
];

export default function Synthese() {
  const { branch, currency } = useBranch();
  const [invoices] = useInvoices();
  const [expenses] = useExpenses();
  const [appts] = useAppointments();
  const [clients] = useClients();
  const [categories] = useCategories();
  const [apprenants] = useApprenants();
  const [formations] = useFormations();
  const byId = useServicesById();

  const [showRev, setShowRev] = useState(false);
  const [showExp, setShowExp] = useState(false);
  /* Détail cliquable d'un montant — écritures derrière le chiffre. */
  const [detail, setDetail] = useState<{ title: string; rows: { date?: string; who: string; meta?: string; amount: number }[]; total: number } | null>(null);

  const thisMonth = monthKey(todayISO());
  const [month, setMonth] = useState(thisMonth);
  const prevMonth = shiftMonth(month, -1);

  const {
    revenueOf, expenseOf, series, byCashbox, byMethod, revSources, expenseGroups, expenseRows, topServices, topClients, svcDetail, revMaison, maisonRows,
  } = useMemo(() => {
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

    // Règlements de formation (Académie) — revenus de la Maison. Les apprenant·e·s
    // ne sont pas rattaché·e·s à une branche : la formation compte comme revenu
    // quelle que soit la branche affichée.
    const fName = (id: string) => formations.find((f) => f.id === id)?.name ?? 'Formation';
    const formationPays = apprenants.flatMap((ap) =>
      (ap.payments ?? []).map((p) => ({
        id: p.id, amount: p.amountXof, who: ap.name, formation: fName(ap.formationId),
        mk: payMonthKey(p.date), iso: payISO(p.date),
      })),
    );

    const revenueOf = (mk: string) =>
      paidInv.filter((i) => monthKey(i.date) === mk).reduce((s, i) => s + invoiceTotal(i), 0) +
      honored.filter((a) => monthKey(a.date) === mk).reduce((s, a) => s + apptNetXof(a, byId), 0) +
      formationPays.filter((p) => p.mk === mk).reduce((s, p) => s + p.amount, 0);
    const expenseOf = (mk: string) =>
      liveExp.filter((e) => monthKey(e.date) === mk).reduce((s, e) => s + expenseTotal(e), 0);

    // Fenêtre de 6 mois : elle se termine au présent (ou au futur navigué) et
    // glisse en arrière si le mois choisi sort du cadre — il reste toujours visible.
    const chartEnd = month > thisMonth ? month : thisMonth;
    let window6 = lastMonths(chartEnd, 6);
    if (!window6.includes(month)) window6 = lastMonths(month, 6);
    const series = window6.map((mk) => {
      const rev = revenueOf(mk);
      const exp = expenseOf(mk);
      return { mk, rev, exp, net: rev - exp, label: monthShort(mk), selected: mk === month };
    });

    // — Détail du mois sélectionné —
    const invM = paidInv.filter((i) => monthKey(i.date) === month);
    const ritM = honored.filter((a) => monthKey(a.date) === month);
    const payM = formationPays.filter((p) => p.mk === month);

    const bump = (m: Map<string, { value: number; count: number }>, key: string, v: number) => {
      const cur = m.get(key) ?? { value: 0, count: 0 };
      m.set(key, { value: cur.value + v, count: cur.count + 1 });
    };
    const spread = (m: Map<string, { value: number; count: number }>) =>
      Array.from(m.entries())
        .map(([name, { value, count }]) => ({ name, value, count }))
        .sort((a, b) => b.value - a.value);

    // Revenus par caisse créditée — factures + rituels honorés (pseudo-caisse).
    // La part réglée par AVOIR (avoirXof) est du revenu mais PAS de l'argent
    // physique : elle va au poste « Avoir (crédit) », jamais dans une caisse.
    const caisseMap = new Map<string, { value: number; count: number }>();
    invM.forEach((i) => {
      const av = i.avoirXof ?? 0;
      const cash = invoiceTotal(i) - av;
      if (cash > 0) bump(caisseMap, cashboxLabel(i.cashbox), cash);
      if (av > 0) bump(caisseMap, 'Avoir (crédit)', av);
    });
    ritM.forEach((a) => bump(caisseMap, 'Rituels honorés', apptNetXof(a, byId)));
    payM.forEach((p) => bump(caisseMap, 'Académie · formations', p.amount));
    const byCashbox = spread(caisseMap);

    // Revenus par mode de paiement (l'avoir a son propre poste, pas une caisse).
    const methodMap = new Map<string, { value: number; count: number }>();
    invM.forEach((i) => {
      const av = i.avoirXof ?? 0;
      const cash = invoiceTotal(i) - av;
      if (cash > 0) bump(methodMap, i.payment ?? 'Non précisé', cash);
      if (av > 0) bump(methodMap, 'Avoir (crédit)', av);
    });
    ritM.forEach((a) => bump(methodMap, 'Rituel · carnet', apptNetXof(a, byId)));
    payM.forEach((p) => bump(methodMap, 'Académie · formation', p.amount));
    const byMethod = spread(methodMap);

    // Top prestations du mois — tous les rituels honorés du mois (facturés ou non),
    // au prix net de la remise ; les séances 2..N d'une série valent 0 (jamais deux fois).
    const honoredAll = appts.filter(
      (a) => a.branchId === branch.id && a.status === 'honoré'
        && monthKey(a.date) === month && !(a.seriesIndex && a.seriesIndex > 1),
    );
    const svcMap = new Map<string, { value: number; count: number }>();
    const svcDetail = new Map<string, { date: string; who: string; amount: number }[]>();
    honoredAll.forEach((a) => {
      const disc = apptDiscountFactor(a, byId);
      apptServices(a, byId).forEach((s) => {
        const amt = Math.round(s.priceXof * disc);
        bump(svcMap, s.name, amt);
        svcDetail.set(s.name, [...(svcDetail.get(s.name) ?? []), { date: a.date, who: nameOf(a.clientId) ?? 'Cliente', amount: amt }]);
      });
    });
    const topServices = spread(svcMap).slice(0, 5);

    /* LE CHIFFRE DE CHAQUE MAISON. L'Atelier MND™ et le Studio ACƆ™ partagent
       une branche, une caisse et un plateau : rien dans le rendez-vous ne dit
       de qui il relève. C'est le catalogue qui le sait — chaque atelier porte
       sa maison — alors on ventile LIGNE À LIGNE, jamais rendez-vous par
       rendez-vous : une visite qui enchaîne un resserrage et des tresses
       nourrit les deux, et trancher pour l'une en déplacerait tout le montant.

       On répartit le NET encaissé (remises comprises) au prorata des prix
       catalogue — la somme des parts égale toujours le net du rendez-vous. */
    const catById = new Map(categories.map((c) => [c.id, c]));
    const partsOf = (a: Appointment): Part[] => {
      const net = apptNetXof(a, byId);
      const poids = a.serviceIds.map((id) => byId.get(id)?.priceXof ?? 0);
      const parts = splitByWeights(net, poids);
      return a.serviceIds.map((id, i) => ({ serviceId: id, amountXof: parts[i] }));
    };
    const revMaison = totalsOf(ritM, partsOf, byId, catById);

    /* LE DÉTAIL DERRIÈRE CHAQUE MONTANT. Un chiffre par maison qu'on ne peut pas
       ouvrir demande de le croire ; celui-ci se justifie visite par visite. Un
       rendez-vous mixte apparaît sous les deux maisons, chacune pour SA part —
       c'est la même règle que le total, montrée. */
    const maisonRows: Record<MaisonBucket, { date: string; who: string; meta: string; amount: number }[]> =
      { atelier: [], studio: [], plateau: [] };
    ritM.forEach((a) => {
      const t = splitByMaison(partsOf(a), byId, catById);
      MAISON_BUCKETS.forEach((m) => {
        if (t[m.k] > 0) {
          maisonRows[m.k].push({
            date: a.date,
            who: nameOf(a.clientId) ?? 'Cliente',
            meta: apptLabel(a, byId),
            amount: t[m.k],
          });
        }
      });
    });
    MAISON_BUCKETS.forEach((m) => maisonRows[m.k].sort((x, y) => y.date.localeCompare(x.date)));

    // Meilleures clientes du mois — factures payées + rituels honorés non facturés
    const cliMap = new Map<string, { value: number; count: number }>();
    invM.forEach((i) => bump(cliMap, i.clientName ?? nameOf(i.clientId) ?? 'Cliente de passage', invoiceTotal(i)));
    ritM.forEach((a) => bump(cliMap, nameOf(a.clientId) ?? 'Cliente', apptNetXof(a, byId)));
    payM.forEach((p) => bump(cliMap, p.who, p.amount));
    const topClients = spread(cliMap).slice(0, 3);

    // Sources itemisées — factures payées + rituels honorés, du plus récent
    const revSources = [
      ...invM.map((i) => ({
        key: `f-${i.id}`,
        date: i.date,
        who: i.clientName ?? nameOf(i.clientId) ?? 'Cliente de passage',
        title: `Facture ${i.number}`,
        mode: i.payment ?? 'Paiement non précisé',
        cashbox: i.cashbox ? cashboxLabel(i.cashbox) : '',
        methodKey: i.payment ?? 'Non précisé',
        cashboxKey: cashboxLabel(i.cashbox),
        amount: invoiceTotal(i),
      })),
      ...ritM.map((a) => ({
        key: `r-${a.id}`,
        date: a.date,
        who: nameOf(a.clientId) ?? 'Cliente',
        title: apptLabel(a, byId),
        mode: ['Rituel honoré', a.master].filter(Boolean).join(' · '),
        cashbox: '',
        methodKey: 'Rituel · carnet',
        cashboxKey: 'Rituels honorés',
        amount: apptNetXof(a, byId),
      })),
      ...payM.map((p) => ({
        key: `af-${p.id}`,
        date: p.iso,
        who: p.who,
        title: `Formation · ${p.formation}`,
        mode: 'Formation · Académie',
        cashbox: 'Académie',
        methodKey: 'Académie · formation',
        cashboxKey: 'Académie · formations',
        amount: p.amount,
      })),
    ].sort((x, y) => (x.date < y.date ? 1 : -1));

    // Dépenses du mois groupées par catégorie, sous-total décroissant
    const expM = liveExp.filter((e) => monthKey(e.date) === month);
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

    // Lignes de dépense aplaties — pour le détail cliquable « Dépenses ».
    const expenseRows = expM
      .map((e) => ({ date: e.date, who: e.label || 'Dépense', meta: [e.category, e.subcategory, e.cashbox ? cashboxLabel(e.cashbox) : ''].filter(Boolean).join(' · '), amount: expenseTotal(e) }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return { revenueOf, expenseOf, series, byCashbox, byMethod, revSources, expenseGroups, expenseRows, topServices, topClients, svcDetail, revMaison, maisonRows };
  }, [invoices, expenses, appts, clients, apprenants, formations, branch.id, month, thisMonth, byId, categories]);

  const monthName = monthLabel(month);
  const revenue = revenueOf(month);
  const spent = expenseOf(month);
  const net = revenue - spent;
  const prevRevenue = revenueOf(prevMonth);
  const prevSpent = expenseOf(prevMonth);
  const prevNet = prevRevenue - prevSpent;
  const margin = revenue > 0 ? Math.round((net / revenue) * 100) : 0;
  const prevMargin = prevRevenue > 0 ? Math.round(((prevRevenue - prevSpent) / prevRevenue) * 100) : 0;

  const prevName = monthLabel(prevMonth);
  const trend = (cur: number, prev: number): { t: string; down: boolean } => {
    if (prev === 0) return { t: 'premier mois suivi', down: false };
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    return { t: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)} % vs ${prevName}`, down: pct < 0 };
  };

  /* — Détail cliquable : chaque montant ouvre la liste des écritures qui le composent — */
  const openDetail = (title: string, rows: { date?: string; who: string; meta?: string; amount: number }[]) =>
    setDetail({ title, rows, total: rows.reduce((s, r) => s + r.amount, 0) });
  const openRevenue = () =>
    openDetail(`Revenus encaissés · ${monthName}`, revSources.map((s) => ({ date: s.date, who: s.who, meta: [s.title, s.mode, s.cashbox].filter(Boolean).join(' · '), amount: s.amount })));
  const openExpenses = () =>
    openDetail(`Dépenses engagées · ${monthName}`, expenseRows.map((e) => ({ date: e.date, who: e.who, meta: e.meta, amount: e.amount })));
  const openResult = () =>
    setDetail({ title: `Résultat net · ${monthName}`, rows: [{ who: 'Revenus encaissés', amount: revenue }, { who: 'Charges & dépenses', amount: -spent }], total: net });
  const openCashbox = (name: string) =>
    openDetail(`Caisse · ${name}`, revSources.filter((s) => s.cashboxKey === name).map((s) => ({ date: s.date, who: s.who, meta: [s.title, s.mode].filter(Boolean).join(' · '), amount: s.amount })));
  const openMethod = (name: string) =>
    openDetail(`Mode de paiement · ${name}`, revSources.filter((s) => s.methodKey === name).map((s) => ({ date: s.date, who: s.who, meta: [s.title, s.cashbox].filter(Boolean).join(' · '), amount: s.amount })));
  const openClient = (name: string) =>
    openDetail(`Cliente · ${name}`, revSources.filter((s) => s.who === name).map((s) => ({ date: s.date, who: s.title, meta: [s.mode, s.cashbox].filter(Boolean).join(' · '), amount: s.amount })));
  const openService = (name: string) =>
    openDetail(`Prestation · ${name}`, (svcDetail.get(name) ?? []).map((d) => ({ date: d.date, who: d.who, meta: name, amount: d.amount })));

  const kpis = [
    { l: `Revenus encaissés · ${monthName}`, v: fmtMoney(revenue, currency), a: 'var(--color-indigo)', col: 'var(--color-indigo)', tr: trend(revenue, prevRevenue), extra: '', on: openRevenue },
    { l: `Dépenses engagées · ${monthName}`, v: fmtMoney(spent, currency), a: 'var(--color-copper)', col: 'var(--color-indigo)', tr: trend(spent, prevSpent), extra: '', on: openExpenses },
    {
      l: `Résultat net · ${monthName}`, v: fmtMoney(net, currency),
      a: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)', col: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)',
      tr: trend(net, prevNet),
      extra: `Marge nette ${margin} %${prevRevenue > 0 ? ` · ${prevMargin} % en ${prevName}` : ''}`,
      on: openResult,
    },
  ];

  // Compte de résultat
  const pnl = [
    { label: 'Chiffre d’affaires encaissé', value: fmtMoney(revenue, currency), strong: true, col: 'var(--color-indigo)', on: openRevenue },
    { label: 'Charges & dépenses', value: `− ${fmtMoney(spent, currency)}`, strong: false, col: 'var(--ink)', on: openExpenses },
    { label: 'Résultat net', value: fmtMoney(net, currency), strong: true, col: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)', on: openResult },
    { label: 'Marge nette', value: `${margin} %`, strong: false, col: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)', on: openResult },
  ];

  const cashMax = Math.max(...byCashbox.map((c) => c.value), 1);
  const cashFills = ['var(--color-indigo)', 'var(--color-copper)', 'var(--indigo-400)', 'var(--copper-400)', 'var(--indigo-300)'];
  const mixTotal = byMethod.reduce((s, m) => s + m.value, 0);
  const topSvcMax = Math.max(...topServices.map((s) => s.value), 1);

  // — Export CSV du mois : lignes de revenus + lignes de dépenses —
  const csvAmt = (xof: number) => convertFromXof(xof, currency).toFixed(2).replace('.', ',');
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Type', 'Date', 'Libellé', 'Cliente / bénéficiaire', 'Mode / catégorie', 'Caisse', `Montant (${currency})`],
      ...revSources.map((s) => ['Revenu', s.date, s.title, s.who, s.mode, s.cashbox, csvAmt(s.amount)]),
      ...expenseGroups.flatMap((g) =>
        g.rows.map((e) => [
          'Dépense', e.date, e.label || 'Dépense', '',
          [g.category, e.subcategory].filter(Boolean).join(' · '), e.cashbox ?? '', csvAmt(expenseTotal(e)),
        ]),
      ),
    ];
    downloadCsv(`synthese-${month}.csv`, rows);
  };

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Finances · Synthèse & résultat</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}>
            Le résultat.
          </h2>
        </div>
        <div className="trf-toolbar" style={{ marginTop: 0 }}>
          <MonthNav month={month} onChange={setMonth} />
          <button className="trf-act" onClick={exportCsv} title="Télécharger les revenus et dépenses du mois en CSV">
            Exporter (CSV)
          </button>
        </div>
      </div>

      <div className="tr-grid tr-grid--3" style={{ marginTop: 24 }}>
        {kpis.map((k) => (
          <div
            className="trf-kpi trf-click"
            key={k.l}
            style={{ '--accent': k.a } as CSSProperties}
            role="button"
            tabIndex={0}
            onClick={k.on}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); k.on(); } }}
            title="Voir le détail"
          >
            <div className="l">{k.l}</div>
            <div className="v" style={{ color: k.col }}>{k.v}</div>
            <div className={`c ${k.tr.down ? '' : 'up'}`}>{k.tr.t}</div>
            {k.extra && <div className="c" style={{ marginTop: 3 }}>{k.extra}</div>}
          </div>
        ))}
      </div>

      {/* Compte de résultat · 6 mois — barres jumelées, mois choisi surligné */}
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
          {series.map((d, i) => d.selected && (
            <rect key={`sel-${d.mk}`} x={padL + i * step + 2} y={4} width={step - 4} height={H - 8} rx={3} fill="var(--color-sable)" />
          ))}
          <line x1={padL} y1={top + plot} x2={W - padL} y2={top + plot} stroke="var(--hairline)" strokeWidth={1} />
          {series.map((d, i) => {
            const cx = padL + i * step + step / 2;
            const bw = Math.min(18, step / 3.2);
            return (
              <g key={d.mk} style={{ cursor: 'pointer' }} onClick={() => setMonth(d.mk)}>
                <rect x={padL + i * step} y={0} width={step} height={H} fill="transparent" />
                <rect x={cx - bw - 2} y={y(d.rev)} width={bw} height={top + plot - y(d.rev)} rx={2} fill="var(--color-indigo)" opacity={d.selected ? 1 : 0.82} />
                <rect x={cx + 2} y={y(d.exp)} width={bw} height={top + plot - y(d.exp)} rx={2} fill="var(--color-copper)" opacity={d.selected ? 1 : 0.82} />
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-sans)" fontWeight={d.selected ? 600 : 400} fill={d.selected ? 'var(--color-copper)' : 'var(--ink-soft)'}>{d.label}</text>
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
            <circle key={d.mk} cx={padL + i * step + step / 2} cy={netY(d.net)} r={d.selected ? 3.4 : 2.6} fill="var(--trf-success)" />
          ))}
        </svg>
      </div>

      <div className="tr-grid tr-grid--2" style={{ marginTop: 18, alignItems: 'start' }}>
        {/* Revenus par caisse */}
        <div className="trf-panel">
          <div className="trf-panel__title">Revenus par caisse · {monthName}</div>
          {byCashbox.length === 0 && <div className="trf-empty">Aucun encaissement en {monthName} pour l’instant.</div>}
          {byCashbox.map((c, i) => (
            <div
              className="trf-linerow trf-click"
              key={c.name}
              role="button"
              tabIndex={0}
              onClick={() => openCashbox(c.name)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCashbox(c.name); } }}
              title={`Voir le détail · ${c.name}`}
            >
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
          <div className="trf-panel__title">Compte de résultat · {monthName}</div>
          {pnl.map((p, i) => (
            <div
              key={p.label}
              className="trf-click"
              role="button"
              tabIndex={0}
              onClick={p.on}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.on(); } }}
              title="Voir le détail"
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '13px 10px', margin: '0 -10px', borderRadius: 4,
                borderBottom: i < pnl.length - 1 ? '1px solid var(--hairline)' : 'none',
              }}
            >
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: p.strong ? 13.5 : 13, fontWeight: p.strong ? 500 : 300, color: 'var(--ink)' }}>{p.label}</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: p.strong ? 22 : 17, color: p.col, fontVariantNumeric: 'tabular-nums' }}>{p.value}</span>
            </div>
          ))}
          <div style={{ marginTop: 14, background: 'var(--color-sable)', borderRadius: 4, padding: '13px 15px', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}>
            {net >= 0
              ? <>La maison dégage <strong style={{ fontWeight: 500, color: 'var(--trf-success)' }}>{fmtMoney(net, currency)}</strong> de résultat en {monthName}. La discipline paie.</>
              : month === thisMonth
                ? <>Le mois est encore jeune : les charges fixes précèdent les encaissements. Le carnet comblera l’écart.</>
                : <>Les charges ont dépassé les encaissements en {monthName} — le détail ci-dessous dit où.</>}
          </div>
        </div>
      </div>

      {/* LE CHIFFRE PAR MAISON. Il ne remplace pas le revenu du mois : il en
          montre l'origine. Le reste — factures, produits, Académie — n'a pas de
          maison à lire (une ligne de facture est du texte libre, pas un rituel
          du catalogue), et se dit en clair plutôt que d'être réparti au jugé. */}
      <div className="trf-panel" style={{ marginTop: 18 }}>
        <div className="trf-panel__title">Chiffre par maison · {monthName}</div>
        {sumTotals(revMaison) === 0 ? (
          <div className="trf-empty">Aucun rituel honoré en {monthName} — rien à ventiler.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, marginTop: 12 }}>
              {MAISON_BUCKETS.map((m) => {
                const part = sumTotals(revMaison) ? Math.round((revMaison[m.k] / sumTotals(revMaison)) * 100) : 0;
                const rows = maisonRows[m.k];
                return (
                  <div
                    key={m.k}
                    className={rows.length ? 'trf-click' : undefined}
                    role={rows.length ? 'button' : undefined}
                    tabIndex={rows.length ? 0 : undefined}
                    title={rows.length ? `Voir les ${rows.length} rituels` : undefined}
                    onClick={() => rows.length && setDetail({ title: `${m.label} · ${monthName}`, rows, total: revMaison[m.k] })}
                    onKeyDown={(e) => {
                      if (rows.length && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setDetail({ title: `${m.label} · ${monthName}`, rows, total: revMaison[m.k] });
                      }
                    }}
                    style={{ minWidth: 150, cursor: rows.length ? 'pointer' : 'default', borderRadius: 4, padding: '4px 6px', margin: '-4px -6px' }}
                  >
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: 22, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtMoney(revMaison[m.k], currency)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                      {part} % des rituels{rows.length ? ` · ${rows.length} visite${rows.length > 1 ? 's' : ''}` : ''}
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', marginTop: 7 }}>
                      <div style={{ width: `${part}%`, height: '100%', borderRadius: 2, background: m.k === 'studio' ? 'var(--color-copper)' : m.k === 'atelier' ? 'var(--color-indigo)' : 'var(--indigo-300)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.55 }}>
              Rituels honorés du mois, ventilés ligne à ligne : une visite mixte nourrit les deux maisons,
              chacune à hauteur de ce qu'elle a fait. « Plateau seul » — les lavages et soins vendus sans
              rituel d'une maison : rien ne permet de les rattacher, on ne devine pas.
              {revenue - sumTotals(revMaison) > 0 && (
                <> S'y ajoutent <strong style={{ fontWeight: 500 }}>{fmtMoney(revenue - sumTotals(revMaison), currency)}</strong> de
                factures, produits et formations, qui ne relèvent d'aucune maison.</>
              )}
            </div>
          </>
        )}
      </div>

      {/* Le podium du mois — prestations, clientes, mix des paiements */}
      <div className="tr-grid tr-grid--3" style={{ marginTop: 18, alignItems: 'start' }}>
        <div className="trf-panel">
          <div className="trf-panel__title">Top prestations · {monthName}</div>
          {topServices.length === 0 && <div className="trf-empty">Aucun rituel honoré en {monthName} — le classement attend ses lauréates.</div>}
          {topServices.map((s, i) => (
            <div
              className="trf-toprow trf-click"
              key={s.name}
              role="button"
              tabIndex={0}
              onClick={() => openService(s.name)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openService(s.name); } }}
              title={`Voir le détail · ${s.name}`}
            >
              <span className="trf-rank">{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="trf-toprow__name">{s.name}</div>
                <div className="trf-bar" style={{ marginTop: 5, height: 4 }}>
                  <div style={{ width: `${Math.round((s.value / topSvcMax) * 100)}%`, background: MIX_FILLS[i % MIX_FILLS.length] }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <div className="trf-toprow__val">{fmtMoney(s.value, currency)}</div>
                <div className="trf-toprow__meta">{s.count} rituel{s.count > 1 ? 's' : ''}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="trf-panel">
          <div className="trf-panel__title">Meilleures clientes · {monthName}</div>
          {topClients.length === 0 && <div className="trf-empty">Aucun encaissement en {monthName} — les têtes couronnées se font attendre.</div>}
          {topClients.map((c, i) => (
            <div
              className="trf-toprow trf-click"
              key={c.name}
              role="button"
              tabIndex={0}
              onClick={() => openClient(c.name)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClient(c.name); } }}
              title={`Voir le détail · ${c.name}`}
            >
              <span className="trf-rank">{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="trf-toprow__name">{c.name}</div>
                <div className="trf-toprow__meta">{c.count} encaissement{c.count > 1 ? 's' : ''}</div>
              </div>
              <span className="trf-toprow__val" style={{ flex: 'none' }}>{fmtMoney(c.value, currency)}</span>
            </div>
          ))}
        </div>

        <div className="trf-panel">
          <div className="trf-panel__title">Modes de paiement · {monthName}</div>
          {byMethod.length === 0 && <div className="trf-empty">Le mix des paiements se dessinera au premier encaissement.</div>}
          {byMethod.length > 0 && (
            <>
              <div className="trf-mixbar" aria-hidden>
                {byMethod.map((m, i) => (
                  <div key={m.name} style={{ width: `${(m.value / mixTotal) * 100}%`, background: MIX_FILLS[i % MIX_FILLS.length] }} title={`${m.name} · ${fmtMoney(m.value, currency)}`} />
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                {byMethod.map((m, i) => (
                  <div
                    className="trf-mixrow trf-click"
                    key={m.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => openMethod(m.name)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMethod(m.name); } }}
                    title={`Voir le détail · ${m.name}`}
                  >
                    <span className="trf-mixrow__dot" style={{ background: MIX_FILLS[i % MIX_FILLS.length] }} />
                    <span className="trf-mixrow__name">{m.name}</span>
                    <span className="trf-mixrow__pct">{mixTotal ? Math.round((m.value / mixTotal) * 100) : 0} %</span>
                    <span className="trf-mixrow__val">{fmtMoney(m.value, currency)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Détail des revenus — sources, mode de paiement, caisse */}
      <div className="trf-panel" style={{ marginTop: 18 }}>
        <div className="trf-detail__head">
          <div className="trf-panel__title" style={{ marginBottom: 0 }}>Détail des revenus · {monthName}</div>
          <button className="trf-iconbtn" onClick={() => setShowRev((v) => !v)}>
            {showRev ? 'Masquer le détail' : 'Voir le détail'} · {fmtMoney(revenue, currency)}
          </button>
        </div>
        {showRev && (
          revSources.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 14 }}>Aucun encaissement en {monthName} — ni facture payée, ni rituel honoré.</div>
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
                    <div className="trf-exprow__meta">{[s.title, s.mode, s.cashbox].filter(Boolean).join(' · ')}</div>
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
          <div className="trf-panel__title" style={{ marginBottom: 0 }}>Détail des dépenses · {monthName}</div>
          <button className="trf-iconbtn" onClick={() => setShowExp((v) => !v)}>
            {showExp ? 'Masquer le détail' : 'Voir le détail'} · {fmtMoney(spent, currency)}
          </button>
        </div>
        {showExp && (
          expenseGroups.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 14 }}>Aucune dépense engagée en {monthName} — la maison tient ses comptes au clair.</div>
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

      {/* Détail cliquable d'un montant — les écritures qui le composent */}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} width={560}>
          {detail.rows.length === 0 ? (
            <div className="trf-empty">Aucune écriture derrière ce montant en {monthName}.</div>
          ) : (
            <div>
              {detail.rows.map((r, idx) => (
                <div className="trf-exprow" key={idx}>
                  {r.date ? <span className="trf-datepill">{fmtDay(r.date)}</span> : <span className="trf-datepill" style={{ visibility: 'hidden' }}>—</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="trf-exprow__vendor">{r.who}</div>
                    {r.meta && <div className="trf-exprow__meta">{r.meta}</div>}
                  </div>
                  <span className="trf-exprow__amt" style={{ color: r.amount < 0 ? 'var(--trf-error)' : undefined }}>{fmtMoney(r.amount, currency)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, paddingTop: 13, borderTop: '1px solid var(--hairline)' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 500, letterSpacing: '0.02em' }}>Total · {detail.rows.length} écriture{detail.rows.length > 1 ? 's' : ''}</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: detail.total < 0 ? 'var(--trf-error)' : 'var(--color-indigo)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(detail.total, currency)}</span>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
