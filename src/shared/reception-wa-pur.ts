import { AGENDA_NON_CONSULTE, consigneDeLaReponse, contextePourClaude, lectureDeLaReponse, paliersDeLocks, type ContexteDeLaReponse } from './ia-reponse-wa-pur';
import { heuresPourClaude } from './chat-du-site-pur';
import { prochaineOuvertureDite, type SuiteDeLaReception } from './automate-wa';
import type { ExceptionDHoraire, HeureDeLaSemaine } from './agenda-pur';

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
    'Les heures de la Maison et son adresse sont dans le contexte. Quand la suite revient à l’équipe et que la Maison est fermée, dis quand une personne lui répondra : à la réouverture que le contexte indique.',
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
    'Elle est en route ou arrive : un mot bref (« Bien noté, nous vous attendons. »), suite "venir" : le plan suit.',
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
    `- Adresse : ${ADRESSE_DE_LA_MAISON}.`,
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
