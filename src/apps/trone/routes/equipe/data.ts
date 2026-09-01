import { createStore, useStore, HOUSE_BLANK } from '../../../../shared/store';
import { DEVISE_COMPLETE } from '../../../../shared/identite';
import type { PaymentMethod } from '../../../../shared/finance';
import type { Appointment } from '../../../../shared/agenda';
import { ussdAvecMontant } from '../../../../shared/momo';
import type { Echeance } from '../../../../shared/echeancier';
import type { OptionCouleur } from '../../../../shared/couleur';

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
  /** L'E-MAIL DE CONNEXION — le lien fiche ↔ compte (20 août 2026).

      L'identité vivait en deux registres reliés par UN espoir : que l'e-mail
      de la fiche soit celui du compte. Or Gérard se connecte avec une
      adresse et sa fiche en porte une autre — d'où la fenêtre « Praticien »,
      les signatures d'adresse, les tête-à-tête invisibles. Ce champ dit LE
      compte avec lequel la personne se connecte ; `email` reste son adresse
      de contact. `adresseDe()` fait foi partout où l'identité compte. */
  compteMail?: string;
  since: string; // ISO — l'ancienneté se calcule dynamiquement
  auFauteuil: boolean; // exécute des prestations
  /** L'ORDRE D'AFFICHAGE, décidé à la main dans Personnel & paie.

      Les listes sortaient dans l'ordre où les fiches avaient été créées —
      c'est-à-dire dans aucun ordre. Or attribuer une tête est un geste
      répété des dizaines de fois par jour, et jamais par une seule personne :
      un KLOKLO se fait à deux, une reprise à deux ou trois, la coiffure par
      un troisième. Ranger les pastilles dans l'ordre où l'on travaille
      réellement fait gagner ce temps-là, tous les jours.

      Absent = à la fin, par ancienneté. */
  ordre?: number;
  /** COMMISSIONNÉ ? Faux par défaut — chez MND, on ne commissionne pas les
      salariés. La commission ne concerne que les maîtres recrutés
      ponctuellement, et le praticien qui devient maître le jour où on l'a
      décidé pour lui. Un réglage, jamais un statut déduit. */
  commissionne?: boolean;
  /** SON taux, en pourcentage du montant facturé de la prestation qu'il a
      exécutée. Absent = on retombe sur le barème de la Maison par palier
      (Paramètres de paie). C'est ce qui permet à un maître externe de porter
      le taux négocié avec lui sans déplacer celui de tout le monde. */
  commissionTauxPct?: number;
  /** PART DE POURBOIRE — 1 par défaut, 0,5 pour le couple fondateur qui n'en
      compte qu'une à deux, 0 pour qui n'entre pas dans le partage.
      Le pourboire se partage entre TOUS, pas seulement entre ceux qui ont
      officié : c'est la règle de la Maison, et elle ne se déduit d'aucun
      rendez-vous. Voir `repartirPourboire`. */
  partPourboire?: number;
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

/* ── LES FONCTIONS DE LA MAISON — 23 août 2026 ─────────────────────
   « Rajouter des fonctions au salon. Rajouter du personnel comme le
   jardinier, l’agent de nettoyage, la sécurité… »

   ELLES ÉTAIENT ÉCRITES EN DUR dans l’écran du Personnel : sept fonctions,
   toutes tournées vers le fauteuil. Une maison n’est pas faite que de mains
   qui coiffent — il y a celles qui ouvrent, qui nettoient, qui gardent, qui
   conduisent. En ajouter sept de plus aurait repoussé le problème d’un an :
   la liste vit donc dans un magasin, et la Maison en ajoute quand elle veut.

   CE QUI N’EST PAS AU FAUTEUIL NE COMMISSIONNE PAS. Un jardinier n’exécute
   pas de prestation : choisir sa fonction pose « hors fauteuil » d’office —
   on ne fait pas semblant de calculer une commission sur un travail qui ne
   passe pas par le fauteuil. Cela reste modifiable : c’est un défaut juste,
   pas une serrure. */
export const FONCTIONS_DEFAUT: string[] = [
  'Maître fondateur', 'Maître', 'Maîtresse', 'Praticienne', 'Praticien',
  'Accueil', 'Gérant·e',
  'Agent d’entretien', 'Sécurité', 'Jardinier', 'Chauffeur', 'Coursier', 'Assistant·e',
];

/** Les fonctions qui TOUCHENT une tête — les seules qui commissionnent. */
export const FONCTIONS_AU_FAUTEUIL = new Set<string>([
  'Maître fondateur', 'Maître', 'Maîtresse', 'Praticienne', 'Praticien',
]);

export const fonctionsStore = createStore<string[]>('mnd_fonctions', FONCTIONS_DEFAUT);
export const useFonctions = () => useStore(fonctionsStore);

