import { createStore } from '../../shared/store';

/* LOKAA — la sœur systématique. Une seule variable : l'accent du locataire.
   Tout le reste est le squelette du Trône, verrouillé « Propulsé par MND ». */

export type PlanId = 'atelier' | 'maison' | 'groupe';
export type Statut = 'actif' | 'pause' | 'essai';

export type Plan = {
  id: PlanId;
  nom: string;
  prixXof: number;
  portee: string;
  traits: string[];
};

export const PLANS: Plan[] = [
  {
    id: 'atelier',
    nom: 'Atelier',
    prixXof: 45000,
    portee: '1 branche · 3 Maîtres',
    traits: ['Agenda & caisse POS', 'CRM · carnet de suivi', 'WhatsApp Business', 'Mobile Money'],
  },
  {
    id: 'maison',
    nom: 'Maison',
    prixXof: 95000,
    portee: 'jusqu’à 3 branches',
    traits: ['Tout Atelier, plus', 'Multi-branches & devises', 'Abonnements clients', 'Recommandations IA'],
  },
  {
    id: 'groupe',
    nom: 'Groupe',
    prixXof: 180000,
    portee: 'branches illimitées',
    traits: ['Tout Maison, plus', 'Académie intégrée', 'Audience web & marketing', 'Support prioritaire'],
  },
];

export const planById = (id: PlanId): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

export type Accent = { nom: string; hex: string };

/** Palette d'accents validée par la Maison — la seule variable du thème. */
export const ACCENTS: Accent[] = [
  { nom: 'Émeraude', hex: '#4A7A5B' },
  { nom: 'Cuivre', hex: '#B97A4A' },
  { nom: 'Indigo', hex: '#1E2150' },
  { nom: 'Terre', hex: '#9B4A45' },
  { nom: 'Bronze', hex: '#7F512E' },
  { nom: 'Ardoise', hex: '#4D5594' },
];

export const accentNom = (hex: string): string =>
  ACCENTS.find((a) => a.hex.toLowerCase() === hex.toLowerCase())?.nom ?? 'Personnalisé';

export type Tenant = {
  id: string;
  nom: string;
  ville: string;
  pays: string;
  dial: string;
  devise: string;
  accent: string;
  logo: string | null;
  plan: PlanId;
  statut: Statut;
  proprietaire: string;
};

const SEED: Tenant[] = [
  {
    id: 'lumiere',
    nom: 'Studio Lumière',
    ville: 'Paris',
    pays: 'France',
    dial: '+33',
    devise: 'EUR',
    accent: '#4A7A5B',
    logo: null,
    plan: 'maison',
    statut: 'actif',
    proprietaire: 'Amara D.',
  },
  {
    id: 'sove',
    nom: 'Atelier Sové',
    ville: 'Dakar',
    pays: 'Sénégal',
    dial: '+221',
    devise: 'XOF',
    accent: '#1E2150',
    logo: null,
    plan: 'atelier',
    statut: 'actif',
    proprietaire: 'Bineta N.',
  },
  {
    id: 'ebene',
    nom: 'Couronne d’Ébène',
    ville: 'Abidjan',
    pays: 'Côte d’Ivoire',
    dial: '+225',
    devise: 'XOF',
    accent: '#9B4A45',
    logo: null,
    plan: 'maison',
    statut: 'essai',
    proprietaire: 'Awa K.',
  },
  {
    id: 'racines',
    nom: 'Racines & Or',
    ville: 'Lomé',
    pays: 'Togo',
    dial: '+228',
    devise: 'XOF',
    accent: '#7F512E',
    logo: null,
    plan: 'atelier',
    statut: 'actif',
    proprietaire: 'Sena A.',
  },
];

export const tenantsStore = createStore<Tenant[]>('lokaa_tenants', SEED);

/** MRR facturé au locataire — nul tant que le salon est en essai ou en pause. */
export const mrrXof = (t: Tenant): number => (t.statut === 'actif' ? planById(t.plan).prixXof : 0);

export const STATUT_LABEL: Record<Statut, string> = {
  actif: 'Actif',
  pause: 'En pause',
  essai: 'Essai',
};

/** Éléments non négociables du standard — jamais surchargés par le locataire. */
export const VERROUILLES: string[] = [
  'Architecture des écrans du Trône',
  'Typographie Cormorant + Jost',
  'Rayons 2–4 px · presque carré',
  'La méthode des quatre temps',
  'La logique de palier',
  'Sceau « Propulsé par MND »',
];
