import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { EtatDeLaReponse } from './automate-wa';
import type { Besoin } from './qualification';

/* ══ LES RÉPONSES DE LA MAISON · 14 octobre 2026 ═════════════════════════

   « Prendre RDV & Conseil Locks » (maquette MwRLSQ3e…, construite sur les
   choix de la direction : sans modèle de langue, les prix comme le site plus
   un « à partir de » pour une création, des brouillons préparés et validés
   par la direction, un onglet des Conversations).

   UN SEUL ÉCRIVAIN : le Trône écrit ce document (`mnd_reponses_maison`) ;
   la fonction `whatsapp-automate` le lit à chaque tour, et n'envoie que les
   réponses VALIDÉES, mot pour mot, leurs prix remplacés par ceux du
   catalogue du jour (`texteDeLaReponse`, dans automate-wa.ts).

   LES BROUILLONS DE DÉPART reprennent la page Questions du site (douze
   réponses déjà publiques) et la carte du catalogue v6 ; la longueur qui
   suffit reste à écrire par la Maison, c'est son savoir. Aucun ne part avant
   la validation de la direction. Absent du serveur, le document y est amorcé
   avec eux, en brouillon (`bindDocument`). */

export type ReponseBrute = {
  id: string;
  titre: string;
  description?: string;
  /** Les mots tels qu'on les a tapés ; l'automate les lit sans accents. */
  mots: string[];
  texte: string;
  etat: EtatDeLaReponse;
  mene?: Besoin;
  ordre: number;
  valideeLe?: string;
  valideePar?: string;
};
export type ConseilBrut = { reponses: ReponseBrute[]; motsSante?: string[] };

const brouillon = (ordre: number, id: string, titre: string, description: string, mots: string[], texte: string, mene?: Besoin): ReponseBrute => ({
  id, titre, ...(description ? { description } : {}), mots, texte, etat: 'brouillon', ...(mene ? { mene } : {}), ordre,
});

