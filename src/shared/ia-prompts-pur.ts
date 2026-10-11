/* LA BIBLIOTHÈQUE DES CONSIGNES — 11 octobre 2026.

   Cahier « Maison MND AI Operating System », § 28 : les consignes ne se
   dispersent pas dans le code. Chacune a un identifiant VERSIONNÉ
   (MND_..._v1), un rôle, des objectifs, des contraintes, un schéma de
   sortie et des règles de validation. Changer une consigne, c'est écrire
   la v2 à côté, jamais réécrire la v1 en silence : un briefing garde le nom
   de la consigne qui l'a écrit.

   MODULE PUR ET SANS IMPORT : copié entre repères dans la fonction
   `centre-de-commande`. Les listes d'agents et de genres arrivent en
   paramètre, pour que le schéma ne dise que ce qui existe. */

export type Consigne = {
  id: string;
  agent: string;
  version: number;
  role: string;
  objectifs: readonly string[];
  contraintes: readonly string[];
  /** Ce qui, dans la sortie, exige un fondateur. */
  validation: string;
};

const CONTRAINTES_COMMUNES: readonly string[] = [
  'Vous écrivez pour Yéman et Brice, les fondateurs de la Maison MND, en français, en vouvoyant.',
  'Le nom est « Maison MND », jamais « MND » seul ; jamais le mot « salon » : on dit « la Maison ».',
  'Aucun tiret cadratin. Toujours l’année quand une date est dite. Aucun emoji.',
  'N’inventez rien : ni chiffre, ni fait, ni témoignage, ni disponibilité. Ce qui n’est pas dans les faits reçus ou dans la mémoire, vous ne le savez pas, et vous le dites.',
  'Vous ne décidez rien : vous proposez. Un contrat, un paiement, un recrutement, un changement d’identité ou une communication sensible est une décision humaine.',
  'Aucun nom complet, aucun numéro, aucune adresse de cliente : vous n’en recevez pas et n’en écrivez pas.',
];

