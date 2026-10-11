import { peutValider, type StatutDeContenu, type Validation } from './ia-validation-pur';
import { bloquant, relisLesChamps, type Remarque } from './ia-marque-pur';

/* LA SÉANCE PHOTO — 11 octobre 2026 (phase 2, agent Photo).

   Cahier § 12 : pour chaque séance, un brief (objectif, campagne, concept,
   histoire, modèle, coiffure, tenue, accessoires, décor, lumière, cadrage,
   poses, expressions, détails, photos nécessaires, formats) et une liste des
   prises, de SHOT 01 à SHOT 10.

   LES PERSONNES D'ABORD : une photo ne se publie pas sans l'accord inscrit
   au registre (docs/site-revelateur/photos.md), un enfant demande l'accord
   écrit de son parent, une cliente ne va pas sur un article qui nomme un
   défaut. Le modèle se dit par son prénom et son initiale.

   MODULE PUR. */

export type Prise = { num: number; nom: string; consigne: string; format: string; faite: boolean };

export type SeancePhoto = {
  id: string;
  titre: string;
  date: string;
  objectif: string;
  campagne: string;
  concept: string;
  histoire: string;
  modele: string;
  enfant: boolean;
  accord: 'a-obtenir' | 'signe' | 'inscrit';
  coiffure: string;
  tenue: string;
  accessoires: string;
  decor: string;
  lumiere: string;
  cadrage: string;
  poses: string;
  expressions: string;
  details: string;
  prises: Prise[];
  statut: StatutDeContenu;
  validation?: Validation;
  consigne?: string;
  creeLe: string;
};

/** Les formats d'une même image, dits une fois pour toute la Maison. */
export const FORMATS_PHOTO: readonly { nom: string; dit: string }[] = [
  { nom: 'Instagram', dit: 'portrait 4:5, 1080 × 1350' },
  { nom: 'Story et Reel', dit: 'vertical 9:16, 1080 × 1920' },
  { nom: 'Site', dit: 'portrait 4:5 pour la page, paysage 16:9 pour le partage du lien' },
  { nom: 'Publicité', dit: 'carré 1:1 et vertical 9:16' },
  { nom: 'Presse', dit: 'paysage 3:2, pleine définition' },
];

/** Les dix prises du cahier, avec leur consigne et leur format d'abord. */
export const PRISES_DE_BASE: readonly Omit<Prise, 'faite'>[] = [
  { num: 1, nom: 'Portrait', consigne: 'De face, à hauteur des yeux, la couronne entière dans le cadre.', format: 'Instagram 4:5' },
  { num: 2, nom: 'Profil', consigne: 'Le profil net, la ligne des locks du front à la nuque.', format: 'Instagram 4:5' },
  { num: 3, nom: 'Arrière', consigne: 'La couronne de dos : le travail des racines se lit.', format: 'Instagram 4:5' },
  { num: 4, nom: 'Détail des locks', consigne: 'Très près : la texture, la régularité, la brillance sans gras.', format: 'Carrousel 4:5' },
  { num: 5, nom: 'Les mains', consigne: 'Les mains de la Maison au travail, un geste nommé (le SÍNSIN™, le DÀNDÀN™).', format: 'Carrousel 4:5' },
  { num: 6, nom: 'Mouvement', consigne: 'La couronne qui bouge : un tour de tête, une marche.', format: 'Story 9:16' },
  { num: 7, nom: 'Sourire', consigne: 'Le sourire vrai, après le soin ; jamais forcé.', format: 'Instagram 4:5' },
  { num: 8, nom: 'Interaction', consigne: 'La cliente et la main de la Maison, un échange, un regard.', format: 'Site 16:9' },
  { num: 9, nom: 'Environnement', consigne: 'La Maison autour : la lumière, les outils propres, l’ivoire et l’indigo.', format: 'Site 16:9' },
  { num: 10, nom: 'Avant et après', consigne: 'Même lumière, même cadre, même angle, avant puis après.', format: 'Carrousel 4:5' },
];

