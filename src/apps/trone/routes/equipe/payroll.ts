import { createStore, useStore } from '../../../../shared/store';
import { bindCollection, bindDocument } from '../../../../shared/sync';

/* ═══════════════════════════════════════════════════════════════════════════
   Paie · moteur de calcul (règles béninoises) — LA SOURCE DE VÉRITÉ.

   La spec vise Postgres côté serveur ; Le Trône est une app cliente (Vite, sans
   serveur). Le calcul vit donc ici, en TypeScript, et CE module est la seule
   source de vérité : le run de paie ET le lien du bulletin s'en servent, aucun
   recalcul ailleurs. Montants en FCFA ENTIERS (jamais de flottant persisté).

   Barèmes et taux ne sont JAMAIS codés en dur dans le calcul : ils vivent dans
   `payrollParametersStore`, versionnés par date d'effet, éditables à l'écran
   « Paramètres de paie » — « à faire valider par votre comptable avant le premier
   run réel ». Les valeurs de départ ci-dessous viennent de la spec.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Une tranche du barème ITS. `upTo` = plafond mensuel FCFA ; null = au-delà. */
export type ItsBracket = { upTo: number | null; rate: number };

export type PayrollParameters = {
  /** Date d'effet (ISO AAAA-MM-JJ) — le run choisit la version applicable au mois. */
  effectiveFrom: string;
  cnssSalarialePct: number;          // pension, part salariale (départ 3,6 %)
  cnssPatronalePensionPct: number;   // pension, part patronale (départ 6,4 %)
  cnssPatronaleFamillePct: number;   // prestations familiales (départ 9 %)
  cnssPatronaleRisquePct: number;    // risques professionnels (1–4 % selon activité)
  /** Congés payés : jours ouvrables acquis par mois de service (référence Bénin : 2). */
  congesJoursParMois: number;
  its: ItsBracket[];                 // barème progressif ITS (mensuel)
};

/* Valeurs de départ (spec) — PROVISOIRES, à faire valider par le comptable. */
export const PAYROLL_PARAMETERS_SEED: PayrollParameters = {
  effectiveFrom: '2026-01-01',
  cnssSalarialePct: 3.6,
  cnssPatronalePensionPct: 6.4,
  cnssPatronaleFamillePct: 9,
  cnssPatronaleRisquePct: 2, // médiane de la fourchette 1–4, à préciser selon l'activité
  congesJoursParMois: 2,
  its: [
    { upTo: 60000, rate: 0 },
    { upTo: 150000, rate: 10 },
    { upTo: 250000, rate: 15 },
    { upTo: 500000, rate: 19 },
    { upTo: null, rate: 30 },
  ],
};

/* Garde-fou transversal du module. Toute valeur de magasin lue ici est censée
   être un TABLEAU, mais une clé localStorage héritée d'une forme antérieure, ou
   une ligne distante abîmée, peut renvoyer autre chose (objet, null, nombre).
   `.filter`/`.map`/`.reduce` casseraient alors la page (« v.filter is not a
   function »). On retombe systématiquement sur un tableau plutôt que de casser.
   Les hooks du module renvoient déjà des tableaux — mais on garde aussi les
   fonctions pures (runTotals, congeBalance, parametersFor) défensives, car elles
   reçoivent des valeurs de magasin directement. */
export const asArray = <T,>(v: T[]): T[] => (Array.isArray(v) ? v : []);

/* Le magasin porte l'historique des versions (au moins une). Doc singleton
   synchronisé — lecture/écriture réservées au personnel par la RLS `documents`. */
export const payrollParametersStore = createStore<PayrollParameters[]>('mnd_payroll_params', [PAYROLL_PARAMETERS_SEED]);
export const usePayrollParameters = (): [PayrollParameters[], typeof payrollParametersStore.set] => {
  const [v, set] = useStore(payrollParametersStore);
  return [normalizeParams(v), set];
};
bindDocument(payrollParametersStore, 'mnd_payroll_params');

/** Normalise la valeur du magasin en TABLEAU de versions. Le magasin porte un
    tableau, mais une ligne `documents` héritée d'une version antérieure du module
    a pu y stocker un OBJET seul (non tableau) — et cette table survit aux
    déploiements comme au reset localStorage. Sans cette normalisation, tout
    lecteur qui fait `.filter`/`.length` casse (« x.filter is not a function »). */
