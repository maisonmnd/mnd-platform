import { createStore, useStore, uid } from '../../../../shared/store';
import { bindCollection } from '../../../../shared/sync';
import type { Formation, Payment } from './data';

/* ═══════════════════════════════════════════════════════════════════════════
   Académie MND — Suivi & Certification de l'apprenant.

   Modèle fidèle à la spec (F1 candidature → F2 inscription → F3 séances →
   F4 pratique client → F5 modules → F6 jury → certificat), mais coulé dans
   l'architecture réelle du Trône : app cliente (Vite / GitHub Pages) sans serveur,
   magasins offline-first synchronisés (JSONB par ligne), accès PERSONNEL.

   Écart assumé vs la spec Next.js/Postgres :
   • Pas de schéma relationnel normalisé : les fiches d'une inscription (séances,
     pratiques, évaluations, jury, certificat) sont IMBRIQUÉES dans l'inscription.
     Deux tables au lieu de huit, mises à jour atomiques par apprenant, mêmes règles.
   • Les garde-fous et la machine à états sont tenus côté app (personnel de
     confiance) ; la RLS réserve la lecture/écriture au personnel.
   • Le barème (30/30/40) et les seuils, calculés ici, remplacent la vue SQL.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ---------- F1 · Candidature ---------- */
export type ExperienceLevel = 'aucune' | 'amateur' | 'pro';
export type ApplicationDecision = 'admis' | 'attente' | 'refuse';

export type AcademyApplication = {
  id: string;
  createdAt: string;
  fullName: string;
  phoneWhatsapp: string;
  city?: string;
  experienceLevel?: ExperienceLevel;
  formationId?: string;
  motivation?: string;
  interviewNotes?: string;
  /** Test d'observation à l'entretien — chaque critère /5. */
  observationTest?: { geste?: number; hygiene?: number; posture?: number };
  decision?: ApplicationDecision;
  decidedBy?: string;
  decidedAt?: string;
};

/* ---------- Machine à états de l'inscription ---------- */
export type EnrollmentStatus =
  | 'candidat' | 'admis' | 'inscrit' | 'en_formation' | 'en_evaluation'
  | 'jury_planifie' | 'certifie' | 'ajourne' | 'abandonne' | 'suspendu';

/** Chemin nominal — la progression suit cet ordre ; les branches (abandonne,
    ajourne, suspendu) se posent hors ligne droite. */
export const STATUS_FLOW: EnrollmentStatus[] = [
  'candidat', 'admis', 'inscrit', 'en_formation', 'en_evaluation', 'jury_planifie', 'certifie',
];

export const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  candidat: 'Candidat', admis: 'Admis', inscrit: 'Inscrit', en_formation: 'En formation',
  en_evaluation: 'En évaluation', jury_planifie: 'Jury planifié', certifie: 'Certifié',
  ajourne: 'Ajourné', abandonne: 'Abandon', suspendu: 'Suspendu',
};

/** Transitions autorisées. Les gardes métier (jury, certificat) s'ajoutent par-dessus. */
export const STATUS_NEXT: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  candidat: ['admis', 'abandonne'],
  admis: ['inscrit', 'abandonne'],
  inscrit: ['en_formation', 'suspendu', 'abandonne'],
  en_formation: ['en_evaluation', 'suspendu', 'abandonne'],
  en_evaluation: ['jury_planifie', 'suspendu', 'abandonne'],
  jury_planifie: ['certifie', 'ajourne', 'abandonne'],
  certifie: [],
  ajourne: ['jury_planifie', 'abandonne'], // repasse le jury (retour sous 3 mois)
  abandonne: [],
  suspendu: ['en_formation', 'inscrit', 'abandonne'], // reprise après régularisation
};

/* ---------- F3 · Séance (planifiée) + fiche de suivi ----------
   Séance et fiche fusionnées : 1 séance = 1 fiche. `trainerSignedAt` posé →
   la fiche est validée et compte dans le contrôle continu. */
export type Attendance = 'present' | 'retard' | 'absent_justifie' | 'absent';

export type SessionEntry = {
  id: string;
  moduleIndex?: number; // module du parcours (index dans formation.modules)
  sessionNumber: number;
  scheduledAt: string;
  durationMinutes?: number;
  trainer?: string;
  attendance?: Attendance;
  objectives?: string;
  technicalScore?: number; // /20
  trainerNotes?: string;
  reworkItems?: string[];
  trainerSignedAt?: string; // signature formateur → fiche validée
  learnerAckAt?: string;    // visa apprenant
};

