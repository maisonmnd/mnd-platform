import { lazy, type LazyExoticComponent, type ComponentType } from 'react';
import {
  LayoutDashboard, LineChart, BarChart3, NotebookPen, ClipboardList, CalendarDays, Users, MonitorPlay,
  Drama, BookOpen, Wallet, FileText, FlaskConical, PieChart, Scale, ReceiptText, UsersRound,
  Megaphone, Crown, Repeat, ShoppingBag, Lightbulb, GraduationCap, Settings, MapPin, Palette, ShieldCheck, Handshake, Landmark, HandCoins, BadgeCheck, type LucideIcon,
} from 'lucide-react';

/* Registre des 24 routes du Trône, groupées par domaine.
   Chaque domaine appartient à un module sous routes/<domaine>/. */

export type TroneRoute = {
  path: string;
  label: string;
  icon: LucideIcon;
  Component: LazyExoticComponent<ComponentType>;
};

export type TroneGroup = { group: string; items: TroneRoute[] };

export const NAV: TroneGroup[] = [
  {
    group: 'Pilotage',
    items: [
      { path: '/', label: 'Tableau de bord', icon: LayoutDashboard, Component: lazy(() => import('./pilotage/Dashboard')) },
      { path: '/bilan-mensuel', label: 'Bilan mensuel', icon: BarChart3, Component: lazy(() => import('./pilotage/BilanMensuel')) },
      { path: '/analytics', label: 'Analytics', icon: LineChart, Component: lazy(() => import('./pilotage/Analytics')) },
    ],
  },
  {
    group: 'Clients & Agenda',
    items: [
      /* Ordre voulu par la maison : le jour d'abord, la lignée ensuite. */
      { path: '/calendrier', label: 'Calendrier', icon: CalendarDays, Component: lazy(() => import('./clients/Calendrier')) },
      { path: '/carnet', label: 'Le Carnet', icon: NotebookPen, Component: lazy(() => import('./clients/Carnet')) },
      { path: '/customers', label: 'Clientes', icon: Users, Component: lazy(() => import('./clients/Customers')) },
      { path: '/consultations', label: 'Consultations', icon: ClipboardList, Component: lazy(() => import('./clients/Consultations')) },
      { path: '/personas', label: 'Personas', icon: Drama, Component: lazy(() => import('./clients/Personas')) },
      { path: '/vitrine', label: 'Vitrine client', icon: MonitorPlay, Component: lazy(() => import('./clients/Vitrine')) },
    ],
  },
  {
    group: 'Vente',
    items: [
      { path: '/catalogue', label: 'Catalogue', icon: BookOpen, Component: lazy(() => import('./vente/Catalogue')) },
      { path: '/caisse', label: 'Caisse POS', icon: Wallet, Component: lazy(() => import('./vente/Caisse')) },
      { path: '/home-rituals', label: 'Produits', icon: ShoppingBag, Component: lazy(() => import('./vente/HomeRituals')) },
      { path: '/factures', label: 'Factures & devis', icon: FileText, Component: lazy(() => import('./vente/Factures')) },
      { path: '/laboratoire', label: 'Le Laboratoire', icon: FlaskConical, Component: lazy(() => import('./vente/Laboratoire')) },
    ],
  },
  {
    group: 'Finances',
    items: [
      { path: '/synthese', label: 'Synthèse & résultat', icon: PieChart, Component: lazy(() => import('./finances/Synthese')) },
      { path: '/encaissements', label: 'Encaissements', icon: BadgeCheck, Component: lazy(() => import('./finances/Encaissements')) },
      { path: '/coffre', label: 'Coffre-fort', icon: Landmark, Component: lazy(() => import('./finances/Coffre')) },
      { path: '/comptes', label: 'Comptes & Avoirs', icon: HandCoins, Component: lazy(() => import('./finances/Comptes')) },
      { path: '/juste-prix', label: 'Le Juste Prix', icon: Scale, Component: lazy(() => import('./finances/JustePrix')) },
      { path: '/depenses', label: 'Dépenses', icon: ReceiptText, Component: lazy(() => import('./finances/Depenses')) },
    ],
  },
  {
    group: 'Équipe & Croissance',
    items: [
      { path: '/mon-mois', label: 'Mon mois', icon: BadgeCheck, Component: lazy(() => import('./equipe/MonMois')) },
      { path: '/personnel', label: 'Personnel & paie', icon: UsersRound, Component: lazy(() => import('./equipe/Personnel')) },
      { path: '/prestataires', label: 'Prestataires', icon: Handshake, Component: lazy(() => import('./equipe/Prestataires')) },
      { path: '/marketing', label: 'Marketing', icon: Megaphone, Component: lazy(() => import('./equipe/Marketing')) },
      { path: '/cercle', label: 'Cercle MND', icon: Crown, Component: lazy(() => import('./equipe/Cercle')) },
      { path: '/abonnements', label: 'Abonnements', icon: Repeat, Component: lazy(() => import('./equipe/Abonnements')) },
      { path: '/recommandations', label: 'Recommandations IA', icon: Lightbulb, Component: lazy(() => import('./equipe/Recommandations')) },
      { path: '/academie', label: 'Académie', icon: GraduationCap, Component: lazy(() => import('./equipe/Academie')) },
    ],
  },
  {
    group: 'Système',
    items: [
      { path: '/parametres', label: 'Paramètres', icon: Settings, Component: lazy(() => import('./systeme/Parametres')) },
      { path: '/acces', label: 'Accès & personnel', icon: ShieldCheck, Component: lazy(() => import('./systeme/Acces')) },
      { path: '/branches', label: 'Branches', icon: MapPin, Component: lazy(() => import('./systeme/Branches')) },
      { path: '/marque', label: 'Marque & thème', icon: Palette, Component: lazy(() => import('./systeme/Marque')) },
    ],
  },
];

