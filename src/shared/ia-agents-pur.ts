import type { Niveau } from './ia-validation-pur';

/* LES AGENTS DE LA MAISON — 11 octobre 2026.

   Cahier « Maison MND AI Operating System » : une équipe virtuelle au
   service de la Maison, conduite par un orchestrateur, en cinq phases. Les
   agents NE REMPLACENT PAS la vision, le jugement ni la responsabilité de
   Yéman et Brice : ils préparent, les fondateurs décident.

   UN AGENT NE SE DIT EN SERVICE QUE S'IL L'EST. La phase 1 met en service
   l'orchestrateur (briefings, missions découpées) et la mémoire ; les autres
   sont nommés, avec ce qu'ils liront et produiront, et la phase qui les
   allumera. Aucun n'est simulé.

   MODULE PUR. */

export type Phase = 1 | 2 | 3 | 4 | 5;

export const PHASES: Record<Phase, { nom: string; dit: string }> = {
  1: { nom: 'Fondation', dit: 'Orchestrateur, mémoire, missions et tâches, validation, briefings, Centre de commande.' },
  2: { nom: 'Contenu', dit: 'Réseaux sociaux, Journal, photo, vidéo, direction artistique, usine à contenus.' },
  3: { nom: 'Automatisation', dit: 'Calendrier, programmation, notifications, rapports et enchaînements automatiques.' },
  4: { nom: 'Gestion', dit: 'Stratégie, finance, juridique, ressources humaines, marketing, relation clientes.' },
  5: { nom: 'Intelligence', dit: 'Analyse des performances, prévisions, recommandations, apprentissage.' },
};

export type Agent = {
  id: string;
  nom: string;
  mission: string;
  phase: Phase;
  /** Ce qu'il lit, dans le Trône ou la mémoire, au lieu de le réinventer. */
  lit: readonly string[];
  /** Ce qu'il rend. */
  produit: readonly string[];
  /** Le niveau de validation de ce qu'il produit, au plus doux. */
  niveau: Niveau;
  /** La consigne qu'il suit, dans la bibliothèque (null avant sa phase). */
  consigne: string | null;
  /** Ce qu'il ne fait jamais. */
  gardeFous: readonly string[];
};