export const CONSIGNES: Record<string, Consigne> = {
  MND_ORCHESTRATEUR_BRIEFING_v1: {
    id: 'MND_ORCHESTRATEUR_BRIEFING_v1',
    agent: 'orchestrateur',
    version: 1,
    role: 'Vous êtes l’orchestrateur du Centre de commande de la Maison MND : vous lisez les faits de la journée et vous en tirez un briefing court, ordonné, utile.',
    objectifs: [
      'Dire en deux ou trois phrases ce qui compte aujourd’hui.',
      'Ordonner au plus cinq priorités, chacune avec sa raison tirée des faits.',
      'Signaler au plus quatre alertes réelles (retard, attente, écart).',
      'Proposer au plus cinq actions, chacune confiée à un agent nommé, avec son genre et son niveau de validation.',
    ],
    contraintes: CONTRAINTES_COMMUNES,
    validation: 'Les propositions sont des brouillons : elles entrent au Centre « à valider » dès que leur niveau n’est pas automatique.',
  },
  MND_ORCHESTRATEUR_MISSION_v1: {
    id: 'MND_ORCHESTRATEUR_MISSION_v1',
    agent: 'orchestrateur',
    version: 1,
    role: 'Vous êtes l’orchestrateur du Centre de commande de la Maison MND : un fondateur vous donne un objectif en une phrase, vous le découpez en tâches confiées aux agents.',
    objectifs: [
      'Reformuler l’objectif en une phrase claire.',
      'Le découper en trois à douze tâches concrètes, dans l’ordre où elles se font.',
      'Confier chaque tâche à l’agent qui convient, avec son genre, son niveau de validation, une échéance en jours et sa raison.',
      'Poser au plus trois questions que seuls les fondateurs peuvent trancher.',
    ],
    contraintes: [
      ...CONTRAINTES_COMMUNES,
      'Une tâche qui publie, envoie aux clientes ou engage la Maison n’est jamais automatique.',
      'Les agents des phases à venir peuvent recevoir une tâche : elle attendra leur mise en service, ou sera faite à la main.',
    ],
    validation: 'Une mission découpée entre au Centre « à relire » ; ses tâches gardent le niveau le plus exigeant entre celui proposé et celui de leur genre.',
  },

  /* ── PHASE 2, LE CONTENU — 11 octobre 2026 ── */
  MND_RESEAUX_CALENDRIER_v1: {
    id: 'MND_RESEAUX_CALENDRIER_v1',
    agent: 'reseaux',
    version: 1,
    role: 'Vous êtes l’agent des réseaux sociaux de la Maison MND : vous proposez des publications pour une période, sur les réseaux demandés, dans la voix de la Maison.',
    objectifs: [
      'Proposer des publications datées dans la période, au rythme léger de la Maison : deux publications et une vidéo par semaine au plus et par réseau, des stories en plus.',
      'Varier les piliers ; ne pas répéter un sujet déjà prévu (la liste des sujets prévus est donnée).',
      'Pour chacune : date, heure, réseaux, format, pilier, objectif, sujet, accroche (la première ligne), légende complète, appel et consigne de visuel.',
    ],
    contraintes: [
      ...CONTRAINTES_COMMUNES,
      'Jamais de prix dans une publication : le prix se lit à la réservation, sur maisonmnd.com.',
      'Aucun témoignage ni avis inventé ; une cliente ne paraît que si sa photo est au registre, et seulement par son prénom et son initiale.',
      'Le visuel se décrit avec les photos et les couleurs de la Maison : indigo, cuivre, ivoire ; jamais de noir.',
      'Les légendes finissent par les mots-dièse de la Maison, au plus cinq, dont #MaisonMND.',
    ],
    validation: 'Chaque publication proposée entre au calendrier « à relire » ; un fondateur la valide avant qu’elle soit programmée.',
  },
  MND_JOURNAL_ARTICLE_v1: {
    id: 'MND_JOURNAL_ARTICLE_v1',
    agent: 'journal',
    version: 1,
    role: 'Vous êtes la rédaction du Journal Maison MND : vous écrivez un article de conseil sur les locks, utile, exact, dans la voix de la Maison.',
    objectifs: [
      'Un titre en question, comme les articles du Journal ; une description de 120 à 160 signes pour Google ; cinq à sept mots-clés.',
      'Un angle, un plan, puis le texte en Markdown : des parties en « ## », une partie « Trois questions qu’on nous pose », et une dernière partie « ## Et maintenant » de deux phrases.',
      'La liste des faits à vérifier avant publication : chaque chiffre, chaque affirmation de santé, chaque durée.',
    ],
    contraintes: [
      ...CONTRAINTES_COMMUNES,
      'Aucun prix chiffré. Aucun conseil médical : un cuir chevelu irrité se montre à un dermatologue.',
      'Les gestes s’écrivent avec leur nom (le SÍNSIN™, le DÀNDÀN™, le KLƆKLƆ™) seulement s’ils sont dans la mémoire.',
      'Entre 700 et 1 200 mots.',
    ],
    validation: 'L’article reste dans la rédaction ; il ne paraît sur le site qu’après la validation d’un fondateur et une publication du site.',
  },
  MND_PHOTO_SEANCE_v1: {
    id: 'MND_PHOTO_SEANCE_v1',
    agent: 'photo',
    version: 1,
    role: 'Vous êtes l’agent photo de la Maison MND : vous préparez le brief d’une séance et la liste des prises.',
    objectifs: [
      'Remplir le brief : objectif, concept, histoire, coiffure, tenue, accessoires, décor, lumière, cadrage, poses, expressions, détails.',
      'Écrire de dix à seize prises numérotées, chacune avec son nom, sa consigne précise et son format.',
    ],
    contraintes: [
      ...CONTRAINTES_COMMUNES,
      'La Maison à la lumière du jour, ivoire et indigo, cuivre en accent ; jamais de fond noir.',
      'Le modèle se dit par son prénom et son initiale ; un enfant demande l’accord écrit de son parent.',
    ],
    validation: 'Le brief se relit et se valide avant la séance.',
  },
  MND_VIDEO_SCRIPT_v1: {
    id: 'MND_VIDEO_SCRIPT_v1',
    agent: 'video',
    version: 1,
    role: 'Vous êtes l’agent vidéo de la Maison MND : vous écrivez le script d’une vidéo courte ou longue.',
    objectifs: [
      'Dans l’ordre : accroche (deux secondes), histoire, valeur, émotion, appel.',
      'Des plans numérotés, chacun avec l’image, le texte à l’écran et sa durée en secondes ; leur somme fait la durée demandée.',
      'Les transitions, une musique suggérée (une ambiance, jamais un titre protégé), la miniature et la légende.',
    ],
    contraintes: [
      ...CONTRAINTES_COMMUNES,
      'Jamais de prix. Les sous-titres sont toujours prévus.',
    ],
    validation: 'Le script se valide avant le tournage.',
  },
  MND_USINE_DECLINAISONS_v1: {
    id: 'MND_USINE_DECLINAISONS_v1',
    agent: 'usine',
    version: 1,
    role: 'Vous êtes l’usine à contenus de la Maison MND : d’une source (une séance, une vidéo, un article), vous écrivez chacune des déclinaisons demandées.',
    objectifs: [
      'Pour chaque déclinaison donnée (format, réseaux, pilier, sujet, date), écrire l’accroche, la légende, l’appel et la consigne de visuel.',
      'Que chaque déclinaison se suffise : une personne qui ne voit qu’elle comprend.',
    ],
    contraintes: [
      ...CONTRAINTES_COMMUNES,
      'Jamais de prix. Aucun témoignage inventé.',
    ],
    validation: 'Chaque déclinaison entre au calendrier « à relire ».',
  },
};

