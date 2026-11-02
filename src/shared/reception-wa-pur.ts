import { AGENDA_NON_CONSULTE, consigneDeLaReponse, contextePourClaude, lectureDeLaReponse, paliersDeLocks, type ContexteDeLaReponse } from './ia-reponse-wa-pur';
import { heuresPourClaude } from './chat-du-site-pur';
import { prochaineOuvertureDite, type SuiteDeLaReception } from './automate-wa';
import type { ExceptionDHoraire, HeureDeLaSemaine } from './agenda-pur';
import { BOUTONS_DE_L_ACCORD, QUESTION_DE_L_ACCORD, doitDemanderLAccord, type FichePourLAccord } from './accord-whatsapp-pur';
import { estMineur } from './clients-pur';

export {
  CLE_DE_LA_RECEPTION, RECEPTION_LIVREE, SUITES_DU_PARCOURS, reglageDeLaReception, laReceptionSert, secoursDeLaReception,
} from './automate-wa';
export type { ModeDeLaReception, ReglageDeLaReception, SuiteDeLaReception, ReponseDeLaReception } from './automate-wa';

/* ══ LA RÉCEPTION WHATSAPP : L'ASSISTANT QUI RÉPOND · 27 octobre 2026 ══════
   « Est-ce que mon assistant répond aux messages WhatsApp de cette façon même
   quand je dors ? S. L. m'a écrit ce soir, toujours sans réponse. Je veux
   que mon assistant WhatsApp soit conçu comme cela » (Yéman, sur une vidéo
   de démonstration). Au sélecteur : en phrases avec Claude, à tout le monde
   jour et nuit, le rendez-vous posé confirmé. Maquette JeSZdwemTYVLfppqhUf3TF
   (v2, validée « Oui, construis ») : la voix du site, la consultation avant
   tout devis de création ou de réparation, le nombre de locks avant le prix
   de la carte, une liste à toucher pour chaque choix.

   L'AUTOMATE DE RÉSERVATION RESTE LE MÊME (shared/automate-wa) : boutons,
   listes, vraies places, pose sous verrou. La réception parle là où il se
   taisait (« ce n'est pas pour moi ») : une question, un prix, un merci, un
   mot qu'il ne reconnaît pas. Elle répond par Claude, avec LA MÊME VOIX et
   LES MÊMES RÈGLES que « Proposer une réponse » (ia-reponse-wa-pur, que la
   direction relit dans les Conversations), puis dit la suite :
     · rien        : la réponse suffit ;
     · reserver    : elle veut un rendez-vous ; la liste des prestations de
                     l'automate suit, et le parcours prend la main ;
     · creation, reparation : la consultation d'abord ; la même liste suit ;
     · calibre     : elle demande un prix qui dépend de ses locks ; la liste
                     des calibres de la grille tarifaire suit ;
     · equipe      : santé, plainte, argent, photo ou vocal, ce qu'elle ne
                     sait pas : une personne de la Maison prend le relais,
                     et l'équipe est prévenue ;
     · venir       : elle demande le chemin ou la localisation ; le plan
                     pour venir et la Maison sur Google Maps suivent, comme
                     après une confirmation (30 octobre 2026).
   JAMAIS UN SILENCE : sans Claude (clé absente, délai, réponse illisible ou
   fautive), un mot de secours part, et la main passe à l'équipe.

   CE MODULE EST PUR : la fonction `reception-wa` (scripts/serveur) le
   regroupe, et `verifie-la-reception-wa` l'éprouve seul. */

/* ── LA SUITE ──────────────────────────────────────────────────────────── */
const SUITES: readonly SuiteDeLaReception[] = ['rien', 'reserver', 'creation', 'reparation', 'calibre', 'equipe', 'venir'];

/* ── LA CONSIGNE ───────────────────────────────────────────────────────── */
/** Ce que la consigne partagée dit d'une PROPOSITION relue, et ce que la
    réception dit à la place : elle envoie elle-même. Chaque repère doit
    exister (le banc crie s'il change là-bas). */
export const REPERES_DE_LA_CONSIGNE: readonly [string, string][] = [
  ['Tu écris, au nom de la Maison MND, maison de soin et de création de locks à Cotonou, la réponse WhatsApp à une cliente.',
    'Tu es l’assistant de la Maison MND, maison de soin et de création de locks à Cotonou : tu réponds toi-même, sur WhatsApp, au nom de la Maison, à toute heure.'],
  ['Une personne de l’équipe la relira, la corrigera et décidera seule de l’envoyer : tu PROPOSES, tu n’envoies rien.',
    'Ton message part tel quel, sans relecture : chaque mot compte. Ce dont tu n’es pas sûr, tu le dis, et tu confies la suite à l’équipe.'],
  ['- Ne signe pas, n’ajoute ni devise ni longue formule finale : la personne qui envoie s’en charge.',
    '- Ne signe pas, n’ajoute ni devise ni longue formule finale.'],
  ['Réponds uniquement par l’objet demandé : { "reponse": "le texte du message" }.', ''],
];

