import { createStore, useStore, HOUSE_BLANK } from '../../../../shared/store';
import type { PaymentMethod } from '../../../../shared/finance';
import type { Appointment } from '../../../../shared/agenda';

/* Équipe & Croissance + Système — données du module.
   Tout est persisté en localStorage (createStore) ; branchId partout où c'est pertinent. */

/* ============================================================
   Dates — « aujourd'hui » se calcule toujours dynamiquement.
   ============================================================ */

export const today = () => new Date();

export const monthLabel = (d: Date = today()) =>
  d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

export const shortDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

/** Ancienneté lisible depuis une date ISO — « 8 ans », « 14 mois », « 3 mois ». */
export function anciennete(sinceIso: string): string {
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(since)) return '—';
  const months = Math.max(0, Math.floor((today().getTime() - since) / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 1) return 'ce mois';
  if (months < 24) return months < 12 ? `${months} mois` : `1 an`;
  return `${Math.floor(months / 12)} ans`;
}

export function ancienneteYears(sinceIso: string): number {
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(since)) return 0;
  return Math.max(0, (today().getTime() - since) / (1000 * 60 * 60 * 24 * 365.25));
}

const isoInDays = (days: number) => {
  const d = today();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/* ============================================================
   1 · Personnel & paie
   ============================================================ */

export type StaffRisk = 'faible' | 'modéré' | 'élevé';

export type StaffMember = {
  id: string;
  branchId: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  since: string; // ISO — l'ancienneté se calcule dynamiquement
  auFauteuil: boolean; // exécute des prestations
  salaireXof: number; // base mensuelle
  commPrestaXof: number;
  commProduitXof: number;
  primeXof: number;
  satisfaction: number; // 0–5 · retours clientes
  wellbeing: number; // 0–100 · indice de bien-être
  charge: number; // 0–100 · charge / capacité
  risk: StaffRisk;
  riskDrivers: string;
  nextStep: string;
  recognition: string;
  statut: string;
  /* — Dossier paie (module RH) — optionnels, renseignés au fil de l'eau. */
  matricule?: string;   // MND-EMP-NNN
  cnssNum?: string;     // n° CNSS
  ifu?: string;         // identifiant fiscal unique
  contractType?: 'CDI' | 'CDD' | 'apprentissage' | 'prestataire';
  atelier?: string;     // atelier d'affectation (Cotonou, Calavi…)
  commissionPct?: number; // taux de commission sur prestations encaissées
  paiement?: string;    // mode/coordonnées de règlement (Mobile Money / banque)
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const STAFF_SEED: StaffMember[] = [];

export const staffStore = createStore<StaffMember[]>('mnd_staff', STAFF_SEED);
export const useStaff = () => useStore(staffStore);

export const netAVerser = (m: StaffMember) =>
  m.salaireXof + m.commPrestaXof + m.commProduitXof + m.primeXof;

/* ============================================================
   2 · Marketing — campagnes, offres instantanées, automatisations
   ============================================================ */

export type Campaign = {
  id: string;
  branchId: string;
  name: string;
  segment: string;
  canal: 'WhatsApp' | 'SMS';
  statut: 'Active' | 'Programmée' | 'Brouillon';
  reach: string;
  lift: string;
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const CAMPAIGNS_SEED: Campaign[] = [];

export const campaignsStore = createStore<Campaign[]>('mnd_campaigns', CAMPAIGNS_SEED);
export const useCampaigns = () => useStore(campaignsStore);

/* Offres instantanées : déplacées vers `shared/offers.ts` (pont Trône → Ma
   Couronne, synchronisé Supabase) — ré-exportées ici pour les routes équipe. */
export {
  OFFER_DAYS, OFFER_AUDIENCES, OFFER_HOURS,
  offersStore, useOffers, offerLiveNow,
  type InstantOffer,
} from '../../../../shared/offers';

export const AUTOMATION_CANAUX = ['WhatsApp', 'Système'] as const;
export type AutomationCanal = (typeof AUTOMATION_CANAUX)[number];

export type Automation = {
  id: string;
  trig: string;
  act: string;
  canal: AutomationCanal;
  runs: number;
};

/* Les six automatisations que la maison fournit. Semence seulement : la liste est
   désormais éditable (la maison crée les siennes), donc ceci ne sert qu'au premier
   chargement. */
export const AUTOMATIONS_SEED: Automation[] = [
  { id: 'a1', trig: 'J-1 avant un rituel', act: 'Rappel WhatsApp + itinéraire', canal: 'WhatsApp', runs: 0 },
  { id: 'a2', trig: 'Loc · jour 365', act: 'Invitation au Couronnement', canal: 'WhatsApp', runs: 0 },
  { id: 'a3', trig: 'Dormante · 90 jours', act: 'Réveil rituel doux', canal: 'WhatsApp', runs: 0 },
  { id: 'a4', trig: 'Après un soin · J+5', act: 'Recommandation produit du Carnet', canal: 'WhatsApp', runs: 0 },
  { id: 'a5', trig: 'Acompte non réglé · 2 h', act: 'Relance douce + lien MoMo', canal: 'WhatsApp', runs: 0 },
  { id: 'a6', trig: 'Stock bas · seuil', act: 'Bon de réassort fournisseur', canal: 'Système', runs: 0 },
];

/** Ce que la maison SAIT d'un segment. Ni dérivé ni deviné : la connaissance des
    maîtres, écrite à la main — la taille et la valeur, elles, viennent du vécu. */
export type SegmentNote = { propension?: string; moment?: string };
export const segmentNotesStore = createStore<Record<string, SegmentNote>>('mnd_segment_notes', {});
export const useSegmentNotes = () => useStore(segmentNotesStore);

/** Liste gérable des automatisations (Marketing), synchronisée Supabase. */
export const automationsStore = createStore<Automation[]>('mnd_automations', AUTOMATIONS_SEED);
export const useAutomations = () => useStore(automationsStore);

/** Alias rétro-compatible (semence). Préférer `useAutomations()`. */
export const AUTOMATIONS = AUTOMATIONS_SEED;

/** Interrupteurs des automatisations — actives par défaut. */
export const automationsActiveStore = createStore<Record<string, boolean>>('mnd_automations_active', {});

export type AutoConfig = {
  momoLink: string;
  mapsLink: string;
  reviewLink: string;
  itineraire: string;
};

/** Liens configurables insérés tels quels dans les envois — partagés Marketing ↔ Paramètres. */
export const autoConfigStore = createStore<AutoConfig>('mnd_auto_config', {
  momoLink: '',
  mapsLink: '',
  reviewLink: '',
  itineraire: '',
});
export const useAutoConfig = () => useStore(autoConfigStore);

/* ============================================================
   3 · Cercle MND — points & paliers de récompense
   ============================================================ */

/* Paliers & points : déplacés vers `shared/offers.ts` (lus par Ma Couronne). */
export {
  TIERS_SEED, tiersStore, useTiers,
  pointsRateStore, pointsHistoryStore, usePointsHistory, pointsEnabledStore,
  type RewardTier, type PointsEvent,
} from '../../../../shared/offers';

/* ============================================================
   4 · Abonnements
   ============================================================ */

/** Une prestation du catalogue INCLUSE dans une formule, avec son quota par cycle.
    `qty === null` = illimité (« Rituels illimités »). */
export type PlanIncluded = { serviceId: string; qty: number | null };

export type Plan = {
  id: string;
  name: string;
  tag: string;
  priceXof: number; // mensuel
  line: string; // la promesse
  perks: string[];
  popular: boolean;
  /** Prestations du catalogue incluses dans la formule (sélection + quota/cycle).
      Le suivi de consommation se calcule depuis les RDV couverts (coveredBySub). */
  included?: PlanIncluded[];
};

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const PLANS_SEED: Plan[] = [];

/* Six formules signées de départ — la voix de la Maison, prix INDICATIFS (F CFA,
   mensuels) à ajuster. Introduites à la demande ; posées une fois via
   `ensureStarterPlans()` puis entièrement éditables (nom, prix, avantages). */
export const STARTER_PLANS: Plan[] = [
  { id: 'pl-essentielle', name: "L’Essentielle", tag: 'Le premier pas', priceXof: 10000,
    line: 'Le rituel minimal pour garder une couronne nette.',
    perks: ['1 resserrage express / mois', 'Rappel automatique', '−5 % Care & Store'], popular: false },
  { id: 'pl-reguliere', name: 'La Régulière', tag: 'L’entretien', priceXof: 20000,
    line: 'L’entretien mensuel, sans y penser.',
    perks: ['1 soin + 1 resserrage / mois', 'Créneau réservé', '−10 % Care & Store'], popular: false },
  { id: 'pl-regente', name: 'La Régente', tag: 'L’équilibre', priceXof: 35000,
    line: 'Le juste milieu : soin, style et priorité.',
    perks: ['2 rituels / mois', 'Créneau réservé prioritaire', '−15 % Care & Store', '1 coiffure événementielle / trimestre'], popular: true },
  { id: 'pl-souveraine', name: 'La Souveraine', tag: 'Tout compris', priceXof: 60000,
    line: 'La couronne sans limite, priorité absolue.',
    perks: ['Rituels illimités', 'Priorité absolue au fauteuil', '−20 % Care & Store', 'Coiffure événementielle incluse'], popular: false },
  { id: 'pl-confidente', name: 'La Confidente', tag: 'Soin & gamme', priceXof: 30000,
    line: 'Pour celles qui prennent soin, à la maison aussi.',
    perks: ['1 soin profond / mois', 'Box produits Care & Store', '−15 % Care & Store'], popular: false },
  { id: 'pl-ceremonie', name: 'La Cérémonie', tag: 'L’événement', priceXof: 45000,
    line: 'La tête haute à chaque grand rendez-vous.',
    perks: ['1 coiffure événementielle / mois', 'Essai coiffure inclus', 'Créneau week-end réservé'], popular: false },
];

export const plansStore = createStore<Plan[]>('mnd_abo_plans', PLANS_SEED);
export const usePlans = () => useStore(plansStore);

/** Idempotent : dote une Maison SANS aucune formule des 6 formules de départ.
    N'agit que si la liste est vide — ne réécrit jamais des formules déjà créées. */
export function ensureStarterPlans(): void {
  if (HOUSE_BLANK) return; // Maison à blanc — aucune semence
  const cur = plansStore.get();
  if (Array.isArray(cur) && cur.length > 0) return;
  plansStore.set(STARTER_PLANS.map((p) => ({ ...p, perks: [...p.perks] })));
}

/* Pré-remplissage des PRESTATIONS INCLUSES des 6 formules signées, à partir de
   leurs avantages, avec de VRAIES prestations du catalogue en ligne (ids réels
   relevés le 2026-07-21). Traduit « 1 resserrage / mois » en prestation
   décomptée. Les avantages non décomptables (remises Care & Store, priorité,
   créneau, coiffure trimestrielle) restent du texte. `null` = illimité. */
const STARTER_PLAN_INCLUDED: Record<string, PlanIncluded[]> = {
  'pl-essentielle': [{ serviceId: 'sv-resserrage', qty: 1 }],
  'pl-reguliere': [{ serviceId: 'sv-gbigbi-essentiel', qty: 1 }, { serviceId: 'sv-resserrage', qty: 1 }],
  'pl-regente': [{ serviceId: 'sv-resserrage', qty: 1 }, { serviceId: 'sv-entretien-complet', qty: 1 }],
  'pl-souveraine': [{ serviceId: 'sv-resserrage', qty: null }, { serviceId: 'sv-entretien-complet', qty: null }, { serviceId: 'sv-gbigbi-essentiel', qty: null }],
  'pl-confidente': [{ serviceId: 'sv-gbigbi-profond', qty: 1 }],
  'pl-ceremonie': [{ serviceId: 'sv-rituel-mpdj8t99', qty: 1 }],
};

/** UNE FOIS : dote les 6 formules de départ de leurs prestations incluses, mais
    UNIQUEMENT celles qui n'en ont encore aucune — ne piétine jamais un choix fait
    à l'écran. Marqueur synchronisé + garde d'hydratation (liste non vide), même
    prudence que les autres migrations. À appeler au montage des Abonnements. */
export function ensureStarterPlanIncluded(): void {
  if (HOUSE_BLANK) return; // Maison à blanc — aucune semence
  if (houseSettingsStore.get()['plans_included_seed_2026_07']) return;
  const list = plansStore.get();
  if (!Array.isArray(list) || list.length === 0) return; // pas encore hydraté — on repassera
  let changed = false;
  const next = list.map((p) => {
    const seed = STARTER_PLAN_INCLUDED[p.id];
    if (seed && (!p.included || p.included.length === 0)) { changed = true; return { ...p, included: seed.map((i) => ({ ...i })) }; }
    return p;
  });
  if (changed) plansStore.set(() => next);
  houseSettingsStore.set((prev) => ({ ...prev, plans_included_seed_2026_07: true }));
}

export type Subscriber = {
  id: string;
  branchId: string;
  clientId?: string; // lien vers la fiche cliente — pour distinguer l'abonnée partout
  name: string;
  planId: string;
  cycle?: SubCycle; // défaut mensuel ; semestriel facture 5 mois (1 offert), annuel 10 mois (2 offerts)
  slot: string; // « Jeu · 14h00 · Yéman »
  nextIso: string; // prochaine échéance
  /** Date d'inscription (ISO) — l'ancienneté S'AFFICHE calculée depuis cette date.
      L'ancien champ `since` était une chaîne figée (« ce mois ») qui ne vieillissait
      jamais ; il reste porté par les abonnées d'avant, en repli d'affichage. */
  sinceIso?: string;
  since: string; // hérité — « 8 mois » figé (repli si sinceIso absent)
  status: 'active' | 'new' | 'risk' | 'churn';
  mrrXof: number; // NORMALISÉ mensuel (annuel = montant annuel / 12) — alimente le MRR
  payments?: Payment[]; // règlements enregistrés, avec dates
  note?: string;
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const SUBSCRIBERS_SEED: Subscriber[] = [];

export const subscribersStore = createStore<Subscriber[]>('mnd_abo_members', SUBSCRIBERS_SEED);
export const useSubscribers = () => useStore(subscribersStore);

/** Cycles de facturation d'un abonnement (règles Maison ci-dessous). */
export type SubCycle = 'mensuel' | 'semestriel' | 'annuel';

/** Nombre de MOIS facturés pour un cycle (le reste est offert) :
    mensuel = 1 · semestriel = 5 payés sur 6 (1 offert) · annuel = 10 sur 12 (2 offerts). */
const CYCLE_MONTHS_PAID: Record<SubCycle, number> = { mensuel: 1, semestriel: 5, annuel: 10 };
/** Durée d'un cycle en mois — sert au MRR normalisé. */
const CYCLE_MONTHS_SPAN: Record<SubCycle, number> = { mensuel: 1, semestriel: 6, annuel: 12 };
/** Durée d'un cycle en jours — sert aux échéances. */
export const cycleDays = (cycle: SubCycle): number => (cycle === 'annuel' ? 365 : cycle === 'semestriel' ? 180 : 30);
/** Libellé lisible d'un cycle, mois offerts compris. */
export const cycleLabel = (cycle: SubCycle): string =>
  cycle === 'annuel' ? 'Annuel · 2 mois offerts' : cycle === 'semestriel' ? 'Semestriel · 1 mois offert' : 'Mensuel';

/** Prix annuel d'une formule : 10 mois payés, 2 mois offerts (règle Maison). */
export const annualPriceXof = (monthlyXof: number) => monthlyXof * CYCLE_MONTHS_PAID.annuel;
/** Prix semestriel : 5 mois payés, 1 mois offert (règle Maison). */
export const semestrielPriceXof = (monthlyXof: number) => monthlyXof * CYCLE_MONTHS_PAID.semestriel;
/** Montant réellement facturé pour un cycle donné. */
export const subCycleAmountXof = (monthlyXof: number, cycle: SubCycle) =>
  monthlyXof * CYCLE_MONTHS_PAID[cycle];
/** Contribution NORMALISÉE (mensuelle) au MRR selon le cycle. */
export const subMonthlyXof = (monthlyXof: number, cycle: SubCycle) =>
  cycle === 'mensuel' ? monthlyXof : Math.round((monthlyXof * CYCLE_MONTHS_PAID[cycle]) / CYCLE_MONTHS_SPAN[cycle]);
/** L'abonnement actif d'une cliente (le 1er non résilié), ou undefined. */
export const activeSubscriberOf = (subs: Subscriber[], clientId: string): Subscriber | undefined =>
  subs.find((s) => s.clientId === clientId && s.status !== 'churn');
/** Somme réglée par l'abonnée (tous règlements confondus). */
export const subPaid = (s: Subscriber) => (s.payments ?? []).reduce((a, p) => a + p.amountXof, 0);

/* ---------- Prestations incluses — sélection & SUIVI de consommation ---------- */

const isoRe = /^\d{4}-\d{2}-\d{2}$/;
const todayIsoLocal = () => new Date().toISOString().slice(0, 10);
/** J±`days` depuis une date ISO (midi local — insensible aux fuseaux). */
export const addDaysFromISO = (iso: string, days: number) =>
  new Date(new Date(`${iso}T12:00:00`).getTime() + days * 86400000).toISOString().slice(0, 10);

/** Fenêtre [début, fin) du cycle EN COURS d'un abonné : la fenêtre se termine à
    l'échéance à venir (`nextIso`) et remonte d'une durée de cycle. Le suivi de
    consommation se lit dans cette fenêtre — il se remet donc à zéro à chaque
    nouveau cycle, sans écriture ni compteur à synchroniser. */
export const cycleWindow = (sub: Subscriber): { start: string; end: string } => {
  const cycle = sub.cycle ?? 'mensuel';
  const end = isoRe.test(sub.nextIso) ? sub.nextIso : addDaysFromISO(todayIsoLocal(), cycleDays(cycle));
  return { start: addDaysFromISO(end, -cycleDays(cycle)), end };
};

/** Consommation d'une prestation incluse : une ligne par prestation de la formule.
    « Utilisée » = RDV COUVERT (coveredBySub), non annulé, daté dans la fenêtre du
    cycle en cours et portant cette prestation. `remaining === null` = illimité. */
export type IncludedUsage = { serviceId: string; qty: number | null; used: number; remaining: number | null };
export const subServiceUsage = (sub: Subscriber, plan: Plan | undefined, appts: Appointment[]): IncludedUsage[] => {
  const inc = plan?.included ?? [];
  if (inc.length === 0) return [];
  const { start, end } = cycleWindow(sub);
  const mine = appts.filter(
    (a) => a.clientId === sub.clientId && a.coveredBySub && a.status !== 'annulé' && a.date >= start && a.date < end,
  );
  return inc.map((i) => {
    const used = mine.filter((a) => a.serviceIds.includes(i.serviceId)).length;
    return { serviceId: i.serviceId, qty: i.qty, used, remaining: i.qty === null ? null : Math.max(0, i.qty - used) };
  });
};

/** Allocation RESTANTE pour couvrir CE service sur le cycle en cours :
    `undefined` = pas inclus dans la formule · `null` = illimité · nombre = reste.
    `excludeApptId` exclut le RDV en cours d'édition de son propre décompte. */
export const coveredRemaining = (
  sub: Subscriber, plan: Plan | undefined, serviceId: string, appts: Appointment[], excludeApptId?: string,
): number | null | undefined => {
  const i = plan?.included?.find((x) => x.serviceId === serviceId);
  if (!i) return undefined;
  if (i.qty === null) return null;
  const { start, end } = cycleWindow(sub);
  const used = appts.filter(
    (a) => a.id !== excludeApptId && a.clientId === sub.clientId && a.coveredBySub && a.status !== 'annulé'
      && a.serviceIds.includes(serviceId) && a.date >= start && a.date < end,
  ).length;
  return Math.max(0, i.qty - used);
};

/* ============================================================
   5 · Recommandations IA — état des décisions
   ============================================================ */

export type RecoDecision = 'appliquée' | 'ignorée';
export const recoStateStore = createStore<Record<string, RecoDecision>>('mnd_reco_state', {});
export const useRecoState = () => useStore(recoStateStore);

/** Catégorie d'une recommandation IA — pilote l'accent de la carte. */
export type RecoCat = 'Réactivation' | 'Upsell' | 'Réassort' | 'Créneau' | 'Risque de fuite';

export type Reco = {
  k: string;
  cat: RecoCat;
  title: string;
  why: string;
  impact: string;
  conf: string; // « confiance 86 % »
};

/** Suggestions de croissance remontées des données — l'humain décide, jamais d'injonction.
    Maison neuve : aucune suggestion fabriquée ; elles naîtront de l'activité réelle. */
export const RECOS: Reco[] = [];

export const RECO_ACCENT: Record<RecoCat, string> = {
  'Réactivation': 'var(--color-indigo)',
  'Upsell': 'var(--color-copper)',
  'Réassort': '#a9702b',
  'Créneau': '#5B5F94',
  'Risque de fuite': '#8c3b2e',
};

/* ============================================================
   6 · Académie
   ============================================================ */

/* Le référentiel méthode — la doctrine « powered by MND ». Éditable par la maison
   (onglet Référentiel de l'Académie), synchronisé, house-wide (jamais par branche).
   Une entrée = un nom (`n`) + sa glose (`g`) ; la numérotation des « quatre temps »
   se lit de la position, jamais stockée — ajouter ou réordonner ne renumérote rien. */
export type RefEntry = { n: string; g: string };

/** Graines du référentiel — servent de défaut au premier lancement ET de « rétablir ». */
export const REF_TEMPS_SEED: RefEntry[] = [
  { n: 'Purifier', g: 'Laver en douceur, libérer le cuir chevelu.' },
  { n: 'Nourrir', g: 'Hydrater la fibre, fortifier la racine.' },
  { n: 'Sceller', g: 'Fixer le soin, protéger la mèche.' },
  { n: 'Couronner', g: 'Sculpter, parfumer, révéler la tête haute.' },
];
export const REF_PALIERS_SEED: RefEntry[] = [
  { n: 'L’Initiation', g: 'Découvrir le rituel' },
  { n: 'L’Affirmation', g: 'Affirmer sa couronne' },
  { n: 'L’Œuvre', g: 'La maîtrise, mèche après mèche' },
];
export const REF_LEXIQUE_SEED: RefEntry[] = [
  { n: 'VÈKPÈ™', g: 'Pose & structure' },
  { n: 'SÍNSIN™', g: 'Resserrage' },
  { n: 'FÍNFÍN™', g: 'Soin & lavage' },
  { n: 'GBÈZÀ™', g: 'Réparation' },
  { n: 'ÀGBÓ™', g: 'Purification' },
  { n: 'DÒDÒ™', g: 'Extensions' },
];

export const refTempsStore = createStore<RefEntry[]>('mnd_ref_temps', REF_TEMPS_SEED);
export const useRefTemps = () => useStore(refTempsStore);
export const refPaliersStore = createStore<RefEntry[]>('mnd_ref_paliers', REF_PALIERS_SEED);
export const useRefPaliers = () => useStore(refPaliersStore);
export const refLexiqueStore = createStore<RefEntry[]>('mnd_ref_lexique', REF_LEXIQUE_SEED);
export const useRefLexique = () => useStore(refLexiqueStore);

export const FORMATION_NIVEAUX = [
  'Niveau I · L’Initiation',
  'Niveau II · L’Affirmation',
  'Niveau III · L’Œuvre',
  'Certifiant · Pro',
];

export type Formation = {
  id: string;
  name: string;
  niveau: string;
  sessions: number;
  demarrage: string; // « démarre 8 juil » / « sur dossier »
  places: string; // « 4 places » / « complet »
  priceXof: number;
  dureeSemaines: number;
  archived: boolean;
  modules?: string[]; // les étapes du parcours — propres à chaque formation
  /** Pourcentage d'acompte à l'inscription (défaut 40 %). */
  depositPct?: number;
  /** Formation VEDETTE : carte indigo mise en avant (comme la formule vedette). */
  featured?: boolean;
};

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const FORMATIONS_SEED: Formation[] = [];

export const formationsStore = createStore<Formation[]>('mnd_formations', FORMATIONS_SEED);
export const useFormations = () => useStore(formationsStore);

/** Un règlement de la formation — intégral ou partiel, avec sa date. */
export type Payment = { id: string; amountXof: number; date: string; method?: PaymentMethod };

export type Apprenant = {
  id: string;
  name: string;
  formationId: string;
  pay: 'À jour' | 'Échéance' | 'En retard';
  modulesDone: boolean[]; // avancement, aligné sur les modules de la formation
  priceXof?: number;      // montant NET convenu (prix formation − remise) = ce qui est dû
  remiseXof?: number;     // remise accordée sur la formation
  payments?: Payment[];   // règlements enregistrés (intégral / partiels / échelonnés)
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const APPRENANTS_SEED: Apprenant[] = [];

export const apprenantsStore = createStore<Apprenant[]>('mnd_apprenants', APPRENANTS_SEED);
export const useApprenants = () => useStore(apprenantsStore);

export const apprAvancement = (a: Apprenant) =>
  a.modulesDone.length ? Math.round((a.modulesDone.filter(Boolean).length / a.modulesDone.length) * 100) : 0;

/** Somme réglée par l'apprenant·e (tous règlements confondus). */
export const apprPaid = (a: Apprenant) => (a.payments ?? []).reduce((s, p) => s + p.amountXof, 0);
/** Reste dû = montant convenu − déjà réglé (jamais négatif). */
export const apprDue = (a: Apprenant) => Math.max(0, (a.priceXof ?? 0) - apprPaid(a));
/** L'apprenant·e porte-t-il·elle un suivi financier (prix convenu, remise ou règlements) ? */
export const apprHasFinance = (a: Apprenant) => (a.priceXof ?? 0) > 0 || (a.remiseXof ?? 0) > 0 || (a.payments?.length ?? 0) > 0;
/** Statut de paiement déduit des règlements réels : soldé → « À jour », sinon « Échéance ». */
export const apprPayStatus = (a: Apprenant): Apprenant['pay'] =>
  apprPaid(a) >= (a.priceXof ?? 0) ? 'À jour' : 'Échéance';

export type Certification = {
  id: string;
  name: string;
  parcours: string; // intitulé de la formation
  date: string;
  statut: 'Délivrée' | 'En cours';
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const CERTIFS_SEED: Certification[] = [];

export const certifsStore = createStore<Certification[]>('mnd_certifs', CERTIFS_SEED);
export const useCertifs = () => useStore(certifsStore);

/* ============================================================
   7 · Paramètres — ouverture, accès ERP, codes
   ============================================================ */

export type DayHours = { open: string; close: string; closed: boolean };

export const WEEK_DAYS: { k: string; l: string }[] = [
  { k: 'lun', l: 'Lundi' }, { k: 'mar', l: 'Mardi' }, { k: 'mer', l: 'Mercredi' },
  { k: 'jeu', l: 'Jeudi' }, { k: 'ven', l: 'Vendredi' }, { k: 'sam', l: 'Samedi' }, { k: 'dim', l: 'Dimanche' },
];

export const HOUR_OPTIONS = ['07h00', '07h30', '08h00', '08h30', '09h00', '09h30', '10h00', '11h00', '12h00', '13h00', '14h00', '15h00', '16h00', '17h00', '18h00', '18h30', '19h00', '19h30', '20h00', '21h00', '22h00'];

export const SALON_HOURS_SEED: Record<string, DayHours> = {
  lun: { open: '09h00', close: '19h00', closed: false },
  mar: { open: '09h00', close: '19h00', closed: false },
  mer: { open: '09h00', close: '19h00', closed: false },
  jeu: { open: '09h00', close: '20h00', closed: false },
  ven: { open: '09h00', close: '20h00', closed: false },
  sam: { open: '08h00', close: '20h00', closed: false },
  dim: { open: '10h00', close: '16h00', closed: true },
};

export const salonHoursStore = createStore<Record<string, DayHours>>('mnd_salon_hours', SALON_HOURS_SEED);
export const useSalonHours = () => useStore(salonHoursStore);

/** Rubriques de domaine de l'ERP — la matrice d'accès du personnel. */
export const ERP_DOMAINS: { k: string; l: string }[] = [
  { k: 'pilotage', l: 'Pilotage' },
  { k: 'clients', l: 'Clients & Agenda' },
  { k: 'vente', l: 'Vente' },
  { k: 'finances', l: 'Finances' },
  { k: 'equipe', l: 'Équipe & Croissance' },
  { k: 'systeme', l: 'Système' },
];

/** staffId → domaine → accès. */
export const staffAccessStore = createStore<Record<string, Record<string, boolean>>>('mnd_staff_access', {});

export function defaultAccessFor(role: string): Record<string, boolean> {
  const fondateur = role.toLowerCase().includes('fondateur') || role.toLowerCase().includes('gérant');
  const maitre = role.toLowerCase().includes('maître') || role.toLowerCase().includes('maîtresse');
  return {
    pilotage: fondateur || maitre,
    clients: true,
    vente: fondateur || maitre,
    finances: fondateur,
    equipe: fondateur,
    systeme: fondateur,
  };
}

/** staffId → code d'accès 6 chiffres, envoyable par WhatsApp. */
export const accessCodesStore = createStore<Record<string, string>>('mnd_access_codes', {});

export const genAccessCode = () => String(Math.floor(100000 + Math.random() * 900000));

export const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

export type HouseSettings = Record<string, boolean>;
/** Interrupteurs des sections Paramètres — tout est ouvert par défaut. */
export const houseSettingsStore = createStore<HouseSettings>('mnd_house_settings', {});

export const PARAM_SECTIONS: {
  title: string;
  cap: string;
  rows: ({ l: string; v: string } | { k: string; l: string; sub: string })[];
}[] = [
  {
    title: 'Identité de la Maison', cap: 'Ce que la Maison montre au monde.', rows: [
      { l: 'Nom de la Maison', v: 'Maison MND' },
      { l: 'Raison sociale', v: 'MND SARL · RCCM COT-B-2021' },
      { l: 'Devise de référence', v: 'Franc CFA · XOF · F' },
      { l: 'Fuseau horaire', v: 'Cotonou · GMT+1' },
    ],
  },
  {
    title: 'Le rituel par défaut', cap: 'Les règles qui cadrent chaque rendez-vous.', rows: [
      { l: 'Durée standard d’un rituel', v: '2 h 30' },
      { l: 'Acompte retenu', v: '30 %' },
      { l: 'Fenêtre d’annulation', v: '48 h avant' },
      { k: 'rappel', l: 'Rappels automatiques', sub: 'SMS + WhatsApp · J-1 et H-2' },
      { k: 'acompte', l: 'Acompte exigé en ligne', sub: 'bloque le fauteuil à la réservation' },
    ],
  },
  {
    title: 'Notifications', cap: 'Qui est prévenu, et quand.', rows: [
      { k: 'notifRdv', l: 'Nouveau rendez-vous', sub: 'au Maître concerné' },
      { k: 'notifStock', l: 'Seuil de réassort atteint', sub: 'à l’Atelier & à l’Accueil' },
      { k: 'notifPaie', l: 'Clôture de paie', sub: 'à la matriarche' },
      { k: 'notifCercle', l: 'Nouvelle introduction du Cercle', sub: 'à toute la Maison' },
    ],
  },
  {
    title: 'Accès & souveraineté', cap: 'La Maison reste maîtresse de ses données.', rows: [
      { k: 'auth', l: 'Double authentification', sub: 'requise pour les Maîtres' },
      { k: 'sauvegarde', l: 'Sauvegarde quotidienne', sub: 'chiffrée · conservée 90 jours' },
      { k: 'export', l: 'Export souverain autorisé', sub: 'la Maison peut tout emporter' },
      { l: 'Hébergement des données', v: 'Souverain · Afrique de l’Ouest' },
    ],
  },
];

/* ============================================================
   8 · Marque & thème
   ============================================================ */

export type SealColor = 'indigo' | 'copper' | 'ivoire' | 'obsidian' | 'or';

export type ThemeConfig = {
  seal: SealColor; // colorway du sceau de la sidebar
  accent: string; // hex de l'accent cuivre
  accentName: string;
  verbe: string;
};

export const THEME_ACCENTS: { k: string; name: string; hex: string; note?: string }[] = [
  { k: 'cuivre', name: 'Cuivre Noble', hex: '#B97A4A', note: 'recommandé' },
  { k: 'cuivre-profond', name: 'Cuivre Profond', hex: '#9E6238' },
  { k: 'cuivre-clair', name: 'Cuivre Clair', hex: '#C98A53' },
];

export const SEAL_OPTIONS: { k: SealColor; name: string }[] = [
  { k: 'copper', name: 'Cuivre' },
  { k: 'indigo', name: 'Indigo' },
  { k: 'or', name: 'Or' },
  { k: 'ivoire', name: 'Ivoire' },
  { k: 'obsidian', name: 'Obsidienne' },
];

export const THEME_DEFAULT: ThemeConfig = {
  seal: 'copper',
  accent: '#B97A4A',
  accentName: 'Cuivre Noble',
  verbe: 'mi nyɔ́ ɖɛkpɛ — la beauté se transmet, tête haute.',
};

export const themeStore = createStore<ThemeConfig>('mnd_theme', THEME_DEFAULT);
export const useTheme = () => useStore(themeStore);

/* ---------- Synchronisation Supabase — tous les magasins de ce module ----------
   Rien de local : équipe, marketing, abonnements, académie, paramètres maison,
   thème et accès du personnel remontent en base (collections + documents). */
import { bindCollection, bindDocument } from '../../../../shared/sync';
bindCollection(staffStore, 'team');
bindCollection(campaignsStore, 'campaigns');
bindCollection(plansStore, 'plans');
bindCollection(subscribersStore, 'subscribers');
bindCollection(formationsStore, 'formations');
bindCollection(apprenantsStore, 'apprenants');
bindCollection(certifsStore, 'certifications');
bindDocument(segmentNotesStore, 'mnd_segment_notes');
bindDocument(automationsStore, 'mnd_automations');
bindDocument(automationsActiveStore, 'mnd_automations_active');
bindDocument(autoConfigStore, 'mnd_auto_config');
bindDocument(recoStateStore, 'mnd_reco_state');
bindDocument(salonHoursStore, 'mnd_salon_hours');
bindDocument(staffAccessStore, 'mnd_staff_access');
bindDocument(accessCodesStore, 'mnd_access_codes');
bindDocument(houseSettingsStore, 'mnd_house_settings');
bindDocument(themeStore, 'mnd_theme');
bindDocument(refTempsStore, 'mnd_ref_temps');
bindDocument(refPaliersStore, 'mnd_ref_paliers');
bindDocument(refLexiqueStore, 'mnd_ref_lexique');
