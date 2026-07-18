import { asset } from '../../../../shared/asset';
import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { useStaff } from './data';
import { useBranchAppointments, useServicesById, apptNetXof } from '../clients/_shared';
import { Pill, Tabs } from './ui';
import {
  payrollRunsStore, usePayrollRuns, useAdvances, usePayrollParameters, payrollParametersStore, useAttendance,
  parametersFor, normalizeParams, computePay, recomputeLine, runTotals, bulletinHref, bulletinNumber,
  RUN_STATUS_LABEL, PAYROLL_PARAMETERS_SEED,
  type PayrollRun, type PayrollLine, type RunStatus, type PayGains, type PayDeductions,
  type PayrollParameters, type ItsBracket,
} from './payroll';

/* Paie — runs mensuels. Le calcul vient du moteur vérifié (payroll.ts) ; ici on
   assemble les lignes depuis les dossiers + avances, on gère le cycle de vie, et
   on ouvre le bulletin officiel (bulletin.html) pré-rempli. Direction seulement. */

const nowStamp = () => new Date().toISOString();
const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const frPeriod = (p: string) => {
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const m = p.match(/^(\d{4})-(\d{2})$/);
  return m ? `${MOIS[Number(m[2]) - 1]} ${m[1]}` : p;
};
const digits = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;

const runTone = (s: RunStatus): 'ok' | 'warn' | 'muted' | 'copper' =>
  s === 'cloture' ? 'ok' : s === 'paye' ? 'copper' : s === 'valide' ? 'warn' : 'muted';

/* ═══════════════ Tableau de bord RH ═══════════════ */
export function RhDashboard() {
  const { branch, currency } = useBranch();
  const [staff] = useStaff();
  const [attendance] = useAttendance();
  const [runs] = usePayrollRuns();
  const team = staff.filter((m) => m.branchId === branch.id);
  const today = new Date().toISOString().slice(0, 10);
  const absents = team.filter((m) => {
    const s = attendance.find((a) => a.employeeId === m.id && a.date === today)?.status;
    return s === 'absent' || s === 'absent_justifie' || s === 'maladie';
  }).length;
  const lastRun = runs
    .filter((r) => !r.branchId || r.branchId === branch.id)
    .sort((a, b) => b.period.localeCompare(a.period) || b.createdAt.localeCompare(a.createdAt))[0];
  const masse = lastRun ? runTotals(lastRun).brut : 0;

  return (
    <div className="tr-grid tr-grid--3" style={{ marginBottom: 18 }}>
      <Card filet="indigo" style={{ padding: 16 }}><div className="mnd-stat__label">Effectif</div><div className="mnd-stat__value" style={{ fontSize: 28 }}>{team.length}</div></Card>
      <Card filet="copper" style={{ padding: 16 }}><div className="mnd-stat__label">Absents aujourd’hui</div><div className="mnd-stat__value" style={{ fontSize: 28 }}>{absents}</div></Card>
      <Card filet="indigo" style={{ padding: 16 }}><div className="mnd-stat__label">Masse salariale · {lastRun ? frPeriod(lastRun.period) : 'dernier run'}</div><div className="mnd-stat__value" style={{ fontSize: 24 }}>{fmtMoney(masse, currency)}</div></Card>
    </div>
  );
}

