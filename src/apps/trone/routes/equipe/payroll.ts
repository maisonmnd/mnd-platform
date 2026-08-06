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
/* CLE DISTINCTE DE CELLE DE Personnel.tsx. Les deux magasins reclamaient
   'mnd_salary_advances' avec des formes incompatibles — un tableau ici, un
   dictionnaire par employee la-bas — et `createStore` lit directement
   localStorage : ils ecrivaient donc dans la MEME case, chacun ecrasant l'autre.
   Des avances versees pouvaient disparaitre. C'est ce conflit que `asArray`
   ci-dessus et `healPayrollStores()` plus bas rafistolaient.
   On renomme ce cote-ci : il pousse vers la table `salary_advances`, qui n'a
   jamais existe en base, donc il n'a aucune donnee serveur a preserver. */
export const advancesStore = createStore<SalaryAdvance[]>('mnd_payroll_advances', []);
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
export type Attendance = {
  id: string; employeeId: string; date: string; status: AttendanceStatus; note?: string; branchId?: string;
  /** L'HEURE D'ARRIVÉE ET DE DÉPART, en HH:mm. Le statut du jour disait déjà
      présent ou en retard ; il ne disait pas de combien, ni jusqu'à quand.
      Sans ces deux heures, un dépassement ne se mesure pas — et c'est lui
      qu'on veut récompenser. Chacun les inscrit depuis son propre compte. */
  arrivee?: string;
  depart?: string;
  /** TRACE DE CORRECTION. Le gérant peut rectifier un oubli ou une heure
      fantaisiste, jamais en silence : on garde qui a corrigé, quand, et ce
      qui était inscrit avant. Une correction qui s'efface elle-même vaut
      moins qu'une absence de correction. */
  corrigePar?: string;
  corrigeAt?: string;
  avant?: { arrivee?: string; depart?: string };
};
export const attendanceStore = createStore<Attendance[]>('mnd_attendance', []);
export const useAttendance = (): [Attendance[], typeof attendanceStore.set] => {
  const [v, set] = useStore(attendanceStore);
  return [asArray<Attendance>(v), set];
};
bindCollection(attendanceStore, 'attendance');

/* ── LE BARÈME DE POINTS ────────────────────────────────────────────────
   Ce qui rend le personnel autonome : chacun pointe, et voit ses points
   grandir. Celui qui ne pointe pas ne marque rien — la règle est la même
   pour tous et ne demande à personne d'aller réclamer son dû.

   Trois sources, et rien d'autre : avoir pointé, être arrivé à l'heure, être
   resté au-delà. La production a déjà ses primes de seuil ; mêler les deux
   ferait payer deux fois le même mérite.

   LA PRIME SE GAGNE SUR UN SEUIL, PAS SUR UN RANG — décision du 6 août. Qui
   dépasse le seuil la touche, fussent-ils trois : on récompense d'avoir bien
   tenu son mois, pas d'avoir fait mieux que le voisin. Personne ne perd sa
   prime parce qu'un collègue a fait plus fort. */
export type BaremePoints = {
  /** Minutes de grâce sur l'ouverture — arriver à 09h03 pour 09h00 n'est pas un retard. */
  toleranceMin: number;
  ptsPointage: number;      // avoir inscrit son arrivée ET son départ
  ptsPonctualite: number;   // arrivé dans la tolérance
  ptsParHeureSup: number;   // par heure entière au-delà de la fermeture
  seuilPrime: number;       // points à dépasser
  primeXof: number;
};
export const BAREME_POINTS_DEFAUT: BaremePoints = {
  toleranceMin: 5, ptsPointage: 1, ptsPonctualite: 3, ptsParHeureSup: 2,
  seuilPrime: 60, primeXof: 10000,
};
export const baremePointsStore = createStore<BaremePoints>('mnd_bareme_points', BAREME_POINTS_DEFAUT);
export const useBaremePoints = () => useStore(baremePointsStore);
bindDocument(baremePointsStore, 'mnd_bareme_points');

