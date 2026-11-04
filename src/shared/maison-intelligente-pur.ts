/* LA MAISON INTELLIGENTE, LE SOCLE — 2 novembre 2026. Maquette
   CrtJrZzF8E6K39dbPeHwwt (public/maquette-la-maison-intelligente.html), v4 :
   quatre choix tranchés au sélecteur, puis Perle (ex-Gérard), Cristal (le
   secrétariat), Grenat chez Yéman et Jade chez Brice.

   Dix professionnels, un par département, chacun avec un nom de pierre et un
   porteur (la personne qui reçoit ses cartes et répond de lui). Ils ne se
   parlent jamais entre eux hors du Trône : un relais, une carte, un bilan.

   Ce module est PUR (ni Supabase, ni DOM) : il est partagé par l'écran « Les
   assistants », la fonction `assistants-maison`, la fonction
   `conseil-du-matin` (Saphir) et leurs bancs. La table `assistants` tient
   l'état vivant (passages, jeton, mode « Je suis loin ») ; ce registre tient
   qui ils sont. */

/* ── Les porteurs ─────────────────────────────────────────────────────── */

export const PORTEURS = {
  yeman: { prenom: 'Yéman', teamId: 'st-5qduae5jef' },
  brice: { prenom: 'Brice', teamId: 'st-d4t24p6inh' },
} as const;
export type Porteur = keyof typeof PORTEURS;

/* ── Le registre des dix ─────────────────────────────────────────────── */

/** Où il tourne : une session de Claude Code sur un ordinateur (Opale, Onyx,
    Cristal), une fonction serveur du Trône (Saphir, Perle, Grenat, Jade,
    Topaze), ou la machine de la Maison avec Chrome (Ambre, Jaspe). */
export type OuIlTourne = 'session' | 'fonction' | 'machine';

/** Où il en est, au registre. L'état vivant (éveillé, endormi, empêché) ne
    vaut que pour ceux qui passent au Trône ; les autres disent ce statut. */
export type StatutDuProfessionnel = 'en-ligne' | 'en-installation' | 'maquette' | 'a-construire' | 'a-part';

export type Professionnel = {
  id: string;
  nom: string;
  /** Ce qu'il tient, en trois mots : « le conseil », « les clientes »… */
  tient: string;
  /** Le département de la barre du Trône (clefs dept-* figées). */
  departements: readonly string[];
  departementDit: string;
  porteurs: readonly Porteur[];
  tourne: OuIlTourne;
  ouDit: string;
  statut: StatutDuProfessionnel;
  /** Ce qu'il fait chaque jour, une phrase. */
  chaqueJour: string;
  /** Ce qu'il fait seul, ce qui lui demande une carte. */
  seul: string;
  enCarte: string;
  /** La quinzaine où il naît ou se termine (frise du plan). */
  quinzaine: string;
  /** Hors du Trône : il n'y laisse ni relais, ni carte, ni bilan (Cristal). */
  horsDuTrone?: boolean;
};