export function nouvelleSeance(o: { id: string; titre: string; date: string; maintenant: string }): SeancePhoto {
  return {
    id: o.id, titre: o.titre.trim(), date: o.date,
    objectif: '', campagne: '', concept: '', histoire: '', modele: '', enfant: false, accord: 'a-obtenir',
    coiffure: '', tenue: '', accessoires: '', decor: 'La Maison, à la lumière du jour ; ivoire et indigo, rien de noir.', lumiere: 'Lumière du jour, douce, de côté.',
    cadrage: '', poses: '', expressions: '', details: '',
    prises: PRISES_DE_BASE.map((p) => ({ ...p, faite: false })),
    statut: 'brouillon', creeLe: o.maintenant,
  };
}

/** Ce qui manque avant de publier une photo de la séance. */
export function avantDePublier(s: Pick<SeancePhoto, 'accord' | 'enfant' | 'modele'>): string[] {
  const manque: string[] = [];
  if (s.accord !== 'inscrit') manque.push('L’accord du modèle n’est pas encore inscrit au registre des photos.');
  if (s.enfant && s.accord === 'a-obtenir') manque.push('Un enfant : l’accord écrit de son parent avant la séance.');
  if (/\s\S{2,}$/.test(s.modele.trim()) && !/\s\S\.$/.test(s.modele.trim())) manque.push('Le modèle se dit par son prénom et son initiale.');
  return manque;
}

/* ── LE SCRIPT VIDÉO (cahier § 14, agent Vidéo) ──────────────────────────── */
export type PlanVideo = { num: number; image: string; texteEcran: string; duree: number };

export type ScriptVideo = {
  id: string;
  titre: string;
  plateforme: 'instagram' | 'tiktok' | 'youtube' | 'facebook';
  duree: number;
  /* L'ordre du cahier : accroche, histoire, valeur, émotion, appel. */
  accroche: string;
  histoire: string;
  valeur: string;
  emotion: string;
  appel: string;
  plans: PlanVideo[];
  transitions: string;
  musique: string;
  sousTitres: boolean;
  miniature: string;
  legende: string;
  statut: StatutDeContenu;
  validation?: Validation;
  consigne?: string;
  creeLe: string;
};

export const TEMPS_DU_SCRIPT: readonly { cle: 'accroche' | 'histoire' | 'valeur' | 'emotion' | 'appel'; nom: string; dit: string }[] = [
  { cle: 'accroche', nom: 'Accroche', dit: 'Les deux premières secondes : ce qui arrête le pouce.' },
  { cle: 'histoire', nom: 'Histoire', dit: 'Qui, où, quoi : une couronne, une main, un moment.' },
  { cle: 'valeur', nom: 'Valeur', dit: 'Ce qu’on apprend ou ce qu’on voit changer.' },
  { cle: 'emotion', nom: 'Émotion', dit: 'Le regard, le sourire, la phrase qui reste.' },
  { cle: 'appel', nom: 'Appel', dit: 'Ce qu’on fait ensuite : réserver, enregistrer, écrire.' },
];

export function nouveauScript(o: { id: string; titre: string; maintenant: string }): ScriptVideo {
  return {
    id: o.id, titre: o.titre.trim(), plateforme: 'instagram', duree: 30,
    accroche: '', histoire: '', valeur: '', emotion: '', appel: 'Votre soin se réserve en ligne : maisonmnd.com',
    plans: [1, 2, 3, 4, 5].map((n) => ({ num: n, image: '', texteEcran: '', duree: 6 })),
    transitions: 'Coupes franches au rythme de la voix ; un fondu à la fin.', musique: '', sousTitres: true, miniature: '', legende: '',
    statut: 'brouillon', creeLe: o.maintenant,
  };
}

