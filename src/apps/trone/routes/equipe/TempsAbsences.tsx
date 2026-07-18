import { useMemo, useState } from 'react';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { uid } from '../../../../shared/store';
import { useStaff as useMyStaff } from '../../../../shared/auth';
import { useStaff } from './data';
import { Pill, Tabs } from './ui';
import {
  attendanceStore, useAttendance, leaveStore, useLeave, usePayrollParameters,
  congeBalance, daysInclusive, ATTENDANCE_LABEL, LEAVE_STATUS_LABEL, PAYROLL_PARAMETERS_SEED,
  type AttendanceStatus, type LeaveType, type LeaveRequest,
} from './payroll';

/* Temps & absences — pointage journalier + congés/maladie avec validation direction.
   Le planning des praticiens reste au slot engine ; ici, présence et absences. */

const todayISO = () => new Date().toISOString().slice(0, 10);
const frDate = (iso?: string) => {
  if (!iso) return '—';
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

type Tab = 'pointage' | 'conges';

export default function TempsAbsences() {
  const [tab, setTab] = useState<Tab>('pointage');
  return (
    <div>
      <div className="trc-tabs" style={{ marginBottom: 18 }}>
        <button className={`trc-tab ${tab === 'pointage' ? 'is-active' : ''}`} onClick={() => setTab('pointage')}>Pointage du jour</button>
        <button className={`trc-tab ${tab === 'conges' ? 'is-active' : ''}`} onClick={() => setTab('conges')}>Congés & absences</button>
      </div>
      {tab === 'pointage' ? <Pointage /> : <Conges />}
    </div>
  );
}

/* ---------- Pointage journalier ---------- */
const STATUSES: AttendanceStatus[] = ['present', 'retard', 'absent', 'maladie'];
const statusTone = (s: AttendanceStatus): 'ok' | 'warn' | 'error' | 'muted' | 'copper' =>
  s === 'present' ? 'ok' : s === 'retard' ? 'warn' : s === 'maladie' ? 'copper' : 'error';

function Pointage() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const [attendance] = useAttendance();
  const [day, setDay] = useState(todayISO());
  const team = staff.filter((m) => m.branchId === branch.id);

  const attOf = (empId: string) => attendance.find((a) => a.employeeId === empId && a.date === day);
  const mark = (empId: string, status: AttendanceStatus) => {
    const existing = attOf(empId);
    if (existing) attendanceStore.set((prev) => prev.map((a) => (a.id === existing.id ? { ...a, status } : a)));
    else attendanceStore.set((prev) => [...prev, { id: `att-${uid()}`, employeeId: empId, date: day, status, branchId: branch.id }]);
  };

  const tally = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of team) {
      const s = attendance.find((a) => a.employeeId === m.id && a.date === day)?.status;
      if (s) c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [team, attendance, day]);

  return (
    <div>
      <div className="tre-actions-row">
        <Field label="Jour"><Input type="date" value={day} max={todayISO()} onChange={(e) => setDay(e.target.value)} style={{ maxWidth: 200 }} /></Field>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {STATUSES.map((s) => <Pill key={s} tone={statusTone(s)}>{ATTENDANCE_LABEL[s]} · {tally[s] ?? 0}</Pill>)}
        </span>
      </div>

      {team.length === 0 && <Card className="tre-empty"><div className="tre-empty__title">Aucun employé sur cet atelier.</div></Card>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {team.map((m) => {
          const cur = attOf(m.id)?.status;
          return (
            <div key={m.id} className="tre-fiche" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)', flex: 1, minWidth: 140 }}>{m.name}<span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 8 }}>{m.role}</span></span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUSES.map((s) => (
                  <button key={s} className={`tre-chip ${cur === s ? 'is-on' : ''}`} onClick={() => mark(m.id, s)}>{ATTENDANCE_LABEL[s]}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Congés & absences ---------- */
function Conges() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const [leaves] = useLeave();
  const [params] = usePayrollParameters();
  const me = useMyStaff();
  const p = params[params.length - 1] ?? PAYROLL_PARAMETERS_SEED;
  const [adding, setAdding] = useState(false);

  const team = staff.filter((m) => m.branchId === branch.id);
  const nameOf = (id: string) => staff.find((m) => m.id === id)?.name ?? 'Employé';
  const branchLeaves = leaves
    .filter((l) => !l.branchId || l.branchId === branch.id)
    .slice()
    .sort((a, b) => (a.status === 'demande' && b.status !== 'demande' ? -1 : b.status === 'demande' && a.status !== 'demande' ? 1 : b.startDate.localeCompare(a.startDate)));

  const decide = (id: string, status: 'approuve' | 'refuse') =>
    leaveStore.set((prev) => prev.map((l) => (l.id === id ? { ...l, status, decidedBy: me?.name ?? 'Direction', decidedAt: new Date().toISOString() } : l)));
  const remove = (id: string) => leaveStore.set((prev) => prev.filter((l) => l.id !== id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Soldes de congés */}
      <div>
        <div className="tre-sec-label" style={{ marginBottom: 10 }}>Soldes de congés payés · {p.congesJoursParMois} j / mois de service</div>
        <Card style={{ overflow: 'hidden' }}>
          <div className="mnd-scroll-x">
            <table className="tre-table">
              <thead><tr><th>Employé</th><th>Acquis</th><th>Pris</th><th>Solde</th></tr></thead>
              <tbody>
                {team.map((m) => {
                  const b = congeBalance(m.since, leaves, m.id, p.congesJoursParMois);
                  return (
                    <tr key={m.id}>
                      <td style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-indigo)' }}>{m.name}</td>
                      <td className="mnd-muted">{b.acquis} j</td>
                      <td className="mnd-muted">{b.pris} j</td>
                      <td><b style={{ color: b.solde < 0 ? '#8f3b30' : 'var(--color-copper)' }}>{b.solde} j</b></td>
                    </tr>
                  );
                })}
                {team.length === 0 && <tr><td colSpan={4} className="mnd-muted" style={{ textAlign: 'center', padding: 24 }}>Aucun employé.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Demandes */}
      <div>
        <div className="tre-actions-row">
          <div className="tre-sec-label" style={{ margin: 0 }}>Demandes · congés & maladie</div>
          <Button variant="copper" onClick={() => setAdding(true)} disabled={team.length === 0}>+ Nouvelle demande</Button>
        </div>
        {branchLeaves.length === 0 && <Card className="tre-empty"><div className="tre-empty__sub">Aucune demande enregistrée.</div></Card>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {branchLeaves.map((l) => (
            <div key={l.id} className="tre-fiche">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>
                  {nameOf(l.employeeId)} · {l.type === 'conge' ? 'Congé' : 'Maladie'}
                </div>
                <Pill tone={l.status === 'approuve' ? 'ok' : l.status === 'refuse' ? 'error' : 'warn'}>{LEAVE_STATUS_LABEL[l.status]}</Pill>
              </div>
              <div className="mnd-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {frDate(l.startDate)} → {frDate(l.endDate)} · {l.days} j{l.reason ? ` · ${l.reason}` : ''}{l.justificatif ? ` · justificatif : ${l.justificatif}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                {l.status === 'demande' && <button className="tre-link-btn" style={{ color: 'var(--trv-success, #2f7d54)' }} onClick={() => decide(l.id, 'approuve')}>Approuver</button>}
                {l.status === 'demande' && <button className="tre-link-btn tre-link-btn--danger" onClick={() => decide(l.id, 'refuse')}>Refuser</button>}
                {l.status !== 'demande' && <span className="mnd-muted" style={{ fontSize: 11 }}>{LEAVE_STATUS_LABEL[l.status]}{l.decidedBy ? ` par ${l.decidedBy}` : ''}</span>}
                <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 'auto' }} onClick={() => remove(l.id)}>Retirer</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {adding && <LeaveForm team={team} onClose={() => setAdding(false)} />}
    </div>
  );
}

function LeaveForm({ team, onClose }: { team: ReturnType<typeof useStaff>[0]; onClose: () => void }) {
  const { branch } = useBranch();
  const [employeeId, setEmp] = useState(team[0]?.id ?? '');
  const [type, setType] = useState<LeaveType>('conge');
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [justificatif, setJustificatif] = useState('');
  const days = daysInclusive(start, end);

  const save = () => {
    if (!employeeId || days <= 0) return;
    const req: LeaveRequest = {
      id: `lv-${uid()}`, employeeId, type, startDate: start, endDate: end, days,
      reason: reason.trim() || undefined,
      justificatif: type === 'maladie' ? (justificatif.trim() || undefined) : undefined,
      status: 'demande', branchId: branch.id,
    };
    leaveStore.set((prev) => [req, ...prev]);
    onClose();
  };

  return (
    <Modal title="Nouvelle demande." onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Employé">
          <Select value={employeeId} onChange={(e) => setEmp(e.target.value)}>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`tre-chip ${type === 'conge' ? 'is-on' : ''}`} onClick={() => setType('conge')}>Congé payé</button>
            <button className={`tre-chip ${type === 'maladie' ? 'is-on' : ''}`} onClick={() => setType('maladie')}>Absence maladie</button>
          </div>
        </Field>
        <div className="tr-grid tr-grid--2">
          <Field label="Du"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Au"><Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: -6 }}>{days > 0 ? `${days} jour${days > 1 ? 's' : ''}` : 'Dates invalides.'}</div>
        <Field label="Motif"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="—" /></Field>
        {type === 'maladie' && (
          <Field label="Justificatif (référence / note)"><Input value={justificatif} onChange={(e) => setJustificatif(e.target.value)} placeholder="Certificat médical du…" /></Field>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 1 }} onClick={save} disabled={!employeeId || days <= 0}>Enregistrer la demande</Button>
        </div>
      </div>
    </Modal>
  );
}
