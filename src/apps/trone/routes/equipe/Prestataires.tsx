import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { createStore, uid, useStore } from '../../../../shared/store';
import { bindDocument } from '../../../../shared/sync';
import { expensesStore, expenseCategoriesStore, useCashboxes, cashboxCurrency, type Expense} from '../../../../shared/finance';
import { MontantDuTiroir, montantsDuTiroir } from '../finances/tiroirs';
import { useStaff as useMyStaff, useAuth } from '../../../../shared/auth';
import { payslipPdf, summaryPdf, type PayslipRow, type SummarySection } from '../../../../shared/pdf';
import { maisonNom } from '../../../../shared/identite';
import './equipe.css';

/* Prestataires extérieurs — répertoire + missions + paiements confirmés (reçu PDF).
   Ce sont des CHARGES (sous-traitance), distinctes de la paie du personnel. */

type ProviderMode = 'prestation' | 'forfait' | 'pourcentage' | 'horaire';
type Provider = { id: string; branchId: string; name: string; specialty?: string; phone?: string; mode: ProviderMode; rateXof?: number; note?: string; archived?: boolean };
type Mission = { id: string; branchId: string; providerId: string; label: string; date: string; qty?: number; amountXof: number; paidAt?: string; byName?: string; method?: string; note?: string; expenseId?: string };

const CHARGE_CATEGORY = 'Sous-traitance';

const providersStore = createStore<Provider[]>('mnd_prestataires', []);
bindDocument(providersStore, 'mnd_prestataires');
const missionsStore = createStore<Mission[]>('mnd_prestations', []);
bindDocument(missionsStore, 'mnd_prestations');

const MODE_LABEL: Record<ProviderMode, string> = {
  prestation: 'Par prestation', forfait: 'Forfait', pourcentage: 'Pourcentage', horaire: 'À l’heure / jour',
};
const MODES: [ProviderMode, string][] = [
  ['prestation', 'Par prestation'], ['forfait', 'Forfait'], ['pourcentage', 'Pourcentage'], ['horaire', 'À l’heure / jour'],
];
const PAY_METHODS = ['Mobile Money', 'Espèces', 'Virement', 'Autre'];
const todayIso = () => new Date().toISOString().slice(0, 10);
const parseXof = (s: string) => Math.max(0, parseInt((s || '').replace(/[^0-9]/g, ''), 10) || 0);
const frDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtStamp = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const monthKey = (iso: string) => iso.slice(0, 7);

