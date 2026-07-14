import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Badge, Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments } from '../../../../shared/agenda';
import { useInvoices, invoiceTotal } from '../../../../shared/finance';
import { useServices } from '../../../../shared/catalog';
import {
  anciennete, ancienneteYears, monthLabel, shortDate, useStaff,
  type StaffMember, type StaffRisk,
} from './data';
import { Bar, DeepNote, Gauge, Pill, Tabs } from './ui';
import { createStore, uid, useStore } from '../../../../shared/store';
import { bindDocument } from '../../../../shared/sync';
import './equipe.css';

type Tab = 'equipe' | 'paie' | 'retention';

/* Avances sur salaire — staffId → liste d'avances. Magasin local à cette route
   (data.ts est en lecture seule) mais synchronisé comme les autres documents. */
type Advance = { id: string; amountXof: number; date: string; note: string };
const advancesStore = createStore<Record<string, Advance[]>>('mnd_salary_advances', {});
bindDocument(advancesStore, 'mnd_salary_advances');
const useAdvances = () => useStore(advancesStore);

/* Taux de commission par palier (%) — pilotés par la maison, 0 au départ. */
type CommRates = { fondation: number; elevation: number; souverainete: number; produits: number };
const DEFAULT_COMM: CommRates = { fondation: 0, elevation: 0, souverainete: 0, produits: 0 };
const commRatesStore = createStore<CommRates>('mnd_commission_rates', DEFAULT_COMM);
bindDocument(commRatesStore, 'mnd_commission_rates');
const useCommRates = () => useStore(commRatesStore);

/* Ajustements manuels par mois + maître : `${AAAA-MM}:${staffId}` → montants forcés. */
type PaieOverride = { commPresta?: number; commProduit?: number; prime?: number };
const overridesStore = createStore<Record<string, PaieOverride>>('mnd_paie_overrides', {});
bindDocument(overridesStore, 'mnd_paie_overrides');
const useOverrides = () => useStore(overridesStore);

/** Mois de paie courant, clé AAAA-MM. */
const payMonth = (): string => new Date().toISOString().slice(0, 7);
const parseXof = (s: string) => Math.max(0, parseInt((s || '').replace(/[^0-9]/g, ''), 10) || 0);

const ROLES = ['Maître fondateur', 'Maître', 'Maîtresse', 'Praticienne', 'Praticien', 'Accueil', 'Gérant·e'];

const riskTone = (r: StaffRisk): 'ok' | 'warn' | 'error' => (r === 'faible' ? 'ok' : r === 'modéré' ? 'warn' : 'error');

type StaffForm = {
  name: string;
  role: string;
  branchId: string;
  phone: string;
  email: string;
  since: string;
  salaire: string;
  auFauteuil: boolean;
};

const emptyForm = (branchId: string): StaffForm => ({
  name: '', role: 'Maîtresse', branchId, phone: '+229 ', email: '', since: new Date().toISOString().slice(0, 10), salaire: '', auFauteuil: true,
});

