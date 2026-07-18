import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { Button, Card, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { usePaymentMethods, type PaymentMethod } from '../../../../shared/finance';
import { summaryPdf } from '../../../../shared/pdf';
import { uid } from '../../../../shared/store';
import { ClientPicker } from '../clients/_shared';
import { useFormations, type Formation, type Payment } from './data';
import { Pill, Tabs, Toggle } from './ui';
import {
  enrollmentsStore, useEnrollments, newEnrollment, setEnrollment,
  scoreEnrollment, mentionFor, MENTION_LABEL, sessionValidated, evalPassed, juryTotal,
  canPlanJury, canCertify, nextCertNumber,
  enrollNet, enrollGross, enrollPaid, enrollDue, depositPctOf, depositAmount, depositMet,
  STATUS_LABEL, STATUS_NEXT,
  type Enrollment, type EnrollmentStatus, type Attendance, type SessionEntry,
  type ModuleEvaluation, type PracticeRecord, type JuryReview, type JuryRole,
} from './academy';
import './equipe.css';

/* Académie — Suivi & Certification. La table des apprenants (F2 + statut) et le
   livret F1→F6 avec note finale en direct et délivrance du certificat. */

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const frDate = (iso?: string) => {
  if (!iso) return '—';
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
const nowStamp = () => new Date().toISOString();

const statusTone = (s: EnrollmentStatus): 'ok' | 'warn' | 'error' | 'muted' | 'copper' =>
  s === 'certifie' ? 'ok'
  : s === 'abandonne' || s === 'suspendu' ? 'error'
  : s === 'ajourne' ? 'warn'
  : s === 'jury_planifie' || s === 'en_evaluation' ? 'copper'
  : 'muted';

export default function AcademieSuivi() {
  const [enrollments] = useEnrollments();
  const [formations] = useFormations();
  const [openId, setOpenId] = useState<string | null>(null);
  const [intake, setIntake] = useState(false);
  const [cohort, setCohort] = useState('Toutes');

  const formationName = (id: string) => formations.find((f) => f.id === id)?.name ?? '—';

  const cohorts = useMemo(() => {
    const set = new Set<string>();
    for (const e of enrollments) if (e.cohortLabel) set.add(e.cohortLabel);
    return ['Toutes', ...[...set].sort()];
  }, [enrollments]);

  const rows = enrollments
    .filter((e) => cohort === 'Toutes' || e.cohortLabel === cohort)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const open = enrollments.find((e) => e.id === openId) ?? null;

  return (
    <div>
      <div className="tre-actions-row">
        <Select value={cohort} onChange={(e) => setCohort(e.target.value)} style={{ maxWidth: 240, fontSize: 12 }}>
          {cohorts.map((c) => <option key={c} value={c}>{c === 'Toutes' ? 'Toutes les cohortes' : c}</option>)}
        </Select>
        <Button variant="copper" onClick={() => setIntake(true)} disabled={formations.length === 0}>+ Inscrire un apprenant</Button>
      </div>

      {formations.length === 0 && (
        <Card className="tre-empty">
          <div className="tre-empty__title">Aucune formation au catalogue.</div>
          <div className="tre-empty__sub">Créez d’abord une formation dans l’onglet « Formations » pour inscrire un apprenant.</div>
        </Card>
      )}

      {formations.length > 0 && (
        <Card style={{ overflow: 'hidden' }}>
          <div className="mnd-scroll-x">
            <table className="tre-table">
              <thead>
                <tr><th>Apprenant</th><th>Formation · cohorte</th><th>Statut</th><th>Note finale</th><th>Alertes</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const sc = scoreEnrollment(e);
                  const hasScore = sc.continu !== null || sc.modules !== null || sc.jury !== null;
                  return (
                    <tr key={e.id}>
                      <td>
                        <button className="tre-link-btn" onClick={() => setOpenId(e.id)} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span className="tre-avatar">{e.learnerName.slice(0, 1)}</span>
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{e.learnerName}</span>
                        </button>
                      </td>
                      <td className="mnd-muted">{formationName(e.formationId)}{e.cohortLabel ? ` · ${e.cohortLabel}` : ''}</td>
                      <td><Pill tone={statusTone(e.status)}>{STATUS_LABEL[e.status]}</Pill></td>
                      <td>
                        {e.certificate ? (
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-copper)' }}>{sc.final} / 100</span>
                        ) : hasScore ? (
                          <span className="mnd-muted" style={{ fontSize: 12.5 }}>{sc.final} / 100 <span style={{ opacity: 0.6 }}>· en cours</span></span>
                        ) : <span className="mnd-muted" style={{ fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {e.attendanceAlert && <Pill tone="warn">Assiduité</Pill>}
                          {e.status !== 'certifie' && e.depositPaid === false && <Pill tone="error">Acompte dû</Pill>}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="tre-link-btn" onClick={() => setOpenId(e.id)}>Livret</button>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucun apprenant inscrit sur ce filtre.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {intake && <IntakeModal formations={formations} onClose={() => setIntake(false)} onCreated={(id) => { setIntake(false); setOpenId(id); }} />}
      {open && <LivretPanel key={open.id} enrollment={open} formations={formations} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/* ---------- F2 · Inscription ---------- */
function IntakeModal({ formations, onClose, onCreated }: { formations: Formation[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [formationId, setFormationId] = useState(formations[0]?.id ?? '');
  const [cohortLabel, setCohort] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [clientId, setClientId] = useState('');
  const [depositPaid, setDeposit] = useState(false);

  const save = () => {
    if (!name.trim() || !formationId) return;
    const e = newEnrollment({
      learnerName: name.trim(), formationId,
      cohortLabel: cohortLabel.trim() || undefined,
      startDate: startDate || undefined,
      clientId: clientId || undefined,
      depositPaid,
      status: 'inscrit',
    });
    enrollmentsStore.set((prev) => [e, ...prev]);
    onCreated(e.id);
  };

  return (
    <Modal title="Inscrire un apprenant." onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Nom de l’apprenant·e">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" />
        </Field>
        <div className="tr-grid tr-grid--2">
          <Field label="Formation">
            <Select value={formationId} onChange={(e) => setFormationId(e.target.value)}>
              {formations.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="Cohorte">
            <Input value={cohortLabel} onChange={(e) => setCohort(e.target.value)} placeholder="Fondation · Sept 2026" />
          </Field>
          <Field label="Début de formation">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Acompte 40 % réglé ?">
            <div style={{ paddingTop: 6 }}><Toggle on={depositPaid} onToggle={() => setDeposit((v) => !v)} label={depositPaid ? 'Oui' : 'Pas encore'} /></div>
          </Field>
        </div>
        <Field label="Rattacher une fiche cliente (CRM) — optionnel">
          <ClientPicker value={clientId} onChange={setClientId} placeholder="Rechercher une cliente…" />
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 1 }} onClick={save} disabled={!name.trim() || !formationId}>Inscrire</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Livret F1→F6 ---------- */
type LivretTab = 'f1' | 'scolarite' | 'f3' | 'f4' | 'f5' | 'f6' | 'cert';

function LivretPanel({ enrollment, formations, onClose }: { enrollment: Enrollment; formations: Formation[]; onClose: () => void }) {
  const { branch } = useBranch();
  const [tab, setTab] = useState<LivretTab>('f3');
  const [flash, setFlash] = useState<string | null>(null);
  /* Confirmation brève d'enregistrement — les saisies en place (candidature,
     scolarité) ne changent rien à l'écran, sans ce mot elles semblent sans effet. */
  const notify = (msg: string) => { setFlash(msg); window.setTimeout(() => setFlash((m) => (m === msg ? null : m)), 2400); };
  const e = enrollment; // toujours frais : le parent re-render depuis le store
  const formation = formations.find((f) => f.id === e.formationId);
  const modules = formation?.modules ?? [];
  const sc = scoreEnrollment(e);
  const mention = mentionFor(sc.final);
  const masters = branch.masters;
  /* Garde-fou spec : une inscription suspendue (impayé) ou abandonnée gèle la
     saisie des fiches — on lit le dossier, on n'y écrit plus. */
  const frozen = e.status === 'suspendu' || e.status === 'abandonne';

  const changeStatus = (next: EnrollmentStatus) => {
    if (next === 'jury_planifie' && !canPlanJury(e, modules.length)) {
      window.alert('Impossible : chaque module doit avoir une évaluation validée (≥ 70) avant le jury.');
      return;
    }
    if (next === 'certifie') {
      window.alert('Le statut « Certifié » se pose en délivrant le certificat (onglet Certificat).');
      return;
    }
    let reason: string | undefined;
    if (next === 'abandonne' || next === 'suspendu') {
      reason = window.prompt(`Motif (${STATUS_LABEL[next].toLowerCase()}) :`)?.trim() || undefined;
    }
    setEnrollment(e.id, { status: next, statusReason: reason ?? e.statusReason });
  };

  const nextChoices = STATUS_NEXT[e.status];

  return (
    <Modal title={`Livret · ${e.learnerName}`} onClose={onClose} width={780}>
      {/* En-tête : formation, statut, note finale en direct */}
      <div className="tre-livret-head">
        <div style={{ minWidth: 0 }}>
          <div className="mnd-muted" style={{ fontSize: 11.5 }}>{formation?.name ?? '—'}{e.cohortLabel ? ` · ${e.cohortLabel}` : ''}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <Pill tone={statusTone(e.status)}>{STATUS_LABEL[e.status]}</Pill>
            {nextChoices.length > 0 && (
              <Select value="" onChange={(ev) => { if (ev.target.value) changeStatus(ev.target.value as EnrollmentStatus); }} style={{ fontSize: 11.5, maxWidth: 190 }}>
                <option value="">Faire évoluer →</option>
                {nextChoices.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
            )}
          </div>
          {e.statusReason && <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>Motif : {e.statusReason}</div>}
        </div>
        <div className="tre-livret-score">
          <div className="tre-livret-score__val">{sc.final}<span>/100</span></div>
          <div className="tre-livret-score__mention">{sc.final >= 70 ? MENTION_LABEL[mention] : 'En deçà du seuil'}</div>
          <div className="tre-livret-score__break">
            <span>Continu {sc.continu ?? '—'}</span><span>·</span>
            <span>Modules {sc.modules ?? '—'}</span><span>·</span>
            <span>Jury {sc.jury ?? '—'}</span>
          </div>
          <div className="tre-livret-score__weights">30 % · 30 % · 40 %</div>
        </div>
      </div>

      <Tabs<LivretTab>
        tabs={[
          { k: 'f1', l: 'Candidature' },
          { k: 'scolarite', l: 'Scolarité' },
          { k: 'f3', l: `Séances (${e.sessions.length})` },
          { k: 'f4', l: `Pratique (${e.practice.length})` },
          { k: 'f5', l: `Modules (${e.evaluations.length})` },
          { k: 'f6', l: 'Jury' },
          { k: 'cert', l: 'Certificat' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {flash && <div className="tre-flash">✓ {flash}</div>}

      {frozen && (
        <div className="tre-inline-note" style={{ marginTop: 14 }}>
          <span className="mark">!</span>
          <span>Dossier {e.status === 'suspendu' ? 'suspendu' : 'clos (abandon)'} — la saisie des fiches est gelée. Faites évoluer le statut pour reprendre.</span>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {tab === 'f1' && <TabCandidature e={e} notify={notify} />}
        {tab === 'scolarite' && <TabScolarite e={e} formation={formation} notify={notify} />}
        {tab === 'f3' && <TabSeances e={e} modules={modules} masters={masters} frozen={frozen} />}
        {tab === 'f4' && <TabPratique e={e} masters={masters} frozen={frozen} />}
        {tab === 'f5' && <TabModules e={e} modules={modules} masters={masters} frozen={frozen} />}
        {tab === 'f6' && <TabJury e={e} modules={modules} frozen={frozen} />}
        {tab === 'cert' && <TabCertificat e={e} formation={formation} modules={modules} sc={sc} mention={mention} />}
      </div>
    </Modal>
  );
}

/* ---------- F1 · Candidature (compacte, portée dans le dossier) ---------- */
function TabCandidature({ e, notify }: { e: Enrollment; notify: (m: string) => void }) {
  const [notes, setNotes] = useState(e.interviewNotes ?? '');
  const [obs, setObs] = useState({
    geste: e.observation?.geste != null ? String(e.observation.geste) : '',
    hygiene: e.observation?.hygiene != null ? String(e.observation.hygiene) : '',
    posture: e.observation?.posture != null ? String(e.observation.posture) : '',
  });
  const save = () => {
    setEnrollment(e.id, {
      interviewNotes: notes.trim() || undefined,
      observation: { geste: numOpt(obs.geste), hygiene: numOpt(obs.hygiene), posture: numOpt(obs.posture) },
    });
    notify('Candidature enregistrée.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="tre-sec-label">Entretien de candidature</div>
      <Field label="Notes d’entretien">
        <Textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Compte-rendu de l’entretien…" style={{ minHeight: 80 }} />
      </Field>
      <div>
        <div className="tre-sec-label" style={{ marginBottom: 8 }}>Test d’observation · /5</div>
        <div className="tr-grid tr-grid--3">
          <Field label="Geste"><Input type="number" min={0} max={5} value={obs.geste} onChange={(ev) => setObs({ ...obs, geste: ev.target.value })} /></Field>
          <Field label="Hygiène"><Input type="number" min={0} max={5} value={obs.hygiene} onChange={(ev) => setObs({ ...obs, hygiene: ev.target.value })} /></Field>
          <Field label="Posture"><Input type="number" min={0} max={5} value={obs.posture} onChange={(ev) => setObs({ ...obs, posture: ev.target.value })} /></Field>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="indigo" size="sm" onClick={save}>Enregistrer la candidature</Button>
      </div>
    </div>
  );
}
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
const numOpt = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : undefined; };
const digits = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;

/* ---------- Scolarité · paiements de la formation (suivi manuel) ---------- */
function TabScolarite({ e, formation, notify }: { e: Enrollment; formation?: Formation; notify: (m: string) => void }) {
  const { currency } = useBranch();
  const [methods] = usePaymentMethods();
  // Montant affiché = BRUT (net convenu + remise). Enregistré en net + remise.
  const [gross, setGross] = useState(String(enrollGross(e, formation) || (formation?.priceXof ?? '')));
  const [remise, setRemise] = useState(e.remiseXof ? String(e.remiseXof) : '');

  const saveAmount = () => {
    const g = digits(gross);
    const r = Math.min(g, digits(remise));
    setEnrollment(e.id, { priceXof: Math.max(0, g - r), remiseXof: r || undefined });
    notify('Montant de la scolarité enregistré.');
  };

  const net = enrollNet(e, formation);
  const paid = enrollPaid(e);
  const due = enrollDue(e, formation);
  const pct = depositPctOf(formation);
  const dep = depositAmount(e, formation);
  const depOk = depositMet(e, formation);

  const addPayment = (p: Payment) => {
    const payments = [...(e.payments ?? []), p];
    const totalPaid = payments.reduce((s, x) => s + x.amountXof, 0);
    setEnrollment(e.id, { payments, depositPaid: net > 0 && totalPaid >= dep });
    notify(`Règlement de ${fmtMoney(p.amountXof, currency)} enregistré.`);
  };
  const removePayment = (id: string) => {
    const payments = (e.payments ?? []).filter((x) => x.id !== id);
    const totalPaid = payments.reduce((s, x) => s + x.amountXof, 0);
    setEnrollment(e.id, { payments, depositPaid: net > 0 && totalPaid >= dep });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Montant & remise */}
      <div>
        <div className="tre-sec-label" style={{ marginBottom: 8 }}>Montant de la formation</div>
        <div className="tr-grid tr-grid--2">
          <Field label="Montant (F CFA)"><Input inputMode="numeric" value={gross} onChange={(ev) => setGross(ev.target.value)} placeholder={String(formation?.priceXof ?? '250 000')} /></Field>
          <Field label="Remise accordée (F CFA)"><Input inputMode="numeric" value={remise} onChange={(ev) => setRemise(ev.target.value)} placeholder="0" /></Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="indigo" size="sm" onClick={saveAmount}>Enregistrer le montant</Button>
        </div>
      </div>

      {/* Récapitulatif */}
      <div className="tre-pay-recap">
        <div className="tre-pay-recap__line"><span className="mnd-muted">Net convenu</span><span>{fmtMoney(net, currency)}</span></div>
        <div className="tre-pay-recap__line"><span className="mnd-muted">Acompte attendu · {pct} %</span><span>{fmtMoney(dep, currency)} {depOk ? '· couvert ✓' : ''}</span></div>
        <div className="tre-pay-recap__line"><span className="mnd-muted">Réglé</span><span>{fmtMoney(paid, currency)}</span></div>
        <div className="tre-pay-recap__line tre-pay-recap__reste"><span>Reste à payer</span><span>{fmtMoney(due, currency)}</span></div>
      </div>

      {/* Règlements */}
      <div>
        <div className="tre-sec-label" style={{ marginBottom: 8 }}>Règlements</div>
        {(e.payments ?? []).length === 0 && <div className="mnd-muted" style={{ fontSize: 12.5, fontStyle: 'italic' }}>Aucun règlement enregistré.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(e.payments ?? []).map((p) => (
            <div key={p.id} className="tre-pay-summary__pay" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span className="mnd-muted" style={{ fontSize: 12 }}>{p.date}{p.method ? ` · ${p.method}` : ''}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>{fmtMoney(p.amountXof, currency)}</span>
                <button className="tre-link-btn tre-link-btn--danger" onClick={() => removePayment(p.id)}>Retirer</button>
              </span>
            </div>
          ))}
        </div>
        <PaymentForm methods={methods} due={due} onAdd={addPayment} />
      </div>
    </div>
  );
}

function PaymentForm({ methods, due, onAdd }: { methods: PaymentMethod[]; due: number; onAdd: (p: Payment) => void }) {
  const { currency } = useBranch();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? 'MTN MoMo');
  const add = (fill?: number) => {
    const amt = fill != null ? fill : digits(amount);
    if (amt <= 0) return;
    onAdd({ id: `pay-${uid()}`, amountXof: amt, date: frDate(date), method });
    setAmount('');
  };
  return (
    <div className="tre-fiche tre-fiche--form" style={{ marginTop: 10 }}>
      <div className="tr-grid tr-grid--3">
        <Field label="Montant (F CFA)"><Input inputMode="numeric" value={amount} onChange={(ev) => setAmount(ev.target.value)} placeholder="Ex. 100 000" /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} /></Field>
        <Field label="Moyen"><Select value={method} onChange={(ev) => setMethod(ev.target.value as PaymentMethod)}>{methods.map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        {due > 0 && <Button variant="ghost" size="sm" onClick={() => add(due)}>Solder le reste ({fmtMoney(due, currency)})</Button>}
        <Button variant="copper" size="sm" style={{ marginLeft: 'auto' }} onClick={() => add()}>Enregistrer le règlement</Button>
      </div>
    </div>
  );
}

/* ---------- F3 · Séances ---------- */
const ATTENDANCE: { k: Attendance; l: string }[] = [
  { k: 'present', l: 'Présent' }, { k: 'retard', l: 'Retard' }, { k: 'absent_justifie', l: 'Absent justifié' }, { k: 'absent', l: 'Absent' },
];

function TabSeances({ e, modules, masters, frozen }: { e: Enrollment; modules: string[]; masters: string[]; frozen: boolean }) {
  const [adding, setAdding] = useState(false);
  const sign = (id: string, field: 'trainerSignedAt' | 'learnerAckAt') =>
    setEnrollment(e.id, { sessions: e.sessions.map((s) => (s.id === id ? { ...s, [field]: nowStamp() } : s)) });
  const remove = (id: string) =>
    setEnrollment(e.id, { sessions: e.sessions.filter((s) => s.id !== id) });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {e.sessions.length === 0 && <div className="mnd-muted" style={{ fontSize: 12.5, fontStyle: 'italic' }}>Aucune séance saisie.</div>}
      {[...e.sessions].sort((a, b) => a.sessionNumber - b.sessionNumber).map((s) => (
        <div key={s.id} className="tre-fiche">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>
              Séance {s.sessionNumber}{s.moduleIndex != null && modules[s.moduleIndex] ? ` · ${modules[s.moduleIndex]}` : ''}
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5 }}>{frDate(s.scheduledAt)}</div>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 12 }}>
            {s.attendance && <span>Présence : <b>{ATTENDANCE.find((a) => a.k === s.attendance)?.l}</b></span>}
            {typeof s.technicalScore === 'number' && <span>Note : <b>{s.technicalScore}/20</b></span>}
            <span className={sessionValidated(s) ? 'tre-ok' : 'mnd-muted'}>{sessionValidated(s) ? 'Fiche signée (formateur)' : 'Non signée'}</span>
            {s.learnerAckAt && <span className="tre-ok">Visa apprenant</span>}
          </div>
          {s.trainerNotes && <div className="mnd-muted" style={{ fontSize: 12, marginTop: 6 }}>{s.trainerNotes}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {!sessionValidated(s) && <button className="tre-link-btn" onClick={() => sign(s.id, 'trainerSignedAt')}>Signer (formateur)</button>}
            {sessionValidated(s) && !s.learnerAckAt && <button className="tre-link-btn" onClick={() => sign(s.id, 'learnerAckAt')}>Viser (apprenant)</button>}
            <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 'auto' }} onClick={() => remove(s.id)}>Retirer</button>
          </div>
        </div>
      ))}
      {!frozen && (adding ? (
        <SessionForm e={e} modules={modules} masters={masters} onDone={() => setAdding(false)} />
      ) : (
        <button className="tre-addline" onClick={() => setAdding(true)}>+ Ajouter une séance (F3)</button>
      ))}
    </div>
  );
}

function SessionForm({ e, modules, masters, onDone }: { e: Enrollment; modules: string[]; masters: string[]; onDone: () => void }) {
  const nextNo = (e.sessions.reduce((m, s) => Math.max(m, s.sessionNumber), 0)) + 1;
  const [scheduledAt, setDate] = useState(todayISO());
  const [moduleIndex, setModule] = useState<string>('');
  const [trainer, setTrainer] = useState(masters[0] ?? '');
  const [attendance, setAtt] = useState<Attendance>('present');
  const [score, setScore] = useState('');
  const [objectives, setObj] = useState('');
  const [notes, setNotes] = useState('');

  const save = (sign: boolean) => {
    const s: SessionEntry = {
      id: `ses-${uid()}`, sessionNumber: nextNo, scheduledAt,
      moduleIndex: moduleIndex === '' ? undefined : Number(moduleIndex),
      trainer: trainer || undefined, attendance,
      technicalScore: score === '' ? undefined : Math.max(0, Math.min(20, num(score))),
      objectives: objectives.trim() || undefined, trainerNotes: notes.trim() || undefined,
      trainerSignedAt: sign ? nowStamp() : undefined,
    };
    const sessions = [...e.sessions, s];
    // Garde-fou spec : 3 absences non justifiées → alerte d'assiduité.
    const unjustified = sessions.filter((x) => x.attendance === 'absent').length;
    setEnrollment(e.id, {
      sessions,
      attendanceAlert: unjustified >= 3 ? true : e.attendanceAlert,
      status: e.status === 'inscrit' ? 'en_formation' : e.status,
    });
    onDone();
  };

  return (
    <div className="tre-fiche tre-fiche--form">
      <div className="tre-sec-label" style={{ marginBottom: 10 }}>Nouvelle séance · F3</div>
      <div className="tr-grid tr-grid--2">
        <Field label="Date"><Input type="date" value={scheduledAt} onChange={(ev) => setDate(ev.target.value)} /></Field>
        <Field label="Module">
          <Select value={moduleIndex} onChange={(ev) => setModule(ev.target.value)}>
            <option value="">— (hors module)</option>
            {modules.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Formateur">
          <Select value={trainer} onChange={(ev) => setTrainer(ev.target.value)}>
            <option value="">—</option>
            {masters.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Présence">
          <Select value={attendance} onChange={(ev) => setAtt(ev.target.value as Attendance)}>
            {ATTENDANCE.map((a) => <option key={a.k} value={a.k}>{a.l}</option>)}
          </Select>
        </Field>
        <Field label="Note technique · /20"><Input type="number" min={0} max={20} value={score} onChange={(ev) => setScore(ev.target.value)} placeholder="—" /></Field>
        <Field label="Objectifs"><Input value={objectives} onChange={(ev) => setObj(ev.target.value)} placeholder="Objectifs de la séance" /></Field>
      </div>
      <Field label="Observations / gestes à retravailler">
        <Textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} style={{ minHeight: 60 }} />
      </Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <Button variant="ghost" size="sm" onClick={onDone}>Annuler</Button>
        <Button variant="ghost" size="sm" onClick={() => save(false)}>Enregistrer (brouillon)</Button>
        <Button variant="copper" size="sm" style={{ marginLeft: 'auto' }} onClick={() => save(true)}>Enregistrer & signer</Button>
      </div>
    </div>
  );
}

/* ---------- F4 · Pratique client ---------- */
const PRACTICE_ROLES: { k: PracticeRecord['role']; l: string }[] = [
  { k: 'observation', l: 'Observation' }, { k: 'assiste', l: 'Assisté' }, { k: 'autonome_supervise', l: 'Autonome supervisé' },
];

function TabPratique({ e, masters, frozen }: { e: Enrollment; masters: string[]; frozen: boolean }) {
  const [adding, setAdding] = useState(false);
  const remove = (id: string) => setEnrollment(e.id, { practice: e.practice.filter((p) => p.id !== id) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mnd-muted" style={{ fontSize: 11.5, fontStyle: 'italic' }}>Pratique sur cliente réelle du Carnet — supervisée, documentée pour la Maison.</div>
      {e.practice.length === 0 && <div className="mnd-muted" style={{ fontSize: 12.5, fontStyle: 'italic' }}>Aucune pratique enregistrée.</div>}
      {e.practice.map((p) => (
        <div key={p.id} className="tre-fiche">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{p.clientName || 'Cliente'} · {p.serviceCode}</div>
            <span className="mnd-muted" style={{ fontSize: 11.5 }}>{frDate(p.practicedAt)}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12 }}>
            <span>{PRACTICE_ROLES.find((r) => r.k === p.role)?.l}</span>
            {p.supervisor && <span className="mnd-muted">superviseur : {p.supervisor}</span>}
            {p.supervisorValidation && <span className={p.supervisorValidation === 'acquise' ? 'tre-ok' : 'tre-warn'}>{p.supervisorValidation === 'acquise' ? 'Acquise' : 'À refaire'}</span>}
            {p.clientRating != null && <span>Cliente : {p.clientRating}/5</span>}
          </div>
          <div style={{ display: 'flex', marginTop: 8 }}>
            <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 'auto' }} onClick={() => remove(p.id)}>Retirer</button>
          </div>
        </div>
      ))}
      {!frozen && (adding ? <PracticeForm e={e} masters={masters} onDone={() => setAdding(false)} /> : <button className="tre-addline" onClick={() => setAdding(true)}>+ Ajouter une pratique (F4)</button>)}
    </div>
  );
}

function PracticeForm({ e, masters, onDone }: { e: Enrollment; masters: string[]; onDone: () => void }) {
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [serviceCode, setService] = useState('VÈKPÈ™');
  const [role, setRole] = useState<PracticeRecord['role']>('assiste');
  const [supervisor, setSup] = useState(masters[0] ?? '');
  const [rating, setRating] = useState('');
  const [validation, setVal] = useState<PracticeRecord['supervisorValidation']>('acquise');
  const [grid, setGrid] = useState({ preparation: '', geste: '', tension: '', finition: '', temps: '' });

  const save = () => {
    const p: PracticeRecord = {
      id: `pra-${uid()}`, clientId, clientName: clientName || undefined, serviceCode,
      practicedAt: todayISO(), role, supervisor: supervisor || undefined,
      technicalGrid: {
        preparation: gnum(grid.preparation), geste: gnum(grid.geste), tension: gnum(grid.tension),
        finition: gnum(grid.finition), temps: gnum(grid.temps),
      },
      clientRating: rating === '' ? undefined : Math.max(1, Math.min(5, Math.round(num(rating)))),
      supervisorValidation: validation,
    };
    setEnrollment(e.id, { practice: [...e.practice, p] });
    onDone();
  };
  return (
    <div className="tre-fiche tre-fiche--form">
      <div className="tre-sec-label" style={{ marginBottom: 10 }}>Nouvelle pratique · F4</div>
      <Field label="Cliente (CRM)">
        <ClientPicker value={clientId} onChange={(id) => setClientId(id)} placeholder="Rechercher une cliente…" />
      </Field>
      <Field label="Nom affiché sur la fiche (si passage libre)">
        <Input value={clientName} onChange={(ev) => setClientName(ev.target.value)} placeholder="—" />
      </Field>
      <div className="tr-grid tr-grid--2">
        <Field label="Prestation">
          <Select value={serviceCode} onChange={(ev) => setService(ev.target.value)}>
            {['VÈKPÈ™', 'SÍNSIN™', 'FÍNFÍN™', 'GBÈZÀ™', 'ÀGBÓ™', 'DÒDÒ™'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Rôle">
          <Select value={role} onChange={(ev) => setRole(ev.target.value as PracticeRecord['role'])}>
            {PRACTICE_ROLES.map((r) => <option key={r.k} value={r.k}>{r.l}</option>)}
          </Select>
        </Field>
        <Field label="Superviseur">
          <Select value={supervisor} onChange={(ev) => setSup(ev.target.value)}>
            <option value="">—</option>
            {masters.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Validation">
          <Select value={validation} onChange={(ev) => setVal(ev.target.value as PracticeRecord['supervisorValidation'])}>
            <option value="acquise">Acquise</option>
            <option value="a_refaire">À refaire</option>
          </Select>
        </Field>
      </div>
      <div className="tre-sec-label" style={{ margin: '8px 0' }}>Grille technique · /5</div>
      <div className="tr-grid tr-grid--3">
        {(['preparation', 'geste', 'tension', 'finition', 'temps'] as const).map((k) => (
          <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
            <Input type="number" min={0} max={5} value={grid[k]} onChange={(ev) => setGrid({ ...grid, [k]: ev.target.value })} />
          </Field>
        ))}
        <Field label="Note cliente · /5"><Input type="number" min={1} max={5} value={rating} onChange={(ev) => setRating(ev.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <Button variant="ghost" size="sm" onClick={onDone}>Annuler</Button>
        <Button variant="copper" size="sm" style={{ marginLeft: 'auto' }} onClick={save} disabled={!clientId && !clientName.trim()}>Enregistrer</Button>
      </div>
    </div>
  );
}
const gnum = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : undefined; };

/* ---------- F5 · Évaluation de module ---------- */
function TabModules({ e, modules, masters, frozen }: { e: Enrollment; modules: string[]; masters: string[]; frozen: boolean }) {
  const [evalFor, setEvalFor] = useState<number | null>(null);
  if (modules.length === 0) return <div className="mnd-muted" style={{ fontSize: 12.5, fontStyle: 'italic' }}>Cette formation n’a aucun module — ajoutez-en dans la fiche formation.</div>;
  const best = (i: number): ModuleEvaluation | null =>
    e.evaluations.filter((ev) => ev.moduleIndex === i).sort((a, b) => b.score - a.score)[0] ?? null;
  const remove = (id: string) => setEnrollment(e.id, { evaluations: e.evaluations.filter((x) => x.id !== id) });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {modules.map((m, i) => {
        const ev = best(i);
        return (
          <div key={i} className="tre-fiche">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{String(i + 1).padStart(2, '0')} · {m}</div>
              {ev ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: evalPassed(ev) ? 'var(--color-copper)' : 'var(--ink-soft)' }}>{ev.score}/100</span>
                  <Pill tone={evalPassed(ev) ? 'ok' : 'error'}>{evalPassed(ev) ? 'Validé' : 'Échoué'}</Pill>
                </span>
              ) : <Pill tone="muted">Non évalué</Pill>}
            </div>
            {ev?.evaluatorComment && <div className="mnd-muted" style={{ fontSize: 12, marginTop: 6 }}>{ev.evaluatorComment}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {!frozen && <button className="tre-link-btn" onClick={() => setEvalFor(i)}>{ev ? 'Réévaluer (rattrapage)' : 'Évaluer'}</button>}
              {ev && !frozen && <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 'auto' }} onClick={() => remove(ev.id)}>Retirer</button>}
            </div>
            {evalFor === i && <ModuleEvalForm e={e} moduleIndex={i} masters={masters} onDone={() => setEvalFor(null)} />}
          </div>
        );
      })}
    </div>
  );
}

function ModuleEvalForm({ e, moduleIndex, masters, onDone }: { e: Enrollment; moduleIndex: number; masters: string[]; onDone: () => void }) {
  const [c, setC] = useState({ theorie: '', preparation: '', geste: '', relationClient: '', hygiene: '' });
  const [evaluator, setEval] = useState(masters[0] ?? '');
  const [comment, setComment] = useState('');
  const score = (['theorie', 'preparation', 'geste', 'relationClient', 'hygiene'] as const)
    .reduce((s, k) => s + Math.max(0, Math.min(20, num(c[k]))), 0); // 5 × /20 = /100
  const attempt = e.evaluations.filter((x) => x.moduleIndex === moduleIndex).length + 1;

  const save = () => {
    const ev: ModuleEvaluation = {
      id: `ev-${uid()}`, moduleIndex, attempt,
      criteria: {
        theorie: num(c.theorie), preparation: num(c.preparation), geste: num(c.geste),
        relationClient: num(c.relationClient), hygiene: num(c.hygiene),
      },
      score, evaluator: evaluator || undefined, evaluatorComment: comment.trim() || undefined,
      evaluatedAt: nowStamp(),
    };
    setEnrollment(e.id, { evaluations: [...e.evaluations, ev], status: e.status === 'en_formation' ? 'en_evaluation' : e.status });
    onDone();
  };
  return (
    <div className="tre-fiche tre-fiche--form" style={{ marginTop: 10 }}>
      <div className="tre-sec-label" style={{ marginBottom: 8 }}>Évaluation · tentative {attempt} · critères /20</div>
      <div className="tr-grid tr-grid--3">
        {(['theorie', 'preparation', 'geste', 'relationClient', 'hygiene'] as const).map((k) => (
          <Field key={k} label={{ theorie: 'Théorie', preparation: 'Préparation', geste: 'Geste', relationClient: 'Relation client', hygiene: 'Hygiène' }[k]}>
            <Input type="number" min={0} max={20} value={c[k]} onChange={(ev) => setC({ ...c, [k]: ev.target.value })} />
          </Field>
        ))}
        <Field label="Évaluateur">
          <Select value={evaluator} onChange={(ev) => setEval(ev.target.value)}>
            <option value="">—</option>
            {masters.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Commentaire"><Textarea value={comment} onChange={(ev) => setComment(ev.target.value)} style={{ minHeight: 56 }} /></Field>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <span className="mnd-muted" style={{ fontSize: 12.5 }}>Score : <b style={{ color: score >= 70 ? 'var(--color-copper)' : 'var(--ink)' }}>{score}/100</b></span>
        <Button variant="ghost" size="sm" onClick={onDone}>Annuler</Button>
        <Button variant="copper" size="sm" style={{ marginLeft: 'auto' }} onClick={save}>Enregistrer l’évaluation</Button>
      </div>
    </div>
  );
}

/* ---------- F6 · Jury ---------- */
function TabJury({ e, modules, frozen }: { e: Enrollment; modules: string[]; frozen: boolean }) {
  const ready = canPlanJury(e, modules.length) && !frozen;
  const j = e.jury;

  const plan = () => {
    const jury: JuryReview = {
      scheduledAt: todayISO(),
      members: [
        { name: '', role: 'president' }, { name: '', role: 'formateur' }, { name: '', role: 'externe' },
      ],
    };
    setEnrollment(e.id, { jury, status: 'jury_planifie' });
  };
  const patchJury = (patch: Partial<JuryReview>) => e.jury && setEnrollment(e.id, { jury: { ...e.jury, ...patch } });
  const setMember = (i: number, name: string) =>
    e.jury && setEnrollment(e.id, { jury: { ...e.jury, members: e.jury.members.map((m, k) => (k === i ? { ...m, name } : m)) } });

  if (!j) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!ready && (
          <div className="tre-inline-note"><span className="mark">!</span><span>Le jury ne peut être planifié tant que chaque module n’a pas une évaluation validée (≥ 70).</span></div>
        )}
        <div className="tr-grid tr-grid--3" style={{ gap: 10 }}>
          {modules.map((m, i) => {
            const passed = e.evaluations.some((ev) => ev.moduleIndex === i && evalPassed(ev));
            return (
              <div key={i} style={{ fontSize: 12 }}>
                <span className={passed ? 'tre-ok' : 'mnd-muted'}>{passed ? '✓' : '○'} {m}</span>
              </div>
            );
          })}
        </div>
        <Button variant="copper" onClick={plan} disabled={!ready} style={{ alignSelf: 'flex-start' }}>Planifier le jury</Button>
      </div>
    );
  }

  const total = juryTotal(j);
  const roleLabel: Record<JuryRole, string> = { president: 'Président', formateur: 'Formateur', externe: 'Externe' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="tr-grid tr-grid--2">
        <Field label="Date du jury"><Input type="date" value={j.scheduledAt.slice(0, 10)} onChange={(ev) => patchJury({ scheduledAt: ev.target.value })} /></Field>
      </div>
      <div>
        <div className="tre-sec-label" style={{ marginBottom: 8 }}>Membres du jury</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {j.members.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="mnd-muted" style={{ fontSize: 11.5, width: 84, flex: 'none' }}>{roleLabel[m.role]}</span>
              <Input value={m.name} onChange={(ev) => setMember(i, ev.target.value)} placeholder="Nom du membre" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="tre-sec-label" style={{ marginBottom: 8 }}>Notes du jury</div>
        <div className="tr-grid tr-grid--3">
          <Field label="Pratique · /40"><Input type="number" min={0} max={40} value={j.practicalScore ?? ''} onChange={(ev) => patchJury({ practicalScore: ev.target.value === '' ? undefined : clamp(num(ev.target.value), 40) })} /></Field>
          <Field label="Oral · /30"><Input type="number" min={0} max={30} value={j.oralScore ?? ''} onChange={(ev) => patchJury({ oralScore: ev.target.value === '' ? undefined : clamp(num(ev.target.value), 30) })} /></Field>
          <Field label="Dossier · /30"><Input type="number" min={0} max={30} value={j.dossierScore ?? ''} onChange={(ev) => patchJury({ dossierScore: ev.target.value === '' ? undefined : clamp(num(ev.target.value), 30) })} /></Field>
        </div>
        <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 6 }}>Total jury : <b style={{ color: 'var(--color-copper)' }}>{total}/100</b></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <Toggle on={!!j.minutesSigned} onToggle={() => patchJury({ minutesSigned: !j.minutesSigned })} label="PV signé" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <span className="mnd-muted" style={{ fontSize: 11.5 }}>Délibération</span>
          <Select value={j.decision ?? ''} onChange={(ev) => patchJury({ decision: (ev.target.value || undefined) as JuryReview['decision'], decidedAt: ev.target.value ? nowStamp() : undefined })} style={{ fontSize: 12 }}>
            <option value="">— à décider</option>
            <option value="certifie">Certifié</option>
            <option value="excellence">Certifié · Excellence</option>
            <option value="ajourne">Ajourné</option>
          </Select>
        </div>
      </div>
      {j.decision === 'ajourne' && (
        <div className="tre-inline-note"><span className="mark">↺</span><span>Ajourné — l’apprenant repasse le jury sous 3 mois. Faites évoluer le statut vers « Ajourné » depuis l’en-tête.</span></div>
      )}
    </div>
  );
}
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

/* ---------- Certificat ---------- */
function TabCertificat({ e, formation, modules, sc, mention }: { e: Enrollment; formation?: Formation; modules: string[]; sc: ReturnType<typeof scoreEnrollment>; mention: ReturnType<typeof mentionFor> }) {
  const [enrollments] = useEnrollments();
  const { branch, currency } = useBranch();
  const eligible = canCertify(e);

  /* Bilan de parcours — le document complet remis à l'apprenant avec le certificat.
     Bâti sur summaryPdf, qui porte déjà le sceau MND, le mot-marque et les couleurs
     de la Maison (respect du design system). */
  const bilan = async () => {
    const safe = e.learnerName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'apprenant';
    const bestEval = (i: number): ModuleEvaluation | null =>
      e.evaluations.filter((ev) => ev.moduleIndex === i).sort((a, b) => b.score - a.score)[0] ?? null;
    await summaryPdf({
      eyebrow: 'Bilan de parcours',
      title: e.learnerName,
      houseName: `${branch.name} · Académie du Lock`,
      meta: [
        formation ? `${formation.name} · ${formation.niveau}` : '',
        e.cohortLabel ? `Cohorte ${e.cohortLabel}` : '',
        `Note finale ${sc.final}/100 — ${sc.final >= 70 ? MENTION_LABEL[mention] : 'ajourné'}`,
      ].filter(Boolean),
      sections: [
        {
          heading: 'Contrôle continu · séances',
          rows: e.sessions.filter(sessionValidated).length
            ? e.sessions.filter(sessionValidated).sort((a, b) => a.sessionNumber - b.sessionNumber).map((s) => ({
                label: `Séance ${s.sessionNumber}${s.moduleIndex != null && modules[s.moduleIndex] ? ` · ${modules[s.moduleIndex]}` : ''}`,
                value: s.technicalScore != null ? `${s.technicalScore}/20` : '—',
              }))
            : [{ label: 'Aucune séance validée.' }],
        },
        {
          heading: 'Modules',
          rows: modules.length
            ? modules.map((m, i) => { const ev = bestEval(i); return { label: `${String(i + 1).padStart(2, '0')} · ${m}`, value: ev ? `${ev.score}/100 · ${evalPassed(ev) ? 'validé' : 'échoué'}` : 'non évalué' }; })
            : [{ label: 'Aucun module défini.' }],
        },
        {
          heading: 'Jury',
          rows: e.jury
            ? [
                { label: 'Pratique', value: `${e.jury.practicalScore ?? 0}/40` },
                { label: 'Oral', value: `${e.jury.oralScore ?? 0}/30` },
                { label: 'Dossier', value: `${e.jury.dossierScore ?? 0}/30` },
                { label: 'Total jury', value: `${juryTotal(e.jury)}/100` },
                { label: 'Décision', value: e.jury.decision ? (e.jury.decision === 'excellence' ? 'Excellence' : e.jury.decision === 'certifie' ? 'Certifié' : 'Ajourné') : '—' },
              ]
            : [{ label: 'Jury non encore tenu.' }],
        },
        {
          heading: 'Synthèse · barème 30 / 30 / 40',
          rows: [
            { label: 'Contrôle continu (30 %)', value: sc.continu != null ? `${sc.continu}/100` : '—' },
            { label: 'Modules (30 %)', value: sc.modules != null ? `${sc.modules}/100` : '—' },
            { label: 'Jury (40 %)', value: sc.jury != null ? `${sc.jury}/100` : '—' },
            { label: 'NOTE FINALE', value: `${sc.final}/100 — ${sc.final >= 70 ? MENTION_LABEL[mention] : 'ajourné'}` },
          ],
        },
        ...(e.priceXof != null ? [{
          heading: 'Scolarité',
          rows: [
            { label: 'Net convenu', value: fmtMoney(enrollNet(e, formation), currency) },
            { label: 'Réglé', value: fmtMoney(enrollPaid(e), currency) },
            { label: 'Reste', value: fmtMoney(enrollDue(e, formation), currency) },
          ],
        }] : []),
      ],
      footer: `${branch.name} · Le cheveu est une couronne. La Maison veille.`,
      filename: `Bilan-${safe}.pdf`,
    });
  };

  const deliver = () => {
    if (!eligible) return;
    const finalMention = mention === 'excellence' ? 'excellence' : 'certifie';
    const cert = {
      number: nextCertNumber(enrollments),
      mention: finalMention as 'certifie' | 'excellence',
      finalScore: sc.final,
      qrToken: uid() + uid(),
      issuedAt: nowStamp(),
      isPublic: true,
    };
    setEnrollment(e.id, { certificate: cert, status: 'certifie' });
  };

  const link = (number: string, mn: 'certifie' | 'excellence', dateIso: string) => {
    const p = new URLSearchParams({
      apprenant: e.learnerName,
      parcours: formation?.name ?? '',
      numero: number,
      date: dateIso.slice(0, 10),
      mention: mn === 'excellence' ? 'Excellence' : 'Honorable',
    });
    if (formation) {
      p.set('niveau', formation.niveau);
      p.set('duree', `${formation.dureeSemaines} semaine${formation.dureeSemaines > 1 ? 's' : ''} · ${formation.sessions} séance${formation.sessions > 1 ? 's' : ''}`);
    }
    return `${asset('/certificat.html')}?${p.toString()}`;
  };

  if (e.certificate) {
    const cert = e.certificate;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ background: 'var(--color-indigo)', borderRadius: 6, padding: '20px 24px', width: '100%', color: 'var(--color-ivoire)' }}>
          <div className="tre-deep__eyebrow" style={{ color: 'var(--copper-200)' }}>Certificat délivré</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, marginTop: 6 }}>{cert.number}</div>
          <div style={{ fontSize: 13, color: 'var(--indigo-100)', marginTop: 6 }}>
            {MENTION_LABEL[cert.mention === 'excellence' ? 'excellence' : 'certifie']} · {cert.finalScore}/100 · le {frDate(cert.issuedAt)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={link(cert.number, cert.mention, cert.issuedAt)} target="_blank" rel="noreferrer" className="mnd-btn mnd-btn--copper" style={{ textDecoration: 'none' }}>
            Ouvrir le certificat →
          </a>
          <Button variant="ghost" onClick={() => void bilan()}>Télécharger le bilan (PDF)</Button>
        </div>
        <div className="mnd-muted" style={{ fontSize: 11.5 }}>Le bilan complet accompagne le certificat, à remettre à l’apprenant. Le PV signé et le registre public /certifiés arrivent dans la phase suivante.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="tre-livret-final">
        <div>
          <div className="tre-sec-label">Note finale</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 34, color: 'var(--color-indigo)' }}>{sc.final}<span style={{ fontSize: 18, color: 'var(--ink-soft)' }}> / 100</span></div>
          <div style={{ fontSize: 12.5, color: sc.final >= 70 ? 'var(--color-copper)' : 'var(--ink-soft)' }}>{sc.final >= 70 ? MENTION_LABEL[mention] : 'En deçà du seuil de 70'}</div>
        </div>
        <div className="tre-livret-final__break mnd-muted" style={{ fontSize: 12 }}>
          <div>Continu (30 %) · {sc.continu ?? '—'}</div>
          <div>Modules (30 %) · {sc.modules ?? '—'}</div>
          <div>Jury (40 %) · {sc.jury ?? '—'}</div>
        </div>
      </div>
      {!eligible ? (
        <div className="tre-inline-note">
          <span className="mark">!</span>
          <span>
            Pour délivrer le certificat : une décision de jury « Certifié » ou « Excellence » {e.jury?.minutesSigned ? '' : 'et le PV signé '}sont requis.
            {!e.jury && ' Planifiez d’abord le jury (onglet Jury).'}
          </span>
        </div>
      ) : (
        <Button variant="copper" onClick={deliver} style={{ alignSelf: 'flex-start' }}>Délivrer le certificat · sceau MND</Button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>Un bilan complet du parcours, au sceau MND — utile même avant la certification.</span>
        <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }} onClick={() => void bilan()}>Télécharger le bilan (PDF)</Button>
      </div>
    </div>
  );
}
