/* ══ LA RUBRIQUE « LES AVIS GOOGLE », SES RÈGLES — 26 octobre 2026 ══════
   « Les avis Google doivent avoir leur espace sur la barre de navigation :
   une maquette qui reçoit les avis, qui apprête les réponses, et ensuite que
   je puisse publier » (Yéman). Maquette YaWfiqou…, « Tout me va » : Marketing
   & fidélité sous « Les vitrines » ; TOUS les avis, par Make ; les nouveaux
   apprêtés à l'ouverture, les anciens par dix à la demande ; le départ
   toujours à la main.

   UNE LISTE, DEUX SOURCES. Les avis viennent de Make (`mnd_avis_google_tous`,
   les 299, leur nom chez Google, leur réponse publiée). Le relevé de Places
   (les cinq « plus pertinents ») ne sert plus qu'à retrouver la clé d'un
   avis qu'il connaît : ses brouillons, son lien à une fiche et son choix pour
   le site, posés avant ce jour, restent les siens. Sans Make, la rubrique
   montre le relevé, comme l'onglet d'avant.

   Pur : ni magasin ni réseau. */
import { apparie, texteDeGoogle, type AvisDeGoogle } from './avis-google-pont-pur';
import { estSansReponse, idDeLAvis, verrouTenu, type BrouillonDAvis, type BrouillonsDAvis } from './ia-avis-pur';
import type { AvisDuReleve } from './avis-fiches-pur';
import { NOTE_A_RECONQUERIR } from './avis-fiches-pur';
import { moisACotonou } from './ia-budget-pur';

/** Un avis de la rubrique : ce que lisent la fiche et la réponse, plus sa clé,
    son nom chez Google et sa réponse publiée. */
export type AvisDeLaRubrique = AvisDuReleve & {
  cle: string;
  name?: string;
  traduction?: string;
  reponduLe?: string;
  parLeTrone?: boolean;
};

/** La clé d'un avis venu de Make sans pendant dans le relevé : tirée de son
    identifiant chez Google, stable d'un relevé à l'autre. */
export const cleDeGoogle = (name: string): string => `g-${String(name).split('/').pop() ?? name}`;

const tempsDe = (iso: string | undefined): number => {
  const t = Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? t : 0;
};

/** LA LISTE DE LA RUBRIQUE, la plus récente d'abord. */
export function avisDeLaRubrique(
  deGoogle: readonly AvisDeGoogle[] | null | undefined,
  releve: readonly AvisDuReleve[] | null | undefined,
): AvisDeLaRubrique[] {
  const places = releve ?? [];
  if (!deGoogle || deGoogle.length === 0) {
    return places.map((a) => ({ ...a, cle: idDeLAvis(a) }));
  }
  /* Le pendant de Places de chaque avis de Make, quand il en a un. */
  const pendant = new Map<string, AvisDuReleve>();
  for (const a of places) {
    const g = apparie(a, deGoogle);
    if (g && !pendant.has(g.name)) pendant.set(g.name, a);
  }
  return [...deGoogle]
    .sort((x, y) => tempsDe(y.creeLe) - tempsDe(x.creeLe))
    .map((g): AvisDeLaRubrique => {
      const p = pendant.get(g.name);
      const { original, traduction } = texteDeGoogle(g.texte);
      return {
        cle: p ? idDeLAvis(p) : cleDeGoogle(g.name),
        name: g.name,
        auteur: g.auteur || p?.auteur || '',
        note: g.note || p?.note || 0,
        texte: original,
        ...(original ? { texteOriginal: original } : {}),
        ...(traduction ? { traduction } : {}),
        quand: '',
        ...(g.creeLe ? { publieLe: g.creeLe } : {}),
        ...(p?.photo ? { photo: p.photo } : {}),
        ...(p?.lien ? { lien: p.lien } : {}),
        ...(g.reponse ? { reponse: g.reponse } : {}),
        ...(g.reponduLe ? { reponduLe: g.reponduLe } : {}),
        ...(g.parLeTrone ? { parLeTrone: true } : {}),
      };
    });
}

