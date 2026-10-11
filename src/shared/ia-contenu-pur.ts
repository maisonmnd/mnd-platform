import { pasPermis, peutValider, type StatutDeContenu, type Validation } from './ia-validation-pur';
import { bloquant, relisLesChamps, type Remarque } from './ia-marque-pur';

/* L'ATELIER DES CONTENUS, LES RÈGLES — 11 octobre 2026 (phase 2).

   Cahier « Maison MND AI Operating System », § 9 à 16 : un calendrier
   éditorial (date, plateforme, objectif, pilier, sujet, format, accroche,
   légende, appel, visuel, statut, publication, résultat), dix piliers, et
   des statuts qui ne sautent jamais la validation :
   brouillon › à relire › validé › programmé › publié › analysé › optimisé.

   CE QUI N'EST PAS RELIÉ SE FAIT À LA MAIN, ET SE DIT. Meta n'est pas relié :
   « programmé » veut dire « date et heure arrêtées », « publié » se coche
   après l'avoir fait, avec le lien. Aucune publication automatique.

   MODULE PUR. */

export type Plateforme = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'whatsapp' | 'linkedin' | 'site' | 'journal';
export const PLATEFORMES: Record<Plateforme, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', whatsapp: 'WhatsApp', linkedin: 'LinkedIn', site: 'Site', journal: 'Journal',
};

export type Format = 'post' | 'carrousel' | 'reel' | 'story' | 'video-longue' | 'document' | 'article' | 'statut-whatsapp' | 'newsletter' | 'bilan';
export const FORMATS: Record<Format, string> = {
  post: 'Publication', carrousel: 'Carrousel', reel: 'Reel', story: 'Story', 'video-longue': 'Vidéo longue', document: 'Document',
  article: 'Article', 'statut-whatsapp': 'Statut WhatsApp', newsletter: 'Lettre', bilan: 'Revue des chiffres',
};

/* ── Les dix piliers (cahier § 10) ───────────────────────────────────────── */
export type PilierId = 'expertise' | 'beaute' | 'histoire' | 'culture' | 'clientes' | 'coulisses' | 'education' | 'lifestyle' | 'offres' | 'journal';
export type Pilier = { id: PilierId; nom: string; dit: string; garde?: string };
export const PILIERS: readonly Pilier[] = [
  { id: 'expertise', nom: 'Expertise', dit: 'Dreadlocks, entretien, transformation, cheveux afro, erreurs à éviter, conseils.' },
  { id: 'beaute', nom: 'Beauté', dit: 'Avant et après, transformations, détails, gestes, textures, résultats.', garde: 'Une photo de cliente demande son accord inscrit au registre.' },
  { id: 'histoire', nom: 'Histoire', dit: 'La Maison, Brice, Yéman, l’origine, l’évolution, la transmission.', garde: 'Le récit se lit sur « Notre histoire » ; jamais « Kolétan » en publicité.' },
  { id: 'culture', nom: 'Culture', dit: 'Le Bénin, la langue fon, l’identité, la beauté africaine, l’héritage.' },
  { id: 'clientes', nom: 'Clientes', dit: 'Témoignages, histoires, parcours, transformations.', garde: 'Accord écrit, prénom et initiale ; aucun témoignage inventé.' },
  { id: 'coulisses', nom: 'Coulisses', dit: 'L’équipe, la préparation, les séances photo, la création, l’organisation.' },
  { id: 'education', nom: 'Éducation', dit: 'Conseils pratiques, idées reçues, pédagogie.' },
  { id: 'lifestyle', nom: 'Art de vivre', dit: 'Beauté, confiance, féminité, élégance, entrepreneuriat.' },
  { id: 'offres', nom: 'Offres', dit: 'Services, diagnostic, ateliers, rendez-vous, nouveautés.', garde: 'Jamais de prix en campagne.' },
  { id: 'journal', nom: 'Le Journal', dit: 'Les articles du Journal Maison MND, relayés.' },
];

/* ── Une publication du calendrier ───────────────────────────────────────── */
export type Resultats = {
  portee?: number; impressions?: number; vues?: number; likes?: number; commentaires?: number; partages?: number;
  sauvegardes?: number; clics?: number; abonnes?: number; rendezVous?: number; note?: string;
};
export const CHAMPS_DE_RESULTAT: readonly (keyof Omit<Resultats, 'note'>)[] = ['portee', 'impressions', 'vues', 'likes', 'commentaires', 'partages', 'sauvegardes', 'clics', 'abonnes', 'rendezVous'];
export const RESULTAT_DIT: Record<keyof Omit<Resultats, 'note'>, string> = {
  portee: 'Portée', impressions: 'Impressions', vues: 'Vues', likes: 'J’aime', commentaires: 'Commentaires', partages: 'Partages',
  sauvegardes: 'Enregistrements', clics: 'Clics', abonnes: 'Nouveaux abonnés', rendezVous: 'Rendez-vous venus',
};

