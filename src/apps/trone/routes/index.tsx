import { lazy, type LazyExoticComponent, type ComponentType } from 'react';
import { Activity, BadgeCheck, BarChart3, BookOpen, CalendarDays, ClipboardList, Crown, Drama, FileSignature, FileText, FlaskConical, GraduationCap, Hammer, HandCoins, Handshake, Handshake as PoigneeDeMain, Inbox, KeyRound, Landmark, LayoutDashboard, Lightbulb, LineChart, ListChecks, MapPin, Megaphone, MessageSquare, MessagesSquare, MonitorPlay, NotebookPen, Palette, PhoneIncoming, PieChart, PiggyBank, QrCode, ReceiptText, Repeat, Scale, ScrollText, Settings, ShieldCheck, ShoppingBag, SquareKanban, Store, Users, UsersRound, Wallet, type LucideIcon } from 'lucide-react';

/* Registre des routes du Trône, groupées par DÉPARTEMENT.
   Le module d'un écran (routes/<dossier>/) dit d'où il vient, pas où il se range :
   les dossiers n'ont pas bougé quand la barre a changé. */

export type TroneRoute = {
  path: string;
  /** Joignable, mais absent de la barre latérale. */
  horsMenu?: boolean;
  label: string;
  icon: LucideIcon;
  Component: LazyExoticComponent<ComponentType>;
};

export type TroneGroup = { group: string; items: TroneRoute[] };

/* ── LA BARRE PAR DÉPARTEMENTS — 22 septembre 2026 ─────────────────────
   « Le menu mélange fréquence d'usage, fonction et type d'objet, et il
   déborde » (Yéman). Chaque rubrique devient un DÉPARTEMENT de la Maison, et
   chaque département un rôle qu'on donne aux personnes qui y travaillent. Le
   Quotidien reste à part : c'est le poste de travail de chacun, filtré selon
   ce qu'on lui a ouvert.

   LA RÈGLE DE PLACEMENT : « Vente & Caisse » couvre l'acte de vendre et
   d'encaisser ; « Finances » couvre ce qui arrive après, trésorerie, créances,
   dettes, charges. Les écrans sont placés d'après ce qu'ils FONT, lu dans
   leur code, pas d'après leur ancien dossier : les chemins et les modules ne
   bougent pas, seule la barre les range autrement. */