/* ---------- F4 · Pratique sur client réel (lien CRM) ---------- */
export type PracticeRole = 'observation' | 'assiste' | 'autonome_supervise';
export type PracticeRecord = {
  id: string;
  clientId: string;   // fiche du Carnet de Suivi
  clientName?: string;
  serviceCode: string; // 'VÈKPÈ', 'SÍNSIN', 'GBÈZÀ'…
  practicedAt: string;
  role: PracticeRole;
  supervisor?: string;
  /** Grille technique — chaque critère /5. */
  technicalGrid: { preparation?: number; geste?: number; tension?: number; finition?: number; temps?: number };
  clientRating?: number; // 1..5
  clientComment?: string;
  supervisorValidation?: 'acquise' | 'a_refaire';
};

/* ---------- F5 · Évaluation de module ---------- */
export type ModuleEvaluation = {
  id: string;
  moduleIndex: number;
  attempt: number; // 1 = initial, 2 = rattrapage
  /** Critères /20. */
  criteria: { theorie?: number; preparation?: number; geste?: number; relationClient?: number; hygiene?: number };
  score: number; // /100
  evaluator?: string;
  evaluatorComment?: string;
  evaluatedAt: string;
};

/* ---------- F6 · Jury final ---------- */
export type JuryRole = 'president' | 'formateur' | 'externe';
export type JuryMember = { name: string; role: JuryRole };
export type JuryDecision = 'certifie' | 'excellence' | 'ajourne';
export type JuryReview = {
  scheduledAt: string;
  members: JuryMember[];
  practicalScore?: number; // /40
  oralScore?: number;      // /30
  dossierScore?: number;   // /30
  decision?: JuryDecision;
  minutesSigned?: boolean; // PV signé
  decidedAt?: string;
};

/* ---------- Certificat ---------- */
export type AcademyCertificate = {
  number: string; // MND-AC-AAAA-NNNN
  mention: 'certifie' | 'excellence';
  finalScore: number;
  qrToken: string; // /verifier/{qr_token}
  issuedAt: string;
  isPublic: boolean;
};

/* ---------- F2 · Inscription (porte tout le dossier imbriqué) ---------- */
export type Enrollment = {
  id: string;
  applicationId?: string;
  clientId?: string;    // lien CRM optionnel (une apprenante peut être une cliente)
  learnerName: string;
  formationId: string;
  cohortLabel?: string; // « Fondation · Sept 2026 »
  startDate?: string;
  endDate?: string;
  status: EnrollmentStatus;
  statusReason?: string; // motif abandon / suspension
  depositPaid?: boolean; // acompte 40 % (suivi manuel)
  attendanceAlert?: boolean; // 3 absences non justifiées
  createdAt: string;
  /** F1 · candidature portée dans le dossier (staff-only) : entretien + test d'observation. */
  interviewNotes?: string;
  observation?: { geste?: number; hygiene?: number; posture?: number };
  /** Formation (suivi manuel) : montant NET convenu (après remise), remise, règlements. */
  priceXof?: number;
  remiseXof?: number;
  payments?: Payment[];
  sessions: SessionEntry[];       // F3
  practice: PracticeRecord[];     // F4
  evaluations: ModuleEvaluation[];// F5
  jury?: JuryReview;              // F6
  certificate?: AcademyCertificate;
};

/* ---------- Magasins ---------- */
export const academyApplicationsStore = createStore<AcademyApplication[]>('mnd_academy_applications', []);
export const useAcademyApplications = () => useStore(academyApplicationsStore);
export const enrollmentsStore = createStore<Enrollment[]>('mnd_academy_enrollments', []);
export const useEnrollments = () => useStore(enrollmentsStore);

bindCollection(academyApplicationsStore, 'academy_applications');
bindCollection(enrollmentsStore, 'academy_enrollments');

/* ---------- Barème & seuils (remplace la vue SQL v_enrollment_final_score) ---------- */
const round2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export const sessionValidated = (s: SessionEntry) => !!s.trainerSignedAt;
export const evalPassed = (e: ModuleEvaluation) => e.score >= 70;
export const juryTotal = (j?: JuryReview): number =>
  j ? (j.practicalScore ?? 0) + (j.oralScore ?? 0) + (j.dossierScore ?? 0) : 0;

export type Scoring = {
  continu: number | null; // /100 — moyenne des fiches F3 validées (note /20 ×5)
  modules: number | null; // /100 — moyenne des F5 réussis
  jury: number | null;    // /100 — total F6
  final: number;          // /100 — 30 % continu + 30 % modules + 40 % jury
};

/** Note finale 30/30/40 — les composantes absentes comptent 0 dans le total,
    mais s'affichent « — » tant qu'aucune donnée ne les nourrit. */