export default function Personnel() {
  const { branch, branches, currency } = useBranch();
  const [staff, setStaff] = useStaff();
  const [advances, setAdvances] = useAdvances();
  const [tab, setTab] = useState<Tab>('equipe');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(() => emptyForm(branch.id));
  const [paieLancee, setPaieLancee] = useState(false);
  const [avanceFor, setAvanceFor] = useState<StaffMember | null>(null);
  const [avanceForm, setAvanceForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), note: '' });

  /* Commissions — taux, ajustements, et sources (rituels honorés + ventes). */
  const [rates, setRates] = useCommRates();
  const [overrides, setOverrides] = useOverrides();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const [services] = useServices();
  const [adjustFor, setAdjustFor] = useState<StaffMember | null>(null);
  const [adjustForm, setAdjustForm] = useState({ presta: '', produit: '', prime: '' });
  const M = payMonth();

  const team = useMemo(() => staff.filter((m) => m.branchId === branch.id), [staff, branch.id]);

  const advancesFor = (id: string) => advances[id] ?? [];
  const totalAdvances = (id: string) => advancesFor(id).reduce((a, x) => a + x.amountXof, 0);

  /* Commission auto : par maître, sur le mois de paie courant. Prestations =
     rituels honorés × taux du palier (remise appliquée, une série comptée une
     fois). Produits = factures produits qui lui sont attribuées × taux produits. */
  const auto = useMemo(() => {
    const byId = new Map(services.map((s) => [s.id, s]));
    const rate = (p: string) =>
      (p === 'Fondation' ? rates.fondation : p === 'Élévation' ? rates.elevation : rates.souverainete) / 100;
    const linked = new Set<string>();
    for (const a of appts) if (a.invoiceId) linked.add(a.invoiceId);
    const map = new Map<string, { presta: number; produit: number }>();
    for (const m of team) {
      let presta = 0;
      for (const a of appts) {
        if (a.branchId !== branch.id || a.master !== m.name || a.status !== 'honoré') continue;
        if (a.date.slice(0, 7) !== M) continue;
        if (a.seriesIndex && a.seriesIndex > 1) continue;
        const disc = 1 - (a.discountPct ?? 0) / 100;
        for (const id of a.serviceIds) {
          const s = byId.get(id);
          if (s) presta += Math.round(s.priceXof * disc * rate(s.palier));
        }
      }
      let produit = 0;
      for (const i of invoices) {
        if (i.branchId !== branch.id || i.kind !== 'facture' || i.status !== 'payée' || i.master !== m.name) continue;
        if (i.date.slice(0, 7) !== M || linked.has(i.id)) continue;
        if (i.lines.some((l) => l.label.startsWith('Règlement ·'))) continue;
        produit += Math.round(invoiceTotal(i) * (rates.produits / 100));
      }
      map.set(m.id, { presta, produit });
    }
    return map;
  }, [appts, invoices, services, team, rates, branch.id, M]);

  const ovOf = (id: string): PaieOverride => overrides[`${M}:${id}`] ?? {};
  const commPrestaOf = (m: StaffMember) => ovOf(m.id).commPresta ?? auto.get(m.id)?.presta ?? 0;
  const commProduitOf = (m: StaffMember) => ovOf(m.id).commProduit ?? auto.get(m.id)?.produit ?? 0;
  const primeOf = (m: StaffMember) => ovOf(m.id).prime ?? m.primeXof ?? 0;
  const isAdjusted = (m: StaffMember) => {
    const o = ovOf(m.id);
    return o.commPresta != null || o.commProduit != null || o.prime != null;
  };
  const netAVerserEff = (m: StaffMember) => m.salaireXof + commPrestaOf(m) + commProduitOf(m) + primeOf(m);
  const netApresAvances = (m: StaffMember) => netAVerserEff(m) - totalAdvances(m.id);

  const setRate = (k: keyof CommRates, v: string) =>
    setRates((r) => ({ ...r, [k]: Math.max(0, Math.min(100, Math.round(Number(v) || 0))) }));

  const openAdjust = (m: StaffMember) => {
    setAdjustFor(m);
    setAdjustForm({ presta: String(commPrestaOf(m)), produit: String(commProduitOf(m)), prime: String(primeOf(m)) });
  };
  const saveAdjust = () => {
    if (!adjustFor) return;
    setOverrides((prev) => ({
      ...prev,
      [`${M}:${adjustFor.id}`]: {
        commPresta: parseXof(adjustForm.presta),
        commProduit: parseXof(adjustForm.produit),
        prime: parseXof(adjustForm.prime),
      },
    }));
    setAdjustFor(null);
  };
  const resetAdjust = (id: string) =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[`${M}:${id}`];
      return next;
    });

  const openAvance = (m: StaffMember) => {
    setAvanceFor(m);
    setAvanceForm({ amount: '', date: new Date().toISOString().slice(0, 10), note: '' });
  };
  const saveAvance = () => {
    if (!avanceFor) return;
    const amountXof = Math.max(0, parseInt(avanceForm.amount, 10) || 0);
    if (amountXof <= 0) return;
    const adv: Advance = { id: `av-${uid()}`, amountXof, date: avanceForm.date, note: avanceForm.note.trim() };
    const sid = avanceFor.id;
    setAdvances((prev) => ({ ...prev, [sid]: [...(prev[sid] ?? []), adv] }));
    setAvanceFor(null);
  };
  const removeAvance = (staffId: string, advId: string) =>
    setAdvances((prev) => ({ ...prev, [staffId]: (prev[staffId] ?? []).filter((a) => a.id !== advId) }));

  const stats = useMemo(() => {
    const n = team.length;
    const avgYears = n ? team.reduce((a, m) => a + ancienneteYears(m.since), 0) / n : 0;
    const avgSat = n ? team.reduce((a, m) => a + m.satisfaction, 0) / n : 0;
    const risky = team.filter((m) => m.risk === 'élevé').length;
    return { n, avgYears, avgSat, risky };
  }, [team]);

  const payrollTotal = team.reduce((a, m) => a + netApresAvances(m), 0);
  const advancesTotal = team.reduce((a, m) => a + totalAdvances(m.id), 0);

  const openNew = () => { setEditId(null); setForm(emptyForm(branch.id)); setModalOpen(true); };
  const openEdit = (m: StaffMember) => {
    setEditId(m.id);
    setForm({ name: m.name, role: m.role, branchId: m.branchId, phone: m.phone, email: m.email, since: m.since, salaire: String(m.salaireXof), auFauteuil: m.auFauteuil });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    const salaireXof = Math.max(0, parseInt(form.salaire, 10) || 0);
    if (editId) {
      setStaff((prev) => prev.map((m) => m.id === editId
        ? { ...m, name: form.name.trim(), role: form.role, branchId: form.branchId, phone: form.phone.trim(), email: form.email.trim(), since: form.since, salaireXof, auFauteuil: form.auFauteuil }
        : m));
    } else {
      const nm: StaffMember = {
        id: `st-${uid()}`, branchId: form.branchId, name: form.name.trim(), role: form.role,
        phone: form.phone.trim(), email: form.email.trim(), since: form.since, auFauteuil: form.auFauteuil,
        salaireXof, commPrestaXof: 0, commProduitXof: 0, primeXof: 0,
        satisfaction: 0, wellbeing: 80, charge: 0, risk: 'faible',
        riskDrivers: 'Nouvelle recrue — intégration en cours.', nextStep: 'Parcours d’intégration',
        recognition: '—', statut: 'Nouveau',
      };
      setStaff((prev) => [...prev, nm]);
    }
    setModalOpen(false);
  };

  const remove = (id: string) => setStaff((prev) => prev.filter((m) => m.id !== id));

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Équipe & Croissance · les Maîtres"
        title="L’équipe."
        sub={`${branch.name} — celles et ceux qui couronnent, et la maison qui veille sur eux.`}
        actions={<Button variant="copper" onClick={openNew}>+ Ajouter un membre</Button>}
      />

      <Tabs<Tab>
        tabs={[{ k: 'equipe', l: 'Équipe' }, { k: 'paie', l: 'Paie & commissions' }, { k: 'retention', l: 'Rétention & bien-être' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'equipe' && (
        <div>
          <div className="tr-grid tr-grid--4">
            <Card filet="copper" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Effectif</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>{stats.n}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>{team.filter((m) => m.auFauteuil).length} au fauteuil</div>
            </Card>
            <Card filet="indigo" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Ancienneté moyenne</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>
                {stats.n === 0 ? '—' : stats.avgYears >= 1.5 ? `${Math.round(stats.avgYears)} ans` : `${Math.max(1, Math.round(stats.avgYears * 12))} mois`}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>fidélité de l’équipe</div>
            </Card>
            <Card filet="indigo" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Satisfaction clientes</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>{stats.avgSat ? stats.avgSat.toFixed(1).replace('.', ',') : '—'}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>sur 5 · retours des têtes couronnées</div>
            </Card>
            <Card filet="copper" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Risque de départ</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>{stats.risky}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>{stats.risky === 0 ? 'aucune alerte à suivre' : 'alerte à traiter cette semaine'}</div>
            </Card>
          </div>

          <Card style={{ marginTop: 18, overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead>
                  <tr>
                    <th>Membre</th><th>Rôle</th><th>Branche</th><th>Au fauteuil</th><th>Ancienneté</th><th>Salaire · base</th><th>Statut</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span className="tre-avatar">{m.name.slice(0, 1)}</span>
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{m.name}</span>
                        </span>
                      </td>
                      <td className="mnd-muted">{m.role}</td>
                      <td className="mnd-muted">{branch.name}</td>
                      <td>{m.auFauteuil ? <Badge tone="copper">Au fauteuil</Badge> : <Badge>Hors fauteuil</Badge>}</td>
                      <td className="num">{anciennete(m.since)}</td>
                      <td className="num">{fmtMoney(m.salaireXof, currency)}</td>
                      <td><Pill tone={m.statut === 'Présent' ? 'ok' : 'muted'}>{m.statut}</Pill></td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button className="tre-link-btn" onClick={() => openAvance(m)}>Avance sur salaire</button>
                        <button className="tre-link-btn" style={{ marginLeft: 12 }} onClick={() => openEdit(m)}>Modifier</button>
                        <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 12 }} onClick={() => remove(m.id)}>Retirer</button>
                      </td>
                    </tr>
                  ))}
                  {team.length === 0 && (
                    <tr><td colSpan={8} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucun membre dans cette branche — la maison attend ses Maîtres.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'paie' && (
        <div>
          <DeepNote
            eyebrow={`Masse salariale · ${monthLabel()}`}
            actions={
              <Button variant="copper" onClick={() => setPaieLancee(true)}>
                Lancer la paie · Mobile Money
              </Button>
            }
          >
            <span style={{ fontSize: 34 }}>{fmtMoney(payrollTotal, currency)}</span>
          </DeepNote>
          {paieLancee && (
            <div className="tre-inline-note" style={{ marginBottom: 16 }}>
              <span className="mark">✦</span>
              <span>Paie de {monthLabel()} lancée — {team.length} virements Mobile Money programmés.</span>
            </div>
          )}

          <Card style={{ overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead>
                  <tr><th>Maître</th><th>Base</th><th>Comm. prestations</th><th>Comm. produits</th><th>Prime</th><th>Avances</th><th>Net à verser (après avances)</th></tr>
                </thead>
                <tbody>
                  {team.map((m) => {
                    const list = advancesFor(m.id);
                    const adv = totalAdvances(m.id);
                    return (
                    <tr key={m.id}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span className="tre-avatar">{m.name.slice(0, 1)}</span>
                          <span>
                            <span style={{ display: 'block' }}>{m.name}</span>
                            <button className="tre-link-btn" onClick={() => openAdjust(m)}>
                              {isAdjusted(m) ? '● ajusté · modifier' : 'Ajuster comm./prime'}
                            </button>
                          </span>
                        </span>
                      </td>
                      <td className="mnd-muted">{fmtMoney(m.salaireXof, currency)}</td>
                      <td>{fmtMoney(commPrestaOf(m), currency)}</td>
                      <td>{fmtMoney(commProduitOf(m), currency)}</td>
                      <td className="mnd-copper">{fmtMoney(primeOf(m), currency)}</td>
                      <td>
                        {adv > 0 ? (
                          <div className="tre-adv-cell">
                            <span className="tre-adv-total">− {fmtMoney(adv, currency)}</span>
                            <ul className="tre-adv-list">
                              {list.map((a) => (
                                <li key={a.id} className="tre-adv-item">
                                  <span className="tre-adv-amt">− {fmtMoney(a.amountXof, currency)}</span>
                                  <span className="mnd-muted tre-adv-meta">{shortDate(a.date)}{a.note ? ` · ${a.note}` : ''}</span>
                                  <button className="tre-link-btn tre-link-btn--danger tre-adv-rm" onClick={() => removeAvance(m.id, a.id)} aria-label="Retirer l’avance">×</button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <button className="tre-link-btn" onClick={() => openAvance(m)}>+ Avance sur salaire</button>
                        )}
                      </td>
                      <td className="num">{fmtMoney(netApresAvances(m), currency)}</td>
                    </tr>
                    );
                  })}
                  {team.length === 0 && (
                    <tr><td colSpan={7} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucun maître à payer — la paie s’ouvrira avec l’équipe.</td></tr>
                  )}
                  {team.length > 0 && (
                    <tr>
                      <td style={{ fontWeight: 500 }}>Total · {monthLabel()}</td>
                      <td className="mnd-muted">{fmtMoney(team.reduce((a, m) => a + m.salaireXof, 0), currency)}</td>
                      <td>{fmtMoney(team.reduce((a, m) => a + commPrestaOf(m), 0), currency)}</td>
                      <td>{fmtMoney(team.reduce((a, m) => a + commProduitOf(m), 0), currency)}</td>
                      <td className="mnd-copper">{fmtMoney(team.reduce((a, m) => a + primeOf(m), 0), currency)}</td>
                      <td>{advancesTotal > 0 ? <span className="tre-adv-total">− {fmtMoney(advancesTotal, currency)}</span> : '—'}</td>
                      <td className="num">{fmtMoney(payrollTotal, currency)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Taux de commission par palier — pilotés ici, appliqués automatiquement. */}
          <Card style={{ marginTop: 14, padding: '16px 18px' }}>
            <div className="tre-rates__head">
              <span className="tre-rates__title">Commission par palier</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>
                Appliquée automatiquement aux rituels honorés & ventes du mois. 0 % = pas de commission.
              </span>
            </div>
            <div className="tre-rates">
              {([
                ['fondation', 'Fondation'],
                ['elevation', 'Élévation'],
                ['souverainete', 'Souveraineté'],
                ['produits', 'Produits'],
              ] as [keyof CommRates, string][]).map(([k, label]) => (
                <label className="tre-rate" key={k}>
                  <span className="tre-rate__label">{label}</span>
                  <span className="tre-rate__field">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={String(rates[k])}
                      onChange={(e) => setRate(k, e.target.value)}
                      style={{ width: 72, textAlign: 'right' }}
                    />
                    <span className="tre-rate__pct">%</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              « Ajuster comm./prime » sur une ligne force les montants d’un maître pour ce mois ; les primes récompensent la rétention, pas le volume.
            </div>
          </Card>
        </div>
      )}

      {tab === 'retention' && (
        <div>
          <div className="tre-quote" style={{ marginBottom: 18 }}>
            « On ne retient pas un Maître par le salaire seul, mais par la charge juste, la croissance visible et la reconnaissance. La maison veille sur ceux qui couronnent. »
          </div>
          {team.length === 0 && (
            <Card className="tre-empty">
              <div className="tre-empty__title">Personne à veiller pour l’instant.</div>
              <div className="tre-empty__sub">Ajoutez un membre à l’équipe — bien-être, charge et reconnaissance se suivront ici.</div>
            </Card>
          )}
          <div className="tr-grid tr-grid--2">
            {team.map((m) => (
              <Card key={m.id} style={{ padding: '18px 20px', borderLeft: `3px solid ${m.risk === 'élevé' ? '#8f3b30' : m.risk === 'modéré' ? '#c9a227' : 'var(--color-copper)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="tre-avatar" style={{ width: 42, height: 42, fontSize: 17 }}>{m.name.slice(0, 1)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{m.name}</div>
                    <div className="mnd-muted" style={{ fontSize: 11 }}>{anciennete(m.since)} d’ancienneté · {m.role}</div>
                  </div>
                  <Pill tone={riskTone(m.risk)}>Risque {m.risk}</Pill>
                </div>

                <div style={{ display: 'flex', gap: 18, marginTop: 16, alignItems: 'flex-start' }}>
                  <Gauge value={m.wellbeing} label="Bien-être" />
                  <Gauge value={Math.round(m.satisfaction * 20)} label={`Satisfaction ${m.satisfaction ? m.satisfaction.toFixed(1).replace('.', ',') : '—'} / 5`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-soft)' }}>
                      <span>Charge / capacité</span><span>{m.charge} %</span>
                    </div>
                    <div style={{ marginTop: 5 }}><Bar pct={m.charge} fill={m.charge > 90 ? '#c9a227' : 'var(--color-copper)'} /></div>
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.4, fontWeight: 300 }}>{m.riskDrivers}</div>
                  </div>
                </div>

                <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-600)', flex: 'none', width: 96 }}>Croissance</span>
                    <span style={{ fontSize: 12.5 }}>{m.nextStep}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-600)', flex: 'none', width: 96 }}>Reconnaissance</span>
                    <span style={{ fontSize: 12.5 }}>{m.recognition}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <Modal title={editId ? 'Paramètres du membre.' : 'Nouveau membre.'} onClose={() => setModalOpen(false)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom du membre">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Prénom Nom" />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Téléphone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="+229 01 00 00 00 00" />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} inputMode="email" placeholder="prenom@mnd.bj" />
              </Field>
            </div>
            <Field label="Fonction au salon">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ROLES.map((r) => (
                  <button key={r} className={`tre-chip ${form.role === r ? 'is-on' : ''}`} onClick={() => setForm({ ...form, role: r })}>{r}</button>
                ))}
              </div>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Branche">
                <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Date d’entrée">
                <Input type="date" value={form.since} onChange={(e) => setForm({ ...form, since: e.target.value })} />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label={`Salaire de base · ${currency === 'XOF' ? 'F / mois' : 'XOF / mois'}`}>
                <Input value={form.salaire} onChange={(e) => setForm({ ...form, salaire: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric" placeholder="180000" />
              </Field>
              <Field label="Au fauteuil">
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`tre-chip ${form.auFauteuil ? 'is-on' : ''}`} onClick={() => setForm({ ...form, auFauteuil: true })}>Exécute des prestations</button>
                  <button className={`tre-chip ${!form.auFauteuil ? 'is-on' : ''}`} onClick={() => setForm({ ...form, auFauteuil: false })}>Hors fauteuil</button>
                </div>
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={save} disabled={!form.name.trim()}>
                {editId ? 'Enregistrer les modifications' : 'Ajouter à l’équipe'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {avanceFor && (
        <Modal title="Avance sur salaire." onClose={() => setAvanceFor(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Pour <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{avanceFor.name}</strong> · déduite du net à verser de {monthLabel()}.
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label={`Montant · ${currency === 'XOF' ? 'F' : 'XOF'}`}>
                <Input value={avanceForm.amount} onChange={(e) => setAvanceForm({ ...avanceForm, amount: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric" placeholder="50000" />
              </Field>
              <Field label="Date de l’avance">
                <Input type="date" value={avanceForm.date} onChange={(e) => setAvanceForm({ ...avanceForm, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Note (facultatif)">
              <Input value={avanceForm.note} onChange={(e) => setAvanceForm({ ...avanceForm, note: e.target.value })} placeholder="Motif de l’avance…" />
            </Field>
            {totalAdvances(avanceFor.id) > 0 && (
              <div className="tre-inline-note">
                <span className="mark">✦</span>
                <span>Déjà avancé ce mois — {fmtMoney(totalAdvances(avanceFor.id), currency)}.</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setAvanceFor(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveAvance} disabled={!avanceForm.amount || (parseInt(avanceForm.amount, 10) || 0) <= 0}>
                Enregistrer l’avance
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {adjustFor && (
        <Modal title="Ajuster la rémunération." onClose={() => setAdjustFor(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Pour <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{adjustFor.name}</strong> · paie de {monthLabel()}. Les montants saisis remplacent le calcul automatique de ce mois.
            </div>
            <div className="tre-inline-note">
              <span className="mark">✦</span>
              <span>
                Calcul auto : prestations {fmtMoney(auto.get(adjustFor.id)?.presta ?? 0, currency)} · produits {fmtMoney(auto.get(adjustFor.id)?.produit ?? 0, currency)}.
              </span>
            </div>
            <div className="tr-grid tr-grid--3">
              <Field label="Comm. prestations">
                <Input value={adjustForm.presta} inputMode="numeric" onChange={(e) => setAdjustForm({ ...adjustForm, presta: e.target.value.replace(/[^0-9]/g, '') })} />
              </Field>
              <Field label="Comm. produits">
                <Input value={adjustForm.produit} inputMode="numeric" onChange={(e) => setAdjustForm({ ...adjustForm, produit: e.target.value.replace(/[^0-9]/g, '') })} />
              </Field>
              <Field label="Prime">
                <Input value={adjustForm.prime} inputMode="numeric" onChange={(e) => setAdjustForm({ ...adjustForm, prime: e.target.value.replace(/[^0-9]/g, '') })} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
              {isAdjusted(adjustFor) && (
                <button className="tre-link-btn" onClick={() => { resetAdjust(adjustFor.id); setAdjustFor(null); }}>
                  ↺ Revenir au calcul auto
                </button>
              )}
              <Button variant="ghost" onClick={() => setAdjustFor(null)} style={{ marginLeft: 'auto' }}>Annuler</Button>
              <Button variant="copper" onClick={saveAdjust}>Enregistrer</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