/* ── LA PREUVE DE PRÉSENCE ──────────────────────────────────────────────
   Sans elle, le pointage n'est pas un pointage : c'est une déclaration, et
   rien n'empêche de l'écrire depuis son lit. La trace de correction permet au
   gérant de rectifier après coup — c'est une réparation, jamais une preuve.

   DEUX VOIES, décidées le 6 août. La POSITION d'abord : le téléphone doit se
   trouver dans un rayon réglé autour du salon, et personne n'a de geste
   quotidien à faire. Le CODE ensuite, en secours : le GPS hésite en intérieur,
   se refuse quand la permission n'est pas donnée, et une journée de travail ne
   peut pas dépendre d'un satellite.

   Le code n'est pas un secret cryptographique — qui sait interroger la base le
   lira. Il demande seulement d'avoir été AU COMPTOIR pour le voir, ce qui est
   exactement ce qu'on veut prouver. Comme le reste de cette application, il
   protège de la négligence, pas d'une volonté de tricher. */
export type PointageConfig = {
  /** Le pointage exige-t-il une preuve ? Faux tant que rien n'est réglé. */
  exigerPreuve: boolean;
  lat?: number;
  lng?: number;
  rayonM: number;
  /** Le code du jour, et le jour qu'il couvre. */
  codeValeur?: string;
  codeDate?: string;
};
export const POINTAGE_DEFAUT: PointageConfig = { exigerPreuve: false, rayonM: 150 };
export const pointageConfigStore = createStore<PointageConfig>('mnd_pointage_config', POINTAGE_DEFAUT);
export const usePointageConfig = () => useStore(pointageConfigStore);
bindDocument(pointageConfigStore, 'mnd_pointage_config');

/** Distance en mètres entre deux points — formule de la corde (haversine).
    Le rayon de la Terre suffit à la précision qu'on cherche : on compare des
    dizaines de mètres, pas des centimètres. */
export const distanceM = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

/** Le code du jour — quatre chiffres, renouvelés au premier regard d'un jour
    nouveau. On ne le calcule pas depuis la date : un code déductible se
    devinerait à l'avance, et l'on veut qu'il faille être passé au comptoir. */
export const codeDuJour = (cfg: PointageConfig, aujourdhui: string): string => {
  if (cfg.codeDate === aujourdhui && cfg.codeValeur) return cfg.codeValeur;
  return '';
};

/* LE CODE SE RENOUVELLE SEUL — décidé le 6 août. Il y avait un bouton
   « Générer le code d'aujourd'hui » à presser chaque matin : une corvée
   quotidienne, donc une corvée qu'on oublie, et le jour où on l'oublie
   personne ne peut plus pointer sans GPS. Une vérification qui dépend d'un
   geste humain répété finit toujours par céder.

   IL RESTE INVISIBLE À CELUI QUI POINTE. Un code que l'application montre au
   téléphone qui s'en sert ne prouve plus rien : on le lirait depuis son lit.
   Il ne s'affiche qu'au comptoir et dans les Paramètres — là où il faut être,
   ou être responsable, pour le voir. */
export const codeAleatoire = (): string => String(Math.floor(1000 + Math.random() * 9000));

/** Le code d'aujourd'hui, créé s'il manque. `ecrire` n'est appelé que par les
    écrans qui ont le droit de l'afficher ; deux écrans ouverts le même jour
    convergent d'eux-mêmes, la synchro tranchant au dernier écrivant. */
export const assurerCodeDuJour = (
  cfg: PointageConfig,
  aujourdhui: string,
  ecrire: (c: PointageConfig) => void,
): string => {
  const existant = codeDuJour(cfg, aujourdhui);
  if (existant) return existant;
  const neuf = codeAleatoire();
  ecrire({ ...cfg, codeValeur: neuf, codeDate: aujourdhui });
  return neuf;
};

