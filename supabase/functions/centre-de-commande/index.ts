// Supabase Edge Function — centre-de-commande
// L'orchestrateur du Centre de commande de la Maison MND (cahier « Maison MND
// AI Operating System », 11 octobre 2026, phase 1).
//
// Il lit les faits de la journée (sans aucun nom), demande à Claude un
// briefing ordonné ou le découpage d'une mission, RELIT la réponse, la range
// dans les documents de la base, compte ce qu'elle a coûté, et prévient Yéman
// et Brice d'une notification. Il ne publie rien, n'envoie rien aux clientes,
// n'exécute aucune décision humaine.
//
// MODES (POST, corps JSON) :
//   { mode: 'etat' }                         fondateur ou clé service : version et dépense du mois, sans Claude.
//   { mode: 'briefing', genre }              clé service (cron) ou fondateur (clic) ; genre = matin | lundi | vendredi | mois.
//   { mode: 'mission', objectif }            fondateur : l'objectif découpé en tâches, rendu au Trône qui le range « à relire ».
//
// DÉPLOIEMENT : Supabase → Edge Functions → New function → nom
// « centre-de-commande » → coller CE FICHIER ENTIER → Deploy. Les secrets
// existent déjà : ANTHROPIC_API_KEY (bilan-redige, suggest-client),
// CLE_SERVICE, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT. Rien à ajouter.
//
// LES RENDEZ-VOUS AUTOMATIQUES (Supabase → Integrations → Cron → Create job,
// type « SQL Snippet ») — heures en UTC, Cotonou = UTC+1 :
//   centre-briefing-matin    0 6 * * *     select public.appelle_fonction_edge('centre-de-commande', '{"mode":"briefing","genre":"matin"}'::jsonb);
//   centre-semaine-lundi     30 6 * * 1    select public.appelle_fonction_edge('centre-de-commande', '{"mode":"briefing","genre":"lundi"}'::jsonb);
//   centre-revue-vendredi    0 16 * * 5    select public.appelle_fonction_edge('centre-de-commande', '{"mode":"briefing","genre":"vendredi"}'::jsonb);
//   centre-rapport-du-mois   0 7 1 * *     select public.appelle_fonction_edge('centre-de-commande', '{"mode":"briefing","genre":"mois"}'::jsonb);
//
// LES BLOCS « COPIE » plus bas sont des copies EXACTES des modules purs du
// Trône (src/shared/ia-*-pur.ts), sans leurs lignes d'import : une fonction
// Edge n'importe rien du dépôt. `node scripts/copie-dans-le-centre.mjs` les
// rafraîchit ; le banc `verifie-le-centre-de-commande` crie s'ils divergent.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

/** La version de ce fichier, rendue dans chaque réponse. */
const VERSION = '2026-10-11-a';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@maisonmnd.com';

/* La routine se fait avec le modèle courant ; si le compte ne le connaît
   pas, le suivant. Le plus cher en dernier : le plafond le compte au prix
   le plus haut. */
