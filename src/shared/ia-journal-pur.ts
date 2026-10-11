import { peutValider, type Validation } from './ia-validation-pur';
import { NOMME_UN_DEFAUT, bloquant, relisLesChamps, type Remarque } from './ia-marque-pur';

/* LE JOURNAL MAISON MND, LA RÉDACTION — 11 octobre 2026 (phase 2).

   Cahier § 11 : le Journal fonctionne comme une rédaction. Idée, angle,
   recherche, plan, rédaction, vérification des faits, édition, direction
   artistique, validation, publication.

   UN ARTICLE DE L'ATELIER S'ÉCRIT DANS LA FORME EXACTE DU SITE : l'en-tête
   (titre, slug, date, description, parcours, image, portrait, mots-clés), le
   titre en « # », les parties en « ## », la dernière partie « Et
   maintenant », et la dernière ligne, le bouton. Le générateur du site le
   lit tel quel (`litArticle`, scripts/genere-revelateur.mjs). La mise en
   ligne passe par une publication du site : l'atelier rend le texte prêt,
   il ne publie rien.

   MODULE PUR. */

export type Etape = 'idee' | 'angle' | 'recherche' | 'plan' | 'redaction' | 'verification' | 'edition' | 'direction-artistique' | 'validation' | 'publication';

export const ETAPES: readonly { id: Etape; nom: string; dit: string }[] = [
  { id: 'idee', nom: 'Idée', dit: 'Le sujet, en une phrase.' },
  { id: 'angle', nom: 'Angle', dit: 'Ce que l’article dit que les autres ne disent pas.' },
  { id: 'recherche', nom: 'Recherche', dit: 'Ce que la Maison sait, et ce qu’il faut vérifier.' },
  { id: 'plan', nom: 'Plan', dit: 'Les parties, dans l’ordre où on les lit.' },
  { id: 'redaction', nom: 'Rédaction', dit: 'Le texte, dans la voix de la Maison.' },
  { id: 'verification', nom: 'Vérification', dit: 'Chaque fait relu, chaque chiffre sourcé.' },
  { id: 'edition', nom: 'Édition', dit: 'Plus court, plus clair, sans tiret cadratin.' },
  { id: 'direction-artistique', nom: 'Direction artistique', dit: 'La photo, la vignette, l’accord inscrit.' },
  { id: 'validation', nom: 'Validation', dit: 'Yéman ou Brice.' },
  { id: 'publication', nom: 'Publication', dit: 'Le texte prêt pour le site.' },
];

export type Parcours = 'premiere-couronne' | 'reparation' | 'entretien' | 'mnd-kids';
export const PARCOURS: Record<Parcours, { nom: string; bouton: string }> = {
  'premiere-couronne': { nom: 'Première Couronne', bouton: 'Réserver ma consultation' },
  reparation: { nom: 'Réparation', bouton: 'Diagnostiquer ma couronne' },
  entretien: { nom: 'Entretien', bouton: 'Réserver mon entretien' },
  'mnd-kids': { nom: 'MND Kids', bouton: 'Organiser notre visite' },
};

export type Article = {
  id: string;
  etape: Etape;
  titre: string;
  slug: string;
  description: string;
  parcours: Parcours;
  motsCles: string[];
  image: string;
  portrait: string;
  angle: string;
  plan: string[];
  corps: string;
  aVerifier: { fait: string; verifie: boolean }[];
  validation?: Validation;
  consigne?: string;
  creeLe: string;
};