/** Où en est un avis. « nouveau » : sans réponse et sans proposition encore. */
export type EtatDeLAvis = 'publiee' | 'ecartee' | 'prepare' | 'prete' | 'nouveau';

export function etatDeLAvis(a: AvisDeLaRubrique, b: BrouillonDAvis | undefined, maintenant: number): EtatDeLAvis {
  if (!estSansReponse(a, b)) return 'publiee';
  if (b?.ecarte) return 'ecartee';
  if (verrouTenu(b, maintenant)) return 'prepare';
  if (b?.reponse) return 'prete';
  return 'nouveau';
}

/** Les filtres : les trois temps (reçoit, apprête, publie) et les onglets. */
export type FiltreDeLaRubrique = 'recus' | 'relire' | 'sans' | 'publiees' | 'site' | 'tous';

/** Un avis « récent » : arrivé dans les 30 jours. Ceux-là s'apprêtent seuls
    à l'ouverture ; les anciens attendent « Préparer les dix suivants ». */
export const JOURS_DES_RECENTS = 30;
export const estRecent = (a: Pick<AvisDeLaRubrique, 'publieLe'>, maintenant: number): boolean => {
  const t = tempsDe(a.publieLe);
  return t > 0 && maintenant - t <= JOURS_DES_RECENTS * 86_400_000;
};

export function passeLeFiltreDeLaRubrique(
  a: AvisDeLaRubrique, f: FiltreDeLaRubrique, b: BrouillonDAvis | undefined, surLeSite: boolean, maintenant: number,
): boolean {
  const e = etatDeLAvis(a, b, maintenant);
  if (f === 'recus') return e === 'nouveau' || e === 'prepare';
  if (f === 'relire') return e === 'prete';
  if (f === 'sans') return e !== 'publiee';
  if (f === 'publiees') return e === 'publiee';
  if (f === 'site') return surLeSite;
  return true;
}

/** Combien dans chaque filtre : le même juge que la liste. */
export function comptesDeLaRubrique(
  avis: readonly AvisDeLaRubrique[], brouillons: BrouillonsDAvis, surLeSite: (cle: string) => boolean, maintenant: number,
): Record<FiltreDeLaRubrique, number> {
  const n = (f: FiltreDeLaRubrique) => avis.filter((a) => passeLeFiltreDeLaRubrique(a, f, brouillons[a.cle], surLeSite(a.cle), maintenant)).length;
  return { recus: n('recus'), relire: n('relire'), sans: n('sans'), publiees: n('publiees'), site: n('site'), tous: avis.length };
}

/** LES DIX SUIVANTS : les anciens avis sans réponse et sans proposition, du
    plus récent au plus ancien, qui n'ont pas échoué tout à l'heure. */
export function anciensAApreter(
  avis: readonly AvisDeLaRubrique[], brouillons: BrouillonsDAvis, maintenant: number, n = 10,
): AvisDeLaRubrique[] {
  return avis.filter((a) => !estRecent(a, maintenant) && etatDeLAvis(a, brouillons[a.cle], maintenant) === 'nouveau'
    && !brouillons[a.cle]?.echoueLe).slice(0, n);
}

/** Le chiffre de la barre : les réponses prêtes à relire. Les brouillons
    seuls (synchronisés partout), sans lire les 299 avis à chaque écran. */
export const reponsesARelire = (brouillons: BrouillonsDAvis): number =>
  Object.values(brouillons).filter((b) => !!b?.reponse && !b.publieeLe && !b.ecarte).length;

/* ══ LA VUE « LES AVIS » DE L'ASSISTANT MAISON, SES CHIFFRES, 26 octobre 2026 ══
   Lot 3 (spec §5.3) : « reçus sans réponse n · prêtes à relire n · publiées
   ce mois n · note Google et note des 10 derniers », la liste « sans réponse
   d'abord, 1 à 3 étoiles en tête », l'âge en un mot sur la ligne. Les deux
   premiers chiffres viennent de `comptesDeLaRubrique` ; voici les autres.
   Le mois se lit à l'heure de Cotonou (`moisACotonou`), jamais en UTC. */