const MODELES = ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-8'];

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify({ version: VERSION, ...(obj as Record<string, unknown>) }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── DÉBUT DE LA COPIE : src/shared/ia-validation-pur.ts ──
/* LE CENTRE DE COMMANDE, LA VALIDATION — 11 octobre 2026.

   Cahier « Maison MND AI Operating System » (Yéman, 11 octobre 2026) :
   « l'automatisation ne signifie pas absence de contrôle ». Trois niveaux,
   et une règle qui ne se discute pas : ce qui est HUMAIN SEUL ne part jamais
   sans un fondateur, et rien de marqué « relecture humaine exigée » ne se
   publie seul.

   QUI VALIDE : Yéman ou Brice, l'un ou l'autre (choix au sélecteur, 11
   octobre 2026). Dans le Trône, ce sont les comptes `souverain`.

   MODULE PUR : ni magasin, ni base, ni React. Le Trône et la fonction
   `centre-de-commande` le lisent tous deux ; la fonction en porte une copie
   entre ses repères, tenue identique par `verifie-le-centre-de-commande`. */

/** AUTO : l'agent exécute seul. RELECTURE : il prépare, un fondateur valide.
    HUMAIN : décision humaine obligatoire, l'agent ne fait que préparer. */
export type Niveau = 'auto' | 'relecture' | 'humain';

export const NIVEAUX: readonly Niveau[] = ['auto', 'relecture', 'humain'];

export const NIVEAU_DIT: Record<Niveau, string> = {
  auto: 'Automatique',
  relecture: 'À relire',
  humain: 'Décision humaine',
};

/** Ce qu'une tâche fait, pour en déduire son niveau minimum. La liste suit
    le cahier (§ 20) : chaque genre y est nommé avec son niveau. */
export type Genre =
  | 'calendrier' | 'analyse' | 'idees' | 'brouillon' | 'rangement' | 'rapport'
  | 'publication' | 'campagne' | 'article' | 'shooting' | 'video' | 'concept' | 'message-clientes'
  | 'contrat' | 'juridique' | 'paiement' | 'recrutement' | 'identite' | 'communication-sensible'
  | 'engagement-financier' | 'publication-sensible';

export const NIVEAU_MINIMUM: Record<Genre, Niveau> = {
  calendrier: 'auto',
  analyse: 'auto',
  idees: 'auto',
  brouillon: 'auto',
  rangement: 'auto',
  rapport: 'auto',
  publication: 'relecture',
  campagne: 'relecture',
  article: 'relecture',
  shooting: 'relecture',
  video: 'relecture',
  concept: 'relecture',
  /* Un message qui part aux clientes engage la Maison : jamais seul. */
  'message-clientes': 'relecture',
  contrat: 'humain',
  juridique: 'humain',
  paiement: 'humain',
  recrutement: 'humain',
  identite: 'humain',
  'communication-sensible': 'humain',
  'engagement-financier': 'humain',
  'publication-sensible': 'humain',
};

export const GENRES = Object.keys(NIVEAU_MINIMUM) as Genre[];

const RANG: Record<Niveau, number> = { auto: 0, relecture: 1, humain: 2 };

/** Le plus exigeant des deux. Un agent peut DURCIR un niveau, jamais
    l'adoucir : un contrat proposé « auto » reste une décision humaine. */
export const plusExigeant = (a: Niveau, b: Niveau): Niveau => (RANG[a] >= RANG[b] ? a : b);

/** Le niveau qu'une tâche porte vraiment : celui qu'on lui propose, relevé
    au minimum de son genre. Un genre inconnu vaut une relecture. */
export function niveauRetenu(genre: string, propose?: string): Niveau {
  const minimum = (NIVEAU_MINIMUM as Record<string, Niveau>)[genre] ?? 'relecture';
  const voulu = (NIVEAUX as readonly string[]).includes(propose ?? '') ? (propose as Niveau) : minimum;
  return plusExigeant(minimum, voulu);
}

/* ── Les statuts d'un contenu (cahier § 16) ──────────────────────────────── */
export type StatutDeContenu = 'brouillon' | 'a-relire' | 'valide' | 'programme' | 'publie' | 'analyse' | 'optimise';

export const STATUTS_DE_CONTENU: readonly StatutDeContenu[] = ['brouillon', 'a-relire', 'valide', 'programme', 'publie', 'analyse', 'optimise'];

export const STATUT_DIT: Record<StatutDeContenu, string> = {
  brouillon: 'Brouillon',
  'a-relire': 'À relire',
  valide: 'Validé',
  programme: 'Programmé',
  publie: 'Publié',
  analyse: 'Analysé',
  optimise: 'Optimisé',
};

/** Les pas permis : on avance d'un cran, ou l'on revient au brouillon pour
    reprendre ; on ne saute jamais la validation. */
const SUIVANTS: Record<StatutDeContenu, readonly StatutDeContenu[]> = {
  brouillon: ['a-relire'],
  'a-relire': ['valide', 'brouillon'],
  valide: ['programme', 'brouillon'],
  programme: ['publie', 'valide'],
  publie: ['analyse'],
  analyse: ['optimise'],
  optimise: [],
};

export const pasPermis = (de: StatutDeContenu, vers: StatutDeContenu): boolean => SUIVANTS[de].includes(vers);

/* ── Les tâches ──────────────────────────────────────────────────────────── */
export type StatutDeTache = 'a-faire' | 'en-cours' | 'a-valider' | 'validee' | 'refusee' | 'faite';

export const STATUT_DE_TACHE_DIT: Record<StatutDeTache, string> = {
  'a-faire': 'À faire',
  'en-cours': 'En cours',
  'a-valider': 'À valider',
  validee: 'Validée',
  refusee: 'Refusée',
  faite: 'Faite',
};

export type Validation = { par: string; nom: string; le: string; verdict: 'oui' | 'non'; mot?: string };

export type TacheDeValidation = {
  niveau: Niveau;
  /** Le drapeau du cahier : HUMAN_REVIEW_REQUIRED. */
  relectureExigee?: boolean;
  validation?: Validation;
};

/** Seul un fondateur valide (le rôle `souverain` du Trône). */
export const peutValider = (role: string | undefined): boolean => role === 'souverain';

/** Une tâche peut-elle s'exécuter sans geste humain ? Seulement si elle est
    AUTO et que personne n'a exigé de relecture. */
export const peutPartirSeule = (t: TacheDeValidation): boolean => t.niveau === 'auto' && !t.relectureExigee;

/** Une tâche (ou un contenu) peut-elle sortir de la Maison : publication,
    envoi, signature ? Une tâche AUTO sans drapeau, ou une tâche validée
    « oui » par un fondateur. Une validation « non » ferme la porte. */
export function peutSortir(t: TacheDeValidation): boolean {
  if (peutPartirSeule(t)) return true;
  return t.validation?.verdict === 'oui';
}

/** Ce qui attend un fondateur : à valider, pas encore tranché. */
export const attendUnFondateur = (t: TacheDeValidation & { statut: StatutDeTache }): boolean =>
  t.statut === 'a-valider' && !t.validation;
// ── FIN DE LA COPIE ──

// ── DÉBUT DE LA COPIE : src/shared/ia-anonymise-pur.ts ──
/* CE QUI SORT DU TRÔNE VERS CLAUDE — 11 octobre 2026.

   Choix de Yéman au sélecteur : « Jamais : prénoms et initiales seulement ».
   Aucun numéro, aucune adresse e-mail, aucun nom complet de cliente ne part
   chez Anthropic. Une cliente se dit « Awa D. », jamais « Awa Dossou ».

   DEUX BARRIÈRES. Le Trône passe chaque texte ici avant l'envoi, avec la
   liste des clientes qu'il connaît (lui seul a les noms). La fonction
   `centre-de-commande` repasse ce qu'elle reçoit et ce qu'elle lit dans la
   base par `sansCoordonnees`, en copie entre ses repères : un numéro glissé
   par erreur ne part pas.

   MODULE PUR. */

/** Un numéro de téléphone : huit chiffres ou plus, avec ou sans indicatif,
    espaces, points ou tirets entre les groupes. Les montants et les dates du
    Trône (« 33 000 F », « 2026-10-11 ») ne sont pas des numéros : huit
    chiffres au moins, et pas de forme de date. */
const TELEPHONE = /(?:\+|00)?\d(?:[\s.\-]?\d){7,}/g;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const COURRIEL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

/** Les coordonnées retirées : chaque numéro devient « [numéro] », chaque
    adresse « [adresse] ». Le reste du texte ne bouge pas. */
export function sansCoordonnees(texte: string): string {
  return String(texte ?? '')
    .replace(COURRIEL, '[adresse]')
    .replace(TELEPHONE, (m) => (DATE_ISO.test(m.trim()) ? m : '[numéro]'));
}

export type Personne = { prenom?: string; nom?: string };

const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** « Awa D. » : le prénom, l'initiale du nom. Sans prénom, les initiales. */
export function prenomEtInitiale(p: Personne): string {
  const prenom = (p.prenom ?? '').trim();
  const nom = (p.nom ?? '').trim();
  const initiale = nom ? `${nom.charAt(0).toLocaleUpperCase('fr')}.` : '';
  if (prenom) return initiale ? `${prenom} ${initiale}` : prenom;
  return initiale;
}

/** Chaque nom complet connu devient prénom et initiale, dans les deux ordres
    où on l'écrit (« Awa Dossou », « DOSSOU Awa »), sans tenir compte de la
    casse. Les noms les plus longs passent d'abord, pour qu'un nom composé ne
    soit pas coupé par un plus court. */
export function nomsEnInitiales(texte: string, personnes: readonly Personne[]): string {
  let t = String(texte ?? '');
  const formes = personnes
    .filter((p) => (p.nom ?? '').trim().length > 1)
    .flatMap((p) => {
      const prenom = (p.prenom ?? '').trim();
      const nom = (p.nom ?? '').trim();
      const court = prenomEtInitiale(p);
      return prenom
        ? [{ motif: `${prenom} ${nom}`, court }, { motif: `${nom} ${prenom}`, court }]
        : [{ motif: nom, court }];
    })
    .sort((a, b) => b.motif.length - a.motif.length);
  for (const f of formes) {
    t = t.replace(new RegExp(`(^|[^\\p{L}])${echappe(f.motif)}(?=$|[^\\p{L}])`, 'giu'), (_m, avant: string) => `${avant}${f.court}`);
  }
  return t;
}

/** Les deux barrières à la fois, dans l'ordre : les noms, puis les numéros. */
export const pourClaude = (texte: string, personnes: readonly Personne[] = []): string =>
  sansCoordonnees(nomsEnInitiales(texte, personnes));

/** Un objet entier, champ par champ (les clés ne changent pas). */
export function objetPourClaude<T>(valeur: T, personnes: readonly Personne[] = []): T {
  if (typeof valeur === 'string') return pourClaude(valeur, personnes) as unknown as T;
  if (Array.isArray(valeur)) return valeur.map((v) => objetPourClaude(v, personnes)) as unknown as T;
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur as Record<string, unknown>).map(([k, v]) => [k, objetPourClaude(v, personnes)])) as T;
  }
  return valeur;
}
// ── FIN DE LA COPIE ──