export type Contenu = {
  id: string;
  date: string;
  heure?: string;
  plateformes: Plateforme[];
  format: Format;
  pilier?: PilierId | '';
  serie?: string;
  objectif?: string;
  sujet: string;
  description?: string;
  accroche?: string;
  legende?: string;
  appel?: string;
  visuel?: string;
  note?: string;
  statut: StatutDeContenu;
  relectureExigee?: boolean;
  validation?: Validation;
  publieLe?: string;
  lien?: string;
  resultats?: Resultats;
  retenu?: string;
  source: 'plan' | 'main' | 'agent' | 'usine';
  plan?: string;
  origine?: string;
  consigne?: string;
  creeLe: string;
};

/** Les remarques de marque d'une publication : tout ce qui part dehors. */
export const remarquesDuContenu = (c: Pick<Contenu, 'sujet' | 'accroche' | 'legende' | 'appel' | 'visuel' | 'format'>): Remarque[] =>
  relisLesChamps([
    { texte: c.sujet, campagne: c.format !== 'bilan' },
    { texte: c.accroche, campagne: true },
    { texte: c.legende, campagne: true },
    { texte: c.appel, campagne: true },
    { texte: c.visuel, visuel: true },
  ]);

export type Verdict = { ok: true } | { ok: false; pourquoi: string };

/** Peut-on mener ce contenu à ce statut ? Les pas permis du Centre, plus
    les règles de l'atelier : seul un fondateur valide ; une faute qui bloque
    empêche la validation ; « programmé » demande une date ; « publié » vient
    d'un contenu programmé ; « analysé » demande au moins un chiffre ;
    « optimisé » demande ce qu'on en retient. */
export function peutPasser(c: Contenu, vers: StatutDeContenu, role?: string): Verdict {
  if (!pasPermis(c.statut, vers)) return { ok: false, pourquoi: 'Ce pas n’est pas permis : la validation ne se saute pas.' };
  if (vers === 'valide') {
    if (!peutValider(role)) return { ok: false, pourquoi: 'Seuls Yéman et Brice valident.' };
    const r = remarquesDuContenu(c);
    if (bloquant(r)) return { ok: false, pourquoi: `À corriger d’abord : ${r.filter((x) => x.gravite === 'bloque').map((x) => x.dit).join(' ')}` };
  }
  if (vers === 'programme' && !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) return { ok: false, pourquoi: 'Une date d’abord.' };
  if (vers === 'analyse' && !CHAMPS_DE_RESULTAT.some((k) => typeof c.resultats?.[k] === 'number')) return { ok: false, pourquoi: 'Au moins un chiffre relevé d’abord.' };
  if (vers === 'optimise' && !(c.retenu ?? '').trim()) return { ok: false, pourquoi: 'Ce qu’on en retient d’abord.' };
  return { ok: true };
}

/* ── L'import des plans déjà préparés ───────────────────────────────────── */
export type EntreeImportable = { id: string; plan: string; date: string; plateformes: string[]; format: string; serie: string; sujet: string; description: string; accroche: string; legende: string; visuel: string; note: string };

const enPlateformes = (xs: readonly string[]): Plateforme[] => xs.filter((x): x is Plateforme => x in PLATEFORMES);
const enFormat = (x: string): Format => (x in FORMATS ? (x as Format) : 'post');

/** Une entrée d'un plan devient une publication « à relire » : les plans ont
    été montrés, mais une validation se donne publication par publication,
    ou d'un geste pour tout un plan. Rien n'est réputé publié. */
export function contenuDuPlan(e: EntreeImportable, maintenant: string): Contenu {
  return {
    id: `plan-${e.id}`,
    date: e.date,
    plateformes: enPlateformes(e.plateformes),
    format: enFormat(e.format),
    pilier: '',
    serie: e.serie,
    sujet: e.sujet,
    description: e.description,
    accroche: e.accroche,
    legende: e.legende,
    visuel: e.visuel,
    note: e.note,
    statut: 'a-relire',
    source: 'plan',
    plan: e.plan,
    creeLe: maintenant,
  };
}

/** L'import ne double jamais : une entrée déjà présente (même identifiant)
    garde ce qu'on en a fait. */
export function importeLesPlans(present: readonly Contenu[], entrees: readonly EntreeImportable[], maintenant: string): { contenus: Contenu[]; ajoutes: number } {
  const ids = new Set(present.map((c) => c.id));
  const neufs = entrees.map((e) => contenuDuPlan(e, maintenant)).filter((c) => !ids.has(c.id));
  return { contenus: [...present, ...neufs], ajoutes: neufs.length };
}

/* ── L'usine à contenus (cahier § 15) ───────────────────────────────────── */
export type SourceDeLUsine = { genre: 'seance' | 'video' | 'article' | 'contenu'; titre: string; date: string; id: string };
export type Declinaison = { format: Format; plateformes: Plateforme[]; pilier: PilierId; sujet: string; decalageJours: number };

