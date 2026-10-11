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