// ── DÉBUT DE LA COPIE : src/shared/ia-budget-pur.ts ──
/* LE PLAFOND DES AGENTS — 11 octobre 2026.

   Choix de Yéman au sélecteur : les agents appellent Claude d'eux-mêmes
   (briefing du matin, lundi, vendredi, rapport du mois), « avec un plafond
   mensuel », 10 $ par mois. Au-delà, ils s'arrêtent et le disent.

   UNE ESTIMATION PRUDENTE. Le coût se calcule ici à partir des jetons que
   Claude rend à chaque appel, avec des prix RELEVÉS VERS LE HAUT : le
   compteur atteint le plafond avant la vraie facture, jamais après. La
   facture réelle se lit dans la console d'Anthropic.

   Le mois se compte à l'heure de Cotonou. MODULE PUR, copié entre repères
   dans la fonction `centre-de-commande`. */

export const PLAFOND_PAR_DEFAUT_USD = 10;

/** Dollars par million de jetons, entrée et sortie. Un modèle inconnu se
    compte au prix le plus haut de la table. */
export const PRIX_PAR_MILLION: Record<string, { entree: number; sortie: number }> = {
  'claude-sonnet-5-5': { entree: 3, sortie: 15 },
  'claude-haiku-4-5-20251001': { entree: 1, sortie: 5 },
  'claude-opus-5-5': { entree: 15, sortie: 75 },
  'claude-opus-4-8': { entree: 15, sortie: 75 },
};

const LE_PLUS_CHER = Object.values(PRIX_PAR_MILLION).reduce(
  (m, p) => ({ entree: Math.max(m.entree, p.entree), sortie: Math.max(m.sortie, p.sortie) }),
  { entree: 0, sortie: 0 },
);

/** Le coût d'un appel, en dollars, arrondi au centième de cent supérieur. */
export function coutDeLAppel(modele: string, jetonsEntree: number, jetonsSortie: number): number {
  const p = PRIX_PAR_MILLION[modele] ?? LE_PLUS_CHER;
  const brut = (Math.max(0, jetonsEntree) * p.entree + Math.max(0, jetonsSortie) * p.sortie) / 1_000_000;
  return Math.ceil(brut * 10_000) / 10_000;
}

/** « 2026-10 » : le mois à Cotonou. */
export function moisACotonou(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
  } catch {
    return d.toISOString().slice(0, 7);
  }
}

export type LigneDuCompteur = { usd: number; appels: number; entree: number; sortie: number };
export type Compteur = Record<string, LigneDuCompteur>;

export const depenseDuMois = (c: Compteur | null | undefined, mois: string): number => c?.[mois]?.usd ?? 0;

/** Un appel peut-il partir ? Le plafond se lit avant l'appel : à 10 $ pile,
    plus rien ne part. Un plafond absent ou abîmé vaut celui par défaut. */
export function peutAppeler(c: Compteur | null | undefined, mois: string, plafondUsd?: number): { oui: boolean; reste: number; plafond: number } {
  const plafond = Number.isFinite(plafondUsd) && (plafondUsd as number) > 0 ? (plafondUsd as number) : PLAFOND_PAR_DEFAUT_USD;
  const depense = depenseDuMois(c, mois);
  const reste = Math.max(0, Math.round((plafond - depense) * 10_000) / 10_000);
  return { oui: depense < plafond, reste, plafond };
}

/** Le compteur après un appel : une ligne par mois, rien d'autre ne bouge. */
export function compteurApres(c: Compteur | null | undefined, mois: string, modele: string, entree: number, sortie: number): Compteur {
  const avant = c?.[mois] ?? { usd: 0, appels: 0, entree: 0, sortie: 0 };
  return {
    ...(c ?? {}),
    [mois]: {
      usd: Math.round((avant.usd + coutDeLAppel(modele, entree, sortie)) * 10_000) / 10_000,
      appels: avant.appels + 1,
      entree: avant.entree + Math.max(0, entree),
      sortie: avant.sortie + Math.max(0, sortie),
    },
  };
}
// ── FIN DE LA COPIE ──