/* ═══════════════ Runs ═══════════════ */
export function PaieRuns() {
  const { branch, currency } = useBranch();
  const [runs] = usePayrollRuns();
  const [staff] = useStaff();
  const [advances] = useAdvances();
  const [params] = usePayrollParameters();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  /* Auto-réparation : une ligne `documents` héritée d'une version antérieure du
     module a pu stocker les barèmes en OBJET seul (non tableau). On réécrit la
     forme tableau attendue — sinon chaque session recharge la forme cassée et le
     run échoue (« x.filter is not a function »). Ne s'exécute que si c'est cassé. */
  useEffect(() => {
    if (!Array.isArray(params)) payrollParametersStore.set(normalizeParams(params));
  }, [params]);

  const branchRuns = runs
    .filter((r) => !r.branchId || r.branchId === branch.id)
    .slice()
    .sort((a, b) => b.period.localeCompare(a.period) || b.createdAt.localeCompare(a.createdAt));
  const open = runs.find((r) => r.id === openId) ?? null;

  const createRun = (period: string, atelier: string) => {
   try {
    const p = parametersFor(period, params);
    const team = staff.filter((m) => m.branchId === branch.id);
    const lines: PayrollLine[] = team.map((s) => {
      const avance = advances
        .filter((a) => a.employeeId === s.id && a.period === period)
        .reduce((x, a) => x + (a.amountXof ?? 0), 0);
      /* Commission depuis les prestations RÉELLEMENT encaissées du mois (rituels
         honorés, au maître = nom de l'employé) × taux du dossier. Sans taux, on
         retombe sur les montants saisis à la main. On ne somme que les RDV dont on
         sait lire le prix (prix figé OU services), pour ne jamais casser le run. */
      const commission = s.commissionPct != null
        ? Math.round(
            appts
              .filter((a) => a.status === 'honoré' && (a.date ?? '').slice(0, 7) === period && a.master === s.name
                && (typeof a.priceXof === 'number' || Array.isArray(a.serviceIds)))
              .reduce((sum, a) => sum + apptNetXof(a, byId), 0) * s.commissionPct / 100,
          )
        : (s.commPrestaXof ?? 0) + (s.commProduitXof ?? 0);
      const gains: PayGains = {
        base: s.salaireXof ?? 0, heuresSup: 0, prime: s.primeXof ?? 0, pourboires: 0,
        commission, indemnites: 0,
      };
      const deductions: PayDeductions = { avance, autresRetenues: 0 };
      return {
        employeeId: s.id, name: s.name, poste: s.role, matricule: s.matricule,
        cnssNum: s.cnssNum, paiement: s.paiement,
        gains, deductions, result: computePay(gains, deductions, p),
      };
    });
    const run: PayrollRun = {
      id: `run-${uid()}`, period, atelier: atelier || undefined, status: 'brouillon',
      lines, createdAt: nowStamp(), branchId: branch.id,
    };
    payrollRunsStore.set((prev) => [run, ...prev]);
    setCreating(false);
    setOpenId(run.id);
   } catch (err) {
    // Un run ne doit jamais échouer en silence : on montre l'erreur plutôt que de « ne rien faire ».
    window.alert(`Le run n'a pas pu être créé : ${err instanceof Error ? err.message : String(err)}`);
   }
  };

  return (
    <div>
      <div className="tre-actions-row">
        <span className="mnd-muted" style={{ fontSize: 12 }}>Un run par mois et par atelier · cycle brouillon → validé → payé → clôturé.</span>
        <Button variant="copper" onClick={() => setCreating(true)} disabled={staff.filter((m) => m.branchId === branch.id).length === 0}>+ Nouveau run</Button>
      </div>

      {staff.filter((m) => m.branchId === branch.id).length === 0 && (
        <Card className="tre-empty"><div className="tre-empty__title">Aucun employé sur cet atelier.</div><div className="tre-empty__sub">Ajoutez l’équipe dans l’onglet « Équipe » avant de lancer un run.</div></Card>
      )}

      {branchRuns.length > 0 && (
        <Card style={{ overflow: 'hidden' }}>
          <div className="mnd-scroll-x">
            <table className="tre-table">
              <thead><tr><th>Période</th><th>Atelier</th><th>Statut</th><th>Effectif</th><th>Masse salariale (brut)</th><th>Net</th><th></th></tr></thead>
              <tbody>
                {branchRuns.map((r) => {
                  const t = runTotals(r);
                  return (
                    <tr key={r.id}>
                      <td><button className="tre-link-btn" onClick={() => setOpenId(r.id)} style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{frPeriod(r.period)}</button></td>
                      <td className="mnd-muted">{r.atelier ?? branch.city}</td>
                      <td><Pill tone={runTone(r.status)}>{RUN_STATUS_LABEL[r.status]}</Pill></td>
                      <td className="mnd-muted">{r.lines.length}</td>
                      <td style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-indigo)' }}>{fmtMoney(t.brut, currency)}</td>
                      <td className="mnd-muted">{fmtMoney(t.net, currency)}</td>
                      <td style={{ textAlign: 'right' }}><button className="tre-link-btn" onClick={() => setOpenId(r.id)}>Ouvrir</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && <NewRunModal onClose={() => setCreating(false)} onCreate={createRun} defaultAtelier={branch.city} />}
      {open && <RunDetail key={open.id} run={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function NewRunModal({ onClose, onCreate, defaultAtelier }: { onClose: () => void; onCreate: (period: string, atelier: string) => void; defaultAtelier: string }) {
  const [period, setPeriod] = useState(currentPeriod());
  const [atelier, setAtelier] = useState(defaultAtelier);
  return (
    <Modal title="Nouveau run de paie." onClose={onClose} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="tr-grid tr-grid--2">
          <Field label="Période"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
          <Field label="Atelier"><Input value={atelier} onChange={(e) => setAtelier(e.target.value)} /></Field>
        </div>
        <div className="mnd-muted" style={{ fontSize: 11.5, fontStyle: 'italic' }}>Le run part des dossiers de l’équipe (salaire, prime, commission) et déduit les avances du mois. Tout reste éditable en brouillon.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 1 }} onClick={() => onCreate(period, atelier)} disabled={!/^\d{4}-\d{2}$/.test(period)}>Créer le run</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════ Détail d'un run ═══════════════ */
function RunDetail({ run, onClose }: { run: PayrollRun; onClose: () => void }) {
  const { branch, currency } = useBranch();
  const [params] = usePayrollParameters();
  const [editLine, setEditLine] = useState<number | null>(null);
  const editable = run.status === 'brouillon';
  const t = runTotals(run);
  const p = parametersFor(run.period, params);

  const setRun = (patch: Partial<PayrollRun>) => payrollRunsStore.set((prev) => prev.map((r) => (r.id === run.id ? { ...r, ...patch } : r)));
  const saveLine = (i: number, gains: PayGains, deductions: PayDeductions) => {
    const line = recomputeLine({ ...run.lines[i], gains, deductions }, p);
    setRun({ lines: run.lines.map((l, j) => (j === i ? line : l)) });
    setEditLine(null);
  };

  /* Cycle de vie — un run clôturé est immuable (les chiffres sont figés). */
  const advance = (next: RunStatus) => {
    if (next === 'cloture' && !window.confirm('Clôturer ce run ? Il deviendra immuable — toute correction passera par un run de régularisation le mois suivant.')) return;
    const stamp = next === 'valide' ? { validatedAt: nowStamp() } : next === 'paye' ? { paidAt: nowStamp() } : next === 'cloture' ? { closedAt: nowStamp() } : {};
    setRun({ status: next, ...stamp });
  };
  const nextStatus: Record<RunStatus, RunStatus | null> = { brouillon: 'valide', valide: 'paye', paye: 'cloture', cloture: null };
  const next = nextStatus[run.status];

  const bulletinFor = (l: PayrollLine) => bulletinHref(asset('/bulletin.html'), {
    nom: l.name, poste: l.poste, matricule: l.matricule, cnssnum: l.cnssNum, periode: run.period,
    base: l.gains.base, hs: l.gains.heuresSup, prime: l.gains.prime, pourboires: l.gains.pourboires,
    commission: l.gains.commission, avance: l.deductions.avance, retenue: l.deductions.autresRetenues,
    paiement: l.paiement,
  });

  const exportCsv = () => {
    const head = ['Matricule', 'Nom', 'Poste', 'Brut', 'CNSS salariale', 'ITS', 'Retenues', 'Net a payer', 'CNSS patronale', 'Cout employeur'];
    const rows = run.lines.map((l) => [
      l.matricule ?? '', l.name, l.poste ?? '',
      l.result.brut, l.result.cnssSalariale, l.result.its, l.result.retenues, l.result.net, l.result.cnssPatronale, l.result.coutEmployeur,
    ]);
    const csv = [head, ...rows, ['', 'TOTAL', '', t.brut, t.cnssSalariale, t.its, '', t.net, t.cnssPatronale, t.cout]]
      .map((r) => r.map((c) => (typeof c === 'string' && c.includes(',') ? `"${c}"` : c)).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `livre-de-paie-${run.period}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Modal title={`Paie · ${frPeriod(run.period)}`} onClose={onClose} width={880}>
      {/* En-tête : statut + cycle + totaux */}
      <div className="tre-livret-head" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Pill tone={runTone(run.status)}>{RUN_STATUS_LABEL[run.status]}</Pill>
          <span className="mnd-muted" style={{ fontSize: 12 }}>{run.atelier ?? branch.city} · {run.lines.length} employé{run.lines.length > 1 ? 's' : ''}</span>
          {next && <Button size="sm" variant={next === 'cloture' ? 'ghost' : 'copper'} onClick={() => advance(next)}>{next === 'valide' ? 'Valider' : next === 'paye' ? 'Marquer payé' : 'Clôturer'}</Button>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tre-livret-score__val">{fmtMoney(t.brut, currency)}<span style={{ fontSize: 12 }}> masse salariale</span></div>
          <div className="tre-livret-score__break">
            <span>Net {fmtMoney(t.net, currency)}</span><span>·</span>
            <span>CNSS {fmtMoney(t.cnssSalariale + t.cnssPatronale, currency)}</span><span>·</span>
            <span>Coût {fmtMoney(t.cout, currency)}</span>
          </div>
        </div>
      </div>

      {!editable && (
        <div className="tre-inline-note" style={{ marginTop: 12 }}><span className="mark">!</span><span>Run {RUN_STATUS_LABEL[run.status].toLowerCase()} — les lignes sont figées. {run.status === 'cloture' ? 'Toute correction passe par un run de régularisation.' : ''}</span></div>
      )}

      {/* Lignes */}
      <div className="mnd-scroll-x" style={{ marginTop: 14 }}>
        <table className="tre-table">
          <thead><tr><th>Employé</th><th>Brut</th><th>CNSS</th><th>ITS</th><th>Retenues</th><th>Net à payer</th><th></th></tr></thead>
          <tbody>
            {run.lines.map((l, i) => (
              <tr key={l.employeeId}>
                <td><div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{l.name}</div><div className="mnd-muted" style={{ fontSize: 11 }}>{l.poste}{l.matricule ? ` · ${l.matricule}` : ''}</div></td>
                <td className="mnd-muted">{fmtMoney(l.result.brut, currency)}</td>
                <td className="mnd-muted">{fmtMoney(l.result.cnssSalariale, currency)}</td>
                <td className="mnd-muted">{fmtMoney(l.result.its, currency)}</td>
                <td className="mnd-muted">{fmtMoney(l.result.retenues, currency)}</td>
                <td style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-copper)' }}>{fmtMoney(l.result.net, currency)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {editable && <button className="tre-link-btn" onClick={() => setEditLine(i)}>Modifier</button>}
                  <a className="tre-link-btn" style={{ marginLeft: 12 }} href={bulletinFor(l)} target="_blank" rel="noreferrer" title={`Bulletin ${bulletinNumber(run.period, l.matricule ?? '')}`}>Bulletin</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="ghost" size="sm" onClick={exportCsv}>Livre de paie (CSV)</Button>
        <span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>
          Récap CNSS du mois · salariale {fmtMoney(t.cnssSalariale, currency)} + patronale {fmtMoney(t.cnssPatronale, currency)} = {fmtMoney(t.cnssSalariale + t.cnssPatronale, currency)}
        </span>
      </div>

      {editLine != null && <LineEditor line={run.lines[editLine]} onClose={() => setEditLine(null)} onSave={(g, d) => saveLine(editLine, g, d)} />}
    </Modal>
  );
}

function LineEditor({ line, onClose, onSave }: { line: PayrollLine; onClose: () => void; onSave: (g: PayGains, d: PayDeductions) => void }) {
  const { currency } = useBranch();
  const [g, setG] = useState({
    base: String(line.gains.base), heuresSup: String(line.gains.heuresSup), prime: String(line.gains.prime),
    pourboires: String(line.gains.pourboires), commission: String(line.gains.commission), indemnites: String(line.gains.indemnites),
  });
  const [d, setD] = useState({ avance: String(line.deductions.avance), autresRetenues: String(line.deductions.autresRetenues) });
  const gains: PayGains = { base: digits(g.base), heuresSup: digits(g.heuresSup), prime: digits(g.prime), pourboires: digits(g.pourboires), commission: digits(g.commission), indemnites: digits(g.indemnites) };
  const deductions: PayDeductions = { avance: digits(d.avance), autresRetenues: digits(d.autresRetenues) };
  const preview = computePay(gains, deductions, PAYROLL_PARAMETERS_SEED); // aperçu au barème courant (indicatif)

  const F = (label: string, key: keyof typeof g) => (
    <Field label={label}><Input inputMode="numeric" value={g[key]} onChange={(e) => setG({ ...g, [key]: e.target.value })} /></Field>
  );
  return (
    <Modal title={`Ligne · ${line.name}`} onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="tre-sec-label">Gains (F CFA)</div>
        <div className="tr-grid tr-grid--3">
          {F('Salaire de base', 'base')}{F('Heures sup.', 'heuresSup')}{F('Prime', 'prime')}
          {F('Pourboires', 'pourboires')}{F('Commission', 'commission')}{F('Indemnités', 'indemnites')}
        </div>
        <div className="tre-sec-label">Retenues (F CFA)</div>
        <div className="tr-grid tr-grid--2">
          <Field label="Avance sur salaire"><Input inputMode="numeric" value={d.avance} onChange={(e) => setD({ ...d, avance: e.target.value })} /></Field>
          <Field label="Autre retenue"><Input inputMode="numeric" value={d.autresRetenues} onChange={(e) => setD({ ...d, autresRetenues: e.target.value })} /></Field>
        </div>
        <div className="tre-pay-recap">
          <div className="tre-pay-recap__line"><span className="mnd-muted">Brut</span><span>{fmtMoney(preview.brut, currency)}</span></div>
          <div className="tre-pay-recap__line"><span className="mnd-muted">CNSS · ITS</span><span>− {fmtMoney(preview.cnssSalariale + preview.its, currency)}</span></div>
          <div className="tre-pay-recap__line tre-pay-recap__reste"><span>Net à payer</span><span>{fmtMoney(preview.net, currency)}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 1 }} onClick={() => onSave(gains, deductions)}>Enregistrer la ligne</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════ Paramètres de paie (barèmes) ═══════════════ */
export function PaieParametres() {
  const [versions] = usePayrollParameters();
  const p = versions[versions.length - 1] ?? PAYROLL_PARAMETERS_SEED;
  const patch = (up: Partial<PayrollParameters>) =>
    payrollParametersStore.set((prev) => {
      const list = prev.length ? [...prev] : [PAYROLL_PARAMETERS_SEED];
      list[list.length - 1] = { ...list[list.length - 1], ...up };
      return list;
    });
  const setBracket = (i: number, field: keyof ItsBracket, v: string) =>
    patch({ its: p.its.map((b, j) => (j === i ? { ...b, [field]: field === 'upTo' ? (v === '' ? null : digits(v)) : Number(v) } : b)) });
  const resetSeed = () => { if (window.confirm('Rétablir les barèmes de départ (valeurs de la spec) ?')) payrollParametersStore.set(() => [{ ...PAYROLL_PARAMETERS_SEED, its: PAYROLL_PARAMETERS_SEED.its.map((b) => ({ ...b })) }]); };

  const num = (label: string, key: 'cnssSalarialePct' | 'cnssPatronalePensionPct' | 'cnssPatronaleFamillePct' | 'cnssPatronaleRisquePct' | 'congesJoursParMois', suffix: string) => (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Input type="number" step="0.1" value={String(p[key])} onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<PayrollParameters>)} style={{ maxWidth: 120 }} />
        <span className="mnd-muted" style={{ fontSize: 12 }}>{suffix}</span>
      </div>
    </Field>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="tre-inline-note"><span className="mark">!</span><span><b>Barèmes à faire valider par votre comptable avant le premier run réel.</b> Valeurs de départ issues de la réglementation béninoise, à confirmer.</span></div>

      <Card style={{ padding: '20px 22px' }}>
        <div className="tre-sec-label" style={{ marginBottom: 14 }}>CNSS · pension & prestations</div>
        <div className="tr-grid tr-grid--2">
          {num('Part salariale (pension)', 'cnssSalarialePct', '% du brut')}
          {num('Part patronale · pension', 'cnssPatronalePensionPct', '% du brut')}
          {num('Part patronale · prestations familiales', 'cnssPatronaleFamillePct', '% du brut')}
          {num('Part patronale · risques professionnels', 'cnssPatronaleRisquePct', '% (1–4)')}
        </div>
      </Card>

      <Card style={{ padding: '20px 22px' }}>
        <div className="tre-sec-label" style={{ marginBottom: 14 }}>ITS · barème progressif (mensuel, sur le brut)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.its.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mnd-muted" style={{ fontSize: 12, width: 70, flex: 'none' }}>Tranche {i + 1}</span>
              <Field label="Jusqu’à (F CFA)"><Input inputMode="numeric" value={b.upTo == null ? '' : String(b.upTo)} placeholder="au-delà" onChange={(e) => setBracket(i, 'upTo', e.target.value)} /></Field>
              <Field label="Taux %"><Input type="number" step="1" value={String(b.rate)} onChange={(e) => setBracket(i, 'rate', e.target.value)} style={{ maxWidth: 100 }} /></Field>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding: '20px 22px' }}>
        <div className="tre-sec-label" style={{ marginBottom: 14 }}>Congés payés</div>
        <div className="tr-grid tr-grid--2">{num('Acquisition', 'congesJoursParMois', 'jours ouvrables / mois de service')}</div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>Date d’effet : {p.effectiveFrom}. Les runs choisissent la version applicable au mois.</span>
        <Button variant="ghost" size="sm" onClick={resetSeed}>Rétablir les valeurs de départ</Button>
      </div>
    </div>
  );
}