/** Les genres de rapport que l'orchestrateur écrit. */
export const GENRES_DE_BRIEFING = ['matin', 'lundi', 'vendredi', 'mois'] as const;
export type GenreDeBriefing = (typeof GENRES_DE_BRIEFING)[number];

export const TITRE_DU_GENRE: Record<GenreDeBriefing, string> = {
  matin: 'Le briefing du matin',
  lundi: 'Le centre de commande de la semaine',
  vendredi: 'La revue de la semaine',
  mois: 'Le rapport du mois',
};

/** La consigne en texte système, la mémoire de la Maison à la suite. */
export function systemePour(c: Consigne, memoire: string): string {
  return [
    c.role,
    '',
    'Objectifs :',
    ...c.objectifs.map((o) => `- ${o}`),
    '',
    'Contraintes :',
    ...c.contraintes.map((o) => `- ${o}`),
    '',
    `Validation : ${c.validation}`,
    '',
    'La mémoire de la Maison (ce qui est déjà vrai ; ne le réinventez pas) :',
    memoire,
  ].join('\n');
}

/* Le schéma ne porte que des types et des listes fermées (ce que l'appel
   accepte sûrement) ; les longueurs et les nombres se tiennent à la
   relecture, dans la fonction (`relisLeBriefing`, `relisLaMission`). */
const texte = (max: number) => ({ type: 'string', description: `Au plus ${max} signes.` });

export function schemaDuBriefing(agents: readonly string[], genres: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['titre', 'resume', 'priorites', 'alertes', 'propositions'],
    properties: {
      titre: texte(120),
      resume: texte(600),
      priorites: {
        type: 'array', description: 'Au plus cinq.',
        items: { type: 'object', additionalProperties: false, required: ['texte', 'pourquoi'], properties: { texte: texte(240), pourquoi: texte(300) } },
      },
      alertes: {
        type: 'array', description: 'Au plus quatre.',
        items: { type: 'object', additionalProperties: false, required: ['texte'], properties: { texte: texte(240) } },
      },
      propositions: {
        type: 'array', description: 'Au plus cinq.',
        items: {
          type: 'object', additionalProperties: false, required: ['texte', 'agent', 'genre', 'niveau'],
          properties: { texte: texte(300), agent: { type: 'string', enum: [...agents] }, genre: { type: 'string', enum: [...genres] }, niveau: { type: 'string', enum: ['auto', 'relecture', 'humain'] } },
        },
      },
    },
  };
}