export function scoreEnrollment(e: Enrollment): Scoring {
  const cont = e.sessions
    .filter(sessionValidated)
    .map((s) => s.technicalScore)
    .filter((x): x is number => typeof x === 'number');
  const continu = cont.length ? round2(avg(cont) * 5) : null;

  const passed = e.evaluations.filter(evalPassed).map((x) => x.score);
  const modules = passed.length ? round2(avg(passed)) : null;

  const jury = e.jury ? juryTotal(e.jury) : null;

  const final = round2((continu ?? 0) * 0.3 + (modules ?? 0) * 0.3 + (jury ?? 0) * 0.4);
  return { continu, modules, jury, final };
}

export type Mention = 'ajourne' | 'certifie' | 'excellence';
/** Seuils : < 70 ajourné · 70–84 certifié · ≥ 85 Excellence. */
export function mentionFor(final: number): Mention {
  return final < 70 ? 'ajourne' : final < 85 ? 'certifie' : 'excellence';
}
export const MENTION_LABEL: Record<Mention, string> = {
  ajourne: 'Ajourné', certifie: 'Certifié', excellence: 'Certifié · Mention Excellence',
};

/* ---------- Garde-fous (spec §1) ---------- */
/** Chaque module de la formation a une F5 « passed ». */
export function allModulesPassed(e: Enrollment, moduleCount: number): boolean {
  if (moduleCount <= 0) return false;
  for (let i = 0; i < moduleCount; i++) {
    if (!e.evaluations.some((ev) => ev.moduleIndex === i && evalPassed(ev))) return false;
  }
  return true;
}
/** en_evaluation → jury_planifie : interdit tant qu'un module n'est pas validé. */
export const canPlanJury = (e: Enrollment, moduleCount: number) => allModulesPassed(e, moduleCount);
/** Certificat : F6 décidée « certifie/excellence » ET PV signé. */
export const canCertify = (e: Enrollment): boolean =>
  !!e.jury && (e.jury.decision === 'certifie' || e.jury.decision === 'excellence') && !!e.jury.minutesSigned;

/* ---------- Numéro de certificat séquentiel MND-AC-AAAA-NNNN ---------- */
export function nextCertNumber(enrollments: Enrollment[]): string {
  const year = new Date().getFullYear();
  let max = 0;
  for (const e of enrollments) {
    const m = e.certificate?.number.match(/^MND-AC-(\d{4})-(\d{4})$/);
    if (m && m[1] === String(year)) max = Math.max(max, parseInt(m[2], 10));
  }
  return `MND-AC-${year}-${String(max + 1).padStart(4, '0')}`;
}

/* ---------- Écritures (helpers) ---------- */
export const setEnrollment = (id: string, patch: Partial<Enrollment>) =>
  enrollmentsStore.set((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

export const newEnrollment = (init: Pick<Enrollment, 'learnerName' | 'formationId'> & Partial<Enrollment>): Enrollment => ({
  id: `enr-${uid()}`,
  status: 'inscrit',
  createdAt: new Date().toISOString(),
  sessions: [],
  practice: [],
  evaluations: [],
  ...init,
});

/* ---------- Formation (suivi manuel) ----------
   `priceXof` = NET convenu (ce qui est dû). Repli sur le prix catalogue de la
   formation tant que rien n'est saisi. */
export const DEFAULT_DEPOSIT_PCT = 40;
export const depositPctOf = (formation?: Formation): number => formation?.depositPct ?? DEFAULT_DEPOSIT_PCT;

export const enrollNet = (e: Enrollment, formation?: Formation): number =>
  e.priceXof != null ? e.priceXof : (formation?.priceXof ?? 0);
export const enrollGross = (e: Enrollment, formation?: Formation): number =>
  enrollNet(e, formation) + (e.remiseXof ?? 0);
export const enrollPaid = (e: Enrollment): number =>
  (e.payments ?? []).reduce((s, p) => s + p.amountXof, 0);
export const enrollDue = (e: Enrollment, formation?: Formation): number =>
  Math.max(0, enrollNet(e, formation) - enrollPaid(e));
/** Montant d'acompte attendu = net × pourcentage de la formation. */
export const depositAmount = (e: Enrollment, formation?: Formation): number =>
  Math.round(enrollNet(e, formation) * depositPctOf(formation) / 100);
/** L'acompte est-il couvert par les règlements enregistrés ? */
export const depositMet = (e: Enrollment, formation?: Formation): boolean => {
  const net = enrollNet(e, formation);
  return net > 0 && enrollPaid(e) >= depositAmount(e, formation);
};