// ── DÉBUT DE LA COPIE : src/shared/ia-agents-pur.ts ──
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
    niveau: 'relecture', consigne: null,
    gardeFous: ['Jamais de prix en campagne', 'Ne publie rien sans validation'],
  },
  {
    id: 'journal', nom: 'Le Journal Maison MND', phase: 2,
    mission: 'Fonctionne comme une rédaction : idée, angle, recherche, plan, rédaction, vérification, édition, validation.',
    lit: ['Articles déjà publiés', 'Voix du site', 'Registre des photos'],
    produit: ['Sujets', 'Articles', 'Portraits', 'Dossiers'],
    niveau: 'relecture', consigne: null,
    gardeFous: ['Aucun fait inventé', 'Aucune cliente sur un article qui nomme un défaut'],
  },
  {
    id: 'photo', nom: 'Photo', phase: 2,
    mission: 'Prépare chaque séance : brief, concept, modèle, tenue, décor, lumière, liste des prises par format.',
    lit: ['Direction photo du site', 'Registre des accords'],
    produit: ['Brief de séance', 'Liste des prises'],
    niveau: 'relecture', consigne: null,
    gardeFous: ['Pas de photo publiée sans accord inscrit au registre', 'Aucun visage d’enfant sans l’accord du parent'],
  },
  {
    id: 'direction-artistique', nom: 'Direction artistique', phase: 2,
    mission: 'Tient la cohérence visuelle : couleurs, composition, lumière, tenues, typographie, planches de tendance.',
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
    niveau: 'relecture', consigne: null,
    gardeFous: ['Ne publie rien sans validation'],
  },
  {
    id: 'usine', nom: 'L’usine à contenus', phase: 2,
    mission: 'Tire d’un seul contenu tout ce qu’il peut donner : posts, stories, articles, messages.',
    lit: ['Contenus validés'],
    produit: ['Déclinaisons par format'],
    niveau: 'relecture', consigne: null,
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

/** En service, prêt, ou prévu : un agent de phase 1 est en service quand la
    fonction de l'orchestrateur répond ; avant, il est prêt. */
export function etatDeLAgent(a: Agent, fonctionPosee: boolean): 'en-service' | 'pret' | 'prevu' {
  if (a.phase > 1) return 'prevu';
  if (a.id === 'memoire') return 'en-service';
  return fonctionPosee ? 'en-service' : 'pret';
}
// ── FIN DE LA COPIE ──

// ── DÉBUT DE LA COPIE : src/shared/ia-memoire-pur.ts ──
/* LA MÉMOIRE DE LA MAISON — 11 octobre 2026.

   Cahier « Maison MND AI Operating System », § 18 : « L'IA ne doit jamais
   réinventer les informations déjà connues. Elle doit rechercher dans la
   mémoire avant de répondre ou de créer. »

   CE QUI EST ICI EST DÉJÀ VRAI AILLEURS. Chaque rubrique dit sa source, et
   le banc `verifie-le-centre-de-commande` relit ces sources : si la devise,
   le nom ou la palette changent là-bas, la mémoire crie avant de mentir.
   Les choix du 11 octobre 2026 (palette indigo, cuivre, ivoire ; devise
   « votre beauté est déjà là ») viennent de Yéman, au sélecteur, contre le
   cahier qui proposait l'or et le noir et « Vous êtes belle ».

   Les fondateurs ajoutent leurs propres notes au Trône (document
   `mnd_ia_memoire`) ; elles s'ajoutent à celle-ci, elles ne la réécrivent
   pas.

   MODULE PUR ET SANS IMPORT : la fonction `centre-de-commande` en porte une
   copie entre ses repères. */

export type Rubrique = { id: string; titre: string; source: string; faits: readonly string[] };

export const NOM_DE_LA_MAISON = 'Maison MND';
export const DEVISE_DE_LA_MAISON = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

export const PALETTE_DE_LA_MAISON: Record<string, string> = {
  indigo: '#1E2150',
  nuit: '#15173A',
  cuivre: '#B97A4A',
  'cuivre plein': '#9A6036',
  ivoire: '#F6F1E7',
  'sable cuivre': '#E7D7C2',
};

export const MEMOIRE: readonly Rubrique[] = [
  {
    id: 'marque', titre: 'La marque', source: 'src/shared/identite.ts ; choix du 11 octobre 2026',
    faits: [
      `Le nom est « ${NOM_DE_LA_MAISON} », toujours en entier dans une communication officielle ; « MND » seul n'est pas le nom de la Maison.`,
      `La devise est « ${DEVISE_DE_LA_MAISON} ». « Mi » dit vous et nous à la fois : la traduction est un choix, gardé tel quel.`,
      'Une maison béninoise, une maison boutique de soin et de transformation par les dreadlocks, à Cotonou.',
      'Contemporaine, raffinée, experte, accessible mais exclusive ; ancrée dans la culture béninoise, elle peut traverser les frontières et valorise la beauté des femmes (cahier du 11 octobre 2026).',
      'L’accroche du site : « Révélez ce que vous avez de plus beau. »',
    ],
  },
  {
    id: 'fondateurs', titre: 'Les fondateurs et l’histoire', source: 'src/apps/revelateur/contenu.ts (accueil, /brice-et-yeman/, /notre-histoire/)',
    faits: [
      'Brice et Yéman Ahouansou ont fondé la Maison ; ils en restent les directeurs et les seuls décideurs.',
      'Le savoir-faire est né sur une terrasse d’Akpakpa, à Cotonou ; la Maison existe depuis 2010.',
      'Le récit complet vit sur la page « Notre histoire » ; il ne se résume pas en publicité, et le mot « Kolétan » n’y sert jamais.',
    ],
  },
  {
    id: 'methode', titre: 'La méthode et les services', source: 'src/shared/catalog.ts ; src/apps/revelateur/contenu.ts',
    faits: [
      'Quatre temps : Purifier, Nourrir, Sceller, Couronner.',
      'Les portes : Première Couronne (création, par une consultation), Réparation (par une consultation), Entretien, Soins, MND Kids, Couronne à domicile, et l’Académie MND pour les formations.',
      'Les prix vivent au catalogue du Trône ; aucun agent n’en invente, et aucune campagne n’affiche de prix.',
    ],
  },
  {
    id: 'visuel', titre: 'L’identité visuelle', source: 'src/ds/tokens/colors.css ; CLAUDE.md ; choix du 11 octobre 2026',
    faits: [
      `La palette : ${Object.entries(PALETTE_DE_LA_MAISON).map(([n, h]) => `${n} ${h}`).join(', ')}.`,
      'Les surfaces sombres sont indigo, jamais l’obsidienne ni le noir profond ; le cuivre est un accent.',
      'Cormorant Garamond et Jost, aucun emoji, des coins de 2 à 4 px, des fondus sans rebond.',
      'Le verrou couché (pictogramme et MAISON MND) signe les documents ; il se compose, il ne se redessine pas.',
    ],
  },
  {
    id: 'ecriture', titre: 'Les règles d’écriture', source: 'mémoire des fondateurs ; docs/site-revelateur/decisions.md',
    faits: [
      'Jamais le mot « salon » : on dit « la Maison ».',
      'Pas de tiret cadratin dans un texte affiché ; une virgule à la place.',
      'Toujours l’année sur une date donnée à une cliente.',
      'Une cliente se nomme par sa civilité et son prénom (« Madame Awa ») ; « Madame » par défaut.',
      'Aucun fait, chiffre, témoignage ni disponibilité inventés.',
    ],
  },
  {
    id: 'images', titre: 'Les photos et les personnes', source: 'docs/site-revelateur/photos.md ; src/shared/droit-image.ts',
    faits: [
      'Aucune photo ne se publie sans l’accord inscrit au registre des photos.',
      'Aucune cliente n’illustre un article qui nomme un défaut des cheveux.',
      'Le visage d’un enfant demande l’accord écrit de son parent.',
    ],
  },
  {
    id: 'clientes', titre: 'Les données des clientes', source: 'choix du 11 octobre 2026 ; page « Politique de données »',
    faits: [
      'Aucun numéro, aucune adresse, aucun nom complet de cliente ne sort du Trône vers un agent : prénom et initiale seulement.',
      'Une demande sans suite s’efface après deux ans, une fiche cinq ans après la dernière venue ; les factures se gardent dix ans (OHADA).',
      'Prévenir au moins 24 heures avant pour déplacer un rendez-vous, sans frais.',
    ],
  },
  {
    id: 'maison', titre: 'La Maison, en droit et en contact', source: 'src/shared/registre.ts ; src/apps/revelateur/contenu.ts',
    faits: [
      'ETS « MAISON MND », RCCM RB/COT/26 A 120676 ; l’employeur reste ACIA 1 jusqu’à la bascule décidée avec le comptable.',
      'Site : maisonmnd.com ; courriel : contact@maisonmnd.com ; téléphone et WhatsApp : +229 01 51 99 77 99.',
    ],
  },
  {
    id: 'agents', titre: 'Les agents et leurs limites', source: 'cahier du 11 octobre 2026 ; choix de Yéman au sélecteur',
    faits: [
      'Yéman ou Brice valident ; un agent prépare, il ne décide pas.',
      'Ce qui est « décision humaine » (contrat, paiement, recrutement, identité, communication sensible) ne part jamais sans un fondateur.',
      'Les appels automatiques à Claude ont un plafond de 10 $ par mois ; au-delà, les agents s’arrêtent et le disent.',
      'Aucune intégration n’est simulée : ce qui n’est pas relié (Meta, TikTok, YouTube) se fait à la main.',
    ],
  },
];

/** La mémoire en texte, pour la consigne d'un agent, avec les notes des
    fondateurs à la suite. */
export function memoireEnTexte(notes: readonly { rubrique?: string; texte: string }[] = []): string {
  const base = MEMOIRE.map((r) => [`## ${r.titre}`, ...r.faits.map((f) => `- ${f}`)].join('\n')).join('\n\n');
  const ajouts = notes.filter((n) => n.texte.trim()).map((n) => `- ${n.rubrique ? `[${n.rubrique}] ` : ''}${n.texte.trim()}`);
  return ajouts.length ? `${base}\n\n## Notes des fondateurs\n${ajouts.join('\n')}` : base;
}
// ── FIN DE LA COPIE ──

// ── DÉBUT DE LA COPIE : src/shared/ia-faits-pur.ts ──
/* LES FAITS DU JOUR — 11 octobre 2026.

   Ce que le Centre de commande sait d'une journée, en chiffres, SANS AUCUN
   NOM : le nombre de rendez-vous et leurs heures, les demandes du site, ce
   qui attend un fondateur, l'encaissé du mois. Le Trône les calcule pour
   l'écran ; la fonction `centre-de-commande` les calcule aussi pour le
   briefing du matin, et c'est la même forme qu'elle envoie à Claude.

   LE BRIEFING DE BASE s'écrit ici, sans Claude : le Centre dit sa journée
   dès sa mise en ligne, même si la fonction n'est pas encore posée ou si le
   plafond du mois est atteint. Claude, quand il répond, y ajoute l'ordre
   des priorités et les propositions.

   MODULE PUR ET SANS IMPORT : copié entre repères dans la fonction. */

export type FaitsDuJour = {
  jour: string;
  rdv: { nombre: number; premiere?: string; derniere?: string };
  demandesNouvelles: number;
  envoisEnAttente?: number;
  encaisse?: { aCeJour: number; moisPrecedent?: number; projete?: number; depenses?: number; releveLe?: string };
  offres: { titre: string; remise: string; jusquau?: string }[];
  validationsEnAttente: number;
  tachesEnRetard: number;
  missionsOuvertes: number;
  /** Pour les rapports de la semaine et du mois : la période qu'ils couvrent. */
  periode?: { du: string; au: string; rdv: number; honores: number; annules: number; demandes: number };
};

/** « 2026-10-11 » : le jour à Cotonou, quel que soit le fuseau de l'appareil. */
export function jourDeCotonou(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Le jour `n` jours après (ou avant, si `n` est négatif). */
export function decaleLeJour(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « dimanche 11 octobre 2026 », « 1er » pour le premier du mois. */
export function jourEnClair(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const j = Number(m[3]);
  return `${JOURS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

/** « 9 h », « 18 h 30 ». */
export function heureEnClair(hhmm?: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  return Number(m[2]) ? `${Number(m[1])} h ${m[2]}` : `${Number(m[1])} h`;
}

/** « 1 245 000 F » : espaces insécables fines entre les milliers. */
export function francs(n: number): string {
  const entier = Math.round(Number.isFinite(n) ? n : 0);
  const signe = entier < 0 ? '-' : '';
  return `${signe}${String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Le briefing écrit sans Claude : une ligne par fait qui compte, dans
    l'ordre où l'on agit (ce qui attend un geste d'abord). */
export function briefingDeBase(f: FaitsDuJour): { titre: string; points: string[] } {
  const points: string[] = [];
  if (f.validationsEnAttente > 0) points.push(`${pluriel(f.validationsEnAttente, 'validation vous attend', 'validations vous attendent')} dans le Centre de commande.`);
  if (f.demandesNouvelles > 0) points.push(`${pluriel(f.demandesNouvelles, 'demande du site attend', 'demandes du site attendent')} une réponse.`);
  if (f.tachesEnRetard > 0) points.push(`${pluriel(f.tachesEnRetard, 'tâche a', 'tâches ont')} passé son échéance.`);
  if (f.rdv.nombre > 0) {
    const plage = f.rdv.premiere && f.rdv.derniere && f.rdv.premiere !== f.rdv.derniere
      ? `, de ${heureEnClair(f.rdv.premiere)} à ${heureEnClair(f.rdv.derniere)}`
      : f.rdv.premiere ? `, à ${heureEnClair(f.rdv.premiere)}` : '';
    points.push(`${pluriel(f.rdv.nombre, 'rendez-vous', 'rendez-vous')} aujourd’hui${plage}.`);
  } else {
    points.push('Aucun rendez-vous aujourd’hui.');
  }
  if (f.envoisEnAttente && f.envoisEnAttente > 0) points.push(`${pluriel(f.envoisEnAttente, 'message attend', 'messages attendent')} dans la salle des envois.`);
  if (f.encaisse) {
    const compare = f.encaisse.moisPrecedent !== undefined ? ` (le mois dernier au même jour : ${francs(f.encaisse.moisPrecedent)})` : '';
    points.push(`Encaissé ce mois à ce jour : ${francs(f.encaisse.aCeJour)}${compare}.`);
  }
  for (const o of f.offres.slice(0, 2)) points.push(`L’offre « ${o.titre} » (${o.remise}) court${o.jusquau ? ` jusqu’au ${jourEnClair(o.jusquau).replace(/^\S+ /, '')}` : ''}.`);
  if (f.periode) points.push(`Du ${jourEnClair(f.periode.du).replace(/^\S+ /, '')} au ${jourEnClair(f.periode.au).replace(/^\S+ /, '')} : ${pluriel(f.periode.rdv, 'rendez-vous', 'rendez-vous')}, dont ${f.periode.honores} honorés et ${f.periode.annules} annulés ; ${pluriel(f.periode.demandes, 'demande', 'demandes')} du site.`);
  if (f.missionsOuvertes > 0) points.push(`${pluriel(f.missionsOuvertes, 'mission est ouverte', 'missions sont ouvertes')}.`);
  return { titre: `Le briefing du ${jourEnClair(f.jour)}`, points };
}

/* ── Les tâches en retard et les missions ouvertes ───────────────────────── */
export type TacheResumee = { statut: string; echeance?: string; validation?: unknown };
export type MissionResumee = { statut: string; taches: readonly TacheResumee[] };

const TERMINEE = new Set(['faite', 'refusee', 'validee']);

export function comptesDesMissions(missions: readonly MissionResumee[], jour: string): { validations: number; retard: number; ouvertes: number } {
  let validations = 0, retard = 0, ouvertes = 0;
  for (const m of missions) {
    if (m.statut === 'terminee' || m.statut === 'abandonnee') continue;
    ouvertes += 1;
    for (const t of m.taches) {
      if (t.statut === 'a-valider' && !t.validation) validations += 1;
      if (t.echeance && t.echeance < jour && !TERMINEE.has(t.statut)) retard += 1;
    }
  }
  return { validations, retard, ouvertes };
}
// ── FIN DE LA COPIE ──

// ── DÉBUT DE LA COPIE : src/shared/ia-prompts-pur.ts ──
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
// ── FIN DE LA COPIE ──

// ── DÉBUT DE LA COPIE : src/shared/ia-relecture-pur.ts ──
/* LA RELECTURE DE CE QUE CLAUDE RENVOIE — 11 octobre 2026.

   Le schéma fixe la forme ; la relecture tient le reste, quoi que le modèle
   ait écrit : les longueurs, les nombres d'éléments, aucun tiret cadratin,
   aucune coordonnée, des agents et des genres qui existent, et surtout LE
   NIVEAU : une tâche garde le plus exigeant entre celui proposé et celui de
   son genre. Un modèle qui propose un contrat « automatique » ne l'obtient
   pas.

   MODULE PUR. La fonction `centre-de-commande` en porte une copie entre ses
   repères (ses imports sont des modules purs, copiés dans le même fichier). */

const propre = (v: unknown, max: number): string =>
  sansCoordonnees(String(v ?? ''))
    .replace(/\s*[—]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type Proposition = { texte: string; agent: string; genre: string; niveau: Niveau };
export type BriefingRelu = {
  titre: string;
  resume: string;
  priorites: { texte: string; pourquoi: string }[];
  alertes: { texte: string }[];
  propositions: Proposition[];
};

export function relisLeBriefing(brut: unknown, agents: readonly string[], genres: readonly string[]): BriefingRelu {
  const b = (brut ?? {}) as Record<string, unknown>;
  return {
    titre: propre(b.titre, 120),
    resume: propre(b.resume, 600),
    priorites: liste(b.priorites).slice(0, 5).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return { texte: propre(x.texte, 240), pourquoi: propre(x.pourquoi, 300) };
    }).filter((p) => p.texte),
    alertes: liste(b.alertes).slice(0, 4).map((a) => ({ texte: propre((a as Record<string, unknown>)?.texte, 240) })).filter((a) => a.texte),
    propositions: liste(b.propositions).slice(0, 5).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      const genre = genres.includes(String(x.genre)) ? String(x.genre) : 'brouillon';
      return {
        texte: propre(x.texte, 300),
        agent: agents.includes(String(x.agent)) ? String(x.agent) : 'orchestrateur',
        genre,
        niveau: niveauRetenu(genre, String(x.niveau)),
      };
    }).filter((p) => p.texte),
  };
}

export type TacheProposee = { titre: string; agent: string; genre: string; niveau: Niveau; echeanceJours: number; pourquoi: string };
export type MissionRelue = { titre: string; objectif: string; taches: TacheProposee[]; questions: string[] };

export function relisLaMission(brut: unknown, agents: readonly string[], genres: readonly string[]): MissionRelue {
  const b = (brut ?? {}) as Record<string, unknown>;
  return {
    titre: propre(b.titre, 120),
    objectif: propre(b.objectif, 400),
    taches: liste(b.taches).slice(0, 12).map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      /* Un genre inconnu vaut une relecture : on ne devine pas vers le bas. */
      const genre = genres.includes(String(x.genre)) ? String(x.genre) : 'concept';
      const jours = Math.round(Number(x.echeanceJours));
      return {
        titre: propre(x.titre, 200),
        agent: agents.includes(String(x.agent)) ? String(x.agent) : 'orchestrateur',
        genre,
        niveau: niveauRetenu(genre, String(x.niveau)),
        echeanceJours: Number.isFinite(jours) ? Math.min(120, Math.max(0, jours)) : 7,
        pourquoi: propre(x.pourquoi, 300),
      };
    }).filter((t) => t.titre),
    questions: liste(b.questions).slice(0, 3).map((q) => propre(q, 240)).filter(Boolean),
  };
}
// ── FIN DE LA COPIE ──

/* ── Qui appelle ─────────────────────────────────────────────────────────── */

/** Égalité à temps constant ; une chaîne vide n'est égale à rien. */
const memeSecret = (a: string, b: string): boolean => {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Le cron (par `appelle_fonction_edge`, qui porte la clé service). */
const porteLaCleService = (req: Request): boolean => {
  const recu = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return [Deno.env.get('CLE_SERVICE'), Deno.env.get('SERVICE_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .some((cle) => memeSecret(recu, (cle ?? '').trim()));
};

/** Un fondateur connecté : un compte du personnel au rôle `souverain`. */
async function fondateurDe(req: Request): Promise<{ uid: string; nom: string } | null> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  const uid = data?.user?.id;
  if (!uid) return null;
  const { data: ligne } = await admin.from('staff').select('user_id,name,role').eq('user_id', uid).maybeSingle();
  if (!ligne || (ligne as { role?: string }).role !== 'souverain') return null;
  return { uid, nom: String((ligne as { name?: string }).name ?? 'Fondateur') };
}

/* ── Les documents ──────────────────────────────────────────────────────── */
async function lisLeDocument<T>(cle: string, defaut: T): Promise<T> {
  const { data } = await admin.from('documents').select('data').eq('key', cle).maybeSingle();
  const v = (data as { data?: unknown } | null)?.data;
  return (v === null || v === undefined ? defaut : v) as T;
}

async function ecrisLeDocument(cle: string, valeur: unknown): Promise<void> {
  const { error } = await admin.from('documents').upsert({ key: cle, data: valeur });
  if (error) throw new Error(`document ${cle} : ${error.message}`);
}

type LigneDeJournal = { id: string; quand: string; qui: string; quoi: string; pourquoi?: string; entree?: string; sortie?: string; statut: 'ok' | 'refus' | 'erreur'; erreur?: string };

/** Le journal de la fonction : qui, quoi, quand, pourquoi, entrée, sortie,
    statut, erreur. Il ne vit que dans son document, que le Trône ne touche pas. */
async function journalise(l: Omit<LigneDeJournal, 'id' | 'quand'>): Promise<void> {
  try {
    const avant = await lisLeDocument<LigneDeJournal[]>('mnd_ia_journal_serveur', []);
    const ligne: LigneDeJournal = { id: crypto.randomUUID().slice(0, 12), quand: new Date().toISOString(), ...l };
    await ecrisLeDocument('mnd_ia_journal_serveur', [ligne, ...(Array.isArray(avant) ? avant : [])].slice(0, 400));
  } catch (e) {
    console.error('[centre-de-commande] journal', String(e));
  }
}

/* ── La notification des fondateurs ─────────────────────────────────────── */
async function previensLesFondateurs(titre: string, corps: string): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  const { data: staff } = await admin.from('staff').select('user_id,role').eq('role', 'souverain');
  const ids = (staff ?? []).map((s: { user_id: string }) => s.user_id);
  if (ids.length === 0) return 0;
  const { data: abonnements } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth,client_id').in('client_id', ids);
  let n = 0;
  for (const s of abonnements ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ url: '/trone/#/centre-de-commande', title: titre, body: corps, tag: 'mnd-centre' }),
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

/* ── Les faits, lus dans la base, sans aucun nom ────────────────────────── */
type Rdv = { date?: string; time?: string; status?: string };

async function rdvEntre(du: string, au: string): Promise<Rdv[]> {
  const { data, error } = await admin.from('appointments').select('data').gte('data->>date', du).lte('data->>date', au).limit(1000);
  if (error) throw new Error(`rendez-vous : ${error.message}`);
  return (data ?? []).map((l: { data: Rdv }) => l.data ?? {});
}

async function lesFaits(jour: string, genre: GenreDeBriefing): Promise<FaitsDuJour> {
  const duJour = (await rdvEntre(jour, jour)).filter((r) => r.status !== 'annulé');
  const heures = duJour.map((r) => String(r.time ?? '')).filter((h) => /^\d{1,2}:\d{2}/.test(h)).sort();

  const { data: demandes } = await admin.from('demandes').select('data').eq('data->>statut', 'nouvelle').limit(1000);
  const nouvelles = (demandes ?? []).filter((l: { data?: { archiveeLe?: string } }) => !l.data?.archiveeLe).length;

  const { count: envois } = await admin.from('envois').select('id', { count: 'exact', head: true }).eq('data->>statut', 'en-attente');

  type OffreBrute = { title?: string; deal?: string; active?: boolean; du?: string; au?: string };
  const offresBrutes = await lisLeDocument<OffreBrute[]>('mnd_offers', []);
  const offres = (Array.isArray(offresBrutes) ? offresBrutes : [])
    .filter((o) => o && o.active && (o.du || o.au) && (!o.du || jour >= o.du) && (!o.au || jour <= o.au))
    .map((o) => ({ titre: sansCoordonnees(String(o.title ?? '')), remise: String(o.deal ?? ''), jusquau: o.au }));

  const missions = await lisLeDocument<MissionResumee[]>('mnd_ia_missions', []);
  const comptes = comptesDesMissions(Array.isArray(missions) ? missions : [], jour);

  /* L'ARGENT SE LIT, IL NE SE RECALCULE PAS : le Trône note l'encaissé du
     mois quand un fondateur ouvre le Centre ; on le reprend tel quel, avec
     son heure, et seulement s'il est du mois en cours. */
  type Releve = { releveLe?: string; jour?: string; encaisse?: FaitsDuJour['encaisse'] };
  const releve = await lisLeDocument<Releve | null>('mnd_ia_etat', null);
  const encaisse = releve?.encaisse && releve.jour && releve.jour.slice(0, 7) === jour.slice(0, 7)
    ? { ...releve.encaisse, releveLe: releve.releveLe }
    : undefined;

  const faits: FaitsDuJour = {
    jour,
    rdv: { nombre: duJour.length, premiere: heures[0], derniere: heures[heures.length - 1] },
    demandesNouvelles: nouvelles,
    envoisEnAttente: envois ?? 0,
    encaisse,
    offres,
    validationsEnAttente: comptes.validations,
    tachesEnRetard: comptes.retard,
    missionsOuvertes: comptes.ouvertes,
  };

  /* La période d'un rapport : la semaine qui vient le lundi, la semaine
     écoulée le vendredi, le mois écoulé le premier du mois. */
  if (genre !== 'matin') {
    const du = genre === 'lundi' ? jour : genre === 'vendredi' ? decaleLeJour(jour, -6) : `${decaleLeJour(jour, -1).slice(0, 7)}-01`;
    const au = genre === 'lundi' ? decaleLeJour(jour, 6) : genre === 'vendredi' ? jour : decaleLeJour(jour, -1);
    const rdv = await rdvEntre(du, au);
    const { data: dem } = await admin.from('demandes').select('data').gte('data->>createdAt', `${du}T00:00:00`).lte('data->>createdAt', `${au}T23:59:59`).limit(1000);
    faits.periode = {
      du, au,
      rdv: rdv.filter((r) => r.status !== 'annulé').length,
      honores: rdv.filter((r) => r.status === 'honoré').length,
      annules: rdv.filter((r) => r.status === 'annulé').length,
      demandes: (dem ?? []).length,
    };
  }
  return faits;
}

/* ── L'appel à Claude, avec le plafond ──────────────────────────────────── */
type Reglages = { plafondUsd?: number; automatique?: boolean; notifier?: boolean };

class Plafond extends Error {}

async function demandeAClaude(systeme: string, message: string, schema: unknown): Promise<{ brut: unknown; modele: string; cout: number }> {
  const reglages = await lisLeDocument<Reglages>('mnd_ia_reglages', {});
  const mois = moisACotonou();
  const compteur = await lisLeDocument<Compteur>('mnd_ia_compteur', {});
  const permis = peutAppeler(compteur, mois, reglages.plafondUsd);
  if (!permis.oui) throw new Plafond(`Le plafond du mois (${permis.plafond} $) est atteint : les agents se sont arrêtés jusqu'au mois prochain.`);
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manque dans les secrets.');

  let derniere = '';
  for (const modele of MODELES) {
    try {
      const reponse = await anthropic.messages.create({
        model: modele,
        max_tokens: 4000,
        system: systeme,
        output_config: { format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content: message }],
      } as never);
      const r = reponse as unknown as { stop_reason?: string; content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number } };
      const cout = coutDeLAppel(modele, r.usage.input_tokens, r.usage.output_tokens);
      /* Le coût se compte même si la réponse est inutilisable : il est dû. */
      await ecrisLeDocument('mnd_ia_compteur', compteurApres(await lisLeDocument<Compteur>('mnd_ia_compteur', {}), mois, modele, r.usage.input_tokens, r.usage.output_tokens));
      if (r.stop_reason === 'refusal') throw new Error('Claude a préféré ne pas répondre.');
      const texte = r.content.find((b) => b.type === 'text')?.text ?? '';
      try { return { brut: JSON.parse(texte), modele, cout }; } catch { throw new Error('Réponse illisible, réessayez.'); }
    } catch (e) {
      const x = e as { status?: number; message?: string; error?: { error?: { message?: string } } };
      derniere = `${x?.status ?? ''} ${x?.error?.error?.message ?? x?.message ?? String(e)}`.trim().slice(0, 300);
      if (x?.status === 404 || (x?.status === 400 && /model/i.test(derniere))) continue;
      throw new Error(derniere);
    }
  }
  throw new Error(derniere || 'Aucun modèle disponible.');
}