/** La durée des plans comparée à celle annoncée : un écart se dit. */
export const ecartDeDuree = (s: Pick<ScriptVideo, 'duree' | 'plans'>): number =>
  s.plans.reduce((n, p) => n + (Number.isFinite(p.duree) ? p.duree : 0), 0) - s.duree;

/* ── CE QU'ON A VALIDÉ EST CE QU'ON A LU (11 octobre 2026) ─────────────────
   Comme une publication : un brief ou un script validé dont le texte change
   revient « à relire ». L'accord obtenu, une prise cochée « faite » ne le
   remettent pas : ils disent que la séance avance, pas que le brief change. */
export const CHAMPS_DU_BRIEF: readonly (keyof SeancePhoto)[] = ['titre', 'objectif', 'campagne', 'concept', 'histoire', 'modele', 'enfant', 'coiffure', 'tenue', 'accessoires', 'decor', 'lumiere', 'cadrage', 'poses', 'expressions', 'details'];
export const CHAMPS_DU_SCRIPT: readonly (keyof ScriptVideo)[] = ['titre', 'plateforme', 'duree', 'accroche', 'histoire', 'valeur', 'emotion', 'appel', 'plans', 'transitions', 'musique', 'sousTitres', 'miniature', 'legende'];

/** Un changement touche-t-il l'un de ces champs ? */
export function toucheA<T extends object>(avant: T, champs: Partial<T>, cles: readonly (keyof T)[]): boolean {
  return cles.some((k) => k in champs && JSON.stringify(champs[k]) !== JSON.stringify(avant[k]));
}

/** La pièce après un changement : validée et touchée, elle revient à relire,
    sauf si le changement fixe lui-même le statut. */
export function apresLeChangement<T extends { statut: StatutDeContenu; validation?: Validation }>(avant: T, champs: Partial<T>, cles: readonly (keyof T)[]): T {
  const revient = avant.statut === 'valide' && !('statut' in champs) && toucheA(avant, champs, cles);
  return { ...avant, ...champs, ...(revient ? { statut: 'a-relire' as StatutDeContenu, validation: undefined } : {}) };
}

/** Tout ce qui part dehors dans un script : le gardien de la marque le relit. */
export const remarquesDuScript = (s: Pick<ScriptVideo, 'accroche' | 'histoire' | 'valeur' | 'emotion' | 'appel' | 'legende' | 'plans' | 'miniature'>): Remarque[] =>
  relisLesChamps([
    ...[s.accroche, s.histoire, s.valeur, s.emotion, s.appel, s.legende].map((texte) => ({ texte, campagne: true })),
    ...s.plans.map((p) => ({ texte: p.texteEcran, campagne: true })),
    { texte: s.miniature, visuel: true },
  ]);

type Verdict = { ok: true } | { ok: false; pourquoi: string };

/** Valider un brief : un fondateur, une pièce à relire. */
export function peutValiderLeBrief(s: Pick<SeancePhoto, 'statut'>, role?: string): Verdict {
  if (!peutValider(role)) return { ok: false, pourquoi: 'Seuls Yéman et Brice valident.' };
  if (s.statut !== 'a-relire') return { ok: false, pourquoi: 'Le brief s’envoie à la relecture d’abord.' };
  return { ok: true };
}

/** Valider un script : un fondateur, une pièce à relire, aucune faute qui bloque. */
export function peutValiderLeScript(s: ScriptVideo, role?: string): Verdict {
  if (!peutValider(role)) return { ok: false, pourquoi: 'Seuls Yéman et Brice valident.' };
  if (s.statut !== 'a-relire') return { ok: false, pourquoi: 'Le script s’envoie à la relecture d’abord.' };
  const r = remarquesDuScript(s);
  if (bloquant(r)) return { ok: false, pourquoi: `À corriger d’abord : ${r.filter((x) => x.gravite === 'bloque').map((x) => x.dit).join(' ')}` };
  return { ok: true };
}
