import { lazy, type LazyExoticComponent, type ComponentType } from 'react';
import {
  LayoutDashboard, LineChart, BarChart3, NotebookPen, ClipboardList, CalendarDays, Users, MonitorPlay, PhoneIncoming,
  Drama, BookOpen, Wallet, FileText, FlaskConical, PieChart, Scale, ReceiptText, UsersRound,
  Megaphone, Crown, Repeat, ShoppingBag, Lightbulb, GraduationCap, Settings, MapPin, Palette, ShieldCheck, Handshake, Landmark, HandCoins, BadgeCheck, KeyRound, PiggyBank, QrCode, Activity, MessageSquare, SquareKanban, ScrollText, Handshake as PoigneeDeMain, type LucideIcon,
} from 'lucide-react';

/* Registre des 24 routes du Trône, groupées par domaine.
   Chaque domaine appartient à un module sous routes/<domaine>/. */

export type TroneRoute = {
  path: string;
  /** Joignable, mais absent de la barre latérale. */
  horsMenu?: boolean;
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
      /* LA CADENCE (16 août) — la salle des prédictions. Le juge existait déjà
         (`shared/cadence.ts`) mais ne parlait qu'à l'oreille d'UNE fiche ;
         personne ne voyait la charge qui vient, ni qui a glissé. */
      { path: '/cadence', label: 'La Cadence', icon: Activity, Component: lazy(() => import('./pilotage/Predictions')) },
    ],
  },
  {
    group: 'Clients & Agenda',
    items: [
      /* Ordre voulu par la maison : le jour d'abord, la lignée ensuite. */
      { path: '/calendrier', label: 'Calendrier', icon: CalendarDays, Component: lazy(() => import('./clients/Calendrier')) },
      { path: '/appels', label: 'Les Appels', icon: PhoneIncoming, Component: lazy(() => import('./clients/Appels')) },
      { path: '/carnet', label: 'Le Carnet', icon: NotebookPen, Component: lazy(() => import('./clients/Carnet')) },
      { path: '/customers', label: 'Clientes', icon: Users, Component: lazy(() => import('./clients/Customers')) },
      { path: '/consultations', label: 'Consultations', icon: ClipboardList, Component: lazy(() => import('./clients/Consultations')) },
      { path: '/personas', label: 'Personas', icon: Drama, Component: lazy(() => import('./clients/Personas')) },
      { path: '/vitrine', label: 'Vitrine client', icon: MonitorPlay, Component: lazy(() => import('./clients/Vitrine')) },
      { path: '/qr-codes', label: 'QR Codes', icon: QrCode, Component: lazy(() => import('./clients/QrCodes')) },
    ],
  },
  {
    group: 'Vente',
    items: [
      { path: '/catalogue', label: 'Catalogue', icon: BookOpen, Component: lazy(() => import('./vente/Catalogue')) },
      { path: '/caisse', label: 'Caisse POS', icon: Wallet, Component: lazy(() => import('./vente/Caisse')) },
      { path: '/home-rituals', label: 'Stock & Achats', icon: ShoppingBag, Component: lazy(() => import('./vente/HomeRituals')) },
      { path: '/factures', label: 'Factures & devis', icon: FileText, Component: lazy(() => import('./vente/Factures')) },
      { path: '/laboratoire', label: 'Le Laboratoire', icon: FlaskConical, Component: lazy(() => import('./vente/Laboratoire')) },
    ],
  },
  {
    group: 'Finances',
    items: [
      { path: '/synthese', label: 'Synthèse & résultat', icon: PieChart, Component: lazy(() => import('./finances/Synthese')) },
      { path: '/encaissements', label: 'Encaissements', icon: BadgeCheck, Component: lazy(() => import('./finances/Encaissements')) },
      /* LES CRÉANCES (26 août) — ce que la Maison attend, rangé par ÂGE. Le dû
         se lisait rituel par rituel dans le Carnet : on savait qu'on attendait
         de l'argent, jamais depuis quand ni de qui d'abord. */
      { path: '/creances', label: 'Les créances', icon: HandCoins, Component: lazy(() => import('./finances/Creances')) },
      /* LES CAISSES ONT LEUR ÉCRAN — 22 août 2026. Elles vivaient sous
         « Dépenses » par accident d'histoire : une caisse n'appartient pas
         aux dépenses, c'est le tiroir par lequel TOUT passe. */
      { path: '/caisses', label: 'Les caisses', icon: Wallet, Component: lazy(() => import('./finances/Caisses')) },
      { path: '/coffre', label: 'Coffre-fort', icon: Landmark, Component: lazy(() => import('./finances/Coffre')) },
      { path: '/comptes', label: 'Comptes & Avoirs', icon: HandCoins, Component: lazy(() => import('./finances/Comptes')) },
      /* LES PRÊTS ONT LEUR ÉCRAN — 23 août 2026. Ils vivaient sous
         « Comptes & Avoirs » : un avoir est de l'argent que la Maison DOIT à
         une cliente, un prêt de l'argent qu'on lui doit, et l'emprunteur n'est
         pas forcément une cliente. Les mêler faisait lire le titre pour savoir
         de quel côté penchait la somme. */
      { path: '/prets', label: 'Les prêts', icon: PoigneeDeMain, Component: lazy(() => import('./finances/Prets')) },
      { path: '/juste-prix', label: 'Le Juste Prix', icon: Scale, Component: lazy(() => import('./finances/JustePrix')) },
      { path: '/depenses', label: 'Dépenses', icon: ReceiptText, Component: lazy(() => import('./finances/Depenses')) },
      { path: '/salon-foyer', label: 'Salon & Foyer', icon: PiggyBank, Component: lazy(() => import('./finances/SalonFoyer')) },
    ],
  },
  {
    group: 'Équipe & Croissance',
    items: [
      /* LE FIL — le registre interne. Il vit avec l'équipe parce que c'est
         d'elle qu'il parle, et il est hissé au Quotidien (Shell) parce qu'on
         l'ouvre tous les jours. */
      { path: '/fil', label: 'Le Fil', icon: MessageSquare, Component: lazy(() => import('./equipe/Fil')) },
      { path: '/tableau', label: 'Le Tableau', icon: SquareKanban, Component: lazy(() => import('./equipe/Tableau')) },
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
      /* LE COMPTOIR N'EST PLUS DANS LE MENU. Un écran qu'on ouvre trois fois
         par an n'a pas sa place entre Paramètres et Accès : il encombrait une
         barre déjà longue. Il reste joignable depuis Paramètres, là où l'on
         règle la preuve de présence — et le code du jour se lit désormais
         directement dans « Mon mois », sur le compte du gérant. */
      { path: '/comptoir', label: 'Comptoir · code du jour', icon: KeyRound, horsMenu: true, Component: lazy(() => import('../routes/equipe/Comptoir')) },
      { path: '/acces', label: 'Accès & personnel', icon: ShieldCheck, Component: lazy(() => import('./systeme/Acces')) },
      { path: '/journal', label: 'Journal des gestes', icon: ScrollText, Component: lazy(() => import('./systeme/Journal')) },
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
/* LE FIL ET LE TABLEAU sont à TOUT le personnel — c'est leur raison d'être :
   « parfois c'est Gérard qui compte, pas moi ; il n'a pas accès aux fiches,
   mais ils ont accès à leurs fils » (18 août). Ce que chacun y VOIT est réglé
   dedans (`messageVisible`, `demandesDuTableau`, `sansPrix`) — la porte peut
   donc être ouverte : elle ne donne que sur ce qui regarde la personne. */
/* ── CE QUI EST OUVERT D'OFFICE, ET CE QUI SE FERME — 31 août 2026 ──
   « Je veux sélectionner si je veux Mon mois, Mon fil ou Mon tableau sur tous
   les comptes employés » (Yéman).

   Ces quatre écrans étaient ouverts à TOUT le personnel, sans recours : la
   matrice les excluait même de ses cases. Impossible de fermer Le Fil à une
   concierge qui n'a rien à y lire, ni Mon mois à quelqu'un dont la production
   ne le regarde pas.

   `/calendrier` RESTE OUVERT À TOUS : c'est le minimum d'un poste de travail,
   et un compte sans un seul écran ouvrirait une application vide, sans même
   pouvoir dire pourquoi.

   Les trois autres passent en OUVERTS PAR DÉFAUT, FERMABLES À LA MAIN. Le
   défaut compte : la matrice des comptes déjà autorisés ne porte aucune case
   pour eux, et les rendre fermés d'un coup les retirerait à tout le monde du
   jour au lendemain. L'ABSENCE vaut donc « ouvert », et seul un `false`
   explicitement posé ferme. */
export const ROUTES_MAITRE = ['/calendrier'];

/** Ouverts d'office, mais qu'un souverain peut refermer un par un. */
export const ROUTES_MAITRE_FERMABLES = ['/mon-mois', '/fil', '/tableau'];

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
/* ── SALON & FOYER EST L'AFFAIRE DU COUPLE ──────────────────────────────
   Prélèvements du foyer, dette des associés, caisses indépendantes : réservé
   au SOUVERAIN, comme la paie — un gérant qui tient le comptoir n'a pas à
   lire le budget maison de Brice et Yéman. Ceci n'est qu'une garde d'écran ;
   la vraie barrière est la RLS (`is_souverain()`, migration 0038). */
/* Le journal dit qui fait quoi : le rendre lisible de tous changerait le
   climat de la Maison — on ne travaille pas pareil quand chaque geste est
   public. Le personnel sait qu'il existe ; les souverains le consultent.
   La vraie barrière reste la RLS (migration 0070), celle-ci n'est que le menu. */
export const ROUTES_SOUVERAIN = ['/salon-foyer', '/journal'];

export const peutVoir = (
  role: string | undefined,
  path: string,
  acces: Record<string, boolean> = {},
): boolean => {
  if (ROUTES_SOUVERAIN.includes(path)) return role === 'souverain';
  if (role !== 'maitre') return true;
  if (ROUTES_MAITRE.includes(path)) return true;
  /* OUVERT SAUF REFUS EXPLICITE. `undefined` vaut oui — sans quoi tous les
     comptes déjà autorisés perdraient ces écrans le jour de la mise en ligne. */
  if (ROUTES_MAITRE_FERMABLES.includes(path)) return acces[path] !== false;
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