/* ── Les modes ──────────────────────────────────────────────────────────── */
type BriefingRange = { id: string; genre: GenreDeBriefing; jour: string; creeLe: string; source: 'auto' | 'clic'; modele: string; consigne: string; cout: number; sortie: BriefingRelu };

async function leBriefing(genre: GenreDeBriefing, source: 'auto' | 'clic', qui: string): Promise<Response> {
  const reglages = await lisLeDocument<Reglages>('mnd_ia_reglages', {});
  if (source === 'auto' && reglages.automatique === false) {
    await journalise({ qui: 'orchestrateur', quoi: `${TITRE_DU_GENRE[genre]} : non écrit`, pourquoi: 'Le mode automatique est coupé au Trône.', statut: 'refus' });
    return json({ ok: true, ecrit: false, raison: 'automatique coupé' });
  }
  const jour = jourDeCotonou();
  const ranges = await lisLeDocument<BriefingRange[]>('mnd_ia_briefings', []);
  const deja = (Array.isArray(ranges) ? ranges : []).some((b) => b.genre === genre && b.jour === jour && b.source === 'auto');
  if (source === 'auto' && deja) return json({ ok: true, ecrit: false, raison: 'déjà écrit aujourd’hui' });

  const faits = await lesFaits(jour, genre);
  const notes = await lisLeDocument<{ rubrique?: string; texte?: string }[]>('mnd_ia_memoire', []);
  const memoire = memoireEnTexte((Array.isArray(notes) ? notes : []).map((n) => ({ rubrique: n.rubrique, texte: sansCoordonnees(String(n.texte ?? '')) })));
  const consigne = CONSIGNES.MND_ORCHESTRATEUR_BRIEFING_v1;
  const base = briefingDeBase(faits);
  const message = [
    `Rapport demandé : ${TITRE_DU_GENRE[genre]}.`,
    `Jour : ${jourEnClair(jour)}.`,
    '',
    'Les faits (JSON, sans aucun nom) :',
    JSON.stringify(faits, null, 1),
    '',
    'Le briefing de base, déjà écrit sans vous :',
    ...base.points.map((p) => `- ${p}`),
    '',
    'Les agents et leur phase (un agent d’une phase à venir peut recevoir une proposition, elle attendra) :',
    ...AGENTS.map((a) => `- ${a.id} (phase ${a.phase}) : ${a.mission}`),
    '',
    'Écrivez le briefing.',
  ].join('\n');

  try {
    const { brut, modele, cout } = await demandeAClaude(systemePour(consigne, memoire), message, schemaDuBriefing(IDS_DES_AGENTS, GENRES));
    const sortie = relisLeBriefing(brut, IDS_DES_AGENTS, GENRES);
    const b: BriefingRange = { id: crypto.randomUUID().slice(0, 12), genre, jour, creeLe: new Date().toISOString(), source, modele, consigne: consigne.id, cout, sortie };
    const avant = await lisLeDocument<BriefingRange[]>('mnd_ia_briefings', []);
    await ecrisLeDocument('mnd_ia_briefings', [b, ...(Array.isArray(avant) ? avant : [])].slice(0, 60));
    await journalise({ qui, quoi: `${TITRE_DU_GENRE[genre]} écrit`, entree: `${faits.rdv.nombre} rdv, ${faits.demandesNouvelles} demandes, ${faits.validationsEnAttente} validations`, sortie: sortie.titre, statut: 'ok' });
    if (reglages.notifier !== false) await previensLesFondateurs('Maison MND', `${TITRE_DU_GENRE[genre]} est prêt dans le Centre de commande.`);
    return json({ ok: true, ecrit: true, briefing: b });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await journalise({ qui, quoi: `${TITRE_DU_GENRE[genre]} non écrit`, statut: e instanceof Plafond ? 'refus' : 'erreur', erreur: m });
    return json({ error: e instanceof Plafond ? 'plafond' : 'upstream', detail: m }, e instanceof Plafond ? 429 : 502);
  }
}