/** Les réponses publiées dans un mois (« AAAA-MM », à l'heure de Cotonou) :
    la date de Google (`reponduLe`, que Make apporte) ou, à défaut, celle que
    le Trône a notée (`publieeLe` du brouillon). Un avis compte une fois.
    « parLeTrone » : parties par le pont (« Publier sur Google »), pas les
    réponses collées à la main. */
export type PublieesDuMois = { total: number; parLeTrone: number };

const moisDe = (iso: string | undefined): string | null => {
  const t = tempsDe(iso);
  return t > 0 ? moisACotonou(new Date(t)) : null;
};

export function publieesCeMois(
  avis: readonly AvisDeLaRubrique[], brouillons: BrouillonsDAvis, mois: string,
): PublieesDuMois {
  let total = 0;
  let parLeTrone = 0;
  for (const a of avis) {
    const b = brouillons[a.cle];
    const le = a.reponduLe || b?.publieeLe;
    if (moisDe(le) !== mois) continue;
    total++;
    if (a.parLeTrone || b?.parLeTrone) parLeTrone++;
  }
  return { total, parLeTrone };
}

/** LA NOTE DES DIX DERNIERS : la moyenne, à une décimale, des dix avis notés
    les plus récents, triés sur `publieLe` (la date de Google), jamais sur
    `quand` (« il y a 3 mois », que Places écrit en lettres : `etatDesAvis`
    s'y trompe). Une note hors de 1 à 5 n'est pas une note. */
export type NoteDesDerniers = { note: number | null; n: number };

export function noteDesDixDerniers(avis: readonly AvisDeLaRubrique[], n = 10): NoteDesDerniers {
  const notes = avis.filter((a) => a.note >= 1 && a.note <= 5)
    .sort((x, y) => tempsDe(y.publieLe) - tempsDe(x.publieLe)).slice(0, n);
  if (notes.length === 0) return { note: null, n: 0 };
  return { note: Math.round((notes.reduce((s, a) => s + a.note, 0) / notes.length) * 10) / 10, n: notes.length };
}

/** « 1 à 3 étoiles » : le même seuil que la redemande d'avis ; 0 n'est pas une note. */
export const estUneNoteBasse = (note: number): boolean => note > 0 && note <= NOTE_A_RECONQUERIR;

/** L'ORDRE DE LA LISTE : ce qui attend un geste d'abord, et parmi eux les
    1 à 3 étoiles en tête ; puis les écartés ; puis les répondus. À rang égal,
    le plus récent d'abord. Ne touche pas la liste reçue. */
export function ordreDeLaListe(
  avis: readonly AvisDeLaRubrique[], brouillons: BrouillonsDAvis, maintenant: number,
): AvisDeLaRubrique[] {
  const rangDe = (a: AvisDeLaRubrique): number => {
    const e = etatDeLAvis(a, brouillons[a.cle], maintenant);
    if (e === 'publiee') return 3;
    if (e === 'ecartee') return 2;
    return estUneNoteBasse(a.note) ? 0 : 1;
  };
  const rangs = new Map(avis.map((a) => [a, rangDe(a)] as const));
  return [...avis].sort((x, y) => (rangs.get(x) ?? 1) - (rangs.get(y) ?? 1) || tempsDe(y.publieLe) - tempsDe(x.publieLe));
}

/** L'ÂGE EN UN MOT, pour la ligne : « 5 min », « 5 h », « 2 j », « 3 mois »,
    « 1 an » ; rien si la date manque ou est à venir. C'est un âge, pas une
    date : la date, avec son année, reste dans le panneau. */
const JOURS_PAR_MOIS = 30.4375;
export function ageCourt(publieLe: string | undefined, maintenant: number): string {
  const t = tempsDe(publieLe);
  if (t <= 0 || maintenant < t) return '';
  const min = Math.floor((maintenant - t) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const j = Math.floor(h / 24);
  if (j < 31) return `${j} j`;
  if (j < 365) return `${Math.floor(j / JOURS_PAR_MOIS)} mois`;
  const ans = Math.floor(j / 365);
  return `${ans} an${ans > 1 ? 's' : ''}`;
}