export const PROFESSIONNELS: readonly Professionnel[] = [
  {
    id: 'opale', nom: 'Opale', tient: 'l\'assistante de Yéman', departements: ['dept-direction'], departementDit: 'Direction',
    porteurs: ['yeman'], tourne: 'session', ouDit: 'l\'ordinateur de Yéman, Chrome', statut: 'en-ligne',
    chaqueJour: 'Lit le WhatsApp de Yéman, propose ses réponses, pose ses rendez-vous et ses dépenses depuis son fil.',
    seul: 'Lire, classer, un pouce sur un « Ok ».', enCarte: 'Chaque réponse, rendez-vous, dépense.', quinzaine: 'en ligne',
  },
  {
    id: 'onyx', nom: 'Onyx', tient: 'l\'assistant de Brice', departements: ['dept-direction'], departementDit: 'Direction',
    porteurs: ['brice'], tourne: 'session', ouDit: 'le Mac de Brice, VS Code', statut: 'en-installation',
    chaqueJour: 'La même chose pour Brice, dans sa voix.',
    seul: 'Lire, classer, un pouce sur un « Ok ».', enCarte: 'Chaque réponse, rendez-vous, dépense.', quinzaine: 'en installation',
  },
  {
    id: 'saphir', nom: 'Saphir', tient: 'le conseil', departements: ['dept-direction'], departementDit: 'Direction',
    porteurs: ['yeman', 'brice'], tourne: 'fonction', ouDit: 'une fonction du Trône, à 7 h', statut: 'en-ligne',
    chaqueJour: 'À 7 h, lit les bilans de tous et écrit le Conseil du matin : une page sur le téléphone.',
    seul: 'Lire, résumer, classer, rappeler.', enCarte: 'Une priorité qui change, un budget qui déborde.', quinzaine: 'semaines 1 et 2, puis à chaque quinzaine',
  },
  {
    id: 'perle', nom: 'Perle', tient: 'les clientes', departements: ['dept-clientele'], departementDit: 'Clientèle',
    porteurs: ['yeman'], tourne: 'fonction', ouDit: 'les fonctions du WhatsApp de la Maison', statut: 'en-ligne',
    chaqueJour: 'Le WhatsApp de la Maison : réserve, répond, garde les rendez-vous, envies, anniversaires, relances, avis Google, briefing avant le fauteuil.',
    seul: 'Modèles approuvés, réponses de la réception, réservation sous verrou.', enCarte: 'Tout texte libre hors réception, toute remise, toute cliente endormie.',
    quinzaine: 'semaines 3 et 4 (lot 3)',
  },
  {
    id: 'ambre', nom: 'Ambre', tient: 'les réseaux', departements: ['dept-marketing'], departementDit: 'Marketing et Fidélité',
    porteurs: ['yeman'], tourne: 'machine', ouDit: 'la machine de la Maison, Chrome', statut: 'maquette',
    chaqueJour: 'Instagram, Facebook, TikTok, LinkedIn, le Journal du site, le référencement du site dans Google et les IA : plan du mardi, publications, réponses aux commentaires, bilan du lundi.',
    seul: 'Publier dans le plan validé, répondre aux commentaires.', enCarte: 'Le plan de la semaine, toute cliente ou enfant, tout argent.',
    quinzaine: 'semaines 3 et 4',
  },
  {
    id: 'grenat', nom: 'Grenat', tient: 'l\'argent', departements: ['dept-vente-caisse', 'dept-finances'], departementDit: 'Vente et Caisse, Finances',
    /* AVANCÉ LE 4 NOVEMBRE 2026 (maquette 9KCMgAb1…) : il naît avec la
       clôture de la journée, à 15 h et à 19 h (fonction `cloture-du-jour`). */
    porteurs: ['yeman'], tourne: 'fonction', ouDit: 'une fonction du Trône, à 15 h et à 19 h', statut: 'en-installation',
    chaqueJour: 'La clôture de la journée à 15 h et à 19 h : chaque rendez-vous à son état final, une facture au même prix et au même argent, le papier parti, les pièces payées effacées signalées, la caisse du jour par moyen et par tiroir.',
    seul: 'Envoyer le papier pas encore parti (par la salle), passer honoré un rendez-vous réglé en entier, relier une facture à son seul rendez-vous.', enCarte: 'Tout argent qui sort, tout écart, une absence, un prix, un effacement.',
    quinzaine: 'avancé au 4 novembre 2026',
  },
  {
    id: 'jade', nom: 'Jade', tient: 'le stock', departements: ['dept-atelier'], departementDit: 'Atelier',
    porteurs: ['brice'], tourne: 'fonction', ouDit: 'une fonction du Trône', statut: 'a-construire',
    chaqueJour: 'Le stock et le Laboratoire : réassort, bons prêts, achats par photos, fournisseurs à rappeler, inventaire du mois.',
    seul: 'Compter, préparer un bon, lire un achat.', enCarte: 'Envoyer un bon, créer un fournisseur, un écart d\'inventaire.',
    quinzaine: 'semaines 5 et 6',
  },
  {
    id: 'topaze', nom: 'Topaze', tient: 'l\'équipe', departements: ['dept-equipe', 'dept-academie'], departementDit: 'Équipe et Académie',
    porteurs: ['brice'], tourne: 'fonction', ouDit: 'une fonction du Trône', statut: 'a-construire',
    chaqueJour: 'Les fauteuils : jours creux et pleins, planning, pointage, congés, préparation de la paie, missions, Académie.',
    seul: 'Lire, préparer, rappeler.', enCarte: 'Un planning changé, une paie, une mission payée, une sanction.',
    quinzaine: 'semaines 7 et 8',
  },
  {
    id: 'jaspe', nom: 'Jaspe', tient: 'le gardien', departements: ['dept-systeme'], departementDit: 'Système',
    porteurs: ['yeman'], tourne: 'machine', ouDit: 'la machine de la Maison', statut: 'a-construire',
    chaqueJour: 'Bancs, sauvegardes de nuit, versions des fonctions, conflits de synchro, jetons et accès, publication, crédits.',
    seul: 'Vérifier, sauvegarder, publier ce qui est commité et vert.', enCarte: 'Un accès, un jeton, une clé, une panne.',
    quinzaine: 'semaines 7 et 8',
  },
  {
    id: 'cristal', nom: 'Cristal', tient: 'le secrétariat', departements: [], departementDit: 'à part',
    porteurs: ['yeman'], tourne: 'session', ouDit: 'l\'ordinateur de Yéman', statut: 'a-part',
    chaqueJour: 'Les papiers de famille, les factures d\'eau et d\'électricité, les démarches, les mails de services, les lettres de la Maison.',
    seul: 'Lire, ranger, préparer.', enCarte: 'Tout envoi, tout paiement.', quinzaine: 'en ligne, à part', horsDuTrone: true,
  },
];