export function normalizeParams(v: unknown): PayrollParameters[] {
  if (Array.isArray(v)) return v as PayrollParameters[];
  if (v && typeof v === 'object' && 'cnssSalarialePct' in v) return [v as PayrollParameters];
  return [PAYROLL_PARAMETERS_SEED];
}

/** Un barème RÉELLEMENT exploitable par le calcul : sans tranches `its` ni taux
    numérique, `computePay` casserait (`p.its` non itérable). On l'exige avant de
    retourner une version — sinon on retombe sur la graine. */
const isPayrollParameters = (v: unknown): v is PayrollParameters =>
  !!v && typeof v === 'object'
  && typeof (v as PayrollParameters).cnssSalarialePct === 'number'
  && Array.isArray((v as PayrollParameters).its)
  && typeof (v as PayrollParameters).effectiveFrom === 'string';

/** La version applicable à un mois « AAAA-MM » : la plus récente dont la date
    d'effet précède ou égale le 1er du mois. GARANTIT un barème valide (ou la
    graine) — le calcul en aval ne peut donc jamais casser sur des barèmes abîmés. */
export function parametersFor(period: string, versions: PayrollParameters[] = payrollParametersStore.get()): PayrollParameters {
  const list = normalizeParams(versions).filter(isPayrollParameters);
  const firstOfMonth = `${period}-01`;
  const applicable = list
    .filter((v) => v.effectiveFrom <= firstOfMonth)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return applicable ?? list[0] ?? PAYROLL_PARAMETERS_SEED;
}

/* ---------- Le calcul ---------- */
const round = Math.round; // FCFA entiers

/** Gains du mois d'un·e employé·e. Le brut = leur somme. */
export type PayGains = {
  base: number;         // salaire de base
  heuresSup: number;    // heures supplémentaires
  prime: number;        // primes du mois
  pourboires: number;   // part collectée à redistribuer
  commission: number;   // depuis les prestations encaissées, au taux du dossier
  indemnites: number;   // indemnités
};
export type PayDeductions = {
  avance: number;        // avances sur salaire du mois
  autresRetenues: number;// autres retenues libellées
};

export type PayResult = {
  brut: number;
  cnssSalariale: number;   // part salariale (pension)
  its: number;             // impôt sur les traitements et salaires
  retenues: number;        // avances + autres
  net: number;             // net à payer
  cnssPatronale: number;   // part patronale (pension + famille + risque)
  coutEmployeur: number;   // brut + part patronale
};

/** ITS progressif par tranches, appliqué au BRUT (conforme au moteur de référence
    du bulletin : base 333 000 → 39 770). Chaque tranche taxe sa part du brut. */
export function computeIts(brut: number, brackets: ItsBracket[]): number {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const ceiling = b.upTo ?? Infinity;
    if (brut > prev) tax += (Math.min(brut, ceiling) - prev) * (b.rate / 100);
    prev = ceiling;
    if (brut <= ceiling) break;
  }
  return round(tax);
}

/** Le calcul complet d'une ligne de paie, dans l'ordre de la spec. */
export function computePay(gains: PayGains, ded: PayDeductions, p: PayrollParameters): PayResult {
  const brut = round(gains.base + gains.heuresSup + gains.prime + gains.pourboires + gains.commission + gains.indemnites);
  const cnssSalariale = round(brut * p.cnssSalarialePct / 100);
  const its = computeIts(brut, p.its);
  const retenues = round(ded.avance + ded.autresRetenues);
  const net = brut - cnssSalariale - its - retenues;
  const cnssPatronale = round(brut * (p.cnssPatronalePensionPct + p.cnssPatronaleFamillePct + p.cnssPatronaleRisquePct) / 100);
  const coutEmployeur = brut + cnssPatronale;
  return { brut, cnssSalariale, its, retenues, net, cnssPatronale, coutEmployeur };
}

/** Numéro de bulletin MND-BP-AAAA-MM-NNN — NNN = suffixe du matricule MND-EMP-NNN. */
export function bulletinNumber(period: string, matricule: string): string {
  const nnn = (matricule.match(/(\d+)\s*$/)?.[1] ?? '').padStart(3, '0').slice(-3) || '000';
  return `MND-BP-${period}-${nnn}`;
}