/** Ajoute une fonction si elle est neuve — jamais deux fois la même. */
export const ajouteUneFonction = (nom: string): void => {
  const propre = nom.trim();
  if (!propre) return;
  fonctionsStore.set((prev) => (prev.some((f) => f.toLowerCase() === propre.toLowerCase())
    ? prev
    : [...prev, propre]));
};

export const staffStore = createStore<StaffMember[]>('mnd_staff', STAFF_SEED);
export const useStaff = () => useStore(staffStore);

/** L'ADRESSE QUI FAIT FOI pour une fiche — celle du COMPTE d'abord, celle de
    contact en repli. Toute identité (signatures, tête-à-tête, colonnes du
    Tableau) passe par ici : deux écrans qui résolvent différemment donnent
    deux personnes différentes. */
export const adresseDe = (m: Pick<StaffMember, 'email' | 'compteMail'>): string =>
  ((m.compteMail ?? '').trim() || (m.email ?? '').trim()).toLowerCase();

/** L'ÉQUIPE DANS L'ORDRE VOULU. Une seule fonction, appelée partout où des
    noms s'alignent : les pastilles du rendez-vous, celles de « Mon mois »,
    la fiche Personnel. Deux écrans qui trient différemment donnent deux
    maisons différentes. */
export const ordonneEquipe = <T extends { ordre?: number; since?: string; name: string }>(l: T[]): T[] =>
  [...l].sort((a, b) => {
    const ra = a.ordre ?? Number.MAX_SAFE_INTEGER;
    const rb = b.ordre ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    if (a.since && b.since && a.since !== b.since) return a.since < b.since ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr');
  });

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

/* ── L'ANNUAIRE DES COMPTES — 19 août 2026 ─────────────────────────
   « Quand Brice se connecte, il voudrait voir le nom affiché dans Accès &
   personnel — mais il voit toujours briceahouansou1. »

   Le NOM DU COMPTE vit dans la table `staff` (celui qu'on modifie dans
   Accès & personnel) ; or sa liste n'est lisible que du souverain
   (`list_staff_full`), et les fiches du Personnel portent souvent une AUTRE
   adresse que celle de connexion (locksmnd@ vs la fiche « Gerard Tolofon »).
   Le Fil signait donc avec ce qu'il trouvait : le début de l'adresse.

   L'annuaire fait DESCENDRE ces noms là où tous peuvent les lire :
   adresse → nom, rempli à chaque passage d'un souverain (list_staff_full
   rend une liste vide aux autres — pas une erreur), lu par le Fil et le
   Tableau pour signer ET pour résoudre les vieux messages à l'affichage,
   sans réécrire une ligne d'histoire. */
export const annuaireStore = createStore<Record<string, string>>('mnd_annuaire', {});
export const useAnnuaire = () => useStore(annuaireStore);
/** Le nom d'une adresse — l'annuaire d'abord, sinon le repli fourni. */
export const nomDuCompte = (annuaire: Record<string, string>, mail: string | undefined, repli: string): string =>
  (mail && annuaire[mail.trim().toLowerCase()]?.trim()) || repli;

export type AutoConfig = {
  momoLink: string;
  mapsLink: string;
  reviewLink: string;
  itineraire: string;
  /** LE QR MARCHAND MoMo (13 août). Le « lien de paiement » de la Maison
      n'est pas un lien : c'est le QR du compte marchand MTN. `momoQr` porte
      la DONNÉE que le QR encode (décodée du document officiel : l'identifiant
      marchand), redessinée en SVG par le moteur maison — même donnée, même
      lecture au scan. L'USSD est le chemin sans appareil photo ; le nom est
      celui du compte marchand, affiché sous le code. Ces trois valeurs sont
      sur l'affiche posée au salon — publiques par nature. */
  momoQr?: string;
  momoUssd?: string;
  momoMarchand?: string;
  /** LE WI-FI DES CLIENTES (13 août). Le QR encode `WIFI:T:WPA;S:…;P:…;;` —
      le téléphone se connecte sans taper le mot de passe. Ces deux valeurs
      vivent ICI, dans la base de la maison, JAMAIS en dur dans le code : le
      dépôt est public, et un mot de passe commité est un mot de passe donné. */
  wifiSsid?: string;
  wifiPass?: string;
  /** Le second réseau de la maison (l'autre box, l'autre bande) — même règle. */
  /** L'AVIS SANS MAIN (19 août). Vrai = la fonction planifiée avis-google
      envoie elle-même le WhatsApp à la première venue soldée, et le comptoir
      cesse d'ouvrir WhatsApp à l'encaissement. À n'allumer que quand les clés
      Meta sont posées — sinon plus personne n'envoie rien. */
  avisAuto?: boolean;
  wifi2Ssid?: string;
  wifi2Pass?: string;
};