export const ID_DES_PROFESSIONNELS = PROFESSIONNELS.map((p) => p.id);

export const professionnel = (id: string | null | undefined): Professionnel | null =>
  PROFESSIONNELS.find((p) => p.id === id) ?? null;

/** Les professionnels qu'un porteur reçoit en cartes (Saphir : les deux). */
export const professionnelsDe = (porteur: Porteur): Professionnel[] =>
  PROFESSIONNELS.filter((p) => p.porteurs.includes(porteur));

/** Le porteur d'un compte, par son équipe (team id). */
export const porteurDeLEquipe = (teamId: string | null | undefined): Porteur | null =>
  (Object.keys(PORTEURS) as Porteur[]).find((k) => PORTEURS[k].teamId === teamId) ?? null;

export const STATUT_DIT: Record<StatutDuProfessionnel, string> = {
  'en-ligne': 'en ligne', 'en-installation': 'en installation', maquette: 'maquette validée', 'a-construire': 'à construire', 'a-part': 'à part, hors du Trône',
};

/** Ceux qui passent au Trône par la ligne de commande et un jeton : leur état
    se lit (éveillé, endormi, empêché). Les autres disent leur statut. */
export const passeAuTrone = (p: Pick<Professionnel, 'tourne' | 'horsDuTrone'>): boolean => p.tourne === 'session' && !p.horsDuTrone;

/* ── Les trois niveaux, les mêmes pour tous ───────────────────────────── */

export const NIVEAUX = {
  seul: [
    'Lire, compter, classer, rapprocher, préparer.',
    'Publier ce qui est dans un plan que vous avez validé.',
    'Répondre dans un modèle approuvé, ou dans le cadre de la réception.',
    'Rappeler, relancer par modèle, déposer un relais.',
    'Sauvegarder, vérifier, publier ce qui est commité et vert.',
  ],
  enCarte: [
    'Tout argent qui sort : une dépense, un paiement, une remise, une publicité.',
    'Toute cliente ou enfant nommé en public, toute photo.',
    'Tout message hors modèle, tout nouveau contact, tout plan de la semaine.',
    'Un planning, une paie, une mission, un accès, un jeton.',
    'Ce qu\'il ne sait pas.',
  ],
  jamais: [
    'Supprimer : il archive.',
    'Payer : il prépare, vous payez.',
    'Parler à un autre professionnel hors du Trône.',
    'Faire sortir un texte privé de l\'ordinateur où il est lu.',
    'Lire la famille, les proches, ou le secrétariat.',
    'Se faire passer pour une personne à une question franche.',
  ],
} as const;

/* ── Le livre des crédits ─────────────────────────────────────────────── */

/** L'enveloppe d'API comprise dans l'abonnement, par mois (credits-api-claude). */
export const ENVELOPPE_USD = 200;

/** Le plafond de chacun, en dollars par mois, dans l'enveloppe. Opale et
    Onyx tournent dans l'abonnement Claude de leur porteur (Claude Code), pas
    sur la clé d'API : zéro. Cristal aussi, mais les lettres de la Maison
    écrites au Trône (chantier « lettre ») lui reviennent : cinq dollars. La
    réserve est ce qui reste des 200 $ ; elle couvre ce que personne ne porte
    encore (la dictée, les mois sans détail). Réglable au Trône
    (`mnd_settings.livreDesCredits.plafonds`). */