/* ── LES JOURNÉES QUI NE SUIVENT PAS LA SEMAINE ─────────────────────────
   Un inventaire, une fermeture exceptionnelle, une personne à qui l'on a
   demandé de venir plus tard : la semaine type ne sait pas dire ces jours-là.
   Sans elles, le pointage jugeait en retard quelqu'un qui faisait exactement
   ce qu'on lui avait demandé — et une prime se perdait sur un malentendu.

   Une exception SANS `staffId` vaut pour toute la Maison ; avec, elle ne vaut
   que pour cette personne, et l'emporte alors sur celle du salon. Le plus
   précis gagne : c'est la règle habituelle, et c'est celle qu'on attend. */
export type HoraireException = {
  id: string;
  date: string;       // AAAA-MM-JJ
  staffId?: string;   // absent = toute la Maison
  open?: string;
  close?: string;
  closed?: boolean;
  note?: string;
};
export const exceptionsHorairesStore = createStore<HoraireException[]>('mnd_horaires_exceptions', []);
export const useExceptionsHoraires = () => useStore(exceptionsHorairesStore);
bindDocument(exceptionsHorairesStore, 'mnd_horaires_exceptions');

/** L'horaire qui s'applique VRAIMENT à une personne un jour donné. */
export const horaireEffectif = (
  date: string,
  staffId: string | undefined,
  semaine: Record<string, { open: string; close: string; closed: boolean }>,
  exceptions: HoraireException[],
  jourDeLaSemaine: (d: string) => string,
): { open: string; close: string; closed: boolean; exception?: HoraireException } => {
  const base = semaine[jourDeLaSemaine(date)] ?? { open: '09h00', close: '19h00', closed: false };
  const duJour = exceptions.filter((e) => e.date === date);
  /* Le plus précis d'abord : la personne, puis la Maison. */
  const ex = duJour.find((e) => e.staffId && e.staffId === staffId) ?? duJour.find((e) => !e.staffId);
  if (!ex) return base;
  return {
    open: ex.open?.trim() || base.open,
    close: ex.close?.trim() || base.close,
    closed: ex.closed ?? base.closed,
    exception: ex,
  };
};

/** Minutes depuis minuit. Accepte « 09h00 » comme « 09:00 » — les horaires du
    salon s'écrivent avec un h, le pointage avec deux points. */
export const minutesDe = (h: string | undefined): number | undefined => {
  const m = /^(\d{1,2})\s*[h:]\s*(\d{2})$/.exec((h ?? '').trim());
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Les points d'UNE journée. Rend le détail plutôt qu'un total : un point qui
    ne s'explique pas se conteste, et une contestation coûte plus cher que la
    prime. */
export const pointsDuJour = (
  a: Pick<Attendance, 'arrivee' | 'depart'>,
  horaire: { open: string; close: string; closed: boolean } | undefined,
  b: BaremePoints,
): { total: number; pointage: number; ponctualite: number; heuresSup: number; ptsSup: number } => {
  const vide = { total: 0, pointage: 0, ponctualite: 0, heuresSup: 0, ptsSup: 0 };
  const arr = minutesDe(a.arrivee);
  const dep = minutesDe(a.depart);
  if (arr === undefined || dep === undefined) return vide; // qui ne pointe pas ne marque rien
  const pointage = b.ptsPointage;
  const ouverture = minutesDe(horaire?.open);
  const fermeture = minutesDe(horaire?.close);
  const ponctualite = ouverture !== undefined && arr <= ouverture + b.toleranceMin ? b.ptsPonctualite : 0;
  /* Heures ENTIERES au-dela de la fermeture : une demi-heure de rangement
     n'est pas une heure supplementaire, et arrondir au superieur ferait
     payer chaque soir. */
  const heuresSup = fermeture !== undefined && dep > fermeture ? Math.floor((dep - fermeture) / 60) : 0;
  const ptsSup = heuresSup * b.ptsParHeureSup;
  return { total: pointage + ponctualite + ptsSup, pointage, ponctualite, heuresSup, ptsSup };
};

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