export default function Prestataires() {
  const { branch, currency } = useBranch();
  const me = useMyStaff();
  const { session } = useAuth();
  const [providers, setProviders] = useStore(providersStore);
  const [missions, setMissions] = useStore(missionsStore);
  const [filter, setFilter] = useState<'a_payer' | 'toutes' | 'payees'>('a_payer');

  const [provModal, setProvModal] = useState(false);
  const [provEditId, setProvEditId] = useState<string | null>(null);
  const [provForm, setProvForm] = useState<{ name: string; specialty: string; phone: string; mode: ProviderMode; rate: string; note: string }>(
    { name: '', specialty: '', phone: '', mode: 'prestation', rate: '', note: '' },
  );
  const [missionFor, setMissionFor] = useState<Provider | null>(null);
  const [missionEditId, setMissionEditId] = useState<string | null>(null);
  const [missionForm, setMissionForm] = useState<{ label: string; date: string; qty: string; amount: string; note: string }>(
    { label: '', date: todayIso(), qty: '1', amount: '', note: '' },
  );
  const [payFor, setPayFor] = useState<Mission | null>(null);
  const [payMethod, setPayMethod] = useState<string>(PAY_METHODS[0]);
  const [providerFor, setProviderFor] = useState<Provider | null>(null);
  const [stmtPeriod, setStmtPeriod] = useState<'mois' | 'annee' | 'tout'>('tout');

  const branchProviders = useMemo(() => providers.filter((p) => p.branchId === branch.id && !p.archived), [providers, branch.id]);
  const branchMissions = useMemo(
    () => missions.filter((m) => m.branchId === branch.id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [missions, branch.id],
  );
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? 'Prestataire';
  const providerOf = (id: string) => providers.find((p) => p.id === id);
  const unpaidOf = (providerId: string) => branchMissions.filter((m) => m.providerId === providerId && !m.paidAt).reduce((a, m) => a + m.amountXof, 0);

  const totalAPayer = branchMissions.filter((m) => !m.paidAt).reduce((a, m) => a + m.amountXof, 0);
  const payeCeMois = branchMissions.filter((m) => m.paidAt && monthKey(m.paidAt.slice(0, 10)) === monthKey(todayIso())).reduce((a, m) => a + m.amountXof, 0);

  const visibleMissions = branchMissions.filter((m) =>
    filter === 'toutes' ? true : filter === 'payees' ? !!m.paidAt : !m.paidAt,
  );

  /* ---------- Prestataires ---------- */
  const openNewProvider = () => { setProvEditId(null); setProvForm({ name: '', specialty: '', phone: '', mode: 'prestation', rate: '', note: '' }); setProvModal(true); };
  const openEditProvider = (p: Provider) => {
    setProvEditId(p.id);
    setProvForm({ name: p.name, specialty: p.specialty ?? '', phone: p.phone ?? '', mode: p.mode, rate: p.rateXof ? String(p.rateXof) : '', note: p.note ?? '' });
    setProvModal(true);
  };
  const saveProvider = () => {
    const name = provForm.name.trim();
    if (!name) return;
    const rateXof = parseXof(provForm.rate) || undefined;
    if (provEditId) {
      setProviders((prev) => prev.map((p) => (p.id === provEditId ? { ...p, name, specialty: provForm.specialty.trim() || undefined, phone: provForm.phone.trim() || undefined, mode: provForm.mode, rateXof, note: provForm.note.trim() || undefined } : p)));
    } else {
      setProviders((prev) => [...prev, { id: `pv-${uid()}`, branchId: branch.id, name, specialty: provForm.specialty.trim() || undefined, phone: provForm.phone.trim() || undefined, mode: provForm.mode, rateXof, note: provForm.note.trim() || undefined }]);
    }
    setProvModal(false);
  };
  const archiveProvider = (p: Provider) => {
    if (!window.confirm(`Archiver le prestataire « ${p.name} » ? Ses missions restent au registre.`)) return;
    setProviders((prev) => prev.map((x) => (x.id === p.id ? { ...x, archived: true } : x)));
  };

  /* ---------- Missions ---------- */
  const openMission = (p: Provider) => {
    setMissionEditId(null);
    setMissionFor(p);
    setMissionForm({ label: '', date: todayIso(), qty: '1', amount: p.mode === 'forfait' && p.rateXof ? String(p.rateXof) : '', note: '' });
  };
  const openEditMission = (m: Mission) => {
    const p = providerOf(m.providerId);
    if (!p) return;
    setMissionEditId(m.id);
    setMissionFor(p);
    setMissionForm({ label: m.label, date: m.date, qty: m.qty ? String(m.qty) : '1', amount: String(m.amountXof), note: m.note ?? '' });
  };
  const setMissionQty = (p: Provider, qtyStr: string) => {
    const qty = qtyStr.replace(/[^0-9.]/g, '');
    const n = parseFloat(qty) || 0;
    setMissionForm((f) => ({ ...f, qty, amount: p.mode === 'prestation' && p.rateXof && n > 0 ? String(Math.round(p.rateXof * n)) : f.amount }));
  };
  const saveMission = () => {
    if (!missionFor) return;
    const amountXof = parseXof(missionForm.amount);
    if (!missionForm.label.trim() || amountXof <= 0) return;
    const qty = parseFloat(missionForm.qty) || undefined;
    const label = missionForm.label.trim();
    const note = missionForm.note.trim() || undefined;
    if (missionEditId) {
      const existing = missions.find((m) => m.id === missionEditId);
      setMissions((prev) => prev.map((m) => (m.id === missionEditId ? { ...m, label, date: missionForm.date, qty, amountXof, note } : m)));
      // Si la mission est déjà payée, on ajuste la charge liée (montant & libellé).
      if (existing?.expenseId) {
        const eid = existing.expenseId;
        expensesStore.set((prev) => prev.map((e) => (e.id === eid ? { ...e, label: `Prestataire · ${missionFor.name}, ${label}`, amountXof } : e)));
      }
    } else {
      setMissions((prev) => [...prev, { id: `ms-${uid()}`, branchId: branch.id, providerId: missionFor.id, label, date: missionForm.date, qty, amountXof, note }]);
    }
    setMissionEditId(null);
    setMissionFor(null);
  };
  const removeMission = (id: string) => {
    const m = missions.find((x) => x.id === id);
    if (!window.confirm('Retirer cette mission du registre ? Action définitive.')) return;
    if (m?.expenseId) expensesStore.set((prev) => prev.filter((e) => e.id !== m.expenseId));
    setMissions((prev) => prev.filter((x) => x.id !== id));
  };

  /* ---------- Paiement (confirmation signée) + charge dans les Dépenses ----------

     LA CHARGE CITE UNE CAISSE, PAS UN MOYEN — 19 août 2026, « quand je paie
     les prestataires, je veux que l'écriture vienne directement en dépenses
     dans Caisse principale ». Le champ `cashbox` recevait le MOYEN de
     règlement (« Espèces », « Mobile Money ») : la dépense montait bien à la
     Synthèse, mais aucune caisse ne la reconnaissait comme sienne — le
     tiroir n'était jamais débité, et l'argent sorti restait compté dedans.
     Le moyen reste sur la mission (le reçu le dit) ; la caisse est choisie
     au paiement, Caisse principale en tête. */
  const [cashboxes] = useCashboxes();
  /* TOUTES LES CAISSES, DEVISES COMPRISES — 22 août 2026. Un prestataire peut
     être payé du tiroir en dollars ; la charge reste en francs à la Synthèse,
     et le tiroir perd des dollars. */
  const caissesMaison = cashboxes.filter((c) => c.branchId === branch.id);
  const caisseParDefaut = (caissesMaison.find((c) => c.name === 'Caisse principale') ?? caissesMaison[0])?.name ?? 'Caisse principale';
  const [payCaisse, setPayCaisse] = useState('');
  const caisseActive = caissesMaison.some((c) => c.name === payCaisse) ? payCaisse : caisseParDefaut;
  const [payDevise, setPayDevise] = useState('');
  const caissePayee = caissesMaison.find((c) => c.name === caisseActive);

  /* LES ÉCRITURES D'AVANT SE RÉPARENT SEULES : une charge de prestataire dont
     la « caisse » est en réalité un moyen de règlement se repointe vers la
     caisse par défaut. Idempotent, et jamais si une vraie caisse portait ce
     nom-là. */
  useEffect(() => {
    if (caissesMaison.length === 0) return;
    const nomsDeCaisses = new Set(cashboxes.map((c) => c.name));
    const egarees = expensesStore.get().filter((e) =>
      e.id.startsWith('exp-ms-') && e.branchId === branch.id
      && PAY_METHODS.includes(e.cashbox) && !nomsDeCaisses.has(e.cashbox));
    if (egarees.length === 0) return;
    const ids = new Set(egarees.map((e) => e.id));
    expensesStore.set((prev) => prev.map((e) => (ids.has(e.id) ? { ...e, cashbox: caisseParDefaut } : e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashboxes, branch.id]);

  const confirmPayment = () => {
    if (!payFor) return;
    const byName = me?.name?.trim() || session?.user?.email?.split('@')[0] || 'La maison';
    const paidAt = new Date().toISOString();
    const expId = `exp-ms-${payFor.id}`;
    const charge: Expense = {
      id: expId,
      branchId: payFor.branchId,
      label: `Prestataire · ${providerName(payFor.providerId)}, ${payFor.label}`,
      amountXof: payFor.amountXof,
      date: paidAt.slice(0, 10),
      cashbox: caisseActive,
      fx: montantsDuTiroir(caissePayee, currency, payDevise, String(payFor.amountXof)).fx,
      category: CHARGE_CATEGORY,
    };
    // La charge remonte dans les Dépenses & la Synthèse (résultat).
    expensesStore.set((prev) => (prev.some((e) => e.id === expId) ? prev.map((e) => (e.id === expId ? charge : e)) : [charge, ...prev]));
    expenseCategoriesStore.set((prev) => (prev.some((c) => c.name === CHARGE_CATEGORY) ? prev : [...prev, { id: 'ec-sous-traitance', name: CHARGE_CATEGORY, subs: [] }]));
    setMissions((prev) => prev.map((m) => (m.id === payFor.id ? { ...m, paidAt, byName, method: payMethod, expenseId: expId } : m)));
    setPayFor(null);
  };
  const unpay = (m: Mission) => {
    if (!window.confirm('Annuler la confirmation de paiement ? La charge correspondante sera retirée des Dépenses.')) return;
    if (m.expenseId) expensesStore.set((prev) => prev.filter((e) => e.id !== m.expenseId));
    setMissions((prev) => prev.map((x) => (x.id === m.id ? { ...x, paidAt: undefined, byName: undefined, method: undefined, expenseId: undefined } : x)));
  };

  /* ---------- Reçu PDF ---------- */
  const pdfMoney = (n: number) => `${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${currency === 'XOF' ? 'F' : currency}`;
  const downloadReceipt = async (m: Mission) => {
    const p = providerOf(m.providerId);
    const rows: PayslipRow[] = [
      { label: m.label, value: pdfMoney(m.amountXof) },
      ...(m.qty && p?.mode === 'prestation' ? [{ label: `— ${m.qty} prestation(s)${p?.rateXof ? ` × ${pdfMoney(p.rateXof)}` : ''}`, value: '', sub: true }] : []),
      ...(m.note ? [{ label: `— ${m.note}`, value: '', sub: true }] : []),
    ];
    await payslipPdf({
      docLabel: 'REÇU DE PAIEMENT',
      partyLabel: 'PRESTATAIRE',
      netLabel: 'MONTANT VERSÉ',
      houseName: maisonNom(),
      houseSub: [branch.name, branch.city].filter(Boolean).join(' · '),
      employeeName: p?.name ?? providerName(m.providerId),
      role: p ? MODE_LABEL[p.mode] + (p.specialty ? ` · ${p.specialty}` : '') : undefined,
      period: frDate(m.date),
      rows,
      net: pdfMoney(m.amountXof),
      paid: m.paidAt ? { line: `Réglé le ${fmtStamp(m.paidAt)}${m.method ? ` · ${m.method}` : ''}`, by: `Confirmé par ${m.byName} · signature électronique enregistrée par Le Trône` } : undefined,
      gerantName: me?.name ?? undefined,
      filename: `recu-${(p?.name ?? 'prestataire').replace(/\s+/g, '-')}-${m.date}.pdf`,
    });
  };

  /* Missions d'un prestataire (récentes d'abord), filtrables par période. */
  const missionsForProvider = (id: string) => branchMissions.filter((m) => m.providerId === id);
  const inPeriod = (iso: string, period: 'mois' | 'annee' | 'tout') => {
    if (period === 'tout') return true;
    if (period === 'mois') return monthKey(iso) === monthKey(todayIso());
    return iso.slice(0, 4) === String(new Date().getFullYear());
  };
  const PERIOD_LABEL: Record<'mois' | 'annee' | 'tout', string> = { mois: 'Ce mois', annee: 'Cette année', tout: 'Tout' };
  const totalsOf = (list: Mission[]) => {
    const total = list.reduce((a, m) => a + m.amountXof, 0);
    const paid = list.filter((m) => m.paidAt).reduce((a, m) => a + m.amountXof, 0);
    return { count: list.length, total, paid, due: total - paid };
  };
  const providerTotals = (id: string) => totalsOf(missionsForProvider(id));
  const downloadStatement = async (p: Provider, period: 'mois' | 'annee' | 'tout') => {
    const list = [...missionsForProvider(p.id)].filter((m) => inPeriod(m.date, period)).reverse(); // chronologique
    const t = totalsOf(list);
    const sections: SummarySection[] = [
      { heading: `Missions · ${list.length}`, rows: list.length
        ? list.map((m) => ({ label: `${frDate(m.date)} · ${m.label}${m.paidAt ? ` · réglé ${m.method ? `(${m.method})` : ''}` : ' · à payer'}`, value: pdfMoney(m.amountXof) }))
        : [{ label: 'Aucune mission sur la période.' }] },
      { heading: 'Total', rows: [
        { label: 'Total des missions', value: pdfMoney(t.total) },
        { label: 'Déjà payé', value: pdfMoney(t.paid) },
        { label: 'Reste à payer', value: pdfMoney(t.due) },
      ] },
    ];
    await summaryPdf({
      eyebrow: `Relevé prestataire · ${PERIOD_LABEL[period]}`,
      title: p.name,
      houseName: maisonNom(),
      meta: [MODE_LABEL[p.mode] + (p.specialty ? ` · ${p.specialty}` : ''), `${branch.name} · ${branch.city}`, `Période · ${PERIOD_LABEL[period]}`],
      sections,
      footer: `Document généré par Le Trône · ${maisonNom()}`,
      filename: `releve-${p.name.replace(/\s+/g, '-')}-${period}.pdf`,
    });
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Équipe · Sous-traitance"
        title="Prestataires extérieurs."
        sub="Vos intervenants ponctuels, payés à la prestation ou au forfait. Chaque paiement confirmé s'inscrit en charge « Sous-traitance » dans les Dépenses et la Synthèse (résultat)."
        actions={<Button variant="copper" onClick={openNewProvider}>+ Prestataire</Button>}
      />

      <div className="tr-grid tr-grid--3" style={{ marginBottom: 18 }}>
        <div className="mnd-stat"><div className="mnd-stat__label">À payer</div><div className="mnd-stat__value" style={{ color: 'var(--color-copper)' }}>{fmtMoney(totalAPayer, currency)}</div></div>
        <div className="mnd-stat"><div className="mnd-stat__label">Payé ce mois</div><div className="mnd-stat__value">{fmtMoney(payeCeMois, currency)}</div></div>
        <div className="mnd-stat"><div className="mnd-stat__label">Prestataires actifs</div><div className="mnd-stat__value">{branchProviders.length}</div></div>
      </div>

      {/* Répertoire */}
      <Card style={{ marginBottom: 18 }}>
        <div className="tre-section-title">Répertoire</div>
        {branchProviders.length === 0 && <div className="mnd-muted" style={{ padding: '10px 0' }}>Aucun prestataire. « + Prestataire » ouvre le premier.</div>}
        <div className="tre-prov-grid">
          {branchProviders.map((p) => {
            const due = unpaidOf(p.id);
            /* LA CARTE RESPIRE — 19 août 2026 : « tout est trop concentré,
               facile d'appuyer un autre bouton ». Trois zones nettes :
               l'identité en tête (le dû en pastille, à droite, où l'œil
               cherche un montant) ; un filet ; puis les gestes en VRAIS
               boutons — le geste du jour (+ Mission) en cuivre, les lectures
               à côté, et l'ARCHIVAGE seul à l'autre bord : un geste qui
               retire ne voisine pas ceux qui servent dix fois par jour. */
            return (
              <div className="tre-prov" key={p.id}>
                <div className="tre-prov__tete">
                  <span className="tre-avatar">{p.name.slice(0, 1)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="tre-prov__name">{p.name}</div>
                    <div className="tre-prov__meta">{MODE_LABEL[p.mode]}{p.rateXof ? ` · ${fmtMoney(p.rateXof, currency)}` : ''}{p.specialty ? ` · ${p.specialty}` : ''}</div>
                  </div>
                  {due > 0 && <span className="tre-prov__due-pill">À payer · {fmtMoney(due, currency)}</span>}
                </div>
                <div className="tre-prov__actions">
                  <button type="button" className="tre-prov__btn tre-prov__btn--copper" onClick={() => openMission(p)}>+ Mission</button>
                  <button type="button" className="tre-prov__btn" onClick={() => setProviderFor(p)}>Détail ({providerTotals(p.id).count})</button>
                  <button type="button" className="tre-prov__btn" onClick={() => openEditProvider(p)}>Modifier</button>
                  <button type="button" className="tre-prov__btn tre-prov__btn--danger" onClick={() => archiveProvider(p)}>Archiver</button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Missions & paiements */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div className="tre-section-title" style={{ margin: 0 }}>Missions & paiements</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['a_payer', 'À payer'], ['payees', 'Payées'], ['toutes', 'Toutes']] as [typeof filter, string][]).map(([k, l]) => (
              <button key={k} className={`tre-chip ${filter === k ? 'is-on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="mnd-scroll-x">
          <table className="tre-table">
            <thead><tr><th>Date</th><th>Prestataire</th><th>Prestation</th><th>Montant</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleMissions.length === 0 && (
                <tr><td colSpan={6} className="mnd-muted" style={{ textAlign: 'center', padding: 26 }}>Aucune mission {filter === 'a_payer' ? 'à payer' : filter === 'payees' ? 'payée' : ''}.</td></tr>
              )}
              {visibleMissions.map((m) => (
                <tr key={m.id}>
                  <td className="mnd-muted" style={{ whiteSpace: 'nowrap' }}>{frDate(m.date)}</td>
                  <td>{providerName(m.providerId)}</td>
                  <td>{m.label}{m.note ? <span className="mnd-muted"> · {m.note}</span> : ''}</td>
                  <td className="num">{fmtMoney(m.amountXof, currency)}</td>
                  <td>
                    {m.paidAt ? (
                      <span className="tre-pay__ok" title={`${m.method ?? ''}`}>✓ Payé · {m.byName}</span>
                    ) : (
                      <span style={{ color: 'var(--color-copper)', fontSize: 12 }}>À payer</span>
                    )}
                  </td>
                  <td>
                    <div className="tre-pay">
                      <button className="tre-link-btn" onClick={() => openEditMission(m)}>Modifier</button>
                      {m.paidAt ? (
                        <>
                          <button className="tre-link-btn" onClick={() => void downloadReceipt(m)}>Reçu PDF</button>
                          <button className="tre-link-btn tre-link-btn--danger" onClick={() => unpay(m)}>↺</button>
                        </>
                      ) : (
                        <button className="tre-link-btn" onClick={() => { setPayMethod(PAY_METHODS[0]); setPayFor(m); }}>Payer</button>
                      )}
                      <button className="tre-link-btn tre-link-btn--danger" onClick={() => removeMission(m.id)} aria-label="Retirer">×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modale prestataire */}
      {provModal && (
        <Modal title={provEditId ? 'Modifier le prestataire.' : 'Nouveau prestataire.'} onClose={() => setProvModal(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="tr-grid tr-grid--2">
              <Field label="Nom"><Input value={provForm.name} onChange={(e) => setProvForm({ ...provForm, name: e.target.value })} placeholder="Ex. Awa · tresseuse" /></Field>
              <Field label="Spécialité"><Input value={provForm.specialty} onChange={(e) => setProvForm({ ...provForm, specialty: e.target.value })} placeholder="Ex. Tresses · Shooting · Formation" /></Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Téléphone"><Input value={provForm.phone} onChange={(e) => setProvForm({ ...provForm, phone: e.target.value })} placeholder={`${branch.dial} `} /></Field>
              <Field label={`Tarif de référence · ${currency === 'XOF' ? 'F' : 'XOF'}`}><Input value={provForm.rate} inputMode="numeric" onChange={(e) => setProvForm({ ...provForm, rate: e.target.value.replace(/[^0-9]/g, '') })} placeholder="0" /></Field>
            </div>
            <Field label="Mode de rémunération">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {MODES.map(([k, label]) => (
                  <button key={k} type="button" className={`tre-chip ${provForm.mode === k ? 'is-on' : ''}`} onClick={() => setProvForm({ ...provForm, mode: k })}>{label}</button>
                ))}
              </div>
            </Field>
            <Field label="Note (facultatif)"><Input value={provForm.note} onChange={(e) => setProvForm({ ...provForm, note: e.target.value })} placeholder="Précision…" /></Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setProvModal(false)}>Annuler</Button>
              <Button variant="copper" onClick={saveProvider} disabled={!provForm.name.trim()}>{provEditId ? 'Enregistrer' : 'Ajouter'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modale mission */}
      {missionFor && (
        <Modal title={missionEditId ? 'Modifier la mission.' : 'Nouvelle mission.'} onClose={() => { setMissionFor(null); setMissionEditId(null); }} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Pour <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{missionFor.name}</strong> · {MODE_LABEL[missionFor.mode]}{missionFor.rateXof ? ` · ${fmtMoney(missionFor.rateXof, currency)}` : ''}.
            </div>
            <Field label="Prestation réalisée"><Input value={missionForm.label} onChange={(e) => setMissionForm({ ...missionForm, label: e.target.value })} placeholder="Ex. Tresses, 4 têtes · Shooting gamme" /></Field>
            <div className="tr-grid tr-grid--3">
              {missionFor.mode === 'prestation' && (
                <Field label="Quantité"><Input value={missionForm.qty} inputMode="decimal" onChange={(e) => setMissionQty(missionFor, e.target.value)} /></Field>
              )}
              <Field label={`Montant · ${currency === 'XOF' ? 'F' : 'XOF'}`}><Input value={missionForm.amount} inputMode="numeric" placeholder="0" onChange={(e) => setMissionForm({ ...missionForm, amount: e.target.value.replace(/[^0-9]/g, '') })} /></Field>
              <Field label="Date"><Input type="date" value={missionForm.date} onChange={(e) => setMissionForm({ ...missionForm, date: e.target.value })} /></Field>
            </div>
            <Field label="Note (facultatif)"><Input value={missionForm.note} onChange={(e) => setMissionForm({ ...missionForm, note: e.target.value })} placeholder="Précision…" /></Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => { setMissionFor(null); setMissionEditId(null); }}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveMission} disabled={!missionForm.label.trim() || parseXof(missionForm.amount) <= 0}>{missionEditId ? 'Enregistrer les modifications' : 'Enregistrer la mission'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Relevé d'un prestataire — toutes ses missions */}
      {providerFor && (() => {
        const list = missionsForProvider(providerFor.id).filter((m) => inPeriod(m.date, stmtPeriod));
        const t = totalsOf(list);
        return (
          <Modal title={`Relevé · ${providerFor.name}`} onClose={() => setProviderFor(null)} width={820}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <div className="mnd-muted" style={{ fontSize: 12.5 }}>
                {MODE_LABEL[providerFor.mode]}{providerFor.rateXof ? ` · ${fmtMoney(providerFor.rateXof, currency)}` : ''}{providerFor.specialty ? ` · ${providerFor.specialty}` : ''}{providerFor.phone ? ` · ${providerFor.phone}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['mois', 'annee', 'tout'] as const).map((k) => (
                    <button key={k} className={`tre-chip ${stmtPeriod === k ? 'is-on' : ''}`} onClick={() => setStmtPeriod(k)}>{PERIOD_LABEL[k]}</button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { openMission(providerFor); setProviderFor(null); }}>+ Mission</Button>
                <Button variant="copper" size="sm" onClick={() => void downloadStatement(providerFor, stmtPeriod)}>Relevé · PDF</Button>
              </div>
            </div>
            <div className="tr-grid tr-grid--3" style={{ marginBottom: 14 }}>
              <div className="mnd-stat"><div className="mnd-stat__label">Total missions</div><div className="mnd-stat__value" style={{ fontSize: 24 }}>{fmtMoney(t.total, currency)}</div></div>
              <div className="mnd-stat"><div className="mnd-stat__label">Déjà payé</div><div className="mnd-stat__value" style={{ fontSize: 24 }}>{fmtMoney(t.paid, currency)}</div></div>
              <div className="mnd-stat"><div className="mnd-stat__label">Reste à payer</div><div className="mnd-stat__value" style={{ fontSize: 24, color: t.due > 0 ? 'var(--color-copper)' : 'var(--color-indigo)' }}>{fmtMoney(t.due, currency)}</div></div>
            </div>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead><tr><th>Date</th><th>Prestation</th><th>Montant</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>
                  {list.length === 0 && <tr><td colSpan={5} className="mnd-muted" style={{ textAlign: 'center', padding: 24 }}>Aucune mission. « + Mission » l'enregistre.</td></tr>}
                  {list.map((m) => (
                    <tr key={m.id}>
                      <td className="mnd-muted" style={{ whiteSpace: 'nowrap' }}>{frDate(m.date)}</td>
                      <td>{m.label}{m.note ? <span className="mnd-muted"> · {m.note}</span> : ''}</td>
                      <td className="num">{fmtMoney(m.amountXof, currency)}</td>
                      <td>{m.paidAt ? <span className="tre-pay__ok" title={fmtStamp(m.paidAt)}>✓ {m.byName}</span> : <span style={{ color: 'var(--color-copper)', fontSize: 12 }}>À payer</span>}</td>
                      <td>
                        <div className="tre-pay">
                          <button className="tre-link-btn" onClick={() => { openEditMission(m); setProviderFor(null); }}>Modifier</button>
                          {m.paidAt
                            ? <button className="tre-link-btn" onClick={() => void downloadReceipt(m)}>Reçu</button>
                            : <button className="tre-link-btn" onClick={() => { setPayMethod(PAY_METHODS[0]); setPayFor(m); setProviderFor(null); }}>Payer</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>
        );
      })()}

      {/* Modale paiement */}
      {payFor && (
        <Modal title="Confirmer le paiement." onClose={() => setPayFor(null)} width={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{providerName(payFor.providerId)}</strong> · {payFor.label} · <strong>{fmtMoney(payFor.amountXof, currency)}</strong>.
              Votre nom et l'horodatage seront enregistrés comme preuve.
            </div>
            <Field label="Moyen de règlement">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PAY_METHODS.map((p) => (
                  <button key={p} type="button" className={`tre-chip ${payMethod === p ? 'is-on' : ''}`} onClick={() => setPayMethod(p)}>{p}</button>
                ))}
              </div>
            </Field>
            {/* D'OÙ SORT L'ARGENT — la caisse débitée par la charge. Sans elle,
                la dépense montait à la Synthèse mais aucun tiroir ne maigrissait. */}
            <Field label="Caisse débitée">
              {caissesMaison.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {caissesMaison.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`tre-chip ${caisseActive === c.name ? 'is-on' : ''}`}
                      onClick={() => setPayCaisse(c.name)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="mnd-muted" style={{ fontSize: 12 }}>
                  Aucune caisse en {currency}, la charge citera « Caisse principale ».
                </span>
              )}
            </Field>
            {/* LA MISSION FIXE SA CHARGE EN FRANCS : ici le tiroir en devise
                se dit en second, pas en premier -- on ne renegocie pas le
                montant convenu de la mission au moment de la payer. */}
            <MontantDuTiroir
              caisse={caissePayee}
              maison={currency}
              valeur={payDevise}
              montantXof={payFor?.amountXof ?? 0}
              onChange={setPayDevise}
              sortant
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setPayFor(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={confirmPayment}>Confirmer le paiement · {fmtMoney(payFor.amountXof, currency)}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
