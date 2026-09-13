import { createStore, useStore, uid } from '../../../../shared/store';
import { type SignatureTracee } from '../../../../shared/contrats';
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
  /** Les critères de la séance notés sur 5, dans l'ordre du plan du manuel
      des formatrices (13 septembre 2026). Tous posés, ils font la note /20. */
  criteres?: (number | null)[];
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
  /** SON CONTRAT DE FORMATION, signé — 6 septembre 2026.

      L'inscription engage sur la totalité du prix : cette clause-là ne vaut
      QUE signée. Sans document, la Maison n'a réservé une place, un formateur
      et des heures de fauteuil contre rien du tout.
      Voir `shared/contrat-formation`. */
  contrat?: SignatureTracee;
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
/** L'ACOMPTE D'UN PRIX NET, selon la formation — 13 septembre 2026.

    La Maison le fixe EN FRANCS ou EN POURCENTAGE. Le montant en francs
    l'emporte quand il est posé, mais ne dépasse jamais le net : une apprenante
    à qui l'on a consenti une remise ne doit pas un acompte plus grand que ce
    qu'elle paie en tout. Un seul juge pour la carte, la fiche et le Suivi. */
export const depositAmountFor = (net: number, formation?: Formation): number => {
  if (net <= 0) return 0;
  const fixe = formation?.depositXof ?? 0;
  if (fixe > 0) return Math.min(net, Math.round(fixe));
  return Math.round(net * depositPctOf(formation) / 100);
};
/** Ce que dit l'écran à côté du montant : « 40 % » ou « montant fixe ». */
export const depositLabelOf = (formation?: Formation): string =>
  ((formation?.depositXof ?? 0) > 0 ? 'montant fixe' : `${depositPctOf(formation)} %`);
/** Montant d'acompte attendu d'une inscription. */
export const depositAmount = (e: Enrollment, formation?: Formation): number =>
  depositAmountFor(enrollNet(e, formation), formation);
/** L'acompte est-il couvert par les règlements enregistrés ? */
export const depositMet = (e: Enrollment, formation?: Formation): boolean => {
  const net = enrollNet(e, formation);
  return net > 0 && enrollPaid(e) >= depositAmount(e, formation);
};

/* ══ POSER LES DATES DES SÉANCES — 13 septembre 2026 ═══════════════════
   « Quand la formation est achetée, qu'on puisse poser les dates des séances
   en même temps pour chaque module » (Yéman).

   LES SÉANCES VIENNENT DU PROGRAMME, JAMAIS D'UN COMPTE À PART : chaque module
   porte ses séances (`Formation.programme`), dans l'ordre. Une formation sans
   programme chiffré retombe sur une séance par module, puis sur son nombre de
   séances sans module. */
export type SeanceAPlanifier = { sessionNumber: number; moduleIndex?: number };

export function seancesDuProgramme(
  formation?: Pick<Formation, 'modules' | 'programme' | 'sessions'>,
): SeanceAPlanifier[] {
  if (!formation) return [];
  const modules = formation.modules ?? [];
  const comptes = modules.map((_, i) => Math.max(0, Math.round(formation.programme?.[i]?.seances ?? 0)));
  const sortie: SeanceAPlanifier[] = [];
  if (comptes.some((c) => c > 0)) {
    comptes.forEach((c, i) => {
      for (let k = 0; k < c; k++) sortie.push({ sessionNumber: sortie.length + 1, moduleIndex: i });
    });
    return sortie;
  }
  if (modules.length > 0) return modules.map((_, i) => ({ sessionNumber: i + 1, moduleIndex: i }));
  return Array.from({ length: Math.max(0, formation.sessions ?? 0) }, (_, i) => ({ sessionNumber: i + 1 }));
}

/** UNE PAR SEMAINE, OU DES JOURS QUI SE SUIVENT. Les débutantes viennent une
    fois par semaine ; les professionnelles, en jours consécutifs. */
export type RythmeDesSeances = 'hebdo' | 'quotidien';