/** Ce qu'une source peut donner, d'après l'exemple du cahier (une séance :
    des posts, des Reels, des stories, un article, une lettre, des citations,
    une vidéo longue, un message WhatsApp), au rythme léger de la Maison :
    deux publications et une vidéo par semaine sur Instagram. Chaque déclinaison est un brouillon. */
export function declinaisonsDe(s: SourceDeLUsine): Declinaison[] {
  const t = s.titre.trim() || 'la source';
  const ig: Plateforme[] = ['instagram', 'facebook'];
  if (s.genre === 'seance') {
    return [
      { format: 'post', plateformes: ig, pilier: 'beaute', sujet: `Le portrait de la séance « ${t} »`, decalageJours: 2 },
      { format: 'carrousel', plateformes: ig, pilier: 'expertise', sujet: `Les détails de la couronne, en carrousel (« ${t} »)`, decalageJours: 4 },
      { format: 'reel', plateformes: ['instagram', 'tiktok'], pilier: 'coulisses', sujet: `Les coulisses de la séance « ${t} »`, decalageJours: 7 },
      { format: 'story', plateformes: ['instagram'], pilier: 'coulisses', sujet: `Trois stories pendant la séance « ${t} »`, decalageJours: 0 },
      { format: 'post', plateformes: ig, pilier: 'education', sujet: `Un conseil tiré de la séance « ${t} »`, decalageJours: 9 },
      { format: 'post', plateformes: ig, pilier: 'lifestyle', sujet: `Une citation de la séance « ${t} »`, decalageJours: 11 },
      { format: 'reel', plateformes: ['instagram', 'tiktok'], pilier: 'beaute', sujet: `La transformation, en trente secondes (« ${t} »)`, decalageJours: 14 },
      { format: 'article', plateformes: ['journal'], pilier: 'journal', sujet: `Un article du Journal à partir de « ${t} »`, decalageJours: 16 },
      { format: 'statut-whatsapp', plateformes: ['whatsapp'], pilier: 'offres', sujet: `Le statut WhatsApp de la semaine (« ${t} »)`, decalageJours: 3 },
      { format: 'newsletter', plateformes: ['site'], pilier: 'journal', sujet: `La lettre du mois reprend « ${t} »`, decalageJours: 21 },
    ];
  }
  if (s.genre === 'video') {
    return [
      { format: 'reel', plateformes: ['instagram', 'tiktok'], pilier: 'expertise', sujet: `« ${t} » en Reel`, decalageJours: 1 },
      { format: 'video-longue', plateformes: ['youtube'], pilier: 'expertise', sujet: `« ${t} » en version longue`, decalageJours: 3 },
      { format: 'story', plateformes: ['instagram'], pilier: 'coulisses', sujet: `Trois stories autour de « ${t} »`, decalageJours: 1 },
      { format: 'post', plateformes: ig, pilier: 'education', sujet: `La phrase à retenir de « ${t} »`, decalageJours: 5 },
      { format: 'statut-whatsapp', plateformes: ['whatsapp'], pilier: 'offres', sujet: `« ${t} » en statut WhatsApp`, decalageJours: 2 },
    ];
  }
  if (s.genre === 'article') {
    return [
      { format: 'carrousel', plateformes: ig, pilier: 'education', sujet: `L’article « ${t} » en cinq images`, decalageJours: 1 },
      { format: 'post', plateformes: ['linkedin'], pilier: 'journal', sujet: `L’article « ${t} » sur LinkedIn`, decalageJours: 2 },
      { format: 'story', plateformes: ['instagram'], pilier: 'journal', sujet: `Une story qui mène à « ${t} »`, decalageJours: 0 },
      { format: 'reel', plateformes: ['instagram', 'tiktok'], pilier: 'education', sujet: `Le conseil de « ${t} » en trente secondes`, decalageJours: 6 },
      { format: 'statut-whatsapp', plateformes: ['whatsapp'], pilier: 'journal', sujet: `Le lien de « ${t} » en statut`, decalageJours: 1 },
    ];
  }
  return [
    { format: 'story', plateformes: ['instagram'], pilier: 'coulisses', sujet: `Une story qui relaie « ${t} »`, decalageJours: 1 },
    { format: 'statut-whatsapp', plateformes: ['whatsapp'], pilier: 'offres', sujet: `« ${t} » en statut WhatsApp`, decalageJours: 1 },
    { format: 'post', plateformes: ['linkedin'], pilier: 'histoire', sujet: `« ${t} » raconté sur LinkedIn`, decalageJours: 3 },
  ];
}

/** Combien de contenus prévus par pilier sur une période : l'équilibre se lit
    avant de publier, pas après. */
export function equilibreDesPiliers(cs: readonly Contenu[], du: string, au: string): Record<PilierId | 'sans', number> {
  const out = Object.fromEntries([...PILIERS.map((p) => [p.id, 0]), ['sans', 0]]) as Record<PilierId | 'sans', number>;
  for (const c of cs) {
    if (c.date < du || c.date > au || c.format === 'bilan') continue;
    out[c.pilier || 'sans'] += 1;
  }
  return out;
}