export const PLAFONDS_PAR_DEFAUT: Readonly<Record<string, number>> = {
  opale: 0, onyx: 0, cristal: 5,
  saphir: 15, perle: 60, ambre: 25, grenat: 15, jade: 10, topaze: 10, jaspe: 5,
};
export const RESERVE = 'reserve';
export const ALERTE_PAR_DEFAUT = 0.8;

export type ReglagesDuLivre = { plafonds?: Record<string, number>; alerteA?: number };

/** Les plafonds lus : un plafond hors de 0 à 200 $ (ou qui n'est pas un
    nombre) reprend celui par défaut ; la réserve est ce qui reste de
    l'enveloppe, jamais négative. `depasse` : ce que la somme des plafonds
    réglés passe au-dessus des 200 $ (l'écran le dit, la réserve vaut 0). */
export const plafondsComplets = (r?: ReglagesDuLivre | null): { plafonds: Record<string, number>; alerteA: number; somme: number; depasse: number } => {
  const plafonds: Record<string, number> = {};
  for (const p of PROFESSIONNELS) {
    const v = r?.plafonds?.[p.id];
    plafonds[p.id] = typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= ENVELOPPE_USD ? Math.round(v * 100) / 100 : PLAFONDS_PAR_DEFAUT[p.id] ?? 0;
  }
  const somme = Math.round(Object.values(plafonds).reduce((a, b) => a + b, 0) * 100) / 100;
  plafonds[RESERVE] = Math.max(0, Math.round((ENVELOPPE_USD - somme) * 100) / 100);
  const a = r?.alerteA;
  return {
    plafonds, alerteA: typeof a === 'number' && a >= 0.5 && a <= 1 ? a : ALERTE_PAR_DEFAUT,
    somme, depasse: Math.max(0, Math.round((somme - ENVELOPPE_USD) * 100) / 100),
  };
};

/** Les chantiers de `ia-maison` (compteur des huit, détail `parChantier`),
    rendus à leur professionnel. Un chantier ajouté plus tard sans ligne ici
    tombe dans la réserve : le banc le signale. */
export const CHANTIER_VERS_PROFESSIONNEL: Readonly<Record<string, string>> = {
  capture: 'grenat', recu: 'grenat',
  cahier: 'perle', 'reponse-wa': 'perle', avis: 'perle', diagnostic: 'perle', 'fiche-du-jour': 'perle',
  lettre: 'cristal',
  prevision: 'saphir', question: 'saphir', processus: 'saphir',
  achat: 'jade',
};

/** Les compteurs des fonctions qui appellent Claude, dans `documents` (tous
    de la forme { "AAAA-MM": { usd, appels, … } }). Relevé du 2 novembre
    2026 : ia-maison (détail par chantier), la réception et les variantes du
    WhatsApp de la Maison, le tri des messages, le diagnostic photo (éteint),
    le Centre de commande, la dictée. `discussion`, `bilan-redige` et
    `suggest-client` n'ont pas de compteur : le livre ne peut pas les voir. */
export const COMPTEURS_DU_LIVRE = [
  { cle: 'mnd_ia_compteur_huit', parChantier: true, professionnel: RESERVE, dit: 'ia-maison' },
  { cle: 'mnd_assistant_wa_compte', parChantier: false, professionnel: 'perle', dit: 'réception WhatsApp' },
  { cle: 'mnd_variantes_wa_compte', parChantier: false, professionnel: 'perle', dit: 'variantes WhatsApp' },
  { cle: 'mnd_tri_compte', parChantier: false, professionnel: 'perle', dit: 'tri des messages' },
  { cle: 'mnd_ia_compteur_diagnostic', parChantier: false, professionnel: 'perle', dit: 'diagnostic photo' },
  { cle: 'mnd_ia_compteur', parChantier: false, professionnel: 'saphir', dit: 'Centre de commande' },
  { cle: 'mnd_dictee_compte', parChantier: false, professionnel: RESERVE, dit: 'la dictée' },
] as const;
export const CLES_DES_COMPTEURS = COMPTEURS_DU_LIVRE.map((c) => c.cle);

type LigneDuMois = { usd?: number; appels?: number };
type DocumentDeCompteur = Record<string, unknown> & { parChantier?: Record<string, Record<string, LigneDuMois>> };

