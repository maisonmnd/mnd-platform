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