export const NAV: TroneGroup[] = [
  {
    /* LE POSTE DE TRAVAIL. Les quatre écrans ouverts d'office à tout le
       personnel (voir ROUTES_MAITRE_FERMABLES) et le tableau de bord. Le Fil
       et le Tableau y sont ensemble : le Tableau n'a pas de table à lui, une
       carte EST une demande du Fil, c'est le même registre vu autrement. */
    group: 'Le Quotidien',
    items: [
      { path: '/', label: 'Tableau de bord', icon: LayoutDashboard, Component: lazy(() => import('./pilotage/Dashboard')) },
      { path: '/calendrier', label: 'Calendrier', icon: CalendarDays, Component: lazy(() => import('./clients/Calendrier')) },
      { path: '/fil', label: 'Le Fil', icon: MessageSquare, Component: lazy(() => import('./equipe/Fil')) },
      { path: '/tableau', label: 'Le Tableau', icon: SquareKanban, Component: lazy(() => import('./equipe/Tableau')) },
      { path: '/mon-mois', label: 'Mon mois', icon: BadgeCheck, Component: lazy(() => import('./equipe/MonMois')) },
    ],
  },
  {
    /* CE QUI SE LIT POUR DÉCIDER. Le Juste Prix est une analyse de prix, pas
       une écriture ; À faire dit où mettre son temps, en nombres et en
       boutons : c'est la direction qui le lit. */
    group: 'Direction',
    items: [
      { path: '/bilan-mensuel', label: 'Bilan mensuel', icon: BarChart3, Component: lazy(() => import('./pilotage/BilanMensuel')) },
      { path: '/synthese', label: 'Synthèse & résultat', icon: PieChart, Component: lazy(() => import('./finances/Synthese')) },
      { path: '/analytics', label: 'Analytics', icon: LineChart, Component: lazy(() => import('./pilotage/Analytics')) },
      /* LA CADENCE (16 août) — la salle des prédictions. Le juge existait déjà
         (`shared/cadence.ts`) mais ne parlait qu'à l'oreille d'UNE fiche ;
         personne ne voyait la charge qui vient, ni qui a glissé. */
      { path: '/cadence', label: 'La Cadence', icon: Activity, Component: lazy(() => import('./pilotage/Predictions')) },
      /* À FAIRE (6 septembre 2026) — le Trône sait déjà presque tout faire ;
         ce qui manque, c'est de savoir ce qui manque. La page dit où mettre
         son temps, en nombres et en boutons, jamais en phrases. */
      { path: '/a-faire', label: 'À faire', icon: ListChecks, Component: lazy(() => import('./pilotage/AFaire')) },
      { path: '/recommandations', label: 'Recommandations IA', icon: Lightbulb, Component: lazy(() => import('./equipe/Recommandations')) },
      { path: '/juste-prix', label: 'Le Juste Prix', icon: Scale, Component: lazy(() => import('./finances/JustePrix')) },
    ],
  },
  {
    /* CE QUI ARRIVE DU DEHORS, ET QUI APPELLE UNE RÉPONSE : appels,
       conversations, demandes. Le Carnet est le registre des rendez-vous et
       de leur règlement, « ce qu'on vient chercher au comptoir » : il vit
       avec la clientèle, pas avec la caisse. */
    group: 'Clientèle',
    items: [
      { path: '/customers', label: 'Clientes', icon: Users, Component: lazy(() => import('./clients/Customers')) },
      { path: '/carnet', label: 'Le Carnet', icon: NotebookPen, Component: lazy(() => import('./clients/Carnet')) },
      { path: '/appels', label: 'Les Appels', icon: PhoneIncoming, Component: lazy(() => import('./clients/Appels')) },
      { path: '/conversations', label: 'Conversations', icon: MessagesSquare, Component: lazy(() => import('./clients/Conversations')) },
      { path: '/demandes', label: 'Les demandes', icon: Inbox, Component: lazy(() => import('./clients/Demandes')) },
      { path: '/consultations', label: 'Consultations', icon: ClipboardList, Component: lazy(() => import('./clients/Consultations')) },
    ],
  },
  {
    /* CE QUE LA MAISON FABRIQUE ET TIENT EN RÉSERVE. Le Laboratoire lie ses
       ingrédients aux fiches d'inventaire et FABRIQUER consomme le stock :
       c'est de la production, pas de la vente, même si la préparation se
       facture ensuite. Les Fournisseurs sont l'autre lecture des Dépenses,
       rangées par maison : placés ici avec les achats, à la demande de la
       direction, alors que la règle de placement les mettrait aux Finances. */
    group: 'Atelier',
    items: [
      { path: '/catalogue', label: 'Catalogue', icon: BookOpen, Component: lazy(() => import('./vente/Catalogue')) },
      { path: '/laboratoire', label: 'Le Laboratoire', icon: FlaskConical, Component: lazy(() => import('./vente/Laboratoire')) },
      { path: '/home-rituals', label: 'Stock & Achats', icon: ShoppingBag, Component: lazy(() => import('./vente/HomeRituals')) },
      { path: '/fournisseurs', label: 'Fournisseurs', icon: Store, Component: lazy(() => import('./finances/Fournisseurs')) },
    ],
  },
  {
    /* L'ACTE DE VENDRE ET D'ENCAISSER. Les Comptes & Avoirs s'y consomment
       au moment de régler ; les Abonnements se vendent. */
    group: 'Vente & Caisse',
    items: [
      { path: '/caisse', label: 'Caisse POS', icon: Wallet, Component: lazy(() => import('./vente/Caisse')) },
      { path: '/factures', label: 'Factures & devis', icon: FileText, Component: lazy(() => import('./vente/Factures')) },
      { path: '/encaissements', label: 'Encaissements', icon: BadgeCheck, Component: lazy(() => import('./finances/Encaissements')) },
      { path: '/comptes', label: 'Comptes & Avoirs', icon: HandCoins, Component: lazy(() => import('./finances/Comptes')) },
      { path: '/abonnements', label: 'Abonnements', icon: Repeat, Component: lazy(() => import('./equipe/Abonnements')) },
    ],
  },
  {
    /* CE QUI ARRIVE APRÈS LA VENTE : trésorerie, créances, dettes, charges.
       Les Engagements y descendent de « Vente » : c'est ce que la Maison
       COMMANDE à un prestataire, devis reçus, retenue, avances versées, une
       dette de la Maison, pas une vente. Salon & Foyer reste au souverain
       seul, quel que soit le département (ROUTES_SOUVERAIN). */
    group: 'Finances',
    items: [
      /* LES CAISSES ONT LEUR ÉCRAN — 22 août 2026. Elles vivaient sous
         « Dépenses » par accident d'histoire : une caisse n'appartient pas
         aux dépenses, c'est le tiroir par lequel TOUT passe. */
      { path: '/caisses', label: 'Les caisses', icon: Wallet, Component: lazy(() => import('./finances/Caisses')) },
      { path: '/coffre', label: 'Coffre-fort', icon: Landmark, Component: lazy(() => import('./finances/Coffre')) },
      /* LES CRÉANCES (26 août) — ce que la Maison attend, rangé par ÂGE. Le dû
         se lisait rituel par rituel dans le Carnet : on savait qu'on attendait
         de l'argent, jamais depuis quand ni de qui d'abord. */
      { path: '/creances', label: 'Les créances', icon: HandCoins, Component: lazy(() => import('./finances/Creances')) },
      /* LES PRÊTS ONT LEUR ÉCRAN — 23 août 2026. Ils vivaient sous
         « Comptes & Avoirs » : un avoir est de l'argent que la Maison DOIT à
         une cliente, un prêt de l'argent qu'on lui doit, et l'emprunteur n'est
         pas forcément une cliente. Les mêler faisait lire le titre pour savoir
         de quel côté penchait la somme. */
      { path: '/prets', label: 'Les prêts', icon: PoigneeDeMain, Component: lazy(() => import('./finances/Prets')) },
      /* Ce que la Maison commande à un prestataire — 15 septembre 2026. */
      { path: '/engagements', label: 'Les engagements', icon: Hammer, Component: lazy(() => import('./vente/Engagements')) },
      { path: '/depenses', label: 'Dépenses', icon: ReceiptText, Component: lazy(() => import('./finances/Depenses')) },
      { path: '/salon-foyer', label: 'Salon & Foyer', icon: PiggyBank, Component: lazy(() => import('./finances/SalonFoyer')) },
    ],
  },
  {
    group: 'Marketing & Fidélité',
    items: [
      { path: '/marketing', label: 'Marketing', icon: Megaphone, Component: lazy(() => import('./equipe/Marketing')) },
      { path: '/cercle', label: 'Cercle MND', icon: Crown, Component: lazy(() => import('./equipe/Cercle')) },
      { path: '/personas', label: 'Personas', icon: Drama, Component: lazy(() => import('./clients/Personas')) },
      { path: '/vitrine', label: 'Vitrine client', icon: MonitorPlay, Component: lazy(() => import('./clients/Vitrine')) },
      { path: '/qr-codes', label: 'QR Codes', icon: QrCode, Component: lazy(() => import('./clients/QrCodes')) },
    ],
  },
  {
    group: 'Équipe',
    items: [
      { path: '/personnel', label: 'Personnel & paie', icon: UsersRound, Component: lazy(() => import('./equipe/Personnel')) },
      { path: '/prestataires', label: 'Prestataires', icon: Handshake, Component: lazy(() => import('./equipe/Prestataires')) },
    ],
  },
  {
    group: 'Académie',
    items: [
      { path: '/academie', label: 'Académie', icon: GraduationCap, Component: lazy(() => import('./equipe/Academie')) },
    ],
  },
  {
    group: 'Système',
    items: [
      { path: '/parametres', label: 'Paramètres', icon: Settings, Component: lazy(() => import('./systeme/Parametres')) },
      /* LES TEXTES DE LA MAISON — hors menu, comme le Comptoir. On y va depuis
         Paramètres et depuis Personnel & paie, là où l'on tient les fiches et
         où l'on remet le règlement ; une barre de vingt-cinq entrées ne gagne
         rien à en porter une vingt-sixième qu'on ouvre trois fois par an.
         Le département reste « Système » : le groupe le donne, rien à déclarer. */
      { path: '/textes', label: 'Les textes de la Maison', icon: FileSignature, horsMenu: true, Component: lazy(() => import('./systeme/Textes')) },
      /* LE COMPTOIR N'EST PLUS DANS LE MENU. Un écran qu'on ouvre trois fois
         par an n'a pas sa place entre Paramètres et Accès : il encombrait une
         barre déjà longue. Il reste joignable depuis Paramètres, là où l'on
         règle la preuve de présence — et le code du jour se lit désormais
         directement dans « Mon mois », sur le compte du gérant. */
      { path: '/comptoir', label: 'Comptoir · code du jour', icon: KeyRound, horsMenu: true, Component: lazy(() => import('../routes/equipe/Comptoir')) },
      /* ACCÈS & RÔLES — renommé le 22 septembre 2026 : on y donne des
         départements à des personnes, c'est-à-dire des rôles. */
      { path: '/acces', label: 'Accès & rôles', icon: ShieldCheck, Component: lazy(() => import('./systeme/Acces')) },
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
/* LE CALENDRIER SE FERME AUSSI — 31 août 2026. « Kabirou est un employé qui
   n'est pas au fauteuil, il n'a pas besoin du calendrier » (Yéman). Il était
   gardé comme minimum d'un poste de travail ; mais un poste peut n'avoir rien
   à faire du carnet de rendez-vous, et laisser une porte ouverte « au cas où »
   n'est pas un minimum, c'est un oubli.

   PLUS AUCUN ÉCRAN N'EST IMPOSÉ. Un compte peut donc n'en avoir aucun — le
   Shell le dit alors en toutes lettres au lieu d'ouvrir une application vide
   (voir `premierEcranVisible`). */
export const ROUTES_MAITRE: string[] = [];

/** Ouverts d'office, mais qu'un souverain peut refermer un par un. */
export const ROUTES_MAITRE_FERMABLES = ['/mon-mois', '/calendrier', '/fil', '/tableau'];

/* ── DEUX CASQUETTES, UN SEUL COMPTE ────────────────────────────────────
   Gerard tient le secrétariat et le fauteuil. Lui donner deux comptes
   couperait la personne en deux : deux pointages, deux productions, deux
   parts de pourboire — et le partage le compterait deux fois.

   Son rôle reste donc `maitre`, et on lui OUVRE des départements en plus. La
   matrice existait dans le modèle depuis toujours (`staffAccessStore`) sans
   que rien ne la lise ; elle commande la barre depuis le 31 août.

   ── UN DÉPARTEMENT EST UN RÔLE — 22 septembre 2026 ──────────────────────
   Chaque groupe de la barre est un département, et chaque département une
   clef de la matrice : donner « Clientèle » à quelqu'un, c'est lui ouvrir les
   écrans de ce groupe. Une personne cumule autant de départements qu'il en
   faut. Le souverain voit tout, et reste seul sur la paie côté serveur : cette
   garde est en base (`is_souverain()`), pas ici, et rien ne la touche.

   TROIS SORTES DE CLEFS DANS LA MATRICE, chacune se reconnaît à sa forme :
     « /caisse »        un écran seul ;
     « dept-finances »  un département, donné depuis Accès & rôles ;
     « finances »       un ANCIEN domaine, tel qu'il a été coché avant ce jour.
   Les anciennes clefs restent lues et gardent EXACTEMENT leur ancienne
   portée : ni migration, ni élargissement. Reprendre « finances » pour le
   nouveau département aurait ouvert les Engagements à quiconque avait coché
   l'ancien domaine, sans que personne ne l'ait décidé. */
export const DEPARTEMENTS: { k: string; l: string }[] = [
  { k: 'dept-quotidien', l: 'Le Quotidien' },
  { k: 'dept-direction', l: 'Direction' },
  { k: 'dept-clientele', l: 'Clientèle' },
  { k: 'dept-atelier', l: 'Atelier' },
  { k: 'dept-vente-caisse', l: 'Vente & Caisse' },
  { k: 'dept-finances', l: 'Finances' },
  { k: 'dept-marketing', l: 'Marketing & Fidélité' },
  { k: 'dept-equipe', l: 'Équipe' },
  { k: 'dept-academie', l: 'Académie' },
  { k: 'dept-systeme', l: 'Système' },
];

/** La clef d'un département, d'après le libellé de son groupe dans la barre :
    la correspondance se lit, elle ne se maintient pas dans un second tableau. */
export const departementDuGroupe = (groupe: string): string | undefined =>
  DEPARTEMENTS.find((d) => d.l === groupe)?.k;

/** Le département d'un écran. Gardé sous son ancien nom : c'est ce que lit
    Accès & rôles, et le nom disait déjà la bonne chose. */
export const domaineDe = (path: string): string | undefined =>
  departementDuGroupe(NAV.find((g) => g.items.some((i) => i.path === path))?.group ?? '');

/* LES ANCIENS DOMAINES, TELS QU'ILS ÉTAIENT LE 21 SEPTEMBRE 2026. Une case
   cochée avant ce jour ouvre encore les mêmes écrans, et seulement ceux-là.
   Cette table ne se met pas à jour : c'est une photographie, pas une règle. */
export const ANCIENS_DOMAINES: Record<string, string[]> = {
  pilotage: ['/', '/bilan-mensuel', '/a-faire', '/analytics', '/cadence'],
  clients: ['/calendrier', '/appels', '/conversations', '/carnet', '/customers', '/consultations', '/demandes', '/personas', '/vitrine', '/qr-codes'],
  vente: ['/catalogue', '/caisse', '/home-rituals', '/factures', '/engagements', '/laboratoire'],
  finances: ['/synthese', '/encaissements', '/creances', '/caisses', '/coffre', '/comptes', '/prets', '/juste-prix', '/depenses', '/fournisseurs', '/salon-foyer'],
  equipe: ['/fil', '/tableau', '/mon-mois', '/personnel', '/prestataires', '/marketing', '/cercle', '/abonnements', '/recommandations', '/academie'],
  systeme: ['/parametres', '/textes', '/comptoir', '/acces', '/journal', '/branches', '/marque'],
};

/** L'ancien domaine d'un écran, celui d'avant les départements. */
export const ancienDomaineDe = (path: string): string | undefined =>
  Object.keys(ANCIENS_DOMAINES).find((k) => ANCIENS_DOMAINES[k].includes(path));

/** Un écran est-il ouvert par un département ou un ancien domaine coché ? */
const ouvertParSonGroupe = (path: string, acces: Record<string, boolean>): boolean => {
  const d = domaineDe(path);
  if (d && acces[d] === true) return true;
  const ancien = ancienDomaineDe(path);
  return !!ancien && acces[ancien] === true;
};

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
export const ROUTES_SOUVERAIN = ['/salon-foyer'];

/* Le journal dit qui fait quoi : le rendre lisible de tous changerait le
   climat de la Maison — on ne travaille pas pareil quand chaque geste est
   public. Le personnel sait qu'il existe ; la DIRECTION le consulte.
   S'OUVRE AU GÉRANT le 13 septembre 2026 (« souverain et gérant »), avec la
   trace signée par la base : sa vraie barrière est la RLS de 0092
   (`est_direction()`). L'ancien journal écrit par l'application, lui, reste
   lisible du souverain seul (0070). */
export const ROUTES_DIRECTION = ['/journal'];

export const peutVoir = (
  role: string | undefined,
  path: string,
  acces: Record<string, boolean> = {},
): boolean => {
  if (ROUTES_SOUVERAIN.includes(path)) return role === 'souverain';
  if (ROUTES_DIRECTION.includes(path)) return role === 'souverain' || role === 'gerant';
  if (role !== 'maitre') return true;
  if (ROUTES_MAITRE.includes(path)) return true;
  /* OUVERT SAUF REFUS EXPLICITE. `undefined` vaut oui — sans quoi tous les
     comptes déjà autorisés perdraient ces écrans le jour de la mise en ligne. */
  if (ROUTES_MAITRE_FERMABLES.includes(path)) return acces[path] !== false;
  if (acces[path] === true) return true;
  return ouvertParSonGroupe(path, acces);
};

/** LES MONTANTS SE TAISENT POUR UN MAÎTRE — sauf s'il tient aussi le comptoir.
    Un secrétaire qui encaisse a besoin des prix ; un praticien qui vient
    pointer, non. C'est le domaine ouvert qui tranche, pas le rôle. */
export const voitLesPrix = (role: string | undefined, acces: Record<string, boolean> = {}): boolean =>
  role !== 'maitre'
  || acces['dept-vente-caisse'] === true || acces['dept-finances'] === true
  || acces.vente === true || acces.finances === true
  /* Ouvrir la Caisse ou les Factures sans les montants n'aurait aucun sens :
     l'écran lui-même vaut autorisation de voir les prix. */
  || acces['/caisse'] === true || acces['/factures'] === true;

/** L'écran d'accueil d'un rôle — celui vers lequel on renvoie quand la route
    demandée ne lui est pas ouverte. Un maître qui tape une adresse de finances
    atterrit sur son mois, pas sur une page blanche. */
export const accueilDe = (role: string | undefined): string =>
  role === 'maitre' ? '/mon-mois' : '/';

/** LES GESTES QU'ON PEUT ENCORE TENDRE À QUELQU'UN — 31 août 2026.

    LE SHELL ET LA BARRE DOIVENT RÉPONDRE LA MÊME CHOSE : c'est lui qui réserve
    les 78 px du bas (`tr-shell--barre`), elle qui les remplit. Deux règles
    écrites séparément auraient fini par diverger, et une bande vide serait
    restée sous la dernière ligne des écrans. */
export const gestesRapides = (
  role: string | undefined,
  acces: Record<string, boolean>,
): { monMois: boolean; calendrier: boolean; caisse: boolean; aucun: boolean } => {
  const monMois = role === 'maitre' && peutVoir('maitre', '/mon-mois', acces);
  const calendrier = role === 'maitre' && peutVoir('maitre', '/calendrier', acces);
  const caisse = role === 'maitre' && peutVoir('maitre', '/caisse', acces);
  return { monMois, calendrier, caisse, aucun: !monMois && !calendrier && !caisse };
};

/** LE PREMIER ÉCRAN QU'IL PEUT VOIR, ou `null` s'il n'en a aucun.

    LE PIÈGE ÉTAIT UNE BOUCLE : le Shell renvoyait vers `accueilDe(role)`, soit
    `/mon-mois` pour un maître. Le jour où l'on ferme cet écran, la redirection
    l'y renvoie, la garde le refuse, elle l'y renvoie encore — l'application
    tourne sur elle-même et personne ne peut plus entrer. On choisit donc une
    destination QU'IL PEUT ATTEINDRE, ou aucune. */
export const premierEcranVisible = (
  role: string | undefined,
  acces: Record<string, boolean> = {},
): string | null => {
  const accueil = accueilDe(role);
  if (peutVoir(role, accueil, acces)) return accueil;
  for (const g of NAV) {
    for (const it of g.items) {
      if (!it.horsMenu && peutVoir(role, it.path, acces)) return it.path;
    }
  }
  return null;
};
