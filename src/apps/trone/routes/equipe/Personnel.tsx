import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Badge, Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import {
  anciennete, ancienneteYears, monthLabel, netAVerser, useStaff,
  type StaffMember, type StaffRisk,
} from './data';
import { Bar, DeepNote, Gauge, Pill, Tabs } from './ui';
import { uid } from '../../../../shared/store';
import './equipe.css';

type Tab = 'equipe' | 'paie' | 'retention';

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
  const [tab, setTab] = useState<Tab>('equipe');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(() => emptyForm(branch.id));
  const [paieLancee, setPaieLancee] = useState(false);

  const team = useMemo(() => staff.filter((m) => m.branchId === branch.id), [staff, branch.id]);

  const stats = useMemo(() => {
    const n = team.length;
    const avgYears = n ? team.reduce((a, m) => a + ancienneteYears(m.since), 0) / n : 0;
    const avgSat = n ? team.reduce((a, m) => a + m.satisfaction, 0) / n : 0;
    const risky = team.filter((m) => m.risk === 'élevé').length;
    return { n, avgYears, avgSat, risky };
  }, [team]);

  const payrollTotal = team.reduce((a, m) => a + netAVerser(m), 0);

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
                {stats.avgYears >= 1.5 ? `${Math.round(stats.avgYears)} ans` : `${Math.max(1, Math.round(stats.avgYears * 12))} mois`}
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
                        <button className="tre-link-btn" onClick={() => openEdit(m)}>Modifier</button>
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
                  <tr><th>Maître</th><th>Base</th><th>Comm. prestations</th><th>Comm. produits</th><th>Prime</th><th>Net à verser</th></tr>
                </thead>
                <tbody>
                  {team.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span className="tre-avatar">{m.name.slice(0, 1)}</span>
                          <span>{m.name}</span>
                        </span>
                      </td>
                      <td className="mnd-muted">{fmtMoney(m.salaireXof, currency)}</td>
                      <td>{fmtMoney(m.commPrestaXof, currency)}</td>
                      <td>{fmtMoney(m.commProduitXof, currency)}</td>
                      <td className="mnd-copper">{fmtMoney(m.primeXof, currency)}</td>
                      <td className="num">{fmtMoney(netAVerser(m), currency)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 500 }}>Total · {monthLabel()}</td>
                    <td className="mnd-muted">{fmtMoney(team.reduce((a, m) => a + m.salaireXof, 0), currency)}</td>
                    <td>{fmtMoney(team.reduce((a, m) => a + m.commPrestaXof, 0), currency)}</td>
                    <td>{fmtMoney(team.reduce((a, m) => a + m.commProduitXof, 0), currency)}</td>
                    <td className="mnd-copper">{fmtMoney(team.reduce((a, m) => a + m.primeXof, 0), currency)}</td>
                    <td className="num">{fmtMoney(payrollTotal, currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <div className="tre-inline-note" style={{ marginTop: 14 }}>
            <span className="mark">✦</span>
            <span>
              Commission par palier — <strong style={{ fontWeight: 500 }}>L’Initiation 15 %</strong> · <strong style={{ fontWeight: 500 }}>L’Affirmation 20 %</strong> · <strong style={{ fontWeight: 500 }}>L’Œuvre 25 %</strong> · produits Care/Store <strong style={{ fontWeight: 500 }}>10 %</strong>. Les primes récompensent la rétention, pas le volume.
            </span>
          </div>
        </div>
      )}

      {tab === 'retention' && (
        <div>
          <div className="tre-quote" style={{ marginBottom: 18 }}>
            « On ne retient pas un Maître par le salaire seul, mais par la charge juste, la croissance visible et la reconnaissance. La maison veille sur ceux qui couronnent. »
          </div>
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
    </div>
  );
}
