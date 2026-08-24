import { asset } from '../../../../shared/asset';
import { useEffect, useMemo, useState } from 'react';
import { normName, sameName } from '../../../../shared/text';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { expensesStore, expenseCategoriesStore, useExpenses, useInvoices } from '../../../../shared/finance';
import { useStaff } from './data';
import { usePrets, etatsDesEmprunteurs, type Pret } from '../../../../shared/foyer';
import { useBranchAppointments, useServicesById, apptNetXof, commissionDetaillee } from '../clients/_shared';
import { Pill, Tabs } from './ui';
import {
  payrollRunsStore, payrollParametersStore, usePayrollRuns, useAdvances, usePayrollParameters, useAttendance, useCommRates,
  parametersFor, asArray, healPayrollStores, computePay, recomputeLine, runTotals, bulletinHref, bulletinNumber,
  cnssEstActive, tauxCnssSalarial, itsEstActif, chargeSalaireId, chargeSalaire, SALAIRES_CATEGORIE,
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
  const [invoices] = useInvoices();
  const [rates] = useCommRates();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  /* Auto-réparation durable : tout magasin de paie dont la valeur persistée n'est
     pas un tableau (forme héritée d'une version antérieure du module, ou ligne
     `documents` des barèmes revenue en objet seul) est réécrit à la bonne forme
     — sinon chaque session recharge la forme cassée et le run échoue. */
  useEffect(() => { healPayrollStores(); }, []);

  const branchRuns = runs
    .filter((r) => !r.branchId || r.branchId === branch.id)
    .slice()
    .sort((a, b) => b.period.localeCompare(a.period) || b.createdAt.localeCompare(a.createdAt));
  const open = runs.find((r) => r.id === openId) ?? null;

  /* Maîtres présents dans les rituels honorés de la période du run ouvert mais
     SANS dossier correspondant dans l'équipe : leurs rituels n'alimentent aucune
     commission. C'est le symptôme d'un renommage (ou d'une orthographe divergente
     que la normalisation ne rattrape pas) — on l'AFFICHE au lieu de laisser la
     commission tomber à zéro en silence. */
  const orphanMasters = useMemo(() => {
    if (!open) return [];
    const names = asArray(staff).filter((m) => m && m.branchId === branch.id).map((m) => m.name);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of asArray(appts)) {
      if (!a || a.status !== 'honoré' || (a.date ?? '').slice(0, 7) !== open.period) continue;
      const m = (a.master ?? '').trim();
      if (!m || names.some((n) => sameName(n, m))) continue;
      const k = normName(m);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
    return out;
  }, [open, staff, appts, branch.id]);

  /* CE QUE CHAQUE PRÊT DEMANDE DE RETENIR CE MOIS-CI. On ne retient jamais
     plus que le reste dû : le dernier mois solde le prêt, il ne le dépasse
     pas. Un emprunteur se reconnaît par sa fiche, sinon par son nom — les
     prêts d’avant ne portent pas toujours de `personneId`. */
  const [lesPrets, setLesPrets] = usePrets();
  const retenuesDuMois = useMemo(() => {
    const par = new Map<string, number>();
    const etats = etatsDesEmprunteurs(lesPrets, branch.id, nowStamp().slice(0, 10));
    for (const m of asArray(staff)) {
      if (!m || m.branchId !== branch.id) continue;
      const e = etats.find((x) => x.personneId === m.id
        || x.nom.trim().toLowerCase() === (m.name ?? '').trim().toLowerCase());
      if (!e || e.reste <= 0 || e.retenueXof <= 0) continue;
      par.set(m.id, Math.min(e.retenueXof, e.reste));
    }
    return par;
  }, [lesPrets, staff, branch.id]);

  const createRun = (period: string, atelier: string) => {
   try {
    const p = parametersFor(period, params);
    const team = asArray(staff).filter((m) => m && m.branchId === branch.id);
    const lines: PayrollLine[] = team.map((s) => {
      const avance = asArray(advances)
        .filter((a) => a && a.employeeId === s.id && a.period === period)
        .reduce((x, a) => x + (a.amountXof ?? 0), 0);
      /* COMMISSION DÉTAILLÉE — la MÊME porte que le tableau Personnel
         (`commissionDetaillee`, clients/_shared) : le net de chaque rituel réparti
         par prestation, les mains partagées, le taux par palier, la commission
         produits. Décision de la Maison (24 août) : le moteur DÉTAILLÉ fait foi,
         plus le forfait `commissionPct`. Un maître non commissionné (`commissionne`
         faux) touche 0 par ce moteur ; à défaut de commission calculée, on retombe
         sur les montants saisis à la main (`commPrestaXof`/`commProduitXof`). */
      const cd = commissionDetaillee(s, period, {
        appts: asArray(appts), invoices: asArray(invoices), byId, team, branchId: branch.id, rates,
      });
      const commission = (cd.presta + cd.produit) || ((s.commPrestaXof ?? 0) + (s.commProduitXof ?? 0));
      const gains: PayGains = {
        base: s.salaireXof ?? 0, heuresSup: 0, prime: s.primeXof ?? 0, pourboires: 0,
        commission, indemnites: 0,
      };
      /* LA RETENUE D’UN PRÊT EST PROPOSÉE, JAMAIS IMPOSÉE — 23 août 2026,
         arbitrage de Yéman. Une avance sur salaire se rembourse par le
         salaire : aucune caisse ne bouge, l’argent n’est jamais sorti de la
         Maison. Elle arrive pré-remplie dans « autres retenues » et se
         corrige ligne à ligne — un mois difficile se gère à la main, sans
         défaire le prêt. Elle ne s’inscrit pour de bon qu’au règlement. */
      const retenuePret = retenuesDuMois.get(s.id) ?? 0;
      const deductions: PayDeductions = { avance, autresRetenues: retenuePret };
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
        <Button variant="copper" onClick={() => setCreating(true)} disabled={asArray(staff).filter((m) => m.branchId === branch.id).length === 0}>+ Nouveau run</Button>
      </div>

      {asArray(staff).filter((m) => m.branchId === branch.id).length === 0 && (
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
                      <td className="mnd-muted">{asArray(r.lines).length}</td>
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
      {open && <RunDetail key={open.id} run={open} orphanMasters={orphanMasters} onClose={() => setOpenId(null)} />}
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
function RunDetail({ run, orphanMasters = [], onClose }: { run: PayrollRun; orphanMasters?: string[]; onClose: () => void }) {
  const { branch, currency } = useBranch();
  const [params] = usePayrollParameters();
  const [allExpenses] = useExpenses();
  /* La dette de l’équipe est lue ET écrite ici : la retenue d’un bulletin
     réglé devient un remboursement de prêt (voir inscrireLesRetenues). */
  const [lesPrets, setLesPrets] = usePrets();
  const [editLine, setEditLine] = useState<number | null>(null);
  const editable = run.status === 'brouillon';
  const lines = asArray<PayrollLine>(run.lines);
  const t = runTotals(run);
  const p = parametersFor(run.period, params);

  const setRun = (patch: Partial<PayrollRun>) => payrollRunsStore.set((prev) => prev.map((r) => (r.id === run.id ? { ...r, ...patch } : r)));
  const saveLine = (i: number, gains: PayGains, deductions: PayDeductions) => {
    const line = recomputeLine({ ...lines[i], gains, deductions }, p);
    setRun({ lines: lines.map((l, j) => (j === i ? line : l)) });
    setEditLine(null);
  };

  /* ═══ LA PAIE DOIT ENTRER DANS LES DÉPENSES ═══

     Un run pouvait être validé, payé, clôturé sans qu'un franc n'apparaisse
     jamais aux Dépenses : la masse salariale sortait de la caisse et le
     résultat du salon l'ignorait. Le Partage croyait alors le salon plus
     riche qu'il n'est, exactement du montant des salaires.

     LA CLÉ EST CELLE DE PERSONNEL & PAIE (`exp-paie-<mois>-<dossier>`) : les
     deux chemins — « Confirmer le règlement » à l'écran Personnel, et le run
     ici — écrivent donc LA MÊME ligne. Passer par les deux ne double rien.

     C'est le NET qui sort de la caisse, donc c'est lui la dépense. Les
     cotisations retenues ne sont pas une charge tant qu'elles n'ont pas été
     versées : elles le deviendront le jour où elles partiront, par leur
     propre ligne. */
  const chargeId = (l: PayrollLine) => chargeSalaireId(run.period, l.employeeId);
  /* Une Map, pas un some/find linéaire par ligne à chaque rendu de la modale. */
  const expParId = useMemo(() => new Map(allExpenses.map((e) => [e.id, e])), [allExpenses]);
  const lignesAvecCharge = lines.filter((l) => expParId.has(chargeId(l)));
  const chargesAJour = lines.every((l) => {
    const e = expParId.get(chargeId(l));
    return !(l.result.net > 0) || (e && e.amountXof === l.result.net);
  });

  const inscrireCharges = () => {
    /* La charge est datée du jour du RÈGLEMENT (en heure LOCALE — voir
       jourLocalDe) et construite par le constructeur COMMUN aux deux chemins :
       même libellé, même catégorie, pas de caisse fantôme, et la marque
       `source: 'run'` verrouille la resynchronisation de Personnel. */
    for (const l of lines) {
      if (!(l.result.net > 0)) continue;
      const charge = chargeSalaire({
        mois: run.period, employeeId: l.employeeId, branchId: branch.id,
        nom: l.name, netXof: l.result.net,
        stamp: run.paidAt ?? run.closedAt, source: 'run',
      });
      expensesStore.set((prev) => (prev.some((e) => e.id === charge.id)
        ? prev.map((e) => (e.id === charge.id ? charge : e))
        : [charge, ...prev]));
    }
    expenseCategoriesStore.set((prev) =>
      prev.some((c) => c.name === SALAIRES_CATEGORIE) ? prev : [...prev, { id: 'ec-salaires', name: SALAIRES_CATEGORIE, subs: [] }]);
    inscrireLesRetenues();
  };

  /* LA RETENUE DEVIENT UN REMBOURSEMENT — au règlement, pas avant. Tant que le
     bulletin est un brouillon, rien ne doit bouger dans la dette : un run
     abandonné aurait soldé un prêt qui n’a rien reçu.

     SANS CAISSE, ET C’EST LE POINT : l’argent n’est jamais sorti de la Maison,
     il a seulement été déduit du salaire. Le faire passer par un tiroir le
     ferait entrer deux fois. L’identifiant est DÉTERMINISTE — rejouer le
     règlement ne double pas le remboursement. */
  const inscrireLesRetenues = () => {
    const nouvelles: Pret[] = [];
    for (const l of lines) {
      const montant = l.deductions.autresRetenues;
      if (!(montant > 0)) continue;
      const etats = etatsDesEmprunteurs(lesPrets, branch.id, nowStamp().slice(0, 10));
      const e = etats.find((x) => x.personneId === l.employeeId
        || x.nom.trim().toLowerCase() === l.name.trim().toLowerCase());
      if (!e || e.reste <= 0) continue;
      nouvelles.push({
        id: `prt-ret-${run.period}-${l.employeeId}`,
        branchId: branch.id,
        date: (run.paidAt ?? nowStamp()).slice(0, 10),
        type: 'remboursement',
        associe: e.nom,
        motif: `Retenue sur le bulletin de ${run.period}`,
        amountXof: Math.min(montant, e.reste),
        genre: e.genre,
        personneId: e.personneId,
      });
    }
    if (nouvelles.length === 0) return;
    setLesPrets((prev) => {
      const dedans = new Set(prev.map((x) => x.id));
      return [...prev, ...nouvelles.filter((n) => !dedans.has(n.id))];
    });
  };

  const retirerCharges = () => {
    if (!window.confirm('Retirer du registre des Dépenses les charges de salaire de ce run ? Le résultat du salon remontera d’autant.')) return;
    const ids = new Set(lines.map(chargeId));
    expensesStore.set((prev) => prev.filter((e) => !ids.has(e.id)));
  };

  /* Cycle de vie — un run clôturé est immuable (les chiffres sont figés). */
  const advance = (next: RunStatus) => {
    if (next === 'paye' && !window.confirm(
      `Marquer ce run payé ?\n\nLa masse salariale nette (${fmtMoney(t.net, currency)}) s'inscrira dans les Dépenses, en catégorie Salaires, c'est ce qui la fait compter dans le résultat du salon et dans le Partage.`,
    )) return;
    if (next === 'cloture' && !window.confirm('Clôturer ce run ? Il deviendra immuable, toute correction passera par un run de régularisation le mois suivant.')) return;
    const stamp = next === 'valide' ? { validatedAt: nowStamp() } : next === 'paye' ? { paidAt: nowStamp() } : next === 'cloture' ? { closedAt: nowStamp() } : {};
    setRun({ status: next, ...stamp });
    if (next === 'paye') inscrireCharges();
  };
  const nextStatus: Record<RunStatus, RunStatus | null> = { brouillon: 'valide', valide: 'paye', paye: 'cloture', cloture: null };
  const next = nextStatus[run.status];

  const bulletinFor = (l: PayrollLine) => bulletinHref(asset('/bulletin.html'), {
    nom: l.name, poste: l.poste, matricule: l.matricule, cnssnum: l.cnssNum, periode: run.period,
    base: l.gains.base, hs: l.gains.heuresSup, prime: l.gains.prime, pourboires: l.gains.pourboires,
    commission: l.gains.commission, avance: l.deductions.avance, retenue: l.deductions.autresRetenues,
    paiement: l.paiement,
    /* LE TAUX SUIT LE BULLETIN. La page refait le calcul de son côté et
       retomberait sur ses 3,6 % par défaut : elle imprimerait alors un net
       inférieur à celui du run, et à celui que l'employé a reçu. */
    cnssPct: tauxCnssSalarial(p),
    itsActif: itsEstActif(p),
  });

  const exportCsv = () => {
    const head = ['Matricule', 'Nom', 'Poste', 'Brut', 'CNSS salariale', 'ITS', 'Retenues', 'Net a payer', 'CNSS patronale', 'Cout employeur'];
    const rows = lines.map((l) => [
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
          <span className="mnd-muted" style={{ fontSize: 12 }}>{run.atelier ?? branch.city} · {lines.length} employé{lines.length > 1 ? 's' : ''}</span>
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
        <div className="tre-inline-note" style={{ marginTop: 12 }}><span className="mark">!</span><span>Run {RUN_STATUS_LABEL[run.status].toLowerCase()}, les lignes sont figées. {run.status === 'cloture' ? 'Toute correction passe par un run de régularisation.' : ''}</span></div>
      )}

      {/* LE PONT VERS LES DÉPENSES, VISIBLE. Un run payé dont les charges ne
          sont pas inscrites ment au résultat du salon : il faut que ça se voie
          et que ça se répare d'un geste, y compris sur un run déjà clôturé. */}
      {(run.status === 'paye' || run.status === 'cloture') && (
        <div
          className="tre-inline-note"
          style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          <span className="mark">{chargesAJour && lignesAvecCharge.length > 0 ? '✓' : '!'}</span>
          <span style={{ flex: 1, minWidth: 240 }}>
            {lignesAvecCharge.length === 0 ? (
              <>
                <b>Ces salaires ne comptent nulle part.</b> Rien n'est inscrit aux Dépenses : le résultat du
                salon et le Partage ignorent {fmtMoney(t.net, currency)} réellement sortis de la caisse.
              </>
            ) : chargesAJour ? (
              <>
                Charges inscrites aux Dépenses · catégorie <b>Salaires</b> ·{' '}
                {lignesAvecCharge.length} ligne{lignesAvecCharge.length > 1 ? 's' : ''} pour {fmtMoney(t.net, currency)}.
              </>
            ) : (
              <>
                <b>Les charges inscrites ne correspondent plus au run.</b> Mettez-les à jour pour que le
                résultat du salon dise la vérité.
              </>
            )}
          </span>
          <span style={{ display: 'inline-flex', gap: 8 }}>
            {!(chargesAJour && lignesAvecCharge.length > 0) && (
              <Button size="sm" variant="copper" onClick={inscrireCharges}>
                {lignesAvecCharge.length === 0 ? 'Inscrire aux Dépenses' : 'Mettre à jour'}
              </Button>
            )}
            {lignesAvecCharge.length > 0 && (
              <Button size="sm" variant="ghost" onClick={retirerCharges}>Retirer</Button>
            )}
          </span>
        </div>
      )}

      {/* Un rituel honoré dont le maître ne correspond à aucun dossier n'alimente
          AUCUNE commission — on le dit, au lieu d'un zéro silencieux. */}
      {orphanMasters.length > 0 && (
        <div className="tre-inline-note" style={{ marginTop: 12 }}>
          <span className="mark">!</span>
          <span>
            Maître{orphanMasters.length > 1 ? 's' : ''} au planning sans dossier dans l’équipe :{' '}
            <b>{orphanMasters.join(' · ')}</b>, leurs rituels honorés du mois ne comptent dans aucune
            commission. Nom renommé ou orthographe différente ? Alignez le dossier (Équipe) puis recréez
            le run en brouillon.
          </span>
        </div>
      )}

      {/* Lignes */}
      <div className="mnd-scroll-x" style={{ marginTop: 14 }}>
        <table className="tre-table">
          <thead><tr><th>Employé</th><th>Brut</th><th>CNSS</th><th>ITS</th><th>Retenues</th><th>Net à payer</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
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

      {editLine != null && <LineEditor line={lines[editLine]} bareme={p} onClose={() => setEditLine(null)} onSave={(g, d) => saveLine(editLine, g, d)} />}
    </Modal>
  );
}

function LineEditor({ line, bareme, onClose, onSave }: { line: PayrollLine; bareme: PayrollParameters; onClose: () => void; onSave: (g: PayGains, d: PayDeductions) => void }) {
  const { currency } = useBranch();
  const [g, setG] = useState({
    base: String(line.gains.base), heuresSup: String(line.gains.heuresSup), prime: String(line.gains.prime),
    pourboires: String(line.gains.pourboires), commission: String(line.gains.commission), indemnites: String(line.gains.indemnites),
  });
  const [d, setD] = useState({ avance: String(line.deductions.avance), autresRetenues: String(line.deductions.autresRetenues) });
  const gains: PayGains = { base: digits(g.base), heuresSup: digits(g.heuresSup), prime: digits(g.prime), pourboires: digits(g.pourboires), commission: digits(g.commission), indemnites: digits(g.indemnites) };
  const deductions: PayDeductions = { avance: digits(d.avance), autresRetenues: digits(d.autresRetenues) };
  /* L'aperçu calcule avec les MÊMES barèmes que l'enregistrement (ceux en vigueur
     pour la période du run) — avec la graine, il mentait dès que le comptable
     ajustait un taux : l'écran annonçait un net différent de celui sauvegardé. */
  const preview = computePay(gains, deductions, bareme);

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
  const cnssActif = cnssEstActive(p);
  const itsActif = itsEstActif(p);

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
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="tre-sec-label">CNSS · pension & prestations</div>
          {/* L'INTERRUPTEUR, PAS LA MISE À ZÉRO DES TAUX. Effacer les taux
              perdrait des chiffres qu'il faudrait retrouver le jour de la
              déclaration ; l'interrupteur les garde intacts et éteint le
              calcul. Les deux parts s'éteignent ensemble — on ne déclare pas
              à moitié. */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={cnssActif}
              onChange={(e) => patch({ cnssActive: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--color-copper)', cursor: 'pointer' }}
            />
            <span>{cnssActif ? 'CNSS appliquée' : 'CNSS suspendue'}</span>
          </label>
        </div>

        {!cnssActif && (
          <div className="tre-inline-note" style={{ marginBottom: 14 }}>
            <span className="mark">!</span>
            <span>
              <b>Aucune cotisation n'est retenue ni due</b> tant que cet interrupteur est éteint, ni part
              salariale, ni part patronale, sur les bulletins comme dans le coût employeur. Les taux ci-dessous
              sont conservés : le jour où les employés seront déclarés, il suffira de rallumer.
            </span>
          </div>
        )}

        <div className="tr-grid tr-grid--2" style={cnssActif ? undefined : { opacity: 0.45 }}>
          {num('Part salariale (pension)', 'cnssSalarialePct', '% du brut')}
          {num('Part patronale · pension', 'cnssPatronalePensionPct', '% du brut')}
          {num('Part patronale · prestations familiales', 'cnssPatronaleFamillePct', '% du brut')}
          {num('Part patronale · risques professionnels', 'cnssPatronaleRisquePct', '% (1–4)')}
        </div>
      </Card>

      <Card style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="tre-sec-label">ITS · barème progressif (mensuel, sur le brut)</div>
          {/* SON PROPRE INTERRUPTEUR. L'ITS est un IMPÔT, la CNSS une
              cotisation : rien ne lie leur sort, et un interrupteur commun
              ferait tomber l'un en croyant éteindre l'autre. */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={itsActif}
              onChange={(e) => patch({ itsActive: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--color-copper)', cursor: 'pointer' }}
            />
            <span>{itsActif ? 'ITS appliqué' : 'ITS suspendu'}</span>
          </label>
        </div>

        {!itsActif && (
          <div className="tre-inline-note" style={{ marginBottom: 14 }}>
            <span className="mark">!</span>
            <span>
              <b>Aucun impôt n'est retenu</b> tant que cet interrupteur est éteint, le bulletin le dit en
              toutes lettres (« suspendu, non appliqué »), pour qu'un zéro ne se lise pas comme un oubli.
              Le barème ci-dessous est conservé.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...(itsActif ? {} : { opacity: 0.45 }) }}>
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