/** Défauts du compte marchand — relevés du document MoMo de la Maison. */
export const MOMO_QR_DEFAUT = '506846@momopay';
export const MOMO_USSD_DEFAUT = '*880*41*506846*montant#';
export const MOMO_MARCHAND_DEFAUT = 'Ets ACIA1';

/** CE QU'IL FAUT POUR PAYER, tel que la facture doit l'imprimer : l'identifiant
    marchand (le QR que l'app MoMo reconnaît — le même que l'affiche du comptoir),
    le code à composer montant compris, et le nom du marchand. */
export const paiementMomoDeLaMaison = (montantXof?: number): {
  qr: string; code: string; marchand: string;
} => {
  const cfg = autoConfigStore.get() as { momoQr?: string; momoUssd?: string; momoMarchand?: string };
  return {
    qr: cfg.momoQr || MOMO_QR_DEFAUT,
    code: ussdAvecMontant(cfg.momoUssd || MOMO_USSD_DEFAUT, montantXof),
    marchand: cfg.momoMarchand || MOMO_MARCHAND_DEFAUT,
  };
};

/** LE LIEN DE PAIEMENT DE LA MAISON (25 août) — la page `payer.html` (marchand +
    code à composer), avec le MONTANT EXACT pré-rempli quand on le connaît. C'est
    ce lien qu'on ENVOIE à une cliente (WhatsApp) : une page se lit, un QR se
    scanne, et ce ne sont pas les mêmes gestes. Le QR de la facture, lui, porte
    l'identifiant marchand (voir `paiementMomoDeLaMaison`). Aucun domaine en dur :
    l'URL naît de l'origine courante, comme le reste de la Maison. */