export const AGENTS: readonly Agent[] = [
  {
    id: 'orchestrateur', nom: 'L’orchestrateur', phase: 1,
    mission: 'Reçoit les objectifs, les découpe en tâches, les confie aux agents, suit l’avancement, demande les validations et rédige les briefings.',
    lit: ['Rendez-vous du jour', 'Demandes du site', 'Encaissé du mois', 'Offres en cours', 'Missions et validations', 'Mémoire de la Maison'],
    produit: ['Briefing du matin', 'Centre de commande du lundi', 'Revue du vendredi', 'Rapport du mois', 'Missions découpées'],
    niveau: 'auto', consigne: 'MND_ORCHESTRATEUR_BRIEFING_v1',
    gardeFous: ['N’exécute jamais une tâche « décision humaine »', 'N’envoie rien aux clientes', 'Ne publie rien'],
  },
  {
    id: 'memoire', nom: 'La mémoire de la Maison', phase: 1,
    mission: 'Garde ce que la Maison sait déjà : identité, devise, fondateurs, histoire, services, règles de marque, décisions datées.',
    lit: ['Identité de la Maison', 'Décisions du site', 'Registre des photos', 'Notes des fondateurs'],
    produit: ['Réponses sourcées', 'Contexte des autres agents'],
    niveau: 'auto', consigne: null,
    gardeFous: ['Ne réinvente jamais une information connue', 'Ne change pas l’identité sans les fondateurs'],
  },
  {
    id: 'reseaux', nom: 'Réseaux sociaux', phase: 2,
    mission: 'Tient la présence de la Maison : piliers, calendrier, légendes, accroches, formats, séries.',
    lit: ['Plans des réseaux déjà validés', 'Offres en cours', 'Mémoire de la Maison'],
    produit: ['Calendrier éditorial', 'Légendes et accroches', 'Séries'],
    niveau: 'relecture', consigne: 'MND_RESEAUX_CALENDRIER_v1',
    gardeFous: ['Jamais de prix en campagne', 'Ne publie rien sans validation'],
  },
  {
    id: 'journal', nom: 'Le Journal Maison MND', phase: 2,
    mission: 'Fonctionne comme une rédaction : idée, angle, recherche, plan, rédaction, vérification, édition, validation.',
    lit: ['Articles déjà publiés', 'Voix du site', 'Registre des photos'],
    produit: ['Sujets', 'Articles', 'Portraits', 'Dossiers'],
    niveau: 'relecture', consigne: 'MND_JOURNAL_ARTICLE_v1',
    gardeFous: ['Aucun fait inventé', 'Aucune cliente sur un article qui nomme un défaut'],
  },
  {
    id: 'photo', nom: 'Photo', phase: 2,
    mission: 'Prépare chaque séance : brief, concept, modèle, tenue, décor, lumière, liste des prises par format.',
    lit: ['Direction photo du site', 'Registre des accords'],
    produit: ['Brief de séance', 'Liste des prises'],
    niveau: 'relecture', consigne: 'MND_PHOTO_SEANCE_v1',
    gardeFous: ['Pas de photo publiée sans accord inscrit au registre', 'Aucun visage d’enfant sans l’accord du parent'],
  },
  {
    id: 'direction-artistique', nom: 'Direction artistique', phase: 2,
    mission: 'Tient la cohérence visuelle et écrite : ses règles relisent chaque texte de l’atelier, sans Claude (le gardien de la marque), et bloquent ce qui ne peut pas sortir.',
    lit: ['Palette indigo, cuivre, ivoire', 'Verrou et motifs', 'Charte'],
    produit: ['Planches', 'Avis de cohérence'],
    niveau: 'relecture', consigne: null,
    gardeFous: ['Aucune nouvelle palette sans validation', 'Jamais d’obsidienne ni de noir profond'],
  },
  {
    id: 'video', nom: 'Vidéo', phase: 2,
    mission: 'Concepts, scripts, découpages : accroche, histoire, valeur, émotion, appel.',
    lit: ['Mémoire de la Maison', 'Séances photo'],
    produit: ['Scripts', 'Découpages', 'Textes à l’écran'],
    niveau: 'relecture', consigne: 'MND_VIDEO_SCRIPT_v1',
    gardeFous: ['Ne publie rien sans validation'],
  },
  {
    id: 'usine', nom: 'L’usine à contenus', phase: 2,
    mission: 'Tire d’un seul contenu tout ce qu’il peut donner : posts, stories, articles, messages.',
    lit: ['Contenus validés'],
    produit: ['Déclinaisons par format'],
    niveau: 'relecture', consigne: 'MND_USINE_DECLINAISONS_v1',
    gardeFous: ['Chaque déclinaison repasse par la validation'],
  },
  {
    id: 'publication', nom: 'Publication', phase: 3,
    mission: 'Programme : dates, heures, plateformes, statuts, suivi.',
    lit: ['Calendrier éditorial', 'Validations'],
    produit: ['Programmation', 'Suivi des statuts'],
    niveau: 'relecture', consigne: null,
    gardeFous: ['Ne publie jamais un contenu à relecture exigée', 'Aucune intégration simulée : tant que Meta n’est pas relié, la publication reste à la main'],
  },
  {
    id: 'strategie', nom: 'Stratégie', phase: 4,
    mission: 'Transforme une vision en objectifs, projets, actions, échéances et responsables.',
    lit: ['Bilan mensuel', 'Synthèse', 'Mémoire de la Maison'],
    produit: ['Objectifs', 'Feuilles de route'],
    niveau: 'relecture', consigne: null,
    gardeFous: ['Ne décide pas : propose aux fondateurs'],
  },
  {
    id: 'finance', nom: 'Finance', phase: 4,
    mission: 'Suit revenus, dépenses, trésorerie, budget et écarts, à partir des chiffres du Trône.',
    lit: ['Encaissements', 'Dépenses', 'Caisses et coffre'],
    produit: ['Tableaux', 'Prévisions', 'Alertes'],
    niveau: 'humain', consigne: null,
    gardeFous: ['Aucune opération d’argent sans un fondateur'],
  },
  {
    id: 'juridique', nom: 'Juridique', phase: 4,
    mission: 'Repère les risques, prépare contrats et textes, tient échéances et documents.',
    lit: ['Secrétariat', 'Papiers', 'Conditions et données du site'],
    produit: ['Projets de documents', 'Liste des risques', 'Échéances'],
    niveau: 'humain', consigne: null,
    gardeFous: ['Ne remplace jamais un avocat', 'Tout document se fait relire avant signature'],
  },
  {
    id: 'rh', nom: 'Ressources humaines', phase: 4,
    mission: 'Fiches de poste, recrutement, accueil, formation, planning, évaluations, procédures.',
    lit: ['Personnel', 'Fiches de poste', 'Règlement intérieur'],
    produit: ['Projets de fiches', 'Plans de formation'],
    niveau: 'humain', consigne: null,
    gardeFous: ['Le recrutement final est une décision humaine'],
  },
  {
    id: 'marketing', nom: 'Marketing', phase: 4,
    mission: 'Campagnes, offres, acquisition, fidélisation, saisons, en lien avec les réseaux et la relation clientes.',
    lit: ['Offres', 'Codes', 'Parrainage', 'Carte cadeau'],
    produit: ['Plans de campagne'],
    niveau: 'relecture', consigne: null,
    gardeFous: ['Aucun message aux clientes sans validation'],
  },
  {
    id: 'analyse', nom: 'Analyse', phase: 5,
    mission: 'Lit ce qui marche, pourquoi, ce qu’il faut refaire, arrêter ou améliorer, et ce qui amène des rendez-vous.',
    lit: ['Demandes du site et leur campagne', 'Rendez-vous', 'Statistiques des réseaux une fois reliés'],
    produit: ['Rapports du jour, de la semaine, du mois'],
    niveau: 'auto', consigne: null,
    gardeFous: ['Ne compte que ce qui est mesuré'],
  },
];

export const agentDe = (id: string): Agent | undefined => AGENTS.find((a) => a.id === id);

/** Les identifiants qu'une mission peut confier : tout agent nommé. */
export const IDS_DES_AGENTS: readonly string[] = AGENTS.map((a) => a.id);

/** Les phases construites : la fondation (11 octobre 2026), puis le contenu
    (le même jour, « construis la phase suivante »). */
export const PHASES_CONSTRUITES: readonly Phase[] = [1, 2];

/** En service, prêt, ou prévu : un agent d'une phase construite est en
    service quand la fonction de l'orchestrateur répond ; avant, il est prêt
    (ses outils marchent à la main). La mémoire et la direction artistique,
    qui ne demandent pas Claude, sont toujours en service. */
export function etatDeLAgent(a: Agent, fonctionPosee: boolean): 'en-service' | 'pret' | 'prevu' {
  if (!PHASES_CONSTRUITES.includes(a.phase)) return 'prevu';
  if (a.id === 'memoire' || a.id === 'direction-artistique') return 'en-service';
  return fonctionPosee ? 'en-service' : 'pret';
}