async function laMission(objectif: string, qui: string): Promise<Response> {
  const propre = sansCoordonnees(objectif).slice(0, 1200).trim();
  if (propre.length < 8) return json({ error: 'bad request', detail: 'L’objectif est trop court.' }, 400);
  const jour = jourDeCotonou();
  const notes = await lisLeDocument<{ rubrique?: string; texte?: string }[]>('mnd_ia_memoire', []);
  const memoire = memoireEnTexte((Array.isArray(notes) ? notes : []).map((n) => ({ rubrique: n.rubrique, texte: sansCoordonnees(String(n.texte ?? '')) })));
  const consigne = CONSIGNES.MND_ORCHESTRATEUR_MISSION_v1;
  const message = [
    `Jour : ${jourEnClair(jour)}.`,
    '',
    'Les agents de la Maison :',
    ...AGENTS.map((a) => `- ${a.id} (phase ${a.phase}, ${a.nom}) : ${a.mission}`),
    '',
    'Les genres de tâche et leur niveau minimum :',
    ...GENRES.map((g) => `- ${g} : ${NIVEAU_MINIMUM[g]}`),
    '',
    `L’objectif donné par ${qui.split(' ')[0]} :`,
    propre,
    '',
    'Découpez-le.',
  ].join('\n');
  try {
    const { brut, modele, cout } = await demandeAClaude(systemePour(consigne, memoire), message, schemaDeLaMission(IDS_DES_AGENTS, GENRES));
    const mission = relisLaMission(brut, IDS_DES_AGENTS, GENRES);
    await journalise({ qui, quoi: 'Mission découpée', entree: propre.slice(0, 300), sortie: `${mission.titre} (${mission.taches.length} tâches, ${modele}, ${cout} $)`, statut: 'ok' });
    return json({ ok: true, mission, consigne: consigne.id });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await journalise({ qui, quoi: 'Mission non découpée', entree: propre.slice(0, 300), statut: e instanceof Plafond ? 'refus' : 'erreur', erreur: m });
    return json({ error: e instanceof Plafond ? 'plafond' : 'upstream', detail: m }, e instanceof Plafond ? 429 : 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const corps = await req.json().catch(() => ({} as Record<string, unknown>));
  const mode = String(corps.mode ?? '');
  const service = porteLaCleService(req);
  const fondateur = service ? null : await fondateurDe(req);
  if (!service && !fondateur) return json({ error: 'forbidden' }, 403);

  try {
    if (mode === 'etat') {
      const reglages = await lisLeDocument<Reglages>('mnd_ia_reglages', {});
      const mois = moisACotonou();
      const compteur = await lisLeDocument<Compteur>('mnd_ia_compteur', {});
      const p = peutAppeler(compteur, mois, reglages.plafondUsd);
      return json({ ok: true, mois, depense: depenseDuMois(compteur, mois), plafond: p.plafond });
    }
    if (mode === 'briefing') {
      const genre = (GENRES_DE_BRIEFING as readonly string[]).includes(String(corps.genre)) ? (String(corps.genre) as GenreDeBriefing) : 'matin';
      return await leBriefing(genre, service ? 'auto' : 'clic', service ? 'orchestrateur' : fondateur!.nom);
    }
    if (mode === 'mission') {
      /* Une mission se demande d'un clic, par un fondateur : le cron n'en lance pas. */
      if (!fondateur) return json({ error: 'forbidden' }, 403);
      return await laMission(String(corps.objectif ?? ''), fondateur.nom);
    }
    return json({ error: 'bad request', detail: 'Mode inconnu.' }, 400);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[centre-de-commande]', mode, m);
    await journalise({ qui: service ? 'orchestrateur' : fondateur?.nom ?? '?', quoi: `Échec du mode ${mode}`, statut: 'erreur', erreur: m });
    return json({ error: 'upstream', detail: m }, 502);
  }
});
