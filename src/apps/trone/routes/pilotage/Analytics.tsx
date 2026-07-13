import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoneyCompact } from '../../../../shared/currency';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useCategories } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { consultationsQueueStore } from '../../../../shared/bridges';
import { useStore } from '../../../../shared/store';
import { apptTotalXof, addDaysISO, todayISO, useServicesById } from '../clients/_shared';
import './pilotage.css';

/* Analytics — lecture de tendance : indices prospectifs, prévision IA, transmission. */

type Period = 'm30' | 'trim' | 'annee';

const INDICES: Record<Period, { l: string; v: string; cap: string; up: boolean; a: string; pct: number }[]> = {
  m30: [
    { l: 'Coefficient de transmission', v: '1,6×', cap: '▲ 0,2 vs période préc.', up: true, a: 'var(--color-copper)', pct: 53 },
    { l: 'Longévité de couronne', v: '13 mois', cap: 'durée moyenne de loc', up: false, a: 'var(--color-indigo)', pct: 54 },
    { l: 'Valeur à vie (LTV)', v: '1,18 M F', cap: 'par tête couronnée', up: false, a: 'var(--copper-600)', pct: 59 },
    { l: 'Revenu récurrent', v: '35 %', cap: '▲ 3 pts', up: true, a: 'var(--indigo-400)', pct: 35 },
  ],
  trim: [
    { l: 'Coefficient de transmission', v: '1,8×', cap: '▲ 0,3 vs an dernier', up: true, a: 'var(--color-copper)', pct: 60 },
    { l: 'Longévité de couronne', v: '14 mois', cap: 'durée moyenne de loc', up: false, a: 'var(--color-indigo)', pct: 58 },
    { l: 'Valeur à vie (LTV)', v: '1,24 M F', cap: 'par tête couronnée', up: false, a: 'var(--copper-600)', pct: 62 },
    { l: 'Revenu récurrent', v: '38 %', cap: '▲ 4 pts', up: true, a: 'var(--indigo-400)', pct: 38 },
  ],
  annee: [
    { l: 'Coefficient de transmission', v: '2,1×', cap: '▲ 0,5 sur 12 mois', up: true, a: 'var(--color-copper)', pct: 70 },
    { l: 'Longévité de couronne', v: '16 mois', cap: 'durée moyenne de loc', up: false, a: 'var(--color-indigo)', pct: 67 },
    { l: 'Valeur à vie (LTV)', v: '1,42 M F', cap: 'par tête couronnée', up: false, a: 'var(--copper-600)', pct: 71 },
    { l: 'Revenu récurrent', v: '41 %', cap: '▲ 6 pts', up: true, a: 'var(--indigo-400)', pct: 41 },
  ],
};

const TRANSMISSION: Record<Period, { coef: string; note: string }> = {
  m30: { coef: '1,6×', note: '58 % des nouvelles têtes couronnées sont arrivées par une introduction du Cercle.' },
  trim: { coef: '1,8×', note: '62 % des nouvelles têtes couronnées sont arrivées par une introduction. Chaque cliente fidèle en transmet près de deux.' },
  annee: { coef: '2,1×', note: '67 % d’acquisition par transmission sur l’année — le Cercle reste le premier moteur, à coût d’acquisition nul.' },
};

/* Revenu par source · 12 mois — milliers de F [Atelier, Care & Store, Académie, Abonnements] */
const MONTHLY: [string, number, number, number, number][] = [
  ['J', 2600, 520, 180, 90], ['F', 2800, 560, 200, 110], ['M', 3100, 640, 220, 130], ['A', 3000, 610, 260, 150],
  ['M', 3300, 720, 280, 170], ['J', 3560, 780, 300, 190], ['J', 3700, 820, 320, 210], ['A', 3900, 860, 340, 230],
  ['S', 4100, 900, 380, 260], ['O', 4300, 960, 400, 290], ['N', 4500, 1020, 430, 320], ['D', 4760, 1080, 470, 360],
];
const LEGEND = [
  ['Atelier', 'var(--indigo-400)'],
  ['Care & Store', 'var(--color-copper)'],
  ['Académie', 'var(--indigo-200)'],
  ['Abonnements', 'var(--copper-200)'],
] as const;