export const BROUILLONS_DU_CONSEIL: readonly ReponseBrute[] = [
  brouillon(1, 'r-prix-creation', 'Prix d’une création', 'La consultation, puis le devis',
    ['prix', 'combien', 'tarif', 'coût', 'coûte', 'création', 'créer', 'microlocks', 'micro locks', 'nano', 'devis', 'VÈKPÈ', 'commencer mes locks', 'faire des locks'],
    'Une création se chiffre après la consultation Origine (KÒKÒ™ Origine, {prix:sv-koko-ori}) : nous regardons vos cheveux, puis le devis vous est remis par écrit, avant toute intervention. La consultation est déduite de la création si elle a lieu dans les 45 jours. À titre de repère, une création commence à {prix:sv-atl-i-jum} (VÈKPÈ™ Jumbo, de 50 à 100 locks) et à {prix:sv-atl-i-med} pour un Medium (de 100 à 180 locks) ; plus les locks sont fines, plus elles sont nombreuses.',
    'creation'),
  brouillon(2, 'r-prix-entretien', 'Prix d’un entretien', 'Le resserrage, selon votre calibre',
    ['resserrage', 'entretien', 'racines', 'retouche', 'SÍNSIN', 'reprise', 'repousse'],
    'Le resserrage des racines (SÍNSIN™ Essentiel) est à {prix:sv-atl-ii-e} pour un calibre Medium ; son prix suit votre calibre, plus doux pour des locks larges, plus élevé pour des locks très fines. Le prix exact s’affiche quand vous réservez.',
    'entretien'),
  brouillon(3, 'r-longueur', 'Ma longueur suffit ?', 'La longueur pour commencer',
    ['longueur', 'assez long', 'assez longs', 'court', 'courts', 'cm', 'centimètres', 'pousse', 'trop court'],
    '',
    'creation'),
  brouillon(4, 'r-duree', 'Durée d’une création', 'Quelques heures ou deux jours',
    ['combien de temps', 'durée', 'heures', 'journée', 'longtemps', 'deux jours'],
    'Quelques heures ou une journée entière, selon la méthode, la longueur et la densité de vos cheveux : de 3 à 4 heures pour un Jumbo, deux jours pour un Micro ou un Nano. La durée prévue vous est donnée avec votre devis.',
    'creation'),
  brouillon(5, 'r-consultation', 'La consultation', 'Obligatoire, ou non',
    ['consultation', 'obligatoire', 'diagnostic', 'KÒKÒ'],
    'Pour une création ou une réparation, oui : nous ne faisons pas de geste important sans avoir regardé. Pour un entretien simple, non, vous réservez directement.'),
  brouillon(6, 'r-couleur', 'La couleur végétale', 'YÈKPÈ™, henné et indigo',
    ['couleur', 'coloration', 'teinture', 'henné', 'roux', 'cuivré', 'YÈKPÈ', 'colorer', 'teindre'],
    'Oui, avec YÈKPÈ™, notre couleur 100 % végétale : henné, indigo, plantes africaines, sans ammoniaque. Elle demande une couronne saine, et un test sur mèche se fait avant. Parlez-en lors d’un entretien ou d’une consultation.'),
  brouillon(7, 'r-extensions', 'Extensions de locks', 'Rallonger sa couronne',
    ['extension', 'extensions', 'rallonge', 'rallonger', 'allonger', 'plus longues'],
    'Oui, la Maison pose des extensions de locks. Leur nombre, leur longueur et leur prix se décident en consultation, selon vos cheveux.'),
  brouillon(8, 'r-ailleurs', 'Locks créées ailleurs', 'Bienvenue quand même',
    ['ailleurs', 'autre coiffeuse', 'autre endroit', 'pas chez vous', 'déjà des locks', 'reprendre mes locks'],
    'Oui, bienvenue quand même. Pour un entretien, réservez directement ; si quelque chose vous inquiète, commencez par une consultation Réparation.'),
  brouillon(9, 'r-cheveux-fins', 'J’ai les cheveux fins', 'Ce qui est possible',
    ['cheveux fins', 'cheveux fin', 'clairsemés', 'peu de cheveux', 'cheveux fragiles'],
    'Cela dépend de vos cheveux, pas d’une règle générale. La consultation sert justement à voir ce qui est possible et quelle méthode convient.',
    'creation'),
  brouillon(10, 'r-enfant', 'Des locks pour un enfant', 'MND Kids',
    ['enfant', 'fille', 'garçon', 'fils', 'âge', 'kids', 'petite'],
    'Il n’y a pas d’âge fixe : cela dépend de l’enfant, de ses cheveux et de son envie. Nous en parlons d’abord avec vous, et l’enfant reste libre de dire non.',
    'enfant'),
  brouillon(11, 'r-methode', 'Notre méthode', 'Purifier, Nourrir, Sceller, Couronner',
    ['méthode', 'technique', 'comment vous faites', 'crochet', 'torsion', 'vanilles'],
    'La méthode MND suit quatre temps : Purifier, Nourrir, Sceller, Couronner. Pour une création, le crochet ou la torsion se choisit en consultation, selon votre texture.'),
  brouillon(12, 'r-annuler', 'Annuler, déplacer', 'Prévenir 24 heures avant',
    ['prévenir', 'empêchement', 'acompte', 'délai'],
    'Prévenez-nous au moins 24 heures avant, sur WhatsApp ou par téléphone, et nous déplaçons votre rendez-vous sans frais. Passé ce délai, un acompte déjà versé reste à la Maison.'),
  brouillon(13, 'r-formation', 'Se former à l’Académie', 'Débuter ou se spécialiser',
    ['formation', 'former', 'apprendre', 'académie', 'cours', 'stage'],
    'Oui : l’Académie MND s’adresse à celles et ceux qui débutent comme aux professionnels qui veulent se spécialiser. Écrivez-nous pour connaître les prochaines sessions.'),
];

export const conseilStore = createStore<ConseilBrut>('mnd_reponses_maison', { reponses: [...BROUILLONS_DU_CONSEIL] });
export const useConseil = () => useStore(conseilStore);
bindDocument(conseilStore, 'mnd_reponses_maison');

/* ── Les gestes de l'écran, purs : ils rendent un conseil neuf ── */

export const nouvelIdDeReponse = (): string => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** CE QUI CHANGE CE QUE LA CLIENTE LIT : une réponse validée qu'on y touche
    redevient un brouillon, et ne part plus jusqu'à la nouvelle validation. */
const CHAMPS_DU_SENS: readonly (keyof ReponseBrute)[] = ['titre', 'description', 'mots', 'texte', 'mene'];

export function modifieLaReponse(c: ConseilBrut, id: string, patch: Partial<Omit<ReponseBrute, 'id' | 'etat' | 'valideeLe' | 'valideePar'>>): ConseilBrut {
  return {
    ...c,
    reponses: c.reponses.map((r) => {
      if (r.id !== id) return r;
      const neuve = { ...r, ...patch };
      const sensChange = CHAMPS_DU_SENS.some((k) => JSON.stringify(neuve[k] ?? null) !== JSON.stringify(r[k] ?? null));
      if (!sensChange || r.etat !== 'validee') return neuve;
      const { valideeLe: _l, valideePar: _p, ...reste } = neuve;
      return { ...reste, etat: 'brouillon' };
    }),
  };
}

export function valideLaReponse(c: ConseilBrut, id: string, par: string, quand: string): ConseilBrut {
  return { ...c, reponses: c.reponses.map((r) => (r.id === id ? { ...r, etat: 'validee', valideeLe: quand, valideePar: par } : r)) };
}