export function consigneDeLaReception(): string {
  let c = consigneDeLaReponse();
  for (const [avant, apres] of REPERES_DE_LA_CONSIGNE) c = c.replace(avant, apres);
  return [
    c.trimEnd(),
    '',
    'Tu es un programme, et tu ne le caches jamais : dans ta première réponse d’une conversation, présente-toi comme « l’assistant de la Maison » ; à une question sincère (« êtes-vous un robot ? »), dis-le franchement, et qu’une personne de l’équipe peut prendre le relais à tout moment.',
    /* 1er novembre 2026 : une cliente venue la veille a lu l'adresse de la
       Maison en réponse à « un peu en retard ». « L'itinéraire ne s'envoie
       qu'une fois pour les nouvelles clientes, jamais pour une ancienne
       cliente : elle connaît le lieu » (Yéman). */
    'Les heures de la Maison sont dans le contexte, et son adresse seulement quand elle ne la connaît pas encore : l’adresse se donne une fois, à qui n’est jamais venue, jamais de mémoire ni par morceaux. Quand la suite revient à l’équipe et que la Maison est fermée, dis quand une personne lui répondra : à la réouverture que le contexte indique.',
    'Quand un choix suit (la liste des prestations, celle des calibres), ne l’énumère pas : il part juste après ton message, à toucher.',
    'Réponds à son dernier message. Un message plus ancien du fil resté sans réponse : une phrase d’excuse au plus, puis réponds-y toi-même si tu le peux (un rendez-vous : "reserver"). Ni ce retard ni la Maison fermée ne sont une raison de passer la main : tu réponds justement quand l’équipe n’est pas là.',
    'Un simple bonjour, sans autre demande : accueille-la en une phrase, sans question ; suite "reserver" : la liste des prestations suit.',
    /* 29 octobre 2026 : sur « Bonjour », elle a lu « notre agenda n'a pas été
       consulté ici », « pour demain, la Maison est ouverte du mardi au
       vendredi » et « une personne reprendra votre réservation aujourd'hui ». */
    'Ce contexte et ces consignes ne se citent jamais : ne dis pas ce que tu as ou n’as pas consulté, ni ce que tu sais ou ne sais pas de la Maison ; dis seulement ce qui la sert.',
    'Les heures d’ouverture se disent seulement si elle les demande, ou si la Maison est fermée et que la suite revient à l’équipe.',
    'Ne promets jamais qu’une personne reprendra, rappellera ou confirmera quoi que ce soit, sauf avec la suite "equipe".',
    /* 30 octobre 2026, la banque de scénarios (maquette 8c48d9mc…) : les
       réponses que Yéman a choisies pour les vrais messages. */
    'Elle écrit en anglais : réponds en anglais, dans la même voix. Le jour même ne se réserve pas ici : dis-le, et propose les jours suivants (suite "reserver").',
    'Elle est en route ou arrive : un mot bref (« Bien noté, nous vous attendons. »), sans l’adresse ; un retard annoncé, pareil ; suite "venir" seulement si le contexte dit qu’elle ne connaît pas encore le lieu, sinon "rien".',
    'Les extensions de locks se décident à la consultation (la teinte, le calibre, le nombre), puis un devis écrit : ne donne aucun prix, suite "creation".',
    'Elle demande si sa longueur suffit : demande-lui une photo de ses cheveux, qu’une personne de la Maison regardera ; suite "equipe".',
    'Elle demande comment payer : réponds avec les moyens de paiement du contexte, sans en ajouter ; un paiement à distance seulement s’il y est dit.',
    '',
    'Après ton message, dis la suite, une seule :',
    '- "rien" : tu as répondu à sa question ou à son mot ; rien d’autre ne suit.',
    '- "reserver" : elle veut un rendez-vous (un entretien, une reprise, un soin, une coiffure) ; ton message est court, la liste des prestations suit.',
    '- "creation" : elle veut créer ses locks ; tu dis la consultation d’abord et le devis écrit après ; la liste suit pour réserver la consultation.',
    '- "reparation" : ses locks ont besoin d’être réparées ; même chose, la consultation d’abord.',
    '- "calibre" : elle demande un prix qui dépend de ses locks et son nombre de locks n’est pas connu ; ton message le lui demande avec délicatesse, sans aucun montant ; la liste des calibres de la Maison suit.',
    '- "equipe" : sa santé ou une gêne, une plainte, un remboursement, un règlement, une photo ou un vocal, une demande qui ne concerne pas la Maison (une adresse pour sortir, un restaurant), ou ce que tu ne sais pas faire : ton message dit, avec égards, qu’une personne de la Maison prend le relais. Jamais pour un bonjour, un rendez-vous, un prix, les heures ou l’adresse : à ceux-là, tu réponds toi-même.',
    /* 30 octobre 2026 : à « Envoie-moi la localisation », elle a lu « je ne
       peux pas vous transmettre de localisation ». */
    '- "venir" : elle demande l’adresse, le chemin, la localisation ou un itinéraire ; ton message donne l’adresse en une phrase et dit que le plan pour venir suit ; le plan de la Maison et la Maison sur Google Maps partent juste après ton message. Ne dis jamais que tu ne peux pas envoyer la localisation, et ne promets aucune personne pour guider.',
    '',
    'Réponds uniquement par l’objet demandé : { "texte": "ton message", "suite": "rien" }.',
  ].join('\n');
}