/* ---------- Avances sur salaire (retenues au run suivant) ---------- */
export type SalaryAdvance = {
  id: string;
  employeeId: string;
  period: string;   // AAAA-MM auquel l'avance se rattache (déduite à ce run)
  amountXof: number;
  date: string;     // JJ/MM/AAAA
  note?: string;
  branchId?: string;
};
export const advancesStore = createStore<SalaryAdvance[]>('mnd_salary_advances', []);
export const useAdvances = (): [SalaryAdvance[], typeof advancesStore.set] => {
  const [v, set] = useStore(advancesStore);
  return [asArray<SalaryAdvance>(v), set];
};
bindCollection(advancesStore, 'salary_advances');

/* ---------- Temps & absences ---------- */
export type AttendanceStatus = 'present' | 'retard' | 'absent' | 'absent_justifie' | 'maladie';
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: 'Présent', retard: 'Retard', absent: 'Absent', absent_justifie: 'Absent justifié', maladie: 'Maladie',
};
export type Attendance = { id: string; employeeId: string; date: string; status: AttendanceStatus; note?: string; branchId?: string };
export const attendanceStore = createStore<Attendance[]>('mnd_attendance', []);
export const useAttendance = (): [Attendance[], typeof attendanceStore.set] => {
  const [v, set] = useStore(attendanceStore);
  return [asArray<Attendance>(v), set];
};
bindCollection(attendanceStore, 'attendance');

export type LeaveType = 'conge' | 'maladie';
export type LeaveStatus = 'demande' | 'approuve' | 'refuse';
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = { demande: 'En attente', approuve: 'Approuvé', refuse: 'Refusé' };
export type LeaveRequest = {
  id: string; employeeId: string; type: LeaveType;
  startDate: string; endDate: string; days: number;
  reason?: string; justificatif?: string; // note/pièce du justificatif (maladie)
  status: LeaveStatus; decidedBy?: string; decidedAt?: string; branchId?: string;
};
export const leaveStore = createStore<LeaveRequest[]>('mnd_leave_requests', []);
export const useLeave = (): [LeaveRequest[], typeof leaveStore.set] => {
  const [v, set] = useStore(leaveStore);
  return [asArray<LeaveRequest>(v), set];
};
bindCollection(leaveStore, 'leave_requests');

/** Nombre de mois de service révolus entre `since` et aujourd'hui. */
export function monthsOfService(since: string, until: string = new Date().toISOString().slice(0, 10)): number {
  const s = since.slice(0, 10).split('-').map(Number);
  const u = until.slice(0, 10).split('-').map(Number);
  if (s.length < 3 || u.length < 3) return 0;
  let months = (u[0] - s[0]) * 12 + (u[1] - s[1]);
  if (u[2] < s[2]) months -= 1; // le jour du mois n'est pas encore atteint
  return Math.max(0, months);
}

/** Jours calendaires inclus entre deux dates ISO (bornes comprises). */
export function daysInclusive(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Solde de congés payés : acquis (mois de service × taux) − pris (congés approuvés). */
export function congeBalance(since: string, leaves: LeaveRequest[], employeeId: string, joursParMois: number): { acquis: number; pris: number; solde: number } {
  const acquis = monthsOfService(since) * joursParMois;
  const pris = asArray<LeaveRequest>(leaves)
    .filter((l) => l.employeeId === employeeId && l.type === 'conge' && l.status === 'approuve')
    .reduce((s, l) => s + l.days, 0);
  return { acquis, pris, solde: acquis - pris };
}

/* ---------- Runs de paie (un par mois × atelier) ---------- */
export type RunStatus = 'brouillon' | 'valide' | 'paye' | 'cloture';
export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  brouillon: 'Brouillon', valide: 'Validé', paye: 'Payé', cloture: 'Clôturé',
};

/** Une ligne de paie figée du run : entrées (gains/retenues) + résultat calculé.
    Le résultat est STOCKÉ (non recalculé au rendu) pour qu'un run clôturé reste
    immuable même si les barèmes changent ensuite. */
export type PayrollLine = {
  employeeId: string;
  name: string;
  poste?: string;
  matricule?: string;
  cnssNum?: string;
  paiement?: string; // Mobile Money / banque
  gains: PayGains;
  deductions: PayDeductions;
  result: PayResult;
};
export type PayrollRun = {
  id: string;
  period: string; // AAAA-MM
  atelier?: string;
  status: RunStatus;
  lines: PayrollLine[];
  createdAt: string;
  validatedAt?: string;
  paidAt?: string;
  closedAt?: string;
  branchId?: string;
};
export const payrollRunsStore = createStore<PayrollRun[]>('mnd_payroll_runs', []);
export const usePayrollRuns = (): [PayrollRun[], typeof payrollRunsStore.set] => {
  const [v, set] = useStore(payrollRunsStore);
  return [asArray<PayrollRun>(v), set];
};
bindCollection(payrollRunsStore, 'payroll_runs');