export const lienPaiementMomo = (montantXof?: number): string | null => {
  const cfg = autoConfigStore.get() as { momoUssd?: string; momoMarchand?: string };
  const ussd = cfg.momoUssd || MOMO_USSD_DEFAUT;
  const marchand = cfg.momoMarchand || MOMO_MARCHAND_DEFAUT;
  const code = (ussd.match(/\d{4,}/g) ?? []).slice(-1)[0] ?? '';
  if (!code && !marchand) return null;
  if (typeof window === 'undefined') return null;
  const u = new URL(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/payer.html`, window.location.href);
  if (marchand) u.searchParams.set('m', marchand);
  if (code) u.searchParams.set('c', code);
  if (montantXof && montantXof > 0) u.searchParams.set('montant', String(Math.round(montantXof)));
  return u.href;
};

/** Le lien d'avis Google de la Maison — remis par Yéman le 18 août 2026.
    Public par nature : c'est le lien qu'on DONNE aux clientes. Il se corrige
    dans Paramètres › Automatisations sans toucher au code. */
export const REVIEW_LINK_DEFAUT = 'https://g.page/r/CYEt1s4BqvZDEBE/review';

/* ── LE JOURNAL DES ENVOIS (13 août) — table `envois`, 0043.
   Une ligne = UN message à UNE personne par UN canal, avec son verdict.
   ÉCRIT par la fonction planifiée `rappels-j1` (push automatique, WhatsApp/
   SMS quand leurs clés existeront) et par la tournée du matin du Trône
   (rappel WhatsApp envoyé à la main). Identifiant DÉTERMINISTE
   `env-<apptId>-<canal>` : l'idempotence des rappels vit dans la clé. */
export type Envoi = {
  id: string;
  branchId?: string;
  type: 'rappel-j1' | 'avis-google';
  canal: 'push' | 'whatsapp' | 'sms' | 'wa-main';
  apptId: string;
  /** La pièce concernée — les envois d'avis n'ont pas de rendez-vous. */
  invoiceId?: string;
  clientId?: string;
  dateRdv: string;
  heure?: string;
  statut: 'envoyé' | 'échec' | 'sans-abonnement' | 'à-la-main';
  detail?: string;
  quand: string; // ISO — l'instant de la tentative
};
export const envoisStore = createStore<Envoi[]>('mnd_envois', []);
export const useEnvois = () => useStore(envoisStore);

/** Liens configurables insérés tels quels dans les envois — partagés Marketing ↔ Paramètres. */
export const autoConfigStore = createStore<AutoConfig>('mnd_auto_config', {
  momoLink: '',
  mapsLink: '',
  reviewLink: REVIEW_LINK_DEFAUT,
  itineraire: '',
  momoQr: MOMO_QR_DEFAUT,
  momoUssd: MOMO_USSD_DEFAUT,
  momoMarchand: MOMO_MARCHAND_DEFAUT,
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

/* ── LE MODÈLE DES ABONNEMENTS VIT DANS shared/ — 28 août 2026 ─────────
   Il a dû descendre pour que Ma Couronne puisse le lire sans importer le
   Trône. Tout est réexporté ici : aucun des quarante imports existants n’a
   eu à changer, et les écrans continuent de dire `from './data'`. */
export {
  PLANS_SEED, plansStore, usePlans, SUBSCRIBERS_SEED, subscribersStore, useSubscribers,
  FAMILLES_FORMULES, cycleDays, cycleLabel, annualPriceXof, semestrielPriceXof,
  subCycleAmountXof, subMonthlyXof, activeSubscriberOf, subPaid, addDaysFromISO,
  cycleWindow, subWindow, coversSub, subServiceUsage, usageDetaille, rdvCouvertsDe, rdvCouvertsHorsFormule,
  prixDeLaFormule, partMensuelleDeLaFormule, moisDuPack, valeurALaCarte, remiseSurLaCarte,
  etendueDeLaFormule, basePourLaTete, type TeteConnue,
  abonnementsVivantsDe, gainPourElle, perkParleDeLaCarte,
  /* Ce qui se convient au comptoir, 28 août — le prix et le contenu propres
     à une tête. Voir `shared/abonnements.ts`. */
  prixVenduXof, inclusVendus, validiteVendueJours, moisCouvertsVendus,
  partMensuelleVendueXof, prixEstConvenu, ecartDuPrixConvenu,
} from '../../../../shared/abonnements';
export type {
  Payment, PlanIncluded, PlanMode, FamilleFormule, Plan, Subscriber, SubCycle, IncludedUsage, PrixAffiche,
} from '../../../../shared/abonnements';
/* Les seuls usages INTERNES à ce fichier : les semences et le marketing en
   ont besoin comme valeurs, pas seulement comme types. */
import { plansStore, subscribersStore, coversSub, inclusVendus, type Payment, type Plan, type PlanIncluded, type Subscriber } from '../../../../shared/abonnements';




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


/** Idempotent : dote une Maison SANS aucune formule des 6 formules de départ.
    N'agit que si la liste est vide — ne réécrit jamais des formules déjà créées. */
export function ensureStarterPlans(): void {
  if (HOUSE_BLANK) return; // Maison à blanc — aucune semence
  const cur = plansStore.get();
  if (Array.isArray(cur) && cur.length > 0) return;
  plansStore.set(STARTER_PLANS.map((p) => ({ ...p, perks: [...p.perks] })));
}

/* ═══ LES FORMULES MARKETING — 28 août 2026 ═══════════════════════════
   « Créer des abonnements marketing pour que mes clients les prennent
   massivement » (Yéman), dans le style de VÈKPÈ™ · Les 4 Premiers Entretiens.

   CE QUI FAIT PRENDRE UN ABONNEMENT N'EST PAS SON PRIX, C'EST SON MOMENT.
   VÈKPÈ™ · Les 4 Premiers Entretiens marche parce qu'il arrive quand la
   question se pose déjà : elle vient de poser sa couronne, elle sait qu'il
   faudra l'entretenir. Chacune des formules ci-dessous porte donc son moment,
   écrit dans `line` — c'est ce qu'on dit au comptoir, pas un slogan.

   LES PRIX SONT CALCULÉS SUR LE CATALOGUE RÉEL, pas inventés : resserrage
   racines 25 000, soin assouplissant 20 000, entretien complet 40 000. Chaque
   formule annonce sa remise (`discountPct`) telle qu'elle est dite à la vente,
   et l'écart au prix à la carte est vrai. Une remise qu'on ne peut pas
   justifier au comptoir se retourne contre la Maison.

   LE FOYER A DEUX TAILLES parce qu'un abonnement famille qui n'aurait qu'une
   taille obligerait la troisième tête à payer un abonnement entier — et c'est
   exactement la tête qu'on veut faire entrer. La remise croît avec le nombre :
   trois têtes gardent plus que deux, sinon rien ne pousse à monter. */
export const PLANS_MARKETING: Plan[] = [
  /* ⓪ L'ÉCLOSION — le pack de la première création, 28 août 2026.
     « À la première création des locks, crée-moi le pack irrésistible avec
     2 mois offerts, des retouches post-création, le lavage et le resserrage,
     pour la cliente qui doit se sentir suivie et en toute sécurité » (Yéman).

     LE MOMENT LE PLUS FRAGILE DE TOUTE LA VIE D'UNE COURONNE. Les premières
     semaines après une création, les locks bougent, la cliente doute, et
     c'est là qu'on la perd — pas au bout d'un an. Ce pack achète cette peur
     et la remplace par un calendrier : elle sait déjà qui la suit et quand.

     IL NE CONTIENT PAS LA CRÉATION. Une VÈKPÈ™ va de 80 000 à 385 000 F selon
     le calibre : l'inclure rendrait le prix du pack impossible à afficher. Il
     se vend AVEC elle, au comptoir, le jour de la naissance.

     DEUX MOIS OFFERTS, AU SENS EXACT DE LA MAISON : 270 000 F de rythme sur
     douze mois, dix payés. Le compte tombe juste, il se vérifie devant elle.
     Les deux retouches post-création viennent EN PLUS, offertes — c'est ce
     qui rend l'offre irrésistible plutôt que simplement avantageuse. */
  {
    id: 'pl-mkt-eclosion', name: 'L’Éclosion', tag: 'Le premier cycle, accompagné', priceXof: 225000,
    line: 'Votre première année, jamais seule.',
    perks: [
      '2 retouches post-création, offertes',
      '6 GBÈJÍ™ resserrage racines',
      '6 KLƆKLƆ™ Le Lavage',
      'Valable 12 mois, dont 2 offerts',
      '270 000 F à la carte, vous gagnez 45 000 F',
    ],
    popular: true, mode: 'pack', validityDays: 365, discountPct: 17, famille: 'naissance',
    included: [
      { serviceId: 'sv-retouches-post-creation', qty: 2 },
      { serviceId: 'sv-resserrage', qty: 6 },
      { serviceId: 'sv-bain-vapeur', qty: 6 },
    ],
  },

  /* ① LA SUITE — le prolongement des 4 Premiers Entretiens. Le meilleur moment
     de vente de la Maison : elle a déjà payé une fois, elle connaît le
     fauteuil, et son quatrième entretien arrive. Aucune tête à convaincre. */
  {
    id: 'pl-mkt-suite', name: 'La Suite', tag: 'Après les quatre', priceXof: 35000,
    line: 'Votre couronne ne s’arrête pas à quatre.',
    perks: [
      '1 GBÈJÍ™ resserrage par mois',
      '1 WÈWÈ™ soin par mois',
      'Votre créneau gardé, rien qu’à vous',
      '−15 % sur la gamme',
    ],
    popular: true, mode: 'cycle', discountPct: 22, famille: 'prolongement',
    included: [{ serviceId: 'sv-resserrage', qty: 1 }, { serviceId: 'sv-bain-vapeur', qty: 1 }],
  },

  /* ② LE CARNET DES SIX — la logique du carnet, comprise de tous. Deux effets
     que le mensuel n'a pas : la caisse encaisse TOUT DE SUITE, et la tête
     revient six fois au lieu d'aller voir ailleurs entre deux resserrages. */
  {
    id: 'pl-mkt-carnet', name: 'Le Carnet des Six', tag: 'Cinq payés, six pris', priceXof: 125000,
    line: 'Le dernier resserrage que vous payez plein tarif.',
    perks: [
      '6 GBÈJÍ™ resserrage racines',
      'Le sixième est offert par la Maison',
      'Valable 12 mois, à votre rythme',
      'Transmissible à une tête de votre foyer',
    ],
    popular: false, mode: 'pack', validityDays: 365, discountPct: 17, famille: 'prolongement',
    included: [{ serviceId: 'sv-resserrage', qty: 6 }],
  },

  /* ③ LE LAVAGE DU MOIS — la porte d'entrée. Ce qui se prend massivement est
     ce qui coûte le moins cher à dire oui : un seul geste, un petit prix, tous
     les mois. C'est la formule qu'on propose à celle qui hésite sur tout le
     reste, et beaucoup montent ensuite vers La Suite. */
  {
    id: 'pl-mkt-lavage', name: 'Le Lavage du Mois', tag: 'La porte d’entrée', priceXof: 15000,
    line: 'Une couronne propre, tous les mois, sans y penser.',
    perks: [
      '1 WÈWÈ™ soin & lavage par mois',
      'Rappel automatique la veille',
      '−10 % sur la gamme',
    ],
    popular: true, mode: 'cycle', discountPct: 25, famille: 'porte',
    included: [{ serviceId: 'sv-bain-vapeur', qty: 1 }],
  },

  /* ④ ET ⑤ LE FOYER — chaque abonnée devient une vendeuse : elle a intérêt à
     trouver sa deuxième tête, puis sa troisième. C'est le seul levier de la
     liste qui amène des têtes NEUVES sans que la Maison dépense un franc. */
  {
    id: 'pl-mkt-foyer2', name: 'Le Foyer · Deux Têtes', tag: 'À deux', priceXof: 60000,
    line: 'Mère et fille, sœurs, amies : une seule formule pour deux couronnes.',
    perks: [
      '1 GBÈJÍ™ + 1 KLƆKLƆ™ chacune, par mois',
      'Vos deux créneaux côte à côte',
      '−15 % sur la gamme pour les deux',
      '10 000 F de moins que deux Suite',
    ],
    popular: true, mode: 'cycle', discountPct: 33, famille: 'foyer',
    included: [{ serviceId: 'sv-resserrage', qty: 2 }, { serviceId: 'sv-bain-vapeur', qty: 2 }],
  },
  {
    id: 'pl-mkt-foyer3', name: 'Le Foyer · Trois Têtes', tag: 'À trois', priceXof: 85000,
    line: 'Trois couronnes sous le même toit, un seul rendez-vous à retenir.',
    perks: [
      '1 GBÈJÍ™ + 1 KLƆKLƆ™ chacune, par mois',
      'Vos trois créneaux à la suite',
      '−15 % sur la gamme pour les trois',
      '20 000 F de moins que trois Suite',
    ],
    popular: false, mode: 'cycle', discountPct: 37, famille: 'foyer',
    included: [{ serviceId: 'sv-resserrage', qty: 3 }, { serviceId: 'sv-bain-vapeur', qty: 3 }],
  },

  /* ═══ LES ANNÉES — packs annuels pour les têtes qui font confiance ═══
     « Pour les clientes qui font confiance, qui veulent prendre un pack annuel
     avec leur lavage et resserrage, et un pour lavage resserrage et soin »
     (Yéman, 28 août). Trois rythmes, chacun en Duo et en Trio.

     PAQUET DE CRÉDITS, PAS ABONNEMENT. La caisse encaisse le jour de la
     signature, et la tête vient quand elle veut sur douze mois. Un abonnement
     annuel lui ferait perdre le mois où elle voyage, et sur une tête fidèle ça
     se retourne contre la Maison au moment de renouveler.

     LE TRIO GAGNE TOUJOURS PLUS QUE SON DUO (≈22 % contre ≈20 %). Sans cet
     écart, rien ne pousse à monter d'un cran — même règle que le Foyer à trois
     têtes. La remise reste sous les 25 % : au-delà, elle cesse d'être un
     remerciement et devient un prix, celui que la tête réclamera ensuite à la
     carte.

     TOUTES DÉPASSENT 100 000 F, donc toutes s'ouvrent au paiement en 2 ou 4
     fois (`shared/echeancier.ts`). C'est ce qui les rend vendables : personne
     ne sort 405 000 F d'un coup. */

  /* ① L'ANNÉE SEREINE — une venue tous les deux mois, tout dans la même
     séance. Un seul rendez-vous à retenir, un seul créneau à garder. */
  {
    id: 'pl-mkt-annee-sereine-duo', name: 'L’Année Sereine · Duo', tag: 'Six séances', priceXof: 215000,
    line: 'Toute l’année tenue, une venue tous les deux mois.',
    perks: [
      '6 GBÈJÍ™ resserrage racines',
      '6 KLƆKLƆ™ Le Lavage',
      'Tout dans la même séance, un seul rendez-vous',
      'Valable 12 mois, à votre rythme',
      '270 000 F à la carte, vous gagnez 55 000 F',
    ],
    popular: false, mode: 'pack', validityDays: 365, discountPct: 20, famille: 'annees',
    included: [{ serviceId: 'sv-resserrage', qty: 6 }, { serviceId: 'sv-bain-vapeur', qty: 6 }],
  },
  {
    id: 'pl-mkt-annee-sereine-trio', name: 'L’Année Sereine · Trio', tag: 'Six séances, soin compris', priceXof: 305000,
    line: 'La même année, le soin en plus.',
    perks: [
      '6 GBÈJÍ™ resserrage racines',
      '6 KLƆKLƆ™ Le Lavage',
      '6 WÈWÈ™ soin',
      'Valable 12 mois, à votre rythme',
      '390 000 F à la carte, vous gagnez 85 000 F',
    ],
    popular: true, mode: 'pack', validityDays: 365, discountPct: 22, famille: 'annees',
    included: [{ serviceId: 'sv-resserrage', qty: 6 }, { serviceId: 'sv-bain-vapeur', qty: 6 }, { serviceId: 'zebpkpg6ar', qty: 6 }],
  },

  /* ② L'ANNÉE FRAÎCHE — le resserrage tous les deux mois, mais le lavage
     CHAQUE mois. Dix-huit passages au lieu de six : plus de travail au
     fauteuil, mais douze occasions de plus de vendre la gamme. */
  {
    id: 'pl-mkt-annee-fraiche-duo', name: 'L’Année Fraîche · Duo', tag: 'Le lavage chaque mois', priceXof: 310000,
    line: 'Une couronne fraîche tous les mois, des racines nettes tous les deux.',
    perks: [
      '6 GBÈJÍ™ resserrage racines',
      '12 KLƆKLƆ™ Le Lavage, un par mois',
      'Valable 12 mois, à votre rythme',
      '390 000 F à la carte, vous gagnez 80 000 F',
    ],
    popular: false, mode: 'pack', validityDays: 365, discountPct: 20, famille: 'annees',
    included: [{ serviceId: 'sv-resserrage', qty: 6 }, { serviceId: 'sv-bain-vapeur', qty: 12 }],
  },
  {
    id: 'pl-mkt-annee-fraiche-trio', name: 'L’Année Fraîche · Trio', tag: 'Lavage mensuel, soin compris', priceXof: 395000,
    line: 'Le lavage chaque mois, le soin à chaque resserrage.',
    perks: [
      '6 GBÈJÍ™ resserrage racines',
      '12 KLƆKLƆ™ Le Lavage, un par mois',
      '6 WÈWÈ™ soin',
      'Valable 12 mois, à votre rythme',
      '510 000 F à la carte, vous gagnez 115 000 F',
    ],
    popular: false, mode: 'pack', validityDays: 365, discountPct: 22, famille: 'annees',
    included: [{ serviceId: 'sv-resserrage', qty: 6 }, { serviceId: 'sv-bain-vapeur', qty: 12 }, { serviceId: 'zebpkpg6ar', qty: 6 }],
  },

  /* ②bis LA JUSTE CADENCE — 28 août 2026, demandée telle quelle : « un
     abonnement de lavage et resserrage qui s'utilise toutes les six semaines,
     total six séances sur l'année, ça dure environ dix mois ».

     SIX SEMAINES EST LE VRAI RYTHME D'UNE COURONNE, entre les deux mois de
     L'Année Sereine (un peu lâche) et les huit séances de L'Année Nette (un
     peu serré). Six séances espacées de six semaines couvrent trente-six
     semaines : huit mois et demi. La validité est posée à DIX MOIS, et cette
     marge est le cœur de l'offre — une séance repoussée pour un voyage ou un
     empêchement ne doit pas faire perdre la dernière.

     MÊME CONTENU ET MÊME PRIX QUE L'ANNÉE SEREINE · DUO : on ne fait pas payer
     plus pour un rythme plus serré à nombre de séances égal. Ce qui les
     sépare est la CADENCE, pas la valeur. */
  {
    id: 'pl-mkt-juste-cadence', name: 'La Juste Cadence', tag: 'Toutes les six semaines', priceXof: 215000,
    line: 'Le rythme que votre couronne demande, ni plus ni moins.',
    perks: [
      '6 GBÈJÍ™ resserrage racines',
      '6 KLƆKLƆ™ Le Lavage',
      'Une venue toutes les six semaines',
      'Valable 10 mois, la marge pour souffler',
      '270 000 F à la carte, vous gagnez 55 000 F',
    ],
    popular: false, mode: 'pack', validityDays: 300, discountPct: 20, famille: 'annees',
    included: [{ serviceId: 'sv-resserrage', qty: 6 }, { serviceId: 'sv-bain-vapeur', qty: 6 }],
  },

  /* ③ L'ANNÉE NETTE — toutes les six semaines. Pour les couronnes qui
     poussent vite et les têtes exigeantes sur la netteté des racines. */
  {
    id: 'pl-mkt-annee-nette-duo', name: 'L’Année Nette · Duo', tag: 'Toutes les six semaines', priceXof: 285000,
    line: 'Des racines toujours nettes, huit fois dans l’année.',
    perks: [
      '8 GBÈJÍ™ resserrage racines',
      '8 KLƆKLƆ™ Le Lavage',
      'Toutes les six semaines',
      'Valable 12 mois, à votre rythme',
      '360 000 F à la carte, vous gagnez 75 000 F',
    ],
    popular: false, mode: 'pack', validityDays: 365, discountPct: 21, famille: 'annees',
    included: [{ serviceId: 'sv-resserrage', qty: 8 }, { serviceId: 'sv-bain-vapeur', qty: 8 }],
  },
  {
    id: 'pl-mkt-annee-nette-trio', name: 'L’Année Nette · Trio', tag: 'Six semaines, soin compris', priceXof: 405000,
    line: 'Le rythme le plus serré, la couronne au plus haut.',
    perks: [
      '8 GBÈJÍ™ resserrage racines',
      '8 KLƆKLƆ™ Le Lavage',
      '8 WÈWÈ™ soin',
      'Toutes les six semaines',
      'Valable 12 mois, à votre rythme',
      '520 000 F à la carte, vous gagnez 115 000 F',
    ],
    popular: false, mode: 'pack', validityDays: 365, discountPct: 22, famille: 'annees',
    included: [{ serviceId: 'sv-resserrage', qty: 8 }, { serviceId: 'sv-bain-vapeur', qty: 8 }, { serviceId: 'zebpkpg6ar', qty: 8 }],
  },
];

/** Les six « Années » — les packs annuels des têtes qui font confiance. */
/* LA FAMILLE FAIT FOI, PAS L'IDENTIFIANT. Le filtre lisait `pl-mkt-annee-` :
   il a laissé La Juste Cadence dehors le jour de sa création, alors qu'elle est
   bien une Année. Un nom d'identifiant n'est pas un classement. */
export const PACKS_ANNUELS = PLANS_MARKETING.filter((p) => p.famille === 'annees');

/** POSE LES FORMULES MARKETING QUI MANQUENT, et rien d'autre.
    Idempotent PAR IDENTIFIANT : une formule déjà posée n'est jamais réécrite,
    même si son prix ou ses avantages ont été retouchés à l'écran. C'est la
    règle de toutes les semences de la Maison — le geste de Yéman prime
    toujours sur celui du code. Rend le nombre réellement ajouté. */
export function poseLesFormulesMarketing(idsDuCatalogue?: ReadonlySet<string>): number {
  const cur = plansStore.get();
  const connus = new Set((Array.isArray(cur) ? cur : []).map((p) => p.id));
  const neuves = PLANS_MARKETING.filter((p) => !connus.has(p.id));
  if (neuves.length === 0) return 0;
  /* LES PRESTATIONS INCLUSES SONT FILTRÉES SUR LE CATALOGUE VIVANT. Les
     identifiants écrits ici viennent d'un relevé ; le catalogue de la Maison a
     pu les renommer, les déplacer, les retirer. Poser un quota sur une
     prestation qui n'existe plus donnerait un suivi de consommation qui
     compte toujours zéro, sans jamais dire pourquoi. Mieux vaut une formule
     sans quota, qu'on rattache à l'écran en trois clics. */
  const garde = (inc?: PlanIncluded[]) =>
    (idsDuCatalogue ? inc?.filter((i) => idsDuCatalogue.has(i.serviceId)) : inc)?.map((i) => ({ ...i }));
  plansStore.set((prev) => [
    ...prev,
    ...neuves.map((p) => ({ ...p, perks: [...p.perks], included: garde(p.included) })),
  ]);
  return neuves.length;
}

/** Combien des formules marketing manquent encore. */
export const formulesMarketingAbsentes = (plans: readonly Plan[]): number => {
  const connus = new Set(plans.map((p) => p.id));
  return PLANS_MARKETING.filter((p) => !connus.has(p.id)).length;
};

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




/** Allocation RESTANTE pour couvrir CE service sur le cycle en cours :
    `undefined` = pas inclus dans la formule · `null` = illimité · nombre = reste.
    `excludeApptId` exclut le RDV en cours d'édition de son propre décompte. */
export const coveredRemaining = (
  sub: Subscriber, plan: Plan | undefined, serviceId: string, appts: Appointment[], excludeApptId?: string,
): number | null | undefined => {
  /* SON CONTENU À ELLE. Lire celui de la formule refuserait au comptoir une
     prestation qu'on lui a vendue en propre, et en offrirait une qu'on lui
     avait retirée — les deux devant elle, au moment de réserver. */
  const i = inclusVendus(sub, plan).find((x) => x.serviceId === serviceId);
  if (!i) return undefined;
  if (i.qty === null) return null;
  const used = appts.filter(
    (a) => a.id !== excludeApptId && a.serviceIds.includes(serviceId) && coversSub(a, sub, plan),
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
  verbe: DEVISE_COMPLETE,
};

export const themeStore = createStore<ThemeConfig>('mnd_theme', THEME_DEFAULT);
export const useTheme = () => useStore(themeStore);

/* ---------- Synchronisation Supabase — tous les magasins de ce module ----------
   Rien de local : équipe, marketing, abonnements, académie, paramètres maison,
   thème et accès du personnel remontent en base (collections + documents). */
import { bindCollection, bindDocument } from '../../../../shared/sync';
bindCollection(staffStore, 'team');
bindCollection(campaignsStore, 'campaigns');
bindCollection(formationsStore, 'formations');
bindCollection(apprenantsStore, 'apprenants');
bindCollection(certifsStore, 'certifications');
bindDocument(segmentNotesStore, 'mnd_segment_notes');
bindDocument(automationsStore, 'mnd_automations');
bindDocument(automationsActiveStore, 'mnd_automations_active');
bindDocument(annuaireStore, 'mnd_annuaire');
bindDocument(autoConfigStore, 'mnd_auto_config');
bindCollection(envoisStore, 'envois');
bindDocument(recoStateStore, 'mnd_reco_state');
bindDocument(salonHoursStore, 'mnd_salon_hours');
bindDocument(staffAccessStore, 'mnd_staff_access');
bindDocument(accessCodesStore, 'mnd_access_codes');
bindDocument(houseSettingsStore, 'mnd_house_settings');
/* LES FONCTIONS SUIVENT LA MAISON, pas l’appareil : une fonction ajoutée au
   comptoir doit exister sur le téléphone de la gérante. */
bindDocument(fonctionsStore, 'mnd_fonctions');
bindDocument(themeStore, 'mnd_theme');
bindDocument(refTempsStore, 'mnd_ref_temps');
bindDocument(refPaliersStore, 'mnd_ref_paliers');
bindDocument(refLexiqueStore, 'mnd_ref_lexique');