export type AlerteDeCredit = 'ok' | 'proche' | 'depasse';

export type LigneDuLivre = { id: string; nom: string; usd: number; appels: number; plafond: number; part: number | null; alerte: AlerteDeCredit };

export type LivreDuMois = {
  mois: string;
  lignes: LigneDuLivre[];
  totalUsd: number;
  enveloppeUsd: number;
  partDeLEnveloppe: number;
  alerte: AlerteDeCredit;
  /** Les chantiers vus au compteur sans professionnel (le banc les refuse). */
  chantiersSansProfessionnel: string[];
};

const usdDe = (l: unknown): number => {
  const v = (l as LigneDuMois | null)?.usd;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
};
const appelsDe = (l: unknown): number => {
  const v = (l as LigneDuMois | null)?.appels;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
};
const arrondi = (v: number) => Math.round(v * 10_000) / 10_000;

export function alerteDe(usd: number, plafond: number, alerteA: number): AlerteDeCredit {
  if (plafond <= 0) return usd > 0 ? 'depasse' : 'ok';
  if (usd >= plafond) return 'depasse';
  if (usd >= plafond * alerteA) return 'proche';
  return 'ok';
}

/** Le livre d'un mois (« 2026-11 ») : chaque compteur rendu à son
    professionnel. Le compteur des huit rend chaque chantier à son
    professionnel ; ce qu'il a compté sans détail va à la réserve. */
export function livreDuMois(documents: Readonly<Record<string, unknown>>, mois: string, reglages?: ReglagesDuLivre | null): LivreDuMois {
  const { plafonds, alerteA } = plafondsComplets(reglages);
  const usd: Record<string, number> = {};
  const appels: Record<string, number> = {};
  const ajoute = (id: string, u: number, a: number) => { usd[id] = (usd[id] ?? 0) + u; appels[id] = (appels[id] ?? 0) + a; };
  const sans = new Set<string>();
  for (const c of COMPTEURS_DU_LIVRE) {
    const doc = (documents[c.cle] ?? null) as DocumentDeCompteur | null;
    if (!doc || typeof doc !== 'object') continue;
    const ligne = doc[mois];
    if (!c.parChantier) { ajoute(c.professionnel, usdDe(ligne), appelsDe(ligne)); continue; }
    const detail = doc.parChantier?.[mois] ?? {};
    let usdDetaille = 0;
    let appelsDetailles = 0;
    for (const [chantier, l] of Object.entries(detail)) {
      const id = CHANTIER_VERS_PROFESSIONNEL[chantier];
      if (!id) sans.add(chantier);
      ajoute(id ?? RESERVE, usdDe(l), appelsDe(l));
      usdDetaille += usdDe(l);
      appelsDetailles += appelsDe(l);
    }
    ajoute(RESERVE, Math.max(0, usdDe(ligne) - usdDetaille), Math.max(0, appelsDe(ligne) - appelsDetailles));
  }
  const lignes: LigneDuLivre[] = [...PROFESSIONNELS.map((p) => ({ id: p.id, nom: p.nom })), { id: RESERVE, nom: 'La réserve' }].map(({ id, nom }) => {
    const u = arrondi(usd[id] ?? 0);
    const plafond = plafonds[id] ?? 0;
    return { id, nom, usd: u, appels: appels[id] ?? 0, plafond, part: plafond > 0 ? Math.round((u / plafond) * 1000) / 1000 : null, alerte: alerteDe(u, plafond, alerteA) };
  });
  const totalUsd = arrondi(lignes.reduce((a, l) => a + l.usd, 0));
  const partDeLEnveloppe = Math.round((totalUsd / ENVELOPPE_USD) * 1000) / 1000;
  return {
    mois, lignes, totalUsd, enveloppeUsd: ENVELOPPE_USD, partDeLEnveloppe,
    alerte: alerteDe(totalUsd, ENVELOPPE_USD, alerteA), chantiersSansProfessionnel: [...sans].sort(),
  };
}

/** Le mois d'un instant, à Cotonou (UTC+1) : la clé des compteurs. */
export const moisDeCotonou = (ms: number): string => new Date(ms + 60 * 60_000).toISOString().slice(0, 7);

export const dollarsDits = (usd: number): string =>
  `${usd < 10 ? usd.toFixed(2).replace('.', ',') : String(Math.round(usd))} $`;