/** « Comment laver ses locks ? » → « comment-laver-ses-locks ». */
export function slugDe(titre: string): string {
  return String(titre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

export function nouvelArticle(o: { id: string; titre: string; maintenant: string }): Article {
  return {
    id: o.id, etape: 'idee', titre: o.titre.trim(), slug: slugDe(o.titre), description: '', parcours: 'entretien', motsCles: [],
    image: '', portrait: '', angle: '', plan: [], corps: '', aVerifier: [], creeLe: o.maintenant,
  };
}

/** Le texte de l'article tel que le site le lit, dans la forme exacte des
    fichiers de docs/site-revelateur/journal/. */
export function articleEnMarkdown(a: Article, date: string): string {
  const guillemets = (t: string) => `"${t.replace(/"/g, '\'')}"`;
  const tete = [
    '---',
    `titre: ${guillemets(a.titre)}`,
    `slug: ${a.slug || slugDe(a.titre)}`,
    `date: ${date}`,
    `description: ${guillemets(a.description)}`,
    `parcours: ${a.parcours}`,
    `image: ${a.image}`,
    ...(a.portrait ? [`portrait: ${a.portrait}`] : []),
    'motsCles:',
    ...a.motsCles.map((m) => `  - ${m}`),
    '---',
  ];
  const corps = a.corps.trim().replace(/^# .*\n+/, '');
  const fin = /\n## Et maintenant\n/.test(`\n${corps}\n`) ? '' : `\n\n## Et maintenant\n\nLe parcours qui correspond à cet article vous attend.\n\n${PARCOURS[a.parcours].bouton}`;
  return `${tete.join('\n')}\n\n# ${a.titre}\n\n${corps}${fin}\n`;
}

/** Ce qui manque à un article pour passer à la validation. */
export function avantLaValidation(a: Article): string[] {
  const manque: string[] = [];
  if (!a.titre.trim()) manque.push('Un titre.');
  if (a.description.trim().length < 60) manque.push('Une description d’au moins 60 signes (elle sert à Google).');
  if (a.motsCles.length < 3) manque.push('Au moins trois mots-clés.');
  if (!a.image) manque.push('Une image, inscrite au registre des photos.');
  if (a.corps.trim().split(/\s+/).length < 300) manque.push('Un texte d’au moins 300 mots.');
  if (a.aVerifier.some((f) => !f.verifie)) manque.push('Des faits restent à vérifier.');
  if (a.portrait && NOMME_UN_DEFAUT.test(a.titre)) manque.push('Une cliente ne va pas sur un article qui nomme un défaut : retirer le portrait.');
  return manque;
}

/** Un article est une page du site : aucun prix chiffré n'y figure (décision
    du 11 octobre 2026, les prix restent à la réservation). */
export const remarquesDeLArticle = (a: Pick<Article, 'titre' | 'description' | 'corps'>): Remarque[] =>
  relisLesChamps([{ texte: a.titre, campagne: true }, { texte: a.description, campagne: true }, { texte: a.corps, campagne: true }]);

/** Valider un article : un fondateur, à l'étape de la validation, rien ne
    manque, aucune faute qui bloque. L'écran grise le bouton ; la règle tient
    aussi sans l'écran. */
export function peutValiderLArticle(a: Article, role?: string): { ok: true } | { ok: false; pourquoi: string } {
  if (!peutValider(role)) return { ok: false, pourquoi: 'Seuls Yéman et Brice valident.' };
  if (a.etape !== 'validation') return { ok: false, pourquoi: 'L’article arrive à l’étape de la validation d’abord.' };
  const manque = avantLaValidation(a);
  if (manque.length) return { ok: false, pourquoi: `Il manque : ${manque.join(' ')}` };
  const r = remarquesDeLArticle(a);
  if (bloquant(r)) return { ok: false, pourquoi: `À corriger d’abord : ${r.filter((x) => x.gravite === 'bloque').map((x) => x.dit).join(' ')}` };
  return { ok: true };
}

/** Ce que le site affiche d'un article : un article validé dont l'un de ces
    champs change revient à l'étape de la validation, sans sa validation. */
export const CHAMPS_DE_L_ARTICLE: readonly (keyof Article)[] = ['titre', 'slug', 'description', 'parcours', 'motsCles', 'image', 'portrait', 'corps'];

export function articleApresLeChangement(avant: Article, champs: Partial<Article>): Article {
  const touche = CHAMPS_DE_L_ARTICLE.some((k) => k in champs && JSON.stringify(champs[k]) !== JSON.stringify(avant[k]));
  const revient = avant.validation?.verdict === 'oui' && !('etape' in champs) && touche;
  return { ...avant, ...champs, ...(revient ? { etape: 'validation' as Etape, validation: undefined } : {}) };
}