/** VALIDER EN COCHANT (30 octobre 2026, « sur un écran à cocher ») : les
    réponses cochées, d'un coup. L'écran ne laisse cocher que celles qui
    peuvent partir ; l'automate rejuge de toute façon chaque texte. */
export function valideLesReponses(c: ConseilBrut, ids: readonly string[], par: string, quand: string): ConseilBrut {
  return ids.reduce((acc, id) => valideLaReponse(acc, id, par, quand), c);
}

/** LES TEXTES PROPOSÉS d'une réponse encore vide (30 octobre 2026, choix de
    la direction sur « ma longueur suffit ? » : une photo, l'équipe regarde). */
export const TEXTES_PROPOSES: Readonly<Record<string, string>> = {
  'r-longueur': 'Envoyez-nous une photo de vos cheveux, de face et de dos : une personne de la Maison regarde et vous dit si la longueur suffit.',
};

/** LA CORRECTION PROPOSÉE d'un brouillon qui ne peut pas partir : un texte
    vide reçoit le texte proposé ; une phrase dont un prix est introuvable au
    catalogue du jour (une création, sur devis) s'en va, le reste demeure.
    Rien à proposer : `null`. */
export function correctionProposee(r: Pick<ReponseBrute, 'id' | 'texte'>, prix: Readonly<Record<string, number>>): { texte: string; pourquoi: string } | null {
  const texte = String(r.texte ?? '').trim();
  if (!texte) {
    const p = TEXTES_PROPOSES[r.id];
    return p ? { texte: p, pourquoi: 'La réponse est vide.' } : null;
  }
  const introuvable = (phrase: string): boolean =>
    [...phrase.matchAll(/\{prix:([^}]{1,80})\}/g)].some((m) => !((prix[m[1].trim()] ?? 0) > 0));
  const phrases = texte.split(/(?<=[.!?])\s+/);
  if (!phrases.some(introuvable)) return null;
  const reste = phrases.filter((p) => !introuvable(p)).join(' ').trim();
  return reste ? { texte: reste, pourquoi: 'Une phrase cite un prix introuvable au catalogue : elle s’en va.' } : null;
}

export function repasseEnBrouillon(c: ConseilBrut, id: string): ConseilBrut {
  return {
    ...c,
    reponses: c.reponses.map((r) => {
      if (r.id !== id) return r;
      const { valideeLe: _l, valideePar: _p, ...reste } = r;
      return { ...reste, etat: 'brouillon' };
    }),
  };
}

export function ajouteUneReponse(c: ConseilBrut, r: Omit<ReponseBrute, 'ordre' | 'etat'>): ConseilBrut {
  const ordre = c.reponses.reduce((m, x) => Math.max(m, x.ordre), 0) + 1;
  return { ...c, reponses: [...c.reponses, { ...r, etat: 'brouillon', ordre }] };
}

export function retireLaReponse(c: ConseilBrut, id: string): ConseilBrut {
  return { ...c, reponses: c.reponses.filter((r) => r.id !== id) };
}

/** Monte (-1) ou descend (+1) une réponse dans la liste de WhatsApp. */
export function deplaceLaReponse(c: ConseilBrut, id: string, sens: -1 | 1): ConseilBrut {
  const rangees = [...c.reponses].sort((a, b) => a.ordre - b.ordre);
  const i = rangees.findIndex((r) => r.id === id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= rangees.length) return c;
  [rangees[i], rangees[j]] = [rangees[j], rangees[i]];
  const ordres = new Map(rangees.map((r, k) => [r.id, k + 1]));
  return { ...c, reponses: c.reponses.map((r) => ({ ...r, ordre: ordres.get(r.id) ?? r.ordre })) };
}

/** Les mots du cuir chevelu, écrits par la direction (vides : ceux de la Maison). */
export function changeLesMotsSante(c: ConseilBrut, mots: string[]): ConseilBrut {
  const propres = [...new Set(mots.map((m) => m.trim()).filter((m) => m.length >= 3))];
  return { ...c, motsSante: propres };
}

/** LES MOTS D'UNE PHRASE, pour une réponse née d'une question restée sans
    réponse : les plus longs d'abord, ni chiffres ni petits mots. */
export function motsDUnePhrase(phrase: string): string[] {
  const vides = new Set(['est-ce', 'quoi', 'vous', 'votre', 'vos', 'faites', 'avez', 'pour', 'avec', 'dans', 'mais', 'aussi', 'bonjour', 'bonsoir', 'merci', 'svp', 'please', 'cette', 'quelle', 'quel', 'combien']);
  const mots = String(phrase ?? '').toLowerCase().replace(/[^\p{L}' -]/gu, ' ').split(/\s+/)
    .map((m) => m.replace(/^'+|'+$/g, '')).filter((m) => m.length >= 5 && !vides.has(m));
  return [...new Set(mots)].sort((a, b) => b.length - a.length).slice(0, 4);
}
