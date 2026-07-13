import { createStore, useStore } from '../../../../shared/store';

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

export const OFFER_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
export const OFFER_AUDIENCES = ['Tous', 'Actifs', 'VIP', 'Cercle', 'Dormants'] as const;
export const OFFER_HOURS = ['00h', '06h', '07h', '08h', '09h', '10h', '11h', '12h', '14h', '16h', '17h', '18h', '19h', '20h', '21h', '22h'];

export type InstantOffer = {
  id: string;
  branchId: string;
  title: string;
  tag: string; // accroche — « Offre éclair », « Heure creuse »…
  deal: string; // avantage — « −25% », « 2 = 1 »…
  sub: string; // détail
  audience: string; // persona / segment qui la voit
  days: string[]; // jours d'affichage
  heureDebut: string;
  heureFin: string;
  active: boolean;
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const OFFERS_SEED: InstantOffer[] = [];

/** Consommées par l'app cliente Ma Couronne — clé partagée. */
export const offersStore = createStore<InstantOffer[]>('mnd_offers', OFFERS_SEED);
export const useOffers = () => useStore(offersStore);

export type Automation = {
  id: string;
  trig: string;
  act: string;
  canal: 'WhatsApp' | 'Système';
  runs: number;
};

export const AUTOMATIONS: Automation[] = [
  { id: 'a1', trig: 'J-1 avant un rituel', act: 'Rappel WhatsApp + itinéraire', canal: 'WhatsApp', runs: 312 },
  { id: 'a2', trig: 'Loc · jour 365', act: 'Invitation au Couronnement', canal: 'WhatsApp', runs: 22 },
  { id: 'a3', trig: 'Dormante · 90 jours', act: 'Réveil rituel doux', canal: 'WhatsApp', runs: 64 },
  { id: 'a4', trig: 'Après un soin · J+5', act: 'Recommandation produit du Carnet', canal: 'WhatsApp', runs: 148 },
  { id: 'a5', trig: 'Acompte non réglé · 2 h', act: 'Relance douce + lien MoMo', canal: 'WhatsApp', runs: 53 },
  { id: 'a6', trig: 'Stock bas · seuil', act: 'Bon de réassort fournisseur', canal: 'Système', runs: 9 },
];

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

export type RewardTier = {
  id: string;
  pts: number; // seuil de points
  serviceId: string; // prestation offerte, tirée du catalogue
  desc: string;
  g: string; // chiffre du sceau — Ⅰ · Ⅱ · Ⅲ…
};

export const TIERS_SEED: RewardTier[] = [
  { id: 'tier-1', pts: 3000, serviceId: 'sv-resserrage', desc: 'Un entretien racines, sans frais.', g: 'Ⅰ' },
  { id: 'tier-2', pts: 6000, serviceId: 'sv-rituel-quatre-temps', desc: 'Un soin signature, sans frais.', g: 'Ⅱ' },
  { id: 'tier-3', pts: 12000, serviceId: 'sv-locks-moyennes', desc: 'La création qu’elle désire, sans frais.', g: 'Ⅲ' },
];

export const tiersStore = createStore<RewardTier[]>('mnd_cercle_tiers', TIERS_SEED);
export const useTiers = () => useStore(tiersStore);

/** 1 point / N F dépensés. */
export const pointsRateStore = createStore<number>('mnd_points_rate', 100);

export type PointsEvent = {
  id: string;
  clientId: string;
  clientName: string;
  label: string; // récompense offerte ou ajustement
  pts: number; // négatif = points rendus en soin
  at: string; // ISO
};

export const pointsHistoryStore = createStore<PointsEvent[]>('mnd_points_history', []);

/* ============================================================
   4 · Abonnements
   ============================================================ */

export type Plan = {
  id: string;
  name: string;
  tag: string;
  priceXof: number; // mensuel
  line: string; // la promesse
  perks: string[];
  popular: boolean;
};

export const PLANS_SEED: Plan[] = [
  {
    id: 'pl-constance', name: 'La Constance', tag: 'L’essentiel', priceXof: 35000, popular: false,
    line: 'Votre rendez-vous, chaque mois, gardé rien que pour vous.',
    perks: ['1 resserrage racines / mois', 'Brume hydratante offerte', 'Créneau réservé & rappel doux', 'Sans engagement'],
  },
  {
    id: 'pl-couronne', name: 'La Couronne', tag: 'Le plus choisi', priceXof: 58000, popular: true,
    line: 'Un rituel complet, un créneau à votre nom, des privilèges qui vous suivent.',
    perks: ['1 resserrage + 1 soin / mois', 'Créneau fixe réservé à vous', '−15 % sur le Care & Store', 'Priorité au Cercle MND'],
  },
  {
    id: 'pl-souveraine', name: 'La Souveraine', tag: 'L’exception', priceXof: 120000, popular: false,
    line: 'Votre Maître attitré, votre couronne sans limite, votre place au Couronnement.',
    perks: ['Entretien illimité', 'Maître attitré · créneau hebdo', 'Rituel maison livré chez vous', 'Accès au Couronnement annuel'],
  },
];

export const plansStore = createStore<Plan[]>('mnd_abo_plans', PLANS_SEED);
export const usePlans = () => useStore(plansStore);

export type Subscriber = {
  id: string;
  branchId: string;
  name: string;
  planId: string;
  slot: string; // « Jeu · 14h00 · Yéman »
  nextIso: string; // prochain prélèvement
  since: string; // « 8 mois »
  status: 'active' | 'new' | 'risk' | 'churn';
  mrrXof: number;
  note?: string;
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const SUBSCRIBERS_SEED: Subscriber[] = [];

export const subscribersStore = createStore<Subscriber[]>('mnd_abo_members', SUBSCRIBERS_SEED);
export const useSubscribers = () => useStore(subscribersStore);

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

/** Suggestions de croissance remontées des données — l'humain décide, jamais d'injonction. */
export const RECOS: Reco[] = [
  { k: 'react', cat: 'Réactivation', title: '12 têtes à réveiller', why: 'Dormantes 90–120 j, fort historique. Un rappel rituel — sans rabais — suffit souvent.', impact: '≈ 420 000 F de potentiel', conf: 'confiance 86 %' },
  { k: 'upsell', cat: 'Upsell', title: 'Sérum Racines · 8 clientes', why: 'Diagnostic densité faible et dernier soin > 30 j dans leur Carnet de Suivi.', impact: '≈ 128 000 F', conf: 'confiance 79 %' },
  { k: 'stock', cat: 'Réassort', title: 'Réassort Huile Couronne sous 6 j', why: 'Vitesse de vente en hausse, stock bas — rupture prédite samedi.', impact: 'évite une rupture', conf: 'confiance 91 %' },
  { k: 'slot', cat: 'Créneau', title: 'Ouvrir 2 créneaux mardi PM', why: 'Demande prédite supérieure à la capacité ce jour ; Adèle est disponible.', impact: '≈ 70 000 F', conf: 'confiance 74 %' },
  { k: 'churn', cat: 'Risque de fuite', title: '3 VIP à choyer cette semaine', why: 'Cadence ralentie vs leur habitude — premier signal de désengagement.', impact: 'protège 1,2 M F de LTV', conf: 'confiance 82 %' },
];

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

export const QUATRE_TEMPS: { no: string; n: string; g: string }[] = [
  { no: '01', n: 'Purifier', g: 'Laver en douceur, libérer le cuir chevelu.' },
  { no: '02', n: 'Nourrir', g: 'Hydrater la fibre, fortifier la racine.' },
  { no: '03', n: 'Sceller', g: 'Fixer le soin, protéger la mèche.' },
  { no: '04', n: 'Couronner', g: 'Sculpter, parfumer, révéler la tête haute.' },
];

export const REF_PALIERS: [string, string][] = [
  ['L’Initiation', 'Découvrir le rituel'],
  ['L’Affirmation', 'Affirmer sa couronne'],
  ['L’Œuvre', 'La maîtrise, mèche après mèche'],
];

export const REF_LEXIQUE: [string, string][] = [
  ['VÈKPÈ™', 'Pose & structure'],
  ['SÍNSIN™', 'Resserrage'],
  ['FÍNFÍN™', 'Soin & lavage'],
  ['GBÈZÀ™', 'Réparation'],
  ['ÀGBÓ™', 'Purification'],
  ['DÒDÒ™', 'Extensions'],
];

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
};

export const FORMATIONS_SEED: Formation[] = [
  { id: 'fo-fondations', name: 'Fondations du Lock', niveau: 'Niveau I · L’Initiation', sessions: 6, demarrage: 'démarre 8 juil', places: '4 places', priceXof: 250000, dureeSemaines: 6, archived: false },
  { id: 'fo-resserrage', name: 'Resserrage & Soin', niveau: 'Niveau II · L’Affirmation', sessions: 4, demarrage: 'démarre 22 juil', places: '6 places', priceXof: 180000, dureeSemaines: 4, archived: false },
  { id: 'fo-nano', name: 'Maîtrise Nano-locks', niveau: 'Niveau III · L’Œuvre', sessions: 8, demarrage: 'démarre 5 août', places: '2 places', priceXof: 420000, dureeSemaines: 8, archived: false },
  { id: 'fo-certif', name: 'Certification Référentiel MND', niveau: 'Certifiant · Pro', sessions: 10, demarrage: 'sur dossier', places: 'complet', priceXof: 600000, dureeSemaines: 12, archived: false },
];

export const formationsStore = createStore<Formation[]>('mnd_formations', FORMATIONS_SEED);
export const useFormations = () => useStore(formationsStore);

export type Apprenant = {
  id: string;
  name: string;
  formationId: string;
  pay: 'À jour' | 'Échéance' | 'En retard';
  modulesDone: boolean[]; // les quatre temps
};

export const APPRENANTS_SEED: Apprenant[] = [
  { id: 'ap-ines', name: 'Inès Tossou', formationId: 'fo-fondations', pay: 'À jour', modulesDone: [true, true, true, false] },
  { id: 'ap-marc', name: 'Marc Adjovi', formationId: 'fo-nano', pay: 'Échéance', modulesDone: [true, true, false, false] },
  { id: 'ap-sarah', name: 'Sarah Koudjo', formationId: 'fo-resserrage', pay: 'À jour', modulesDone: [true, true, true, true] },
  { id: 'ap-yann', name: 'Yann Hounkpè', formationId: 'fo-certif', pay: 'À jour', modulesDone: [true, false, false, false] },
  { id: 'ap-adele', name: 'Adèle Sika', formationId: 'fo-nano', pay: 'À jour', modulesDone: [true, true, true, false] },
];

export const apprenantsStore = createStore<Apprenant[]>('mnd_apprenants', APPRENANTS_SEED);
export const useApprenants = () => useStore(apprenantsStore);

export const apprAvancement = (a: Apprenant) =>
  a.modulesDone.length ? Math.round((a.modulesDone.filter(Boolean).length / a.modulesDone.length) * 100) : 0;

export type Certification = {
  id: string;
  name: string;
  parcours: string; // intitulé de la formation
  date: string;
  statut: 'Délivrée' | 'En cours';
};

export const CERTIFS_SEED: Certification[] = [
  { id: 'ce-adele', name: 'Adèle Sika', parcours: 'Maîtrise Nano-locks', date: '12 mars 2026', statut: 'Délivrée' },
  { id: 'ce-koffi', name: 'Koffi · Studio Lumière', parcours: 'Certification Référentiel MND', date: '4 fév 2026', statut: 'Délivrée' },
  { id: 'ce-sarah', name: 'Sarah Koudjo', parcours: 'Resserrage & Soin', date: 'jury · 18 juil', statut: 'En cours' },
  { id: 'ce-marc', name: 'Marc Adjovi', parcours: 'Maîtrise Nano-locks', date: '—', statut: 'En cours' },
];

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