export const SCHEMA_DE_LA_RECEPTION: Record<string, unknown> = {
  type: 'object',
  properties: {
    texte: { type: 'string', description: 'Le message WhatsApp, au nom de la Maison, sans émoji.' },
    suite: { type: 'string', enum: [...SUITES], description: 'Ce qui suit le message.' },
  },
  required: ['texte', 'suite'],
  additionalProperties: false,
};

/* ── LA MAISON, À L'INSTANT ────────────────────────────────────────────── */
/** Ce que la réception sait de la Maison, en plus du contexte partagé. */
export const ADRESSE_DE_LA_MAISON = 'Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, Cotonou';

export type ContexteDeLaReception = ContexteDeLaReponse & {
  semaine: readonly HeureDeLaSemaine[];
  exceptions: readonly ExceptionDHoraire[];
  maintenantMs: number;
  /** La Maison a-t-elle déjà écrit dans ce fil ? Sinon, l'assistant se présente. */
  premiereReponse: boolean;
  /** Les moyens de paiement de la Maison (`mnd_payment_methods`, Système ›
      Paramètres › Paiements), et le lien de paiement en ligne quand MND PAY
      est allumé (30 octobre 2026 : « Can I pay with a card ? »). */
  paiements?: readonly string[];
  paiementEnLigne?: boolean;
  /** ELLE CONNAÎT LE LIEU (1er novembre 2026) : déjà venue, ou l'adresse ou
      le plan déjà envoyés dans ce fil. L'adresse sort alors du contexte, et
      la consigne dit de ne pas la redonner. Voir `connaitLeLieuDe`. */
  connaitLeLieu?: boolean;
};

/** CE QUE LA RÉCEPTION LIT À LA PLACE DE « AGENDA : NON CONSULTÉ » : les
    vraies places, c'est la liste de l'automate qui les propose. */
export const AGENDA_DE_LA_RECEPTION = 'Les places libres : pour un rendez-vous, ta suite est "reserver", et la liste qui suit lui propose les vraies places. Ne promets aucune heure ni aucun jour, et ne parle pas de l’agenda.';

export function contexteDeLaReception(o: ContexteDeLaReception): string {
  const base = contextePourClaude(o).replace(AGENDA_NON_CONSULTE, AGENDA_DE_LA_RECEPTION);
  const heures = heuresPourClaude(o.semaine);
  /* La règle de l'automate : `null` quand la Maison est ouverte, sinon
     « demain dès 9 h », exceptions et fermetures comprises. */
  const reouverture = prochaineOuvertureDite(o.maintenantMs, o.semaine, o.exceptions);
  const lignes = [
    base,
    '',
    'LA MAISON :',
    o.connaitLeLieu
      ? '- Elle connaît déjà le lieu (elle est déjà venue, ou l’adresse lui a déjà été donnée) : ne redonne ni l’adresse ni le chemin, même en partie, et ne dis pas qu’un plan suit. Si elle redemande expressément le chemin, un mot bref sans l’adresse, suite "venir".'
      : `- Adresse : ${ADRESSE_DE_LA_MAISON}.`,
    heures.length ? `- Heures d’ouverture : ${heures.join(' ; ')}.` : '- Heures d’ouverture : non communiquées ; ne donne aucune heure.',
    reouverture === null
      ? '- En ce moment, la Maison est ouverte : une personne de l’équipe peut répondre dans la journée.'
      : `- En ce moment, la Maison est fermée, et tu réponds pour elle ; si la suite revient à l’équipe, une personne lui répondra ${reouverture}.`,
    ...((o.paiements ?? []).length > 0 ? [`- Moyens de paiement à la Maison : ${(o.paiements ?? []).join(', ')}.`] : []),
    ...(o.paiementEnLigne ? ['- Paiement à distance : la Maison envoie un lien de paiement en ligne (MND PAY), sur demande.'] : []),
    o.premiereReponse
      ? '- C’est ta première réponse dans cette conversation : présente-toi comme l’assistant de la Maison.'
      : '- La Maison a déjà répondu dans cette conversation : ne te présente pas de nouveau, ne salue pas une seconde fois.',
  ];
  return lignes.join('\n');
}

/* ── LA LECTURE DE CE QUE CLAUDE A ÉCRIT ───────────────────────────────── */
export type LaReception = { texte: string; suite: SuiteDeLaReception };

