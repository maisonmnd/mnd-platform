import { lazy, type LazyExoticComponent, type ComponentType } from 'react';
import {
  LayoutDashboard, LineChart, NotebookPen, ClipboardList, CalendarDays, Users, MonitorPlay,
  Drama, BookOpen, Wallet, FileText, FlaskConical, PieChart, Scale, ReceiptText, UsersRound,
  Megaphone, Crown, Repeat, Lightbulb, GraduationCap, Settings, MapPin, Palette, type LucideIcon,
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
      { path: '/analytics', label: 'Analytics', icon: LineChart, Component: lazy(() => import('./pilotage/Analytics')) },
    ],
  },
  {
    group: 'Clients & Agenda',
    items: [
      { path: '/carnet', label: 'Le Carnet', icon: NotebookPen, Component: lazy(() => import('./clients/Carnet')) },
      { path: '/consultations', label: 'Consultations', icon: ClipboardList, Component: lazy(() => import('./clients/Consultations')) },
      { path: '/calendrier', label: 'Calendrier', icon: CalendarDays, Component: lazy(() => import('./clients/Calendrier')) },
      { path: '/customers', label: 'Customers', icon: Users, Component: lazy(() => import('./clients/Customers')) },
      { path: '/vitrine', label: 'Vitrine client', icon: MonitorPlay, Component: lazy(() => import('./clients/Vitrine')) },
      { path: '/personas', label: 'Personas', icon: Drama, Component: lazy(() => import('./clients/Personas')) },
    ],
  },
  {
    group: 'Vente',
    items: [
      { path: '/catalogue', label: 'Catalogue', icon: BookOpen, Component: lazy(() => import('./vente/Catalogue')) },
      { path: '/caisse', label: 'Caisse POS', icon: Wallet, Component: lazy(() => import('./vente/Caisse')) },
      { path: '/factures', label: 'Factures & devis', icon: FileText, Component: lazy(() => import('./vente/Factures')) },
      { path: '/laboratoire', label: 'Le Laboratoire', icon: FlaskConical, Component: lazy(() => import('./vente/Laboratoire')) },
    ],
  },
  {
    group: 'Finances',
    items: [
      { path: '/synthese', label: 'Synthèse & résultat', icon: PieChart, Component: lazy(() => import('./finances/Synthese')) },
      { path: '/juste-prix', label: 'Le Juste Prix', icon: Scale, Component: lazy(() => import('./finances/JustePrix')) },
      { path: '/depenses', label: 'Dépenses', icon: ReceiptText, Component: lazy(() => import('./finances/Depenses')) },
    ],
  },
  {
    group: 'Équipe & Croissance',
    items: [
      { path: '/personnel', label: 'Personnel & paie', icon: UsersRound, Component: lazy(() => import('./equipe/Personnel')) },
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
      { path: '/branches', label: 'Branches', icon: MapPin, Component: lazy(() => import('./systeme/Branches')) },
      { path: '/marque', label: 'Marque & thème', icon: Palette, Component: lazy(() => import('./systeme/Marque')) },
    ],
  },
];