/** Répare DURABLEMENT les magasins de paie dont la valeur persistée n'est pas un
    tableau — forme héritée d'une version antérieure du module (localStorage) ou
    ligne `documents` des barèmes revenue en objet seul. À appeler une fois au
    montage de l'écran Paie : réécrit la bonne forme (localStorage + Supabase via
    la synchro), pour que la corruption ne revienne pas à la session suivante. */
export function healPayrollStores(): void {
  if (!Array.isArray(payrollParametersStore.get())) payrollParametersStore.set(normalizeParams(payrollParametersStore.get()));
  if (!Array.isArray(advancesStore.get())) advancesStore.set([]);
  if (!Array.isArray(payrollRunsStore.get())) payrollRunsStore.set([]);
  if (!Array.isArray(attendanceStore.get())) attendanceStore.set([]);
  if (!Array.isArray(leaveStore.get())) leaveStore.set([]);
}

/** Recalcule une ligne (brouillon uniquement) : rejoue computePay sur ses entrées. */
export const recomputeLine = (line: PayrollLine, p: PayrollParameters): PayrollLine =>
  ({ ...line, result: computePay(line.gains, line.deductions, p) });

/** Totaux d'un run — masse salariale (brut), net, cotisations, coût employeur. */
export type RunTotals = { brut: number; net: number; cnssSalariale: number; cnssPatronale: number; its: number; cout: number };
export function runTotals(run: PayrollRun): RunTotals {
  // `?.` + `?? 0` sur chaque champ : une ligne malformée (donnée distante abîmée)
  // ne fausse pas le total et ne casse pas le rendu.
  return asArray<PayrollLine>(run.lines).reduce<RunTotals>((t, l) => ({
    brut: t.brut + (l?.result?.brut ?? 0),
    net: t.net + (l?.result?.net ?? 0),
    cnssSalariale: t.cnssSalariale + (l?.result?.cnssSalariale ?? 0),
    cnssPatronale: t.cnssPatronale + (l?.result?.cnssPatronale ?? 0),
    its: t.its + (l?.result?.its ?? 0),
    cout: t.cout + (l?.result?.coutEmployeur ?? 0),
  }), { brut: 0, net: 0, cnssSalariale: 0, cnssPatronale: 0, its: 0, cout: 0 });
}

/** Identité + montants d'un bulletin, pour pré-remplir bulletin.html. */
export type BulletinLink = {
  nom: string; poste?: string; matricule?: string; cnssnum?: string;
  periode: string; // AAAA-MM
  base: number; hs?: number; prime?: number; pourboires?: number; commission?: number;
  avance?: number; retenue?: number; paiement?: string;
};

/** Lien vers bulletin.html pré-rempli — noms de paramètres EXACTS attendus par la
    page (nom, poste, matricule, cnssnum, periode, base, hs, prime, pourboires,
    commission, avance, retenue, paiement). L'ERP passe les ENTRÉES ; la page
    réaffiche le calcul, qui retombe sur le même net que computePay. */
export function bulletinHref(base: string, b: BulletinLink): string {
  const q = new URLSearchParams();
  q.set('nom', b.nom);
  if (b.poste) q.set('poste', b.poste);
  if (b.matricule) q.set('matricule', b.matricule);
  if (b.cnssnum) q.set('cnssnum', b.cnssnum);
  q.set('periode', b.periode);
  q.set('base', String(b.base));
  if (b.hs) q.set('hs', String(b.hs));
  if (b.prime) q.set('prime', String(b.prime));
  if (b.pourboires) q.set('pourboires', String(b.pourboires));
  if (b.commission) q.set('commission', String(b.commission));
  if (b.avance) q.set('avance', String(b.avance));
  if (b.retenue) q.set('retenue', String(b.retenue));
  if (b.paiement) q.set('paiement', b.paiement);
  return `${base}?${q.toString()}`;
}

/** Échéance de règlement : le 5 du mois suivant la période « AAAA-MM ». */
export function echeanceReglement(period: string): string {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return period;
  let year = Number(m[1]);
  let month = Number(m[2]) + 1;
  if (month > 12) { month = 1; year += 1; }
  return `${year}-${String(month).padStart(2, '0')}-05`;
}
