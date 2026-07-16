import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments } from '../../../../shared/agenda';
import { useCategories } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useInvoices, invoiceTotal } from '../../../../shared/finance';
import { consultationsQueueStore } from '../../../../shared/bridges';
import { useStore } from '../../../../shared/store';
import { useClientSessions, isOnline, type ClientSession } from '../../../../shared/activity';
import { apptTotalXof, addDaysISO, todayISO, useServicesById } from '../clients/_shared';
import './pilotage.css';

/* Analytics — lecture de tendance. Maison neuve : tout est dérivé des magasins
   réels (carnet, factures, clientes, consultations) — aucun indice fabriqué.
   « L'intelligence a besoin de vécu — les indices apparaîtront avec l'activité. » */

type Period = 'm30' | 'trim' | 'annee';

const PERIOD_DAYS: Record<Period, number> = { m30: 30, trim: 91, annee: 365 };

/** Durée cumulée en clair : « 42 s », « 12 min », « 1 h 05 ». */
function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.max(0, Math.round(sec))} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Écart relatif fin depuis une dernière activité : « à l'instant », « il y a 4 min », « il y a 2 h », « il y a 3 j ». */
function relSeen(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'à l’instant';
  const min = Math.round(s / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

export default function Analytics() {
  const { branch, branches, currency } = useBranch();
  const [appointments] = useAppointments();
  const [invoices] = useInvoices();
  const [clients] = useClients();
  const [categories] = useCategories();
  const [queue] = useStore(consultationsQueueStore);
  const [sessions] = useClientSessions();
  const byId = useServicesById();

  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

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
  const scopedPaidInvoices = useMemo(
    () => invoices.filter((i) => (scope === 'toutes' ? true : i.branchId === scope) && i.kind === 'facture' && i.status === 'payée'),
    [invoices, scope],
  );

  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  const periodStart = addDaysISO(today, -PERIOD_DAYS[period]);

  /* — indices prospectifs : dérivés du vécu de la période, jamais inventés — */
  const life = useMemo(() => {
    const inWindow = scopedAppts.filter((a) => a.date >= periodStart && a.date <= today && a.status !== 'annulé');
    const honored = inWindow.filter((a) => a.status === 'honoré');
    const honoredXof = honored.reduce((s, a) => s + apptTotalXof(a, byId), 0);
    const invXof = scopedPaidInvoices
      .filter((i) => i.date >= periodStart && i.date <= today)
      .reduce((s, i) => s + invoiceTotal(i), 0);
    const revenue = honoredXof + invXof;
    const heads = new Set(inWindow.map((a) => a.clientId)).size;
    const basket = honored.length > 0 ? Math.round(honoredXof / honored.length) : 0;
    const maxTicket = honored.reduce((m, a) => Math.max(m, apptTotalXof(a, byId)), 0);
    return {
      revenue, honoredXof, honoredCount: honored.length, apptCount: inWindow.length,
      heads, basket, maxTicket,
      hasLife: revenue > 0 || inWindow.length > 0,
    };
  }, [scopedAppts, scopedPaidInvoices, byId, periodStart, today]);

  const indices = [
    {
      l: 'Revenu encaissé · période',
      v: life.revenue > 0 ? fmtMoney(life.revenue, currency) : '—',
      cap: life.revenue > 0 ? 'rituels honorés + factures payées' : 'en attente de vécu',
      up: life.revenue > 0,
      a: 'var(--color-copper)',
      pct: life.revenue > 0 ? Math.round((life.honoredXof / life.revenue) * 100) : 0,
    },
    {
      l: 'Rituels honorés',
      v: life.honoredCount > 0 ? String(life.honoredCount) : '—',
      cap: life.apptCount > 0 ? `${life.apptCount} rendez-vous sur la période` : 'le carnet est encore vierge',
      up: false,
      a: 'var(--color-indigo)',
      pct: life.apptCount > 0 ? Math.round((life.honoredCount / life.apptCount) * 100) : 0,
    },
    {
      l: 'Têtes actives',
      v: life.heads > 0 ? String(life.heads) : '—',
      cap: `${scopedClients.length} au carnet de la maison`,
      up: false,
      a: 'var(--copper-600)',
      pct: scopedClients.length > 0 ? Math.min(100, Math.round((life.heads / scopedClients.length) * 100)) : 0,
    },
    {
      l: 'Panier moyen · rituel',
      v: life.basket > 0 ? fmtMoney(life.basket, currency) : '—',
      cap: life.basket > 0 ? 'par rituel honoré' : 'se calculera à l’usage',
      up: false,
      a: 'var(--indigo-400)',
      pct: life.maxTicket > 0 ? Math.round((life.basket / life.maxTicket) * 100) : 0,
    },
  ];

  /* — prévision : rythme du mois × jours restants — */
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
    const total = Array.from(perCat.values()).reduce((s, v) => s + v, 0);
    return {
      hasData: total > 0,
      rows: categories
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c, i) => ({
          name: c.fon,
          pct: total > 0 ? Math.round(((perCat.get(c.id) ?? 0) / total) * 100) : 0,
          fill: ['var(--color-indigo)', 'var(--color-copper)', 'var(--indigo-400)', 'var(--indigo-300)', 'var(--copper-300)', 'var(--color-argile)'][i % 6],
        })),
    };
  }, [scopedAppts, byId, categories]);

  /* — taux de remplissage par maître (fenêtre ± 7 jours, 10 h / jour) — */
  const fillRates = useMemo(() => {
    const masters = scope === 'toutes' ? branches.flatMap((b) => b.masters) : (branches.find((b) => b.id === scope)?.masters ?? []);
    const lo = addDaysISO(today, -7);
    const hi = addDaysISO(today, 7);
    const capacityMin = 15 * 10 * 60; // 15 jours × 10 h d'ouverture
    const booked = new Map<string, number>();
    scopedAppts
      .filter((a) => a.status !== 'annulé' && a.date >= lo && a.date <= hi)
      .forEach((a) => {
        const min = a.serviceIds.reduce((s, id) => s + (byId.get(id)?.durationMin ?? 60), 0);
        booked.set(a.master, (booked.get(a.master) ?? 0) + min);
      });
    return masters
      .map((m) => ({ name: m, pct: Math.min(100, Math.round(((booked.get(m) ?? 0) / capacityMin) * 100)) }))
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
  const hasTransmission = funnel.some((f) => f.n > 0);

  /* — revenu encaissé · 12 mois, dérivé des rituels honorés et des factures payées — */
  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const appt = scopedAppts
        .filter((a) => a.status === 'honoré' && a.date.slice(0, 7) === mk)
        .reduce((s, a) => s + apptTotalXof(a, byId), 0);
      const inv = scopedPaidInvoices
        .filter((x) => x.date.slice(0, 7) === mk)
        .reduce((s, x) => s + invoiceTotal(x), 0);
      return { mk, label: d.toLocaleDateString('fr-FR', { month: 'narrow' }).toUpperCase(), total: appt + inv };
    });
  }, [scopedAppts, scopedPaidInvoices, byId]);
  const yearTotal = monthly.reduce((s, m) => s + m.total, 0);
  const chartMax = Math.max(...monthly.map((m) => m.total), 1);

  /* — Activité des clientes · Ma Couronne : présence & temps sur la plateforme —
     Sessions regroupées par cliente, filtrées au périmètre (branchId de la session). */
  const activity = useMemo(() => {
    const scoped = sessions.filter((s: ClientSession) => (scope === 'toutes' ? true : s.branchId ? s.branchId === scope : true));
    const byClient = new Map<string, ClientSession[]>();
    scoped.forEach((s) => {
      const arr = byClient.get(s.clientId) ?? [];
      arr.push(s);
      byClient.set(s.clientId, arr);
    });
    const rows = Array.from(byClient.entries()).map(([clientId, list]) => {
      const last = list.reduce((a, b) => (b.lastSeenAt > a.lastSeenAt ? b : a));
      return {
        clientId,
        name: list.find((s) => s.clientName)?.clientName ?? clientNameById.get(clientId) ?? 'Cliente',
        online: list.some((s) => isOnline(s)),
        lastSeenAt: last.lastSeenAt,
        screen: last.screen,
        totalSec: list.reduce((sum, s) => sum + s.durationSec, 0),
        count: list.length,
      };
    });
    rows.sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeenAt > a.lastSeenAt ? 1 : b.lastSeenAt < a.lastSeenAt ? -1 : 0));
    const onlineNow = rows.filter((r) => r.online).length;
    const avgSec = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.totalSec, 0) / rows.length) : 0;
    return { rows, onlineNow, avgSec };
  }, [sessions, scope, clientNameById]);

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

      {!life.hasLife && (
        <div className="trp-panel" style={{ marginTop: 18 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            L’intelligence a besoin de vécu — les indices apparaîtront avec l’activité de la maison.
          </div>
        </div>
      )}

      {/* Indices prospectifs, jauges fines — dérivés de la période */}
      <div className="tr-grid tr-grid--4" style={{ marginTop: 18 }}>
        {indices.map((i) => (
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

      {/* Revenu encaissé · 12 mois */}
      <div className="trp-rev" style={{ marginTop: 18, borderRadius: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="trp-rev__eyebrow">Revenu encaissé · 12 mois</div>
            <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 4 }}>
              Rituels honorés et factures payées — la preuve se construit mois après mois.
            </div>
          </div>
        </div>
        {yearTotal > 0 ? (
          <svg viewBox="0 0 480 190" style={{ width: '100%', height: 190, marginTop: 18, display: 'block' }} aria-hidden>
            {monthly.map((m, i) => {
              const x = 10 + i * 39;
              const h = (m.total / chartMax) * 150;
              return (
                <g key={m.mk}>
                  <rect x={x} y={168 - h} width={26} height={Math.max(1, h)} fill={m.total > 0 ? 'var(--color-copper)' : 'rgba(246,241,231,0.10)'} />
                  <text x={x + 13} y={184} textAnchor="middle" fontSize={9} fontFamily="var(--font-sans)" fill="var(--indigo-200)">
                    {m.label}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ padding: '38px 0 26px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--indigo-100)' }}>
            Aucun encaissement encore — le premier rituel honoré posera la première pierre de cette courbe.
          </div>
        )}
        <div className="trp-rev__foot">
          <span>Périmètre · {scope === 'toutes' ? 'toutes les branches' : (branches.find((b) => b.id === scope)?.name ?? '')}</span>
          <span className="trp-rev__best">{yearTotal > 0 ? fmtMoney(yearTotal, currency) : '—'}</span>
        </div>
      </div>

      {/* Mix de services + remplissage */}
      <div className="tr-grid tr-grid--2" style={{ marginTop: 18 }}>
        <div className="trp-panel">
          <div className="trp-panel__title">Mix de services · lexique ™</div>
          {!mix.hasData && (
            <div className="mnd-muted" style={{ fontSize: 13, fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginBottom: 12 }}>
              Le mix se dessinera avec les premiers rituels du carnet.
            </div>
          )}
          {mix.rows.map((x) => (
            <div key={x.name} style={{ marginBottom: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="mnd-serif" style={{ fontSize: 15, color: 'var(--color-indigo)' }}>{x.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{mix.hasData ? `${x.pct} %` : '—'}</span>
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
                <span className="mnd-serif" style={{ fontSize: 17, color: 'var(--color-indigo)' }}>{f.pct > 0 ? `${f.pct} %` : '—'}</span>
              </div>
              <div className="trp-bar" style={{ height: 6, marginTop: 6 }}>
                <div style={{ width: `${f.pct}%`, background: i === 0 ? 'var(--color-copper)' : 'var(--indigo-400)' }} />
              </div>
            </div>
          ))}
          {fillRates.length === 0 && <div className="mnd-muted" style={{ fontSize: 13 }}>Aucun maître sur ce périmètre.</div>}
          {fillRates.length > 0 && fillRates.every((f) => f.pct === 0) && (
            <div className="mnd-muted" style={{ fontSize: 12, fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginTop: 4 }}>
              Les fauteuils attendent leurs premiers rendez-vous — le remplissage se lira ici.
            </div>
          )}
        </div>
      </div>

      {/* Prévision + transmission */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, marginTop: 18, alignItems: 'stretch' }}>
        <div className="trp-panel" style={{ position: 'relative', overflow: 'hidden' }}>
          <span className="trp-kpi__bar" style={{ background: 'var(--indigo-400)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="trp-panel__title" style={{ marginBottom: 0 }}>Prévision · IA souveraine</div>
            <span className="mnd-badge">fin de mois</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
            <span className="mnd-serif" style={{ fontSize: 42, lineHeight: 1, color: 'var(--color-indigo)' }}>
              {forecast > 0 ? fmtMoney(forecast, currency) : '—'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--copper-600)' }}>{forecast > 0 ? 'au rythme réel du carnet' : ''}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 300, color: 'var(--ink-soft)', marginTop: 10, lineHeight: 1.5 }}>
            {forecast > 0
              ? 'Projection au rythme réel du carnet — portée par les rituels confirmés et honorés du mois.'
              : 'La prévision attend les premiers rituels du mois — elle se calcule sur le rythme réel du carnet, jamais sur une hypothèse.'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
            L’humain décide · la maison propose.
          </div>
        </div>

        <div className="trp-obsidian">
          <div className="trp-rev__eyebrow">Le Cercle · transmission</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
            <span className="mnd-serif" style={{ fontSize: 44, lineHeight: 1 }}>{hasTransmission ? funnel[0].n : '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--indigo-100)' }}>{hasTransmission ? 'consultations reçues' : 'têtes apportées / cliente'}</span>
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
            {hasTransmission
              ? `${funnel[1].n} réservation${funnel[1].n > 1 ? 's' : ''} nées de la consultation · ${funnel[2].n} tête${funnel[2].n > 1 ? 's' : ''} fidélisée${funnel[2].n > 1 ? 's' : ''} — le coefficient de transmission se calculera avec la lignée.`
              : 'Le Cercle s’exprimera dès les premières introductions — l’intelligence a besoin de vécu.'}
          </div>
        </div>
      </div>

      {/* Activité des clientes · Ma Couronne — présence temps réel & temps sur la plateforme */}
      <div className="trp-panel" style={{ marginTop: 18 }}>
        <div className="trp-mon__head">
          <div className="trp-panel__title" style={{ marginBottom: 0 }}>Activité des clientes · Ma Couronne</div>
          {activity.rows.length > 0 && (
            <div className="trp-mon__headline">
              <span className="trp-dot is-on" style={{ marginRight: 6 }} />
              {activity.onlineNow > 0
                ? `${activity.onlineNow} en ligne maintenant`
                : 'aucune en ligne'}
              <span className="trp-mon__sep">·</span>
              temps moyen {fmtDuration(activity.avgSec)}
            </div>
          )}
        </div>
        {activity.rows.length === 0 ? (
          <div className="trp-empty">Aucune visite cliente pour l’instant.</div>
        ) : (
          <div className="trp-act">
            {activity.rows.map((r) => (
              <div className="trp-act__row" key={r.clientId}>
                <span className={`trp-dot ${r.online ? 'is-on' : ''}`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="trp-act__name">{r.name}</div>
                  <div className="trp-act__meta">
                    {r.online ? 'En ligne' : relSeen(r.lastSeenAt)}
                    <span className="trp-mon__sep">·</span>
                    {r.screen ?? 'écran inconnu'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="trp-act__time">{fmtDuration(r.totalSec)}</div>
                  <div className="trp-act__meta">{r.count} session{r.count > 1 ? 's' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