export default function Analytics() {
  const { branch, branches, currency } = useBranch();
  const [appointments] = useAppointments();
  const [clients] = useClients();
  const [categories] = useCategories();
  const [queue] = useStore(consultationsQueueStore);
  const byId = useServicesById();

  const [period, setPeriod] = useState<Period>('trim');
  const [scope, setScope] = useState<string>(branch.id); // id de branche ou 'toutes'

  const scopedAppts = useMemo(
    () => appointments.filter((a) => (scope === 'toutes' ? true : a.branchId === scope)),
    [appointments, scope],
  );
  const scopedClients = useMemo(
    () => clients.filter((c) => (scope === 'toutes' ? true : c.branchId === scope)),
    [clients, scope],
  );

  const today = todayISO();
  const thisMonth = today.slice(0, 7);

  /* — prévision IA : rythme du mois × jours restants — */
  const forecast = useMemo(() => {
    const realized = scopedAppts.filter(
      (a) => a.date.slice(0, 7) === thisMonth && a.date <= today && (a.status === 'honoré' || a.status === 'confirmé'),
    );
    const soFar = realized.reduce((s, a) => s + apptTotalXof(a, byId), 0);
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    return Math.round((soFar / Math.max(1, dayOfMonth)) * daysInMonth);
  }, [scopedAppts, byId, thisMonth, today]);

  /* — mix de services par nomenclature ™ — */
  const mix = useMemo(() => {
    const perCat = new Map<string, number>();
    scopedAppts
      .filter((a) => a.status !== 'annulé')
      .forEach((a) =>
        a.serviceIds.forEach((id) => {
          const sv = byId.get(id);
          if (sv) perCat.set(sv.categoryId, (perCat.get(sv.categoryId) ?? 0) + sv.priceXof);
        }),
      );
    const total = Array.from(perCat.values()).reduce((s, v) => s + v, 0) || 1;
    return categories
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c, i) => ({
        name: c.fon,
        pct: Math.round(((perCat.get(c.id) ?? 0) / total) * 100),
        fill: ['var(--color-indigo)', 'var(--color-copper)', 'var(--indigo-400)', 'var(--indigo-300)', 'var(--copper-300)', 'var(--color-argile)'][i % 6],
      }));
  }, [scopedAppts, byId, categories]);

  /* — taux de remplissage par maître (fenêtre ± 7 jours) — */
  const fillRates = useMemo(() => {
    const masters = scope === 'toutes' ? branches.flatMap((b) => b.masters) : (branches.find((b) => b.id === scope)?.masters ?? []);
    const lo = addDaysISO(today, -7);
    const hi = addDaysISO(today, 7);
    const booked = new Map<string, number>();
    scopedAppts
      .filter((a) => a.status !== 'annulé' && a.date >= lo && a.date <= hi)
      .forEach((a) => {
        const min = a.serviceIds.reduce((s, id) => s + (byId.get(id)?.durationMin ?? 60), 0);
        booked.set(a.master, (booked.get(a.master) ?? 0) + min);
      });
    const max = Math.max(...masters.map((m) => booked.get(m) ?? 0), 1);
    return masters
      .map((m) => {
        const b = booked.get(m) ?? 0;
        return { name: m, pct: b === 0 ? 8 : Math.round(38 + (b / max) * 54) };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [scopedAppts, byId, branches, scope, today]);

  /* — transmission : consultation → réservation → fidélisation — */
  const funnel = useMemo(() => {
    const consultations = queue.length + scopedAppts.filter((a) => a.source === 'consultation').length;
    const reservations = scopedAppts.filter((a) => a.source === 'consultation' && a.status !== 'annulé').length;
    const perClient = new Map<string, number>();
    scopedAppts.filter((a) => a.status !== 'annulé').forEach((a) => perClient.set(a.clientId, (perClient.get(a.clientId) ?? 0) + 1));
    const fideles = scopedClients.filter((c) => (perClient.get(c.id) ?? 0) >= 2).length;
    return [
      { label: 'Consultations', n: consultations },
      { label: 'Réservations', n: reservations },
      { label: 'Fidélisation', n: fideles },
    ];
  }, [queue, scopedAppts, scopedClients]);
  const funnelMax = Math.max(...funnel.map((f) => f.n), 1);

  /* — revenu par source, mis à l'échelle du périmètre — */
  const scale = scope === 'toutes' ? branches.length * 0.7 : scope === branch.id && branch.flagship ? 1 : 0.55;
  const chartMax = Math.max(...MONTHLY.map(([, a, b, c, d]) => a + b + c + d));

  const scopeChips = [
    { id: 'toutes', label: 'Toutes les branches' },
    ...branches.map((b) => ({ id: b.id, label: b.name })),
  ];

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Analytics · Lecture de tendance"
        title="Les tendances."
        actions={
          <Segs<Period>
            options={[
              { value: 'm30', label: '30 jours' },
              { value: 'trim', label: 'Trimestre' },
              { value: 'annee', label: 'Année' },
            ]}
            value={period}
            onChange={setPeriod}
          />
        }
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: -12 }}>
        {scopeChips.map((c) => (
          <button key={c.id} className={`trp-chip ${scope === c.id ? 'is-active' : ''}`} onClick={() => setScope(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Indices prospectifs, jauges fines */}
      <div className="tr-grid tr-grid--4" style={{ marginTop: 18 }}>
        {INDICES[period].map((i) => (
          <div className="trp-index" key={i.l}>
            <span className="trp-kpi__bar" style={{ background: i.a }} />
            <div className="trp-index__label">{i.l}</div>
            <div className="trp-index__value">{i.v}</div>
            <svg viewBox="0 0 100 8" style={{ width: '100%', height: 8, marginTop: 12, display: 'block' }} aria-hidden>
              <line x1="0" y1="4" x2="100" y2="4" stroke="var(--hairline)" strokeWidth="2" />
              <line x1="0" y1="4" x2={i.pct} y2="4" stroke={i.a} strokeWidth="4" strokeLinecap="round" />
            </svg>
            <div className={`trp-index__cap ${i.up ? 'trp-index__cap--up' : ''}`}>{i.cap}</div>
          </div>
        ))}
      </div>

      {/* Revenu par source · 12 mois */}
      <div className="trp-rev" style={{ marginTop: 18, borderRadius: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="trp-rev__eyebrow">Revenu par source · 12 mois</div>
            <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 4 }}>
              La preuve de scale : la part hors-atelier progresse.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {LEGEND.map(([label, fill]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--indigo-100)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: fill }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <svg viewBox="0 0 480 190" style={{ width: '100%', height: 190, marginTop: 18, display: 'block' }} aria-hidden>
          {MONTHLY.map(([m, at, care, acad, abo], i) => {
            const x = 10 + i * 39;
            const parts = [at, care, acad, abo];
            let y = 168;
            return (
              <g key={i}>
                {parts.map((v, j) => {
                  const h = (v / chartMax) * 150;
                  y -= h;
                  return <rect key={j} x={x} y={y} width={26} height={Math.max(1, h - 1)} fill={LEGEND[j][1]} />;
                })}
                <text x={x + 13} y={184} textAnchor="middle" fontSize={9} fontFamily="var(--font-sans)" fill="var(--indigo-200)">
                  {m}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="trp-rev__foot">
          <span>Périmètre · {scope === 'toutes' ? 'toutes les branches' : (branches.find((b) => b.id === scope)?.name ?? '')}</span>
          <span className="trp-rev__best">{fmtMoneyCompact(MONTHLY.reduce((s, [, a, b2, c, d]) => s + (a + b2 + c + d) * 1000, 0) * scale, currency)}</span>
        </div>
      </div>

      {/* Mix de services + remplissage */}
      <div className="tr-grid tr-grid--2" style={{ marginTop: 18 }}>
        <div className="trp-panel">
          <div className="trp-panel__title">Mix de services · lexique ™</div>
          {mix.map((x) => (
            <div key={x.name} style={{ marginBottom: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="mnd-serif" style={{ fontSize: 15, color: 'var(--color-indigo)' }}>{x.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{x.pct} %</span>
              </div>
              <div className="trp-bar" style={{ marginTop: 5 }}>
                <div style={{ width: `${x.pct}%`, background: x.fill }} />
              </div>
            </div>
          ))}
        </div>
        <div className="trp-panel">
          <div className="trp-panel__title">Taux de remplissage · par Maître</div>
          {fillRates.map((f, i) => (
            <div key={f.name} style={{ marginBottom: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{f.name}</span>
                <span className="mnd-serif" style={{ fontSize: 17, color: 'var(--color-indigo)' }}>{f.pct} %</span>
              </div>
              <div className="trp-bar" style={{ height: 6, marginTop: 6 }}>
                <div style={{ width: `${f.pct}%`, background: i === 0 ? 'var(--color-copper)' : 'var(--indigo-400)' }} />
              </div>
            </div>
          ))}
          {fillRates.length === 0 && <div className="mnd-muted" style={{ fontSize: 13 }}>Aucun maître sur ce périmètre.</div>}
        </div>
      </div>

      {/* Prévision IA + transmission */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, marginTop: 18, alignItems: 'stretch' }}>
        <div className="trp-panel" style={{ position: 'relative', overflow: 'hidden' }}>
          <span className="trp-kpi__bar" style={{ background: 'var(--indigo-400)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="trp-panel__title" style={{ marginBottom: 0 }}>Prévision · IA souveraine</div>
            <span className="mnd-badge">fin de mois</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
            <span className="mnd-serif" style={{ fontSize: 42, lineHeight: 1, color: 'var(--color-indigo)' }}>
              {fmtMoneyCompact(forecast, currency)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--copper-600)' }}>fourchette ± 5 %</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 300, color: 'var(--ink-soft)', marginTop: 10, lineHeight: 1.5 }}>
            Projection au rythme réel du carnet — portée par les rituels confirmés et le réassort Care & Store.
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
            L’humain décide · la maison propose.
          </div>
        </div>

        <div className="trp-obsidian">
          <div className="trp-rev__eyebrow">Le Cercle · transmission</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
            <span className="mnd-serif" style={{ fontSize: 44, lineHeight: 1 }}>{TRANSMISSION[period].coef}</span>
            <span style={{ fontSize: 12, color: 'var(--indigo-100)' }}>têtes apportées / cliente</span>
          </div>
          <div style={{ marginTop: 16 }}>
            {funnel.map((f) => (
              <div className="trp-funnel__row" key={f.label}>
                <span className="trp-funnel__label" style={{ color: 'var(--indigo-100)' }}>{f.label}</span>
                <div className="trp-bar" style={{ flex: 1, background: 'rgba(246,241,231,0.14)' }}>
                  <div style={{ width: `${Math.round((f.n / funnelMax) * 100)}%`, background: 'var(--color-copper)' }} />
                </div>
                <span className="trp-funnel__num" style={{ color: 'var(--copper-200)' }}>{f.n}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 300, color: 'var(--indigo-100)', marginTop: 12, lineHeight: 1.5 }}>
            {TRANSMISSION[period].note}
          </div>
        </div>
      </div>
    </div>
  );
}
