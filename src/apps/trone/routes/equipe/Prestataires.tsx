import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { createStore, uid, useStore } from '../../../../shared/store';
import { bindDocument } from '../../../../shared/sync';
import { useStaff as useMyStaff, useAuth } from '../../../../shared/auth';
import { payslipPdf, type PayslipRow } from '../../../../shared/pdf';
import './equipe.css';

/* Prestataires extérieurs — répertoire + missions + paiements confirmés (reçu PDF).
   Ce sont des CHARGES (sous-traitance), distinctes de la paie du personnel. */

type ProviderMode = 'prestation' | 'forfait' | 'pourcentage' | 'horaire';
type Provider = { id: string; branchId: string; name: string; specialty?: string; phone?: string; mode: ProviderMode; rateXof?: number; note?: string; archived?: boolean };
type Mission = { id: string; branchId: string; providerId: string; label: string; date: string; qty?: number; amountXof: number; paidAt?: string; byName?: string; method?: string; note?: string };

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
  const [missionForm, setMissionForm] = useState<{ label: string; date: string; qty: string; amount: string; note: string }>(
    { label: '', date: todayIso(), qty: '1', amount: '', note: '' },
  );
  const [payFor, setPayFor] = useState<Mission | null>(null);
  const [payMethod, setPayMethod] = useState<string>(PAY_METHODS[0]);

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
    setMissionFor(p);
    setMissionForm({ label: '', date: todayIso(), qty: '1', amount: p.mode === 'forfait' && p.rateXof ? String(p.rateXof) : '', note: '' });
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
    setMissions((prev) => [...prev, { id: `ms-${uid()}`, branchId: branch.id, providerId: missionFor.id, label: missionForm.label.trim(), date: missionForm.date, qty, amountXof, note: missionForm.note.trim() || undefined }]);
    setMissionFor(null);
  };
  const removeMission = (id: string) => {
    if (!window.confirm('Retirer cette mission du registre ? Action définitive.')) return;
    setMissions((prev) => prev.filter((m) => m.id !== id));
  };

  /* ---------- Paiement (confirmation signée) ---------- */
  const confirmPayment = () => {
    if (!payFor) return;
    const byName = me?.name?.trim() || session?.user?.email?.split('@')[0] || 'La maison';
    setMissions((prev) => prev.map((m) => (m.id === payFor.id ? { ...m, paidAt: new Date().toISOString(), byName, method: payMethod } : m)));
    setPayFor(null);
  };
  const unpay = (m: Mission) => {
    if (!window.confirm('Annuler la confirmation de paiement de cette mission ?')) return;
    setMissions((prev) => prev.map((x) => (x.id === m.id ? { ...x, paidAt: undefined, byName: undefined, method: undefined } : x)));
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
      houseName: 'Maison MND',
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

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Équipe · Sous-traitance"
        title="Prestataires extérieurs."
        sub="Vos intervenants ponctuels — payés à la prestation ou au forfait. Ce sont des charges, distinctes de la paie du personnel."
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
            return (
              <div className="tre-prov" key={p.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <span className="tre-avatar">{p.name.slice(0, 1)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="tre-prov__name">{p.name}</div>
                    <div className="tre-prov__meta">{MODE_LABEL[p.mode]}{p.rateXof ? ` · ${fmtMoney(p.rateXof, currency)}` : ''}{p.specialty ? ` · ${p.specialty}` : ''}</div>
                  </div>
                </div>
                {due > 0 && <div className="tre-prov__due">À payer · {fmtMoney(due, currency)}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="tre-link-btn" onClick={() => openMission(p)}>+ Mission</button>
                  <button className="tre-link-btn" onClick={() => openEditProvider(p)}>Modifier</button>
                  <button className="tre-link-btn tre-link-btn--danger" onClick={() => archiveProvider(p)}>Archiver</button>
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
        <Modal title="Nouvelle mission." onClose={() => setMissionFor(null)} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Pour <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{missionFor.name}</strong> · {MODE_LABEL[missionFor.mode]}{missionFor.rateXof ? ` · ${fmtMoney(missionFor.rateXof, currency)}` : ''}.
            </div>
            <Field label="Prestation réalisée"><Input value={missionForm.label} onChange={(e) => setMissionForm({ ...missionForm, label: e.target.value })} placeholder="Ex. Tresses — 4 têtes · Shooting gamme" /></Field>
            <div className="tr-grid tr-grid--3">
              {missionFor.mode === 'prestation' && (
                <Field label="Quantité"><Input value={missionForm.qty} inputMode="decimal" onChange={(e) => setMissionQty(missionFor, e.target.value)} /></Field>
              )}
              <Field label={`Montant · ${currency === 'XOF' ? 'F' : 'XOF'}`}><Input value={missionForm.amount} inputMode="numeric" placeholder="0" onChange={(e) => setMissionForm({ ...missionForm, amount: e.target.value.replace(/[^0-9]/g, '') })} /></Field>
              <Field label="Date"><Input type="date" value={missionForm.date} onChange={(e) => setMissionForm({ ...missionForm, date: e.target.value })} /></Field>
            </div>
            <Field label="Note (facultatif)"><Input value={missionForm.note} onChange={(e) => setMissionForm({ ...missionForm, note: e.target.value })} placeholder="Précision…" /></Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setMissionFor(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveMission} disabled={!missionForm.label.trim() || parseXof(missionForm.amount) <= 0}>Enregistrer la mission</Button>
            </div>
          </div>
        </Modal>
      )}

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