/* ── CE QU'UN RÔLE OUVRE ────────────────────────────────────────────────
   La barre affichait les vingt-cinq écrans à quiconque se connectait. Le
   modèle portait pourtant des rubriques par domaine et trois rôles depuis
   toujours — rien ne les appliquait. Donner un compte à un maître pour qu'il
   pointe, c'était lui ouvrir le Coffre-fort, les Finances, et les bulletins
   de paie de ses collègues.

   UN MAÎTRE VOIT SON MOIS ET LE CALENDRIER, et le calendrier sans les
   montants — décision du 6 août. Il vient y lire sa journée, pas le chiffre
   d'affaires de la Maison.

   La liste est BLANCHE, jamais noire : un écran nouveau n'est pas ouvert par
   défaut. Ajouter une route ne peut donc pas élargir un accès par distraction. */
export const ROUTES_MAITRE = ['/mon-mois', '/calendrier'];

/* ── DEUX CASQUETTES, UN SEUL COMPTE ────────────────────────────────────
   Gerard tient le secrétariat et le fauteuil. Lui donner deux comptes
   couperait la personne en deux : deux pointages, deux productions, deux
   parts de pourboire — et le partage le compterait deux fois.

   Son rôle reste donc `maitre`, et on lui OUVRE des domaines en plus. La
   matrice existait dans le modèle depuis toujours (`staffAccessStore`,
   `ERP_DOMAINS`) sans que rien ne la lise ; elle commande désormais la barre.

   Les groupes de la barre portent exactement les libellés des domaines : la
   correspondance se lit, elle ne se maintient pas dans un second tableau. */
const DOMAINE_DU_GROUPE: Record<string, string> = {
  'Pilotage': 'pilotage',
  'Clients & Agenda': 'clients',
  'Vente': 'vente',
  'Finances': 'finances',
  'Équipe & Croissance': 'equipe',
  'Système': 'systeme',
};

export const domaineDe = (path: string): string | undefined =>
  DOMAINE_DU_GROUPE[NAV.find((g) => g.items.some((i) => i.path === path))?.group ?? ''];

/* ── OUVRIR UN ÉCRAN, PAS UN DOMAINE ────────────────────────────────────
   Cocher « Clients & Agenda » ouvrait onze écrans d'un coup — les
   consultations, les personas, la vitrine — là où un secrétaire n'a besoin
   que du calendrier, du carnet et des clientes. Une porte trop large est une
   porte ouverte.

   La matrice accepte donc les deux : la CLÉ D'UN DOMAINE ouvre tout le
   domaine, le CHEMIN D'UN ÉCRAN ouvre cet écran seul. Les chemins commencent
   par « / », les domaines non : rien ne se confond, et les réglages posés
   avant ce jour continuent de valoir. */
export const peutVoir = (
  role: string | undefined,
  path: string,
  acces: Record<string, boolean> = {},
): boolean => {
  if (role !== 'maitre') return true;
  if (ROUTES_MAITRE.includes(path)) return true;
  if (acces[path] === true) return true;
  const d = domaineDe(path);
  return !!d && acces[d] === true;
};

/** LES MONTANTS SE TAISENT POUR UN MAÎTRE — sauf s'il tient aussi le comptoir.
    Un secrétaire qui encaisse a besoin des prix ; un praticien qui vient
    pointer, non. C'est le domaine ouvert qui tranche, pas le rôle. */
export const voitLesPrix = (role: string | undefined, acces: Record<string, boolean> = {}): boolean =>
  role !== 'maitre'
  || acces.vente === true || acces.finances === true
  /* Ouvrir la Caisse ou les Factures sans les montants n'aurait aucun sens :
     l'écran lui-même vaut autorisation de voir les prix. */
  || acces['/caisse'] === true || acces['/factures'] === true;

/** L'écran d'accueil d'un rôle — celui vers lequel on renvoie quand la route
    demandée ne lui est pas ouverte. Un maître qui tape une adresse de finances
    atterrit sur son mois, pas sur une page blanche. */
export const accueilDe = (role: string | undefined): string =>
  role === 'maitre' ? '/mon-mois' : '/';
