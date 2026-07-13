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

export const STAFF_SEED: StaffMember[] = [
  {
    id: 'st-yeman', branchId: 'cotonou-flagship', name: 'Yéman', role: 'Maître fondateur',
    phone: '+229 ** ** ** **', email: 'retire@mnd.bj', since: '2018-06-01', auFauteuil: true,
    salaireXof: 250000, commPrestaXof: 680000, commProduitXof: 90000, primeXof: 60000,
    satisfaction: 4.9, wellbeing: 72, charge: 92, risk: 'modéré',
    riskDrivers: 'Charge élevée 4 semaines de suite, peu de repos — surveiller le surmenage.',
    nextStep: 'Transmettre le module Nano-locks à l’Académie', recognition: 'Maître de l’année 2025', statut: 'Présent',
  },
  {
    id: 'st-brice', branchId: 'cotonou-flagship', name: 'Brice', role: 'Maître fondateur',
    phone: '+229 ** ** ** **', email: 'retire@mnd.bj', since: '2018-06-01', auFauteuil: true,
    salaireXof: 250000, commPrestaXof: 540000, commProduitXof: 70000, primeXof: 40000,
    satisfaction: 4.8, wellbeing: 81, charge: 88, risk: 'faible',
    riskDrivers: 'Charge équilibrée, congés pris régulièrement.',
    nextStep: 'Certification formateur · niveau III', recognition: 'Mentor de 4 apprenants', statut: 'Présent',
  },
  {
    id: 'st-adele', branchId: 'cotonou-flagship', name: 'Adèle', role: 'Maîtresse',
    phone: '+229 ** ** ** **', email: 'retire@mnd.bj', since: '2023-03-15', auFauteuil: true,
    salaireXof: 180000, commPrestaXof: 360000, commProduitXof: 50000, primeXof: 25000,
    satisfaction: 4.7, wellbeing: 84, charge: 79, risk: 'faible',
    riskDrivers: 'En montée de palier, fortement engagée.',
    nextStep: 'Passage Maîtrise · L’Œuvre (juillet)', recognition: 'Progression la plus rapide', statut: 'Formation',
  },
  {
    id: 'st-naissa', branchId: 'cotonou-flagship', name: 'Naïssa', role: 'Praticienne',
    phone: '+229 ** ** ** **', email: 'retire@mnd.bj', since: '2025-05-01', auFauteuil: true,
    salaireXof: 140000, commPrestaXof: 180000, commProduitXof: 30000, primeXof: 10000,
    satisfaction: 4.5, wellbeing: 58, charge: 71, risk: 'élevé',
    riskDrivers: 'Junior, commissions faibles, signe d’isolement — agir vite.',
    nextStep: 'Mentorat par Brice + Fondations niveau II', recognition: '—', statut: 'Présent',
  },
  {
    id: 'st-mariam', branchId: 'abidjan', name: 'Mariam', role: 'Maîtresse',
    phone: '+229 ** ** ** **', email: 'retire@mnd.bj', since: '2022-02-01', auFauteuil: true,
    salaireXof: 210000, commPrestaXof: 410000, commProduitXof: 40000, primeXof: 30000,
    satisfaction: 4.8, wellbeing: 78, charge: 82, risk: 'faible',
    riskDrivers: 'Cadence stable, équipe soudée.', nextStep: 'Ouvrir le samedi matin en autonomie',
    recognition: 'Pilier de Cocody', statut: 'Présent',
  },
  {
    id: 'st-koffi', branchId: 'abidjan', name: 'Koffi', role: 'Praticien',
    phone: '+229 ** ** ** **', email: 'retire@mnd.bj', since: '2024-09-01', auFauteuil: true,
    salaireXof: 150000, commPrestaXof: 190000, commProduitXof: 20000, primeXof: 10000,
    satisfaction: 4.6, wellbeing: 75, charge: 64, risk: 'modéré',
    riskDrivers: 'Charge en dessous de la capacité — nourrir son carnet.',
    nextStep: 'Fondations du Lock · niveau I', recognition: '—', statut: 'Présent',
  },
  {
    id: 'st-awa', branchId: 'paris', name: 'Awa', role: 'Maîtresse',
    phone: '+229 ** ** ** **', email: 'retire@mnd.bj', since: '2021-11-01', auFauteuil: true,
    salaireXof: 1180000, commPrestaXof: 620000, commProduitXof: 90000, primeXof: 65000,
    satisfaction: 4.9, wellbeing: 80, charge: 90, risk: 'modéré',
    riskDrivers: 'Très demandée — liste d’attente longue, veiller à la charge.',
    nextStep: 'Recruter une praticienne en soutien', recognition: 'Visage de Château d’Eau', statut: 'Présent',
  },
  {
    id: 'st-seb', branchId: 'paris', name: 'Sébastien', role: 'Praticien',
    phone: '+229 ** ** ** **', email: 'retire@mnd.bj', since: '2024-04-01', auFauteuil: true,
    salaireXof: 920000, commPrestaXof: 280000, commProduitXof: 45000, primeXof: 20000,
    satisfaction: 4.6, wellbeing: 82, charge: 68, risk: 'faible',
    riskDrivers: 'Intégration réussie, en progression.', nextStep: 'Resserrage & Soin · niveau II',
    recognition: '—', statut: 'Présent',
  },
];

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