/** Les montants d'un texte (« 35 000 F », « 40000 FCFA »). */
export function montantsDe(t: string): number[] {
  return [...String(t ?? '').matchAll(/(\d{1,3}(?:[   .]\d{3})+|\d+)\s*(?:F\b|FCFA\b|francs?\b)/giu)]
    .map((m) => Number(m[1].replace(/[^\d]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** CE QUI PART, OU RIEN. Le texte passe par la même lecture que la
    proposition (vide, numéro, « salon » : rien ; tiret long, émoji : ôtés ;
    trop long : coupé). Puis la réception ajoute ses juges : la suite connue
    (sinon « rien »), aucun montant pour une création ou une réparation, et
    un montant ailleurs seulement s'il est l'un de ceux du catalogue. */
export function lectureDeLaReception(brut: unknown, montantsPermis: ReadonlySet<number>): LaReception | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as { texte?: unknown; suite?: unknown };
  const texte = lectureDeLaReponse({ reponse: b.texte });
  if (!texte) return null;
  const suite: SuiteDeLaReception = SUITES.includes(b.suite as SuiteDeLaReception) ? (b.suite as SuiteDeLaReception) : 'rien';
  const montants = montantsDe(texte);
  if ((suite === 'creation' || suite === 'reparation' || suite === 'calibre') && montants.length > 0) return null;
  if (montants.some((n) => !montantsPermis.has(n))) return null;
  return { texte, suite };
}

/* ── LE LIEU, UNE FOIS, À QUI NE LE CONNAÎT PAS (1er novembre 2026) ────────
   « L'itinéraire ne s'envoie qu'une fois pour les nouvelles clientes. Jamais
   pour une ancienne cliente. Elle connaît le lieu » (Yéman) : une cliente
   venue la veille a lu, en réponse à « je serai un peu en retard », l'adresse
   entière de la Maison, et le plan a suivi. Trois gardes : l'adresse sort du
   contexte de Claude quand elle connaît le lieu (`contexteDeLaReception`),
   la phrase qui la porterait quand même tombe (`reponseSelonLeLieu`), et
   l'automate ne renvoie le plan à une tête déjà venue que si elle demande
   le chemin (`lePlan`, shared/automate-wa). */
const MOTS_DE_L_ADRESSE = /ilot\s*130|maison\s*88|portail\s*marron|suru[\s-]*l[ée]r[ée]|maisonmnd\.com\/venir/iu;

/** Ce texte porte l'adresse de la Maison, le plan ou son lien. */
export const parleDeLAdresse = (texte: string): boolean => MOTS_DE_L_ADRESSE.test(String(texte ?? ''));

/** Elle connaît le lieu : une venue à la Maison, ou l'adresse (le plan, le
    lien) déjà partie de la Maison dans ce fil. */
export function connaitLeLieuDe(o: { derniereVenue?: unknown; fil: readonly { sens: 'entrant' | 'sortant'; texte: string }[] }): boolean {
  if (o.derniereVenue) return true;
  return o.fil.some((m) => m.sens === 'sortant' && parleDeLAdresse(m.texte));
}

/** Le mot bref quand la phrase ôtée était tout le message. */
export const MOT_SANS_ADRESSE = 'Bien noté, nous vous attendons.';

/** Le texte sans les phrases qui portent l'adresse ; vide s'il n'en reste rien. */
export function sansLAdresse(texte: string): string {
  const phrases = String(texte ?? '').match(/[^.!?\n]+[.!?]*[ \t]*|\n+/g) ?? [];
  return phrases.filter((p) => !parleDeLAdresse(p)).join('').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Ce qui part quand elle connaît le lieu : jamais l'adresse. La suite reste
    à l'automate, qui ne renvoie le plan que si elle demande le chemin. */
export function reponseSelonLeLieu(r: LaReception, connaitLeLieu: boolean): LaReception {
  if (!connaitLeLieu || !parleDeLAdresse(r.texte)) return r;
  return { texte: sansLAdresse(r.texte) || MOT_SANS_ADRESSE, suite: r.suite };
}

/* ── LA LISTE DES CALIBRES ─────────────────────────────────────────────── */
export type Calibre = { id: string; name?: string; maxLocks?: number | null };
export type LigneDeListe = { id: string; titre: string; description?: string };
export const CHOIX_DU_CALIBRE = 'calibre:';
export const CALIBRE_INCONNU = `${CHOIX_DU_CALIBRE}inconnu`;
/** WhatsApp : 10 lignes par liste, 24 signes par titre, 72 par description. */
const LIGNES_MAX = 10;

/** LES CALIBRES DE LA GRILLE TARIFAIRE (`mnd_model_bands`), du plus large au
    plus fin : leur nom en titre, leur nombre de locks en description, puis
    « Je ne sais pas ». */
export function listeDesCalibres(bandes: readonly Calibre[]): LigneDeListe[] {
  const paliers = paliersDeLocks(bandes);
  const nomDe = new Map(bandes.map((b) => [b.id, String(b.name ?? '').trim()]));
  const lignes = paliers.slice(0, LIGNES_MAX - 1).map((p) => {
    const nom = nomDe.get(p.id) || p.palier;
    return { id: `${CHOIX_DU_CALIBRE}${p.id}`, titre: nom.slice(0, 24), ...(nom !== p.palier ? { description: p.palier.slice(0, 72) } : {}) };
  });
  return [...lignes, { id: CALIBRE_INCONNU, titre: 'Je ne sais pas', description: 'La Maison les comptera avec vous' }];
}

/** LE CALIBRE TOUCHÉ : son nombre de locks représentatif, « inconnu », ou
    rien. L'automate rend l'identifiant de la Maison (« MND:7:calibre:jumbo ») ;
    la liste d'ici l'écrit court (« calibre:jumbo »). Les deux se lisent. */
export function calibreDuChoix(id: string | undefined, bandes: readonly Calibre[]): { locks: number; palier: string } | 'inconnu' | null {
  const m = /^(?:MND:\d+:)?calibre:(.+)$/.exec(String(id ?? ''));
  if (!m) return null;
  if (m[1] === 'inconnu') return 'inconnu';
  const p = paliersDeLocks(bandes).find((x) => x.id === m[1]);
  return p ? { locks: p.locks, palier: p.palier } : null;
}

/** PAS PLUS DE VINGT RÉPONSES PAR NUMÉRO EN VINGT-QUATRE HEURES : au-delà,
    la main passe (une boucle avec un autre robot, un abus) et rien ne coûte. */
export const RECEPTIONS_PAR_JOUR = 20;

/** LA FENÊTRE DU FIL (31 octobre 2026). Sur un « Ok » de W. N. après sa
    confirmation, l'assistant a répondu à un vocal et à un shampoing du
    21 septembre, sans date dans le fil : « il a répondu à un vieux message,
    d'avant l'automate ; très peu professionnel pour Maison MND » (Yéman).
    Claude ne lit plus que les messages des 48 dernières heures ; un message
    sans date n'entre pas. Ce qui est plus ancien, la Maison l'a déjà traité. */
export const FENETRE_DU_FIL_MS = 48 * 3_600_000;
export function filDeLaFenetre<M extends { quand?: string }>(fil: readonly M[], maintenantMs: number): M[] {
  const depuis = maintenantMs - FENETRE_DU_FIL_MS;
  return fil.filter((m) => { const q = Date.parse(String(m.quand ?? '')); return Number.isFinite(q) && q >= depuis; });
}

/* ══ LA PAROLE EN CONTEXTE · 2 novembre 2026 (lot 3 de Perle) ══════════════
   « Ce qu'il comprend » (maquette de Gérard, validée ; spec v4) : quand une
   cliente répond EN MOTS à un message de Perle de moins de 48 heures, la
   réception sait à quoi elle répond (garder son rendez-vous, une envie, une
   endormie…) et le rendez-vous visé. Cinq gestes de plus, compris par Claude
   et jugés par le code, qui les écrit lui-même au Trône :
     · garder-oui    : elle vient ; le rendez-vous est confirmé par elle,
                       comme au bouton « Oui, je viens » ;
     · deplacer      : elle veut une autre heure pour un rendez-vous qui
                       existe (après « garder », ou n'importe quand, son
                       prochain rendez-vous) ; le rendez-vous le dit
                       (`autreMomentDemandeLe`), comme au bouton « Changer
                       l'heure », et l'automate reçoit la suite « deplacer »
                       avec le rendez-vous : il ouvre les places et le déplace
                       seul, sous verrou (choix de Yéman au sélecteur, le
                       2 novembre 2026 ; morceau C du lot 3) ;
     · garder-non    : elle ne peut plus ; rien n'est annulé, le rendez-vous
                       le dit (`empecheeDitLe`), et la main passe à
                       l'équipe (suite « equipe ») ;
     · locks-defaits : elle a défait ses locks ; la fiche le dit, datée, et
                       Perle ne la relance plus pour ses locks ;
     · envie         : ce qu'elle veut pour sa prochaine séance, noté sur le
                       rendez-vous à venir (`envieAvantSeance`, en mots courts),
                       comme le bouton d'avant séance.
   Un geste n'est offert à Claude que si le contexte le permet (le genre du
   message de Perle, un rendez-vous vivant, une fiche) ; un geste rendu hors
   de ce qui était offert ne passe pas : jamais une phrase qui dirait « c'est
   noté » sans que rien ne soit noté. */

export const GESTES_DE_LA_PAROLE = ['garder-oui', 'deplacer', 'garder-non', 'locks-defaits', 'envie'] as const;
export type GesteDeLaParole = typeof GESTES_DE_LA_PAROLE[number];

/** La suite que l'automate reçoit : une des siennes, ou « deplacer » (son
    parcours des places en mode déplacement, morceau C). Tant qu'un automate
    ne la connaît pas, il la lit « rien » : le message part seul et le
    rendez-vous porte déjà la demande. */
export type SuiteRendue = SuiteDeLaReception | 'deplacer';
export const SUITE_DU_GESTE: Record<GesteDeLaParole, SuiteRendue> = {
  'garder-oui': 'rien', deplacer: 'deplacer', 'garder-non': 'equipe', 'locks-defaits': 'rien', envie: 'rien',
};

/** Les genres des messages de Perle (le modèle Meta `assistant_maison_<genre>`). */
export const GENRES_DE_PERLE = ['garder', 'avant', 'envie', 'place', 'anniversaire', 'fetes', 'endormie'] as const;
export type GenreDePerle = typeof GENRES_DE_PERLE[number];

/** Le genre d'un modèle de Perle : `assistant_maison_garder`, l'ancien
    `gerard_garder`, la carte d'anniversaire. Tout autre modèle : rien. */
export function genreDuModele(modele: unknown): GenreDePerle | null {
  const m = /^(?:assistant_maison|gerard)_(.+)$/.exec(String(modele ?? ''));
  if (!m) return null;
  const g = m[1] === 'carte_anniversaire' ? 'anniversaire' : m[1];
  return (GENRES_DE_PERLE as readonly string[]).includes(g) ? (g as GenreDePerle) : null;
}

export type MessageDuFilBrut = { sens?: unknown; quand?: unknown; modele?: unknown; parQui?: unknown; waId?: unknown };
export type MotDePerle = { genre: GenreDePerle; quand: string; waId?: string };

/** LE DERNIER MOT DE PERLE dans le fil : le plus récent message parti par
    elle (un modèle `assistant_maison_*`), s'il a moins de 48 heures et que
    la cliente a écrit après lui. Sinon, rien. */
export function dernierMotDePerle(fil: readonly MessageDuFilBrut[], maintenantMs: number): MotDePerle | null {
  const dates = (m: MessageDuFilBrut) => Date.parse(String(m.quand ?? ''));
  const siens = fil
    .filter((m) => m.sens === 'sortant' && genreDuModele(m.modele) && Number.isFinite(dates(m)))
    .sort((a, b) => dates(b) - dates(a));
  const dernier = siens[0];
  if (!dernier) return null;
  const q = dates(dernier);
  if (maintenantMs - q > FENETRE_DU_FIL_MS || q > maintenantMs) return null;
  if (!fil.some((m) => m.sens === 'entrant' && dates(m) > q)) return null;
  const waId = typeof dernier.waId === 'string' && dernier.waId ? dernier.waId : undefined;
  return { genre: genreDuModele(dernier.modele) as GenreDePerle, quand: new Date(q).toISOString(), ...(waId ? { waId } : {}) };
}

/** Un rendez-vous tel que la réception le lit : vivant s'il n'est ni annulé
    ni honoré, et à venir (aujourd'hui compris, à Cotonou). */
export type RdvDeLaParole = { id: string; date: string; time?: string; status?: string };
export const rdvVivant = (r: RdvDeLaParole | null | undefined, aujourdhui: string): boolean =>
  !!r && !!r.date && r.date >= aujourdhui && r.status !== 'annulé' && r.status !== 'honoré';

export type ContexteDeLaParole = {
  /** Le dernier mot de Perle (moins de 48 h, la cliente a écrit après), s'il y en a un. */
  mot?: MotDePerle | null;
  /** Le rendez-vous que le message de Perle visait (« garder »), s'il vit. */
  rdvVise?: RdvDeLaParole | null;
  /** Son prochain rendez-vous vivant (une envie, un déplacement). */
  prochainRdv?: RdvDeLaParole | null;
  /** La fiche à qui Perle a écrit. */
  clientId?: string | null;
};

/** LES GESTES QUE CE CONTEXTE PERMET. Garder (oui, non) : après un
    « garder » de Perle, sur le rendez-vous qu'il visait. Déplacer : un
    rendez-vous vivant, visé ou le prochain, avec ou sans mot de Perle. Une
    envie, des locks défaits : en réponse à un mot de Perle seulement. */
export function gestesPermis(c: ContexteDeLaParole | null, aujourdhui: string): GesteDeLaParole[] {
  if (!c) return [];
  const g: GesteDeLaParole[] = [];
  const vise = c.mot && rdvVivant(c.rdvVise, aujourdhui) ? c.rdvVise : null;
  const prochain = rdvVivant(c.prochainRdv, aujourdhui) ? c.prochainRdv : null;
  if (c.mot?.genre === 'garder' && vise) g.push('garder-oui', 'garder-non');
  if (vise || prochain) g.push('deplacer');
  if (c.mot && (vise || prochain)) g.push('envie');
  if (c.mot && c.clientId) g.push('locks-defaits');
  return g;
}

/** Le rendez-vous d'un geste : celui que Perle visait, sinon le prochain. */
export const rdvDuGeste = (c: ContexteDeLaParole, aujourdhui: string): RdvDeLaParole | null =>
  (c.mot && rdvVivant(c.rdvVise, aujourdhui) ? c.rdvVise! : rdvVivant(c.prochainRdv, aujourdhui) ? c.prochainRdv! : null);

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** « jeudi 5 novembre 2026 à 10 h » : le jour, l'année, l'heure si connue. */
export function rdvDit(r: { date: string; time?: string }): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date);
  if (!m) return 'son rendez-vous';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const jour = `${JOURS[d.getUTCDay()]} ${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS[+m[2] - 1]} ${m[1]}`;
  const h = /^(\d{1,2}):(\d{2})/.exec(String(r.time ?? ''));
  return h ? `${jour} à ${Number(h[1])} h${h[2] === '00' ? '' : ` ${h[2]}`}` : jour;
}

const CE_QUE_PERLE_A_DIT: Record<GenreDePerle, string> = {
  garder: 'pour lui rappeler son rendez-vous et lui demander si elle le garde',
  avant: 'parce que sa prochaine venue approche et qu’elle n’a pas encore de rendez-vous',
  envie: 'pour lui proposer une envie entre deux séances',
  place: 'pour lui proposer une place qui s’est libérée',
  anniversaire: 'pour son anniversaire',
  fetes: 'pour les fêtes',
  endormie: 'parce qu’elle n’est pas venue depuis longtemps',
};

const CE_QUE_DIT_LE_GESTE: Record<GesteDeLaParole, string> = {
  'garder-oui': '- "garder-oui" : elle répond qu’elle vient à ce rendez-vous ; ton message le note en une phrase brève, sans redire l’adresse.',
  deplacer: '- "deplacer" : elle voudrait une autre heure ou un autre jour pour ce rendez-vous ; ton message, bref, dit que la Maison lui propose d’autres places, sans promettre aucune heure ; les places partent juste après ton message.',
  'garder-non': '- "garder-non" : elle ne pourra pas venir à ce rendez-vous ; ton message le note avec égards, sans rien annuler, et dit qu’une personne de la Maison reviendra vers elle.',
  'locks-defaits': '- "locks-defaits" : elle dit avoir défait ou coupé ses locks ; ton message le note avec délicatesse, sans insister ni rien proposer.',
  envie: '- "envie" : elle dit ce qu’elle souhaite pour sa prochaine séance (un soin, une coloration, une coiffure, autre chose) ; ton message le note, et tu donnes aussi "envie" (soin, coloration, coiffure ou autre) et "precision" (quelques mots, sans citation).',
};

/** CE QUE CLAUDE LIT EN PLUS : le dernier mot de Perle, le rendez-vous du
    geste, et les gestes permis. Rien quand rien n'est permis. */
export function contexteDeLaParole(c: ContexteDeLaParole, permis: readonly GesteDeLaParole[], maintenantMs: number, aujourdhui: string): string {
  if (permis.length === 0) return '';
  const rdv = rdvDuGeste(c, aujourdhui);
  const lignes = [''];
  if (c.mot) {
    const heures = Math.max(1, Math.round((maintenantMs - Date.parse(c.mot.quand)) / 3_600_000));
    lignes.push('LE DERNIER MESSAGE DE L’ASSISTANT DE LA MAISON :',
      `- Il y a ${heures === 1 ? 'une heure' : `${heures} heures`}, l’assistant de la Maison lui a écrit ${CE_QUE_PERLE_A_DIT[c.mot.genre]}.`);
  } else {
    lignes.push('SON RENDEZ-VOUS :');
  }
  if (rdv) lignes.push(`- Le rendez-vous concerné : ${rdvDit(rdv)}.`);
  lignes.push(
    c.mot ? '- Si son message répond à celui-là, ta suite peut aussi être l’une de celles-ci (sinon, les suites habituelles) :'
      : '- Si elle parle de ce rendez-vous, ta suite peut aussi être celle-ci (sinon, les suites habituelles) :',
    ...permis.map((g) => CE_QUE_DIT_LE_GESTE[g]),
  );
  return lignes.join('\n');
}

/** LE SCHÉMA, selon ce qui est permis : les gestes n'y entrent que permis. */
export function schemaDeLaParole(permis: readonly GesteDeLaParole[]): Record<string, unknown> {
  if (permis.length === 0) return SCHEMA_DE_LA_RECEPTION;
  return {
    type: 'object',
    properties: {
      texte: { type: 'string', description: 'Le message WhatsApp, au nom de la Maison, sans émoji.' },
      suite: { type: 'string', enum: [...SUITES, ...permis], description: 'Ce qui suit le message.' },
      ...(permis.includes('envie') ? {
        envie: { type: 'string', enum: ['soin', 'coloration', 'coiffure', 'autre'], description: 'Avec la suite "envie" : ce qu’elle souhaite.' },
        precision: { type: 'string', description: 'Avec la suite "envie" : quelques mots, sans citation (une couleur cuivrée).' },
      } : {}),
    },
    required: ['texte', 'suite'],
    additionalProperties: false,
  };
}

export type EnvieDeLaParole = { envie: 'soin' | 'coloration' | 'coiffure' | 'autre'; precision?: string };
export type LaParole = { texte: string; suite: SuiteRendue; geste?: GesteDeLaParole; envie?: EnvieDeLaParole };

export const PRECISION_AU_PLUS = 60;
/** Quelques mots de faits : ni guillemets, ni numéro, ni plus de soixante signes. */
export function precisionPropre(p: unknown): string | undefined {
  const t = String(p ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > PRECISION_AU_PLUS || /[«»"“”„]/.test(t) || /\d{6,}/.test(t.replace(/[\s.-]/g, ''))) return undefined;
  return t;
}

/** LA LECTURE AVEC LES GESTES. Un geste ne passe que s'il était permis
    (sinon rien ne part : le secours, et la main à l'équipe) ; son texte passe
    les juges de la réception comme un mot sans suite ; l'automate reçoit la
    suite de ce geste. Sans geste, la lecture de la réception, inchangée. */
export function lectureDeLaParole(brut: unknown, montantsPermis: ReadonlySet<number>, permis: readonly GesteDeLaParole[]): LaParole | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as { texte?: unknown; suite?: unknown; envie?: unknown; precision?: unknown };
  const geste = (GESTES_DE_LA_PAROLE as readonly string[]).includes(String(b.suite)) ? (b.suite as GesteDeLaParole) : null;
  if (!geste) return lectureDeLaReception(brut, montantsPermis);
  if (!permis.includes(geste)) return null;
  const lue = lectureDeLaReception({ texte: b.texte, suite: 'rien' }, montantsPermis);
  if (!lue) return null;
  const suite = SUITE_DU_GESTE[geste];
  if (geste !== 'envie') return { texte: lue.texte, suite, geste };
  const cle = ['soin', 'coloration', 'coiffure', 'autre'].includes(String(b.envie)) ? (b.envie as EnvieDeLaParole['envie']) : 'autre';
  const precision = precisionPropre(b.precision);
  return { texte: lue.texte, suite, geste, envie: { envie: cle, ...(precision ? { precision } : {}) } };
}

/** CE QUE LE GESTE ÉCRIT, à l'instant `quand` : sur le rendez-vous, la fiche,
    la ligne d'envoi de Perle. Rien n'est jamais annulé ici. Une clé à
    `undefined` sort de l'objet écrit (le JSON l'omet). */
export type EcrituresDuGeste = {
  rdv?: Record<string, unknown>;
  fiche?: Record<string, unknown>;
  envoi?: Record<string, unknown>;
};
export const PAR_LA_PAROLE = 'Perle';

export function ecrituresDuGeste(geste: GesteDeLaParole, quand: string, envie?: EnvieDeLaParole): EcrituresDuGeste {
  const envoi = (reponse?: 'oui' | 'non') => ({ ...(reponse ? { reponse } : {}), reponduLe: quand, parole: geste });
  switch (geste) {
    case 'garder-oui':
      return { rdv: { confirmeeParLaClienteLe: quand, autreMomentDemandeLe: undefined, empecheeDitLe: undefined }, envoi: envoi('oui') };
    case 'deplacer':
      return { rdv: { autreMomentDemandeLe: quand, confirmeeParLaClienteLe: undefined, empecheeDitLe: undefined }, envoi: envoi('oui') };
    case 'garder-non':
      return { rdv: { empecheeDitLe: quand, confirmeeParLaClienteLe: undefined }, envoi: envoi('non') };
    case 'locks-defaits':
      return { fiche: { locksDefaits: true, locksDefaitsLe: quand, locksDefaitsPar: PAR_LA_PAROLE }, envoi: envoi() };
    case 'envie':
      return {
        rdv: { envieAvantSeance: { envie: envie?.envie ?? 'autre', quand, ...(envie?.precision ? { precision: envie.precision } : {}), par: PAR_LA_PAROLE } },
        envoi: envoi(),
      };
  }
}

/** La ligne du journal : un fait, jamais un nom ni une citation. */
export function pieceDuGeste(geste: GesteDeLaParole, rdv?: { date: string; time?: string } | null): string {
  const quand = rdv ? `, rendez-vous du ${rdvDit(rdv)}` : '';
  switch (geste) {
    case 'garder-oui': return `Rendez-vous gardé par la cliente, sur WhatsApp${quand}`;
    case 'deplacer': return `Une autre heure demandée par la cliente, sur WhatsApp${quand}`;
    case 'garder-non': return `La cliente ne pourra pas venir, dit sur WhatsApp${quand} ; rien n’est annulé`;
    case 'locks-defaits': return 'Locks défaits, dit par la cliente sur WhatsApp';
    case 'envie': return `Une envie pour la séance, dite sur WhatsApp${quand}`;
  }
}

/* ── L'ACCORD DES NOUVELLES, APRÈS UN « OUI JE VIENS » ÉCRIT (2 novembre 2026) ──
   Maquette « Nouvelles par WhatsApp » (Q6aGAyTUKKJc6c2roJgHhN), « construis »
   de Yéman : sur WhatsApp, une seule fois par personne, juste après un « Oui,
   je viens ». Quand la réception a confirmé le rendez-vous (garder-oui), la
   question suit, avec ses deux boutons, si la règle partagée le permet
   (shared/accord-whatsapp-pur). La réception n'envoie rien elle-même :
   elle rend `ensuite` à l'automate, qui l'envoie après son mot, et seulement
   s'il a dit savoir le faire (`sait: ['accord']` dans sa demande). Sans
   cela, ni question ni marque : une fiche ne se dit jamais « demandée » sans
   que la question soit partie. Les boutons (NOUVELLES:oui, NOUVELLES:non)
   sont lus par le webhook. */
export type EnsuiteDeLaReception = { texte: string; boutons: { id: string; titre: string }[] };

export function accordApresLeOui(
  o: { geste?: GesteDeLaParole; sait: readonly string[]; fiche: FichePourLAccord | null; aujourdhui: string },
): EnsuiteDeLaReception | null {
  if (o.geste !== 'garder-oui' || !o.sait.includes('accord') || !o.fiche) return null;
  const estEnfant = estMineur({ birthday: o.fiche.birthday ?? undefined }, o.aujourdhui);
  const juge = doitDemanderLAccord(o.fiche, { moment: 'oui-je-viens', fenetreOuverte: true, estEnfant });
  if (!juge.oui) return null;
  return { texte: QUESTION_DE_L_ACCORD, boutons: BOUTONS_DE_L_ACCORD.map((b) => ({ id: b.id, titre: b.titre })) };
}
