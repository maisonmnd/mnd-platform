/* LE QUIZ DE LA MAISON — les mots, partagés par les deux surfaces.

   Le miroir du salon (Vitrine du Trône) et le tunnel de réservation (Ma
   Couronne) posent LES MÊMES questions et nomment LES MÊMES envies : une
   cliente qui répond « L'éclat » devant le fauteuil doit retrouver l'éclat sur
   son téléphone, sous le même nom. Deux jeux de mots, c'étaient deux maisons.

   Ce que le quiz PROPOSE en face, lui, ne vit pas ici : il se désigne au
   catalogue depuis la Régie (`VitrineConfig.recoParEnvie`). Ici, rien qui ait
   un prix. */

/** L'ADRESSE DE LA MAISON. Le miroir posé devant le fauteuil TUTOIE — la
    maîtresse est là, elle parle. L'application VOUVOIE — c'est la Maison qui
    écrit à une cliente chez elle. Même question, deux voix. */
export type Adresse = 'tu' | 'vous';
export type Phrase = Record<Adresse, string>;

export type EnvieKey = 'longueur' | 'eclat' | 'protection' | 'transformation';
export type ElanKey = 'garder' | 'oser' | 'surprise';

/* LES QUATRE ENVIES. Ne restent que les mots — ce que la Maison dit en
   proposant, et qui n'a pas de prix. */
export const ENVIES: { k: EnvieKey; label: string; line: Phrase }[] = [
  {
    k: 'longueur',
    label: 'La longueur',
    line: {
      tu: 'On nourrit la racine — c’est là que la longueur se gagne.',
      vous: 'On nourrit la racine — c’est là que la longueur se gagne.',
    },
  },
  {
    k: 'eclat',
    label: 'L’éclat',
    line: {
      tu: 'Une lumière posée sur ta couronne, rien que pour la faire chanter.',
      vous: 'Une lumière posée sur votre couronne, rien que pour la faire chanter.',
    },
  },
  {
    k: 'protection',
    label: 'La protection',
    line: {
      tu: 'On protège ce que tu as bâti, mèche après mèche.',
      vous: 'On protège ce que vous avez bâti, mèche après mèche.',
    },
  },
  {
    k: 'transformation',
    label: 'Le changement',
    line: {
      tu: 'Le grand passage — une œuvre qui change tout.',
      vous: 'Le grand passage — une œuvre qui change tout.',
    },
  },
];

export const envieLabel = (k: string | undefined): string | undefined =>
  ENVIES.find((e) => e.k === k)?.label;

export type QuizVariante = {
  q1: Phrase;
  q1opts: [EnvieKey, string][];
  q2: Phrase;
  q2opts: [ElanKey, string][];
};

/* Trois jeux de questions, à rotation : deux visites de suite ne posent pas
   exactement les mêmes mots. Les réponses, elles, retombent toujours sur les
   quatre mêmes envies — c'est la question qui varie, jamais la clé. */
export const QUIZ_POOL: QuizVariante[] = [
  {
    q1: {
      tu: 'Aujourd’hui, qu’est-ce qui compte le plus pour toi ?',
      vous: 'Aujourd’hui, qu’est-ce qui compte le plus pour vous ?',
    },
    q1opts: [['longueur', 'La longueur'], ['eclat', 'L’éclat'], ['protection', 'La protection'], ['transformation', 'Le changement']],
    q2: {
      tu: 'Et pour la suite, tu te verrais bien…',
      vous: 'Et pour la suite, vous vous verriez bien…',
    },
    q2opts: [['garder', 'Garder ma ligne'], ['oser', 'Oser plus grand'], ['surprise', 'Me faire surprendre']],
  },
  {
    q1: {
      tu: 'Si ta couronne pouvait parler, elle réclamerait…',
      vous: 'Si votre couronne pouvait parler, elle réclamerait…',
    },
    q1opts: [['longueur', 'De pousser encore'], ['eclat', 'De briller plus'], ['protection', 'D’être protégée'], ['transformation', 'De tout changer']],
    q2: {
      tu: 'Ton humeur du moment, c’est plutôt…',
      vous: 'Votre humeur du moment, c’est plutôt…',
    },
    q2opts: [['garder', 'La continuité'], ['oser', 'L’audace'], ['surprise', 'La surprise']],
  },
  {
    q1: {
      tu: 'Ce mois-ci, ton geste beauté prioritaire…',
      vous: 'Ce mois-ci, votre geste beauté prioritaire…',
    },
    q1opts: [['longueur', 'Gagner en longueur'], ['eclat', 'Raviver l’éclat'], ['protection', 'Fortifier'], ['transformation', 'Réinventer']],
    q2: {
      tu: 'Pour ta prochaine venue, tu aimerais…',
      vous: 'Pour votre prochaine venue, vous aimeriez…',
    },
    q2opts: [['garder', 'Rester fidèle à mon style'], ['oser', 'Voir plus grand'], ['surprise', 'Qu’on me guide']],
  },
];