export const CAMPAIGNS_SEED: Campaign[] = [
  { id: 'cp-cadence', branchId: 'cotonou-flagship', name: 'Cadence de resserrage', segment: 'En cycle · 6 semaines', canal: 'WhatsApp', statut: 'Active', reach: '128', lift: '+18 %' },
  { id: 'cp-reveil', branchId: 'cotonou-flagship', name: 'Réveil des dormantes', segment: 'Dormantes 90 j+', canal: 'WhatsApp', statut: 'Active', reach: '64', lift: '+11 %' },
  { id: 'cp-anniv', branchId: 'cotonou-flagship', name: 'Anniversaire de couronne', segment: '1 an de loc', canal: 'WhatsApp', statut: 'Programmée', reach: '22', lift: '+24 %' },
  { id: 'cp-apressoin', branchId: 'cotonou-flagship', name: 'Rituel maison · après-soin', segment: 'Soin < 7 j', canal: 'SMS', statut: 'Brouillon', reach: '—', lift: '—' },
  { id: 'cp-abj-ouv', branchId: 'abidjan', name: 'Les matinées de Cocody', segment: 'Actives · heures creuses', canal: 'WhatsApp', statut: 'Active', reach: '46', lift: '+9 %' },
  { id: 'cp-par-diaspora', branchId: 'paris', name: 'Retour au pays · diaspora', segment: 'Diaspora · été', canal: 'WhatsApp', statut: 'Programmée', reach: '31', lift: '+15 %' },
];

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

export const OFFERS_SEED: InstantOffer[] = [
  { id: 'of-serum', branchId: 'cotonou-flagship', title: 'Resserrage racines', tag: 'Offre éclair', deal: '−25%', sub: 'Sérum Densité offert', audience: 'Actifs', days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'], heureDebut: '09h', heureFin: '18h', active: true },
  { id: 'of-duo', branchId: 'cotonou-flagship', title: 'Resserrage + Soin profond', tag: 'Duo découverte', deal: '−15%', sub: 'Réservé aujourd’hui', audience: 'Tous', days: ['Sam'], heureDebut: '10h', heureFin: '19h', active: true },
  { id: 'of-parrain', branchId: 'cotonou-flagship', title: 'Parrainez une amie', tag: 'Cadeau', deal: '✦', sub: 'Un soin offert à sa 1ʳᵉ visite', audience: 'Cercle', days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], heureDebut: '08h', heureFin: '20h', active: false },
  { id: 'of-matin', branchId: 'cotonou-flagship', title: 'Soin profond du matin', tag: 'Heure creuse', deal: '−20%', sub: 'Créneaux 8h–11h uniquement', audience: 'Tous', days: ['Mar', 'Mer', 'Jeu'], heureDebut: '08h', heureFin: '11h', active: true },
  { id: 'of-vip', branchId: 'cotonou-flagship', title: 'Rituel signature VIP', tag: 'Privilège', deal: '+1 soin', sub: 'Un masque cuir chevelu offert', audience: 'VIP', days: ['Jeu', 'Ven'], heureDebut: '14h', heureFin: '19h', active: true },
  { id: 'of-reveil', branchId: 'cotonou-flagship', title: 'On vous a manqué', tag: 'Retour', deal: '−30%', sub: 'Pour un retour après 90 jours', audience: 'Dormants', days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], heureDebut: '09h', heureFin: '20h', active: true },
  { id: 'of-produit', branchId: 'cotonou-flagship', title: 'Huile Couronne Maison', tag: 'Produit', deal: '2 = 1', sub: 'La 2ᵉ huile à moitié prix', audience: 'Actifs', days: ['Ven', 'Sam'], heureDebut: '10h', heureFin: '18h', active: false },
];

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

export const SUBSCRIBERS_SEED: Subscriber[] = [
  { id: 'ab-adjoa', branchId: 'cotonou-flagship', name: 'Adjoa Koudjo', planId: 'pl-couronne', slot: 'Jeu · 14h00 · Yéman', nextIso: isoInDays(4), since: '8 mois', status: 'active', mrrXof: 58000 },
  { id: 'ab-koffi', branchId: 'cotonou-flagship', name: 'Koffi Mensah', planId: 'pl-souveraine', slot: 'Sam · 10h00 · Brice', nextIso: isoInDays(2), since: '1 an', status: 'active', mrrXof: 120000 },
  { id: 'ab-naima', branchId: 'cotonou-flagship', name: 'Naïma Sow', planId: 'pl-constance', slot: 'Mar · 16h00 · Adèle', nextIso: isoInDays(8), since: '4 mois', status: 'new', mrrXof: 35000 },
  { id: 'ab-fatou', branchId: 'cotonou-flagship', name: 'Fatou Diallo', planId: 'pl-couronne', slot: 'Ven · 11h00 · Yéman', nextIso: isoInDays(1), since: '6 mois', status: 'risk', mrrXof: 58000, note: 'Paiement en retard · relance douce envoyée' },
  { id: 'ab-yasmine', branchId: 'cotonou-flagship', name: 'Yasmine Bâ', planId: 'pl-souveraine', slot: 'Mer · 15h00 · Brice', nextIso: isoInDays(5), since: '2 ans', status: 'active', mrrXof: 120000 },
  { id: 'ab-aicha', branchId: 'cotonou-flagship', name: 'Aïcha Touré', planId: 'pl-constance', slot: 'Lun · 09h30 · Adèle', nextIso: isoInDays(10), since: '2 mois', status: 'new', mrrXof: 35000 },
  { id: 'ab-abj-1', branchId: 'abidjan', name: 'Fatou Koné', planId: 'pl-couronne', slot: 'Sam · 11h00 · Mariam', nextIso: isoInDays(6), since: '5 mois', status: 'active', mrrXof: 58000 },
  { id: 'ab-par-1', branchId: 'paris', name: 'Awa Diallo', planId: 'pl-souveraine', slot: 'Jeu · 18h00 · Awa', nextIso: isoInDays(3), since: '9 mois', status: 'active', mrrXof: 120000 },
];

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