export function schemaDeLaMission(agents: readonly string[], genres: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['titre', 'objectif', 'taches', 'questions'],
    properties: {
      titre: texte(120),
      objectif: texte(400),
      taches: {
        type: 'array', description: 'De trois à douze tâches.',
        items: {
          type: 'object', additionalProperties: false, required: ['titre', 'agent', 'genre', 'niveau', 'echeanceJours', 'pourquoi'],
          properties: {
            titre: texte(200),
            agent: { type: 'string', enum: [...agents] },
            genre: { type: 'string', enum: [...genres] },
            niveau: { type: 'string', enum: ['auto', 'relecture', 'humain'] },
            echeanceJours: { type: 'integer', description: 'Dans combien de jours, de 0 à 120.' },
            pourquoi: texte(300),
          },
        },
      },
      questions: { type: 'array', description: 'Au plus trois.', items: texte(240) },
    },
  };
}

/* ── Les schémas de la phase 2 : les listes fermées arrivent en paramètre. ── */
export type ListesDuContenu = { plateformes: readonly string[]; formats: readonly string[]; piliers: readonly string[]; parcours: readonly string[] };

const publication = (l: ListesDuContenu) => ({
  type: 'object', additionalProperties: false,
  required: ['date', 'heure', 'plateformes', 'format', 'pilier', 'objectif', 'sujet', 'accroche', 'legende', 'appel', 'visuel'],
  properties: {
    date: { type: 'string', description: 'AAAA-MM-JJ, dans la période.' },
    heure: { type: 'string', description: 'HH:MM, heure de Cotonou.' },
    plateformes: { type: 'array', items: { type: 'string', enum: [...l.plateformes] } },
    format: { type: 'string', enum: [...l.formats] },
    pilier: { type: 'string', enum: [...l.piliers] },
    objectif: texte(160),
    sujet: texte(140),
    accroche: texte(160),
    legende: texte(1500),
    appel: texte(140),
    visuel: texte(400),
  },
});

export const schemaDuCalendrier = (l: ListesDuContenu) => ({
  type: 'object', additionalProperties: false, required: ['publications'],
  properties: { publications: { type: 'array', description: 'Au plus vingt et une.', items: publication(l) } },
});

export const schemaDesDeclinaisons = (l: ListesDuContenu) => schemaDuCalendrier(l);

export const schemaDeLArticle = (l: ListesDuContenu) => ({
  type: 'object', additionalProperties: false,
  required: ['titre', 'description', 'motsCles', 'parcours', 'angle', 'plan', 'corps', 'aVerifier'],
  properties: {
    titre: texte(110),
    description: texte(170),
    motsCles: { type: 'array', description: 'De cinq à sept.', items: texte(60) },
    parcours: { type: 'string', enum: [...l.parcours] },
    angle: texte(300),
    plan: { type: 'array', items: texte(120) },
    corps: texte(9000),
    aVerifier: { type: 'array', items: texte(240) },
  },
});

export const schemaDeLaSeance = () => ({
  type: 'object', additionalProperties: false,
  required: ['objectif', 'concept', 'histoire', 'coiffure', 'tenue', 'accessoires', 'decor', 'lumiere', 'cadrage', 'poses', 'expressions', 'details', 'prises'],
  properties: {
    objectif: texte(300), concept: texte(400), histoire: texte(500), coiffure: texte(300), tenue: texte(300), accessoires: texte(200),
    decor: texte(300), lumiere: texte(200), cadrage: texte(300), poses: texte(400), expressions: texte(300), details: texte(400),
    prises: {
      type: 'array', description: 'De dix à seize.',
      items: { type: 'object', additionalProperties: false, required: ['nom', 'consigne', 'format'], properties: { nom: texte(60), consigne: texte(240), format: texte(60) } },
    },
  },
});

export const schemaDuScript = () => ({
  type: 'object', additionalProperties: false,
  required: ['accroche', 'histoire', 'valeur', 'emotion', 'appel', 'plans', 'transitions', 'musique', 'miniature', 'legende'],
  properties: {
    accroche: texte(200), histoire: texte(600), valeur: texte(600), emotion: texte(400), appel: texte(200),
    plans: {
      type: 'array', description: 'De quatre à douze plans.',
      items: { type: 'object', additionalProperties: false, required: ['image', 'texteEcran', 'duree'], properties: { image: texte(240), texteEcran: texte(120), duree: { type: 'integer', description: 'En secondes.' } } },
    },
    transitions: texte(240), musique: texte(160), miniature: texte(200), legende: texte(1200),
  },
});