const deuxChiffres = (n: number) => String(n).padStart(2, '0');
const decale = (iso: string, jours: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + jours);
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
};
const lundiZero = (iso: string) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;

/** LES DATES DE N SÉANCES à partir d'un premier jour.

    LA MAISON FERMÉE NE REÇOIT PAS DE SÉANCE : un jour fermé (lundi = 0) glisse
    au jour ouvert suivant. Une semaine entièrement fermée ne bloque rien, on
    ignore alors les fermetures plutôt que de ne rien poser.
    Midi, jamais minuit : un changement d'heure ne décale pas un jour. */
export function datesDesSeances(
  n: number,
  debut: string,
  rythme: RythmeDesSeances,
  joursFermes: readonly number[] = [],
): string[] {
  if (n <= 0) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || Number.isNaN(new Date(`${debut}T12:00:00`).getTime())) {
    return Array.from({ length: n }, () => '');
  }
  const fermes = new Set(joursFermes.filter((j) => j >= 0 && j <= 6));
  const ouvert = (iso: string) => fermes.size >= 7 || !fermes.has(lundiZero(iso));
  const prochainOuvert = (iso: string) => {
    let d = iso;
    for (let k = 0; k < 7 && !ouvert(d); k++) d = decale(d, 1);
    return d;
  };
  const dates: string[] = [];
  if (rythme === 'hebdo') {
    for (let i = 0; i < n; i++) dates.push(prochainOuvert(decale(debut, 7 * i)));
  } else {
    let d = prochainOuvert(debut);
    for (let i = 0; i < n; i++) {
      dates.push(d);
      d = prochainOuvert(decale(d, 1));
    }
  }
  return dates;
}

/* ══ AJOUTER DES SÉANCES AU BESOIN — 13 septembre 2026 ═════════════════
   « Donne-moi la possibilité de rajouter des séances au besoin » (Yéman).

   LE PROGRAMME EST UN POINT DE DÉPART, PAS UN PLAFOND. Une apprenante lente sur
   un geste, un module qui demande une séance de plus : on l'ajoute là où il
   manque, sous son module.

   DEUX FAÇONS DE NUMÉROTER, et le choix n'est pas esthétique :
   · un dossier SANS AUCUNE SÉANCE se renumérote dans l'ordre des modules : la
     séance ajoutée au module I devient la séance 2, et les suivantes glissent ;
   · un dossier qui PORTE DÉJÀ DES SÉANCES ne renumérote jamais ce qui existe :
     une fiche remplie « séance 3 » ne peut pas devenir « séance 4 » dans son
     dos. Les ajouts prennent les numéros suivants.
   Chaque ligne garde une CLÉ stable : une date corrigée à la main suit sa
   séance quand les numéros bougent. */
export type AjoutDeSeance = { cle: string; moduleIndex?: number };
export type LigneDuPlan = SeanceAPlanifier & { cle: string; ajoutee: boolean };

export function lignesDuPlan(
  base: readonly SeanceAPlanifier[],
  ajouts: readonly AjoutDeSeance[],
  renumeroter: boolean,
  apresLeNumero = 0,
): LigneDuPlan[] {
  const programme: LigneDuPlan[] = base.map((l) => ({ ...l, cle: `p${l.sessionNumber}`, ajoutee: false }));
  const extra: LigneDuPlan[] = ajouts.map((a) => ({ sessionNumber: 0, moduleIndex: a.moduleIndex, cle: a.cle, ajoutee: true }));
  if (renumeroter) {
    const rang = (m?: number) => (m == null ? Number.MAX_SAFE_INTEGER : m);
    return [...programme, ...extra]
      .map((x, i) => ({ x, i }))
      .sort((a, b) => rang(a.x.moduleIndex) - rang(b.x.moduleIndex) || a.i - b.i)
      .map(({ x }, i) => ({ ...x, sessionNumber: i + 1 }));
  }
  let suivant = Math.max(apresLeNumero, 0, ...programme.map((l) => l.sessionNumber)) + 1;
  return [...programme, ...extra.map((x) => ({ ...x, sessionNumber: suivant++ }))];
}
