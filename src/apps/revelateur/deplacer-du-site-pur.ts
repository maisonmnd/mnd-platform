/* DÉPLACER SON RENDEZ-VOUS SUR LE SITE, CE QUE LA PAGE EN LIT ET EN DIT —
   7 novembre 2026. « DÉPLACER son RDV depuis le site, ouvrir le calendrier et
   changer de date » (Yéman). La page /rdv/?v= ouvre le calendrier en mois
   (celui de la réservation : `calendrier-du-site-pur`), propose les heures
   libres du MÊME maître pour la MÊME durée, puis « Déplacer à ce moment ».

   Ce fichier est PUR : ce que la fonction `demande-submit` rend
   (`{ rdv: 'places' }` et `{ rdv: 'deplacer' }`), relu avant d'être cru, et
   les mots que la cliente lit. La règle des 24 heures vit dans
   shared/deplacer-du-site-pur.ts ; le serveur seul la juge, la page n'en
   tire que le bouton à montrer. Jamais de « — », jamais de « salon ». */
import { deplacementPermis } from '../../shared/deplacer-du-site-pur';
import { FORME_DE_LA_REFERENCE } from '../../shared/lien-du-rdv-pur';
import { lectureDuRdv, type RendezVousLu } from './reservation-du-site-pure';

export const FONCTION_DES_PLACES = 'demande-submit';

/** Pourquoi un rendez-vous ne se déplace pas depuis la page. */
export type RaisonDuRefus = 'trop_tard' | 'annule' | 'passe';

/** Ce que la page montre à la place du bouton « Déplacer ». `ouvert` : le
    calendrier peut s'ouvrir ; `ecrire` : 24 h ou moins restent, un mot à la
    Maison sur WhatsApp. Un rendez-vous annulé ou passé n'a ni l'un ni l'autre. */
export function leBoutonDeplacer(r: { statut: RendezVousLu['statut']; date: string; heure: string }, maintenantMs: number): 'ouvert' | 'ecrire' | 'rien' {
  if (r.statut !== 'a-venir') return 'rien';
  const v = deplacementPermis({ status: 'confirmé', date: r.date, time: r.heure }, maintenantMs);
  return v === 'permis' ? 'ouvert' : v === 'trop-tard' ? 'ecrire' : 'rien';
}

/** Les places libres, relues. `jours` : AAAA-MM-JJ → ses heures (HH:MM), du
    plus tôt au plus tard ; `fermes` : les jours que la Maison ne reçoit pas. */
export type PlacesDuDeplacement = {
  du: string; au: string; dureeMin: number; actuel: { date: string; heure: string };
  jours: Record<string, string[]>; fermes: string[];
};
export type LectureDesPlaces =
  | { etat: 'pret'; places: PlacesDuDeplacement }
  | { etat: 'ferme'; raison: RaisonDuRefus }
  | { etat: 'lien' } | { etat: 'trop' } | { etat: 'panne' };

/** Un jour qui existe : « 2026-13-01 » a la forme d'un jour, pas le calendrier. */
const JOUR = {
  test: (s: string): boolean => {
    const t = Date.parse(`${s}T12:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
  },
};
/** Une heure qui existe : « 25:00 » non. */
const HEURE = { test: (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s) };
/** Quatre mois et demi de jours au plus : la borne de la réservation, avec de la marge. */
const JOURS_AU_PLUS = 140;

export function placesLues(r: unknown, statut?: number): LectureDesPlaces {
  const x = r as ({ ok?: unknown; error?: unknown; deplacable?: unknown; raison?: unknown } & Record<string, unknown>) | null;
  if (statut === 429 || x?.error === 'rate_limited') return { etat: 'trop' };
  if (!x || typeof x !== 'object') return { etat: 'panne' };
  if (x.ok !== true) return x.error === 'lien' || x.error === 'introuvable' ? { etat: 'lien' } : { etat: 'panne' };
  if (x.deplacable === false) {
    return x.raison === 'trop_tard' || x.raison === 'annule' || x.raison === 'passe' ? { etat: 'ferme', raison: x.raison } : { etat: 'panne' };
  }
  const jours: Record<string, string[]> = {};
  const brut = x.jours as Record<string, unknown> | null;
  if (x.deplacable !== true || !brut || typeof brut !== 'object' || Array.isArray(brut)) return { etat: 'panne' };
  const entrees = Object.entries(brut);
  if (entrees.length > JOURS_AU_PLUS) return { etat: 'panne' };
  for (const [iso, heures] of entrees) {
    if (!JOUR.test(iso) || !Array.isArray(heures)) return { etat: 'panne' };
    const bonnes = (heures as unknown[]).filter((h): h is string => typeof h === 'string' && HEURE.test(h));
    if (bonnes.length > 0) jours[iso] = [...new Set(bonnes)].sort();
  }
  const actuel = x.actuel as { date?: unknown; heure?: unknown } | null;
  if (typeof x.du !== 'string' || !JOUR.test(x.du) || typeof x.au !== 'string' || !JOUR.test(x.au) || x.du > x.au) return { etat: 'panne' };
  if (!actuel || typeof actuel.date !== 'string' || !JOUR.test(actuel.date) || typeof actuel.heure !== 'string' || !HEURE.test(actuel.heure)) return { etat: 'panne' };
  const fermes = Array.isArray(x.fermes) ? (x.fermes as unknown[]).filter((j): j is string => typeof j === 'string' && JOUR.test(j)).slice(0, JOURS_AU_PLUS) : [];
  return {
    etat: 'pret',
    places: { du: x.du, au: x.au, dureeMin: Math.max(0, Math.round(Number(x.dureeMin) || 0)), actuel: { date: actuel.date, heure: actuel.heure }, jours, fermes },
  };
}

/** Ce que « Déplacer à ce moment » a rendu : le rendez-vous à sa nouvelle
    place (la même lecture que la page), ou pourquoi il n'a pas bougé. */
export type RefusDuDeplacement = 'place_prise' | 'trop_tard' | 'annule' | 'passe' | 'meme_place' | 'lien' | 'modifie' | 'panne';
export type LectureDuDeplacement =
  | { etat: 'deplace'; rdv: RendezVousLu; confirmation: 'envoyee' | 'plus-tard' | 'sans' | 'deja' }
  | { etat: 'refus'; raison: RefusDuDeplacement }
  | { etat: 'trop' };

/** Les codes du serveur qui disent « cette place n'est plus libre » : elle est partie, ou ne tient pas. */
const PLACE_PERDUE = ['creneau_pris', 'creneau_plafond', 'creneau_ferme', 'creneau_hors_ouverture', 'creneau_hors_fenetre', 'creneau_invalide', 'creneau_trop_proche'];

export function deplacementLu(r: unknown, statut?: number): LectureDuDeplacement {
  const x = r as { ok?: unknown; error?: unknown; verdict?: unknown; confirmation?: unknown; rdv?: unknown } | null;
  if (statut === 429 || x?.error === 'rate_limited') return { etat: 'trop' };
  if (!x || typeof x !== 'object') return { etat: 'refus', raison: 'panne' };
  if (x.ok !== true) {
    const e = String(x.error ?? '');
    if (PLACE_PERDUE.includes(e)) return { etat: 'refus', raison: 'place_prise' };
    if (e === 'trop_tard' || e === 'annule' || e === 'passe' || e === 'meme_place' || e === 'modifie') return { etat: 'refus', raison: e };
    return { etat: 'refus', raison: e === 'lien' || e === 'introuvable' ? 'lien' : 'panne' };
  }
  if (x.verdict !== 'deplace' && x.verdict !== 'deja') return { etat: 'refus', raison: 'panne' };
  const lu = lectureDuRdv({ ok: true, rdv: x.rdv });
  /* Un rendez-vous rendu sans sa forme, ou pas à venir : la page ne dit rien de faux. */
  if (lu.etat !== 'pret' || lu.rdv.statut !== 'a-venir' || !FORME_DE_LA_REFERENCE.test(lu.rdv.reference)) return { etat: 'refus', raison: 'panne' };
  const c = x.confirmation;
  return {
    etat: 'deplace', rdv: lu.rdv,
    /* « En cours » : le message part en tâche de fond, la page ne le dit pas échoué. */
    confirmation: c === 'envoyé' || c === 'en-cours' ? 'envoyee' : c === 'deja' ? 'deja' : c === 'plus-tard' ? 'plus-tard' : 'sans',
  };
}

/* ── Les mots ───────────────────────────────────────────────────────────── */
export const MOTS_DU_DEPLACEMENT = {
  sur: 'Déplacer mon rendez-vous',
  titre: 'Choisissez une nouvelle date',
  jusqua: 'Vous avez jusqu’à 24 h avant votre rituel pour déplacer.',
  heures: 'Choisissez l’heure :',
  bouton: 'Déplacer à ce moment',
  encours: 'Un instant…',
  garder: 'Garder ma date',
  charge: 'Les places se chargent.',
  /** Le bouton qui remplace « Déplacer » quand il reste 24 h ou moins. */
  ecrire: 'Déplacer : écrire à la Maison',
  trop_tard: 'Il reste 24 h ou moins avant votre rituel : pour le déplacer, écrivez à la Maison sur WhatsApp.',
  aucune: 'Aucune place libre pour le moment. Écrivez à la Maison sur WhatsApp, nous trouverons ensemble.',
  panne: 'Les places ne se chargent pas. Réessayez dans un moment, ou écrivez à la Maison sur WhatsApp.',
  reessayer: 'Réessayer',
  trop: 'Beaucoup de demandes d’un coup. Réessayez dans un moment.',
  /** L'écran de confirmation. */
  surFait: 'Rendez-vous déplacé',
  revenir: 'Revenir à mon rendez-vous',
} as const;

/** Pourquoi le rendez-vous n'a pas bougé, en une phrase calme. Le choix reste à elle. */
export function refusDuDeplacementDit(r: RefusDuDeplacement): string {
  switch (r) {
    case 'place_prise': return 'Cette place vient d’être prise. Choisissez-en une autre, votre rendez-vous n’a pas bougé.';
    case 'trop_tard': return MOTS_DU_DEPLACEMENT.trop_tard;
    case 'annule': return 'Ce rendez-vous est annulé : il ne peut plus être déplacé.';
    case 'passe': return 'Ce rendez-vous a eu lieu : il ne peut plus être déplacé.';
    case 'meme_place': return 'C’est déjà la date de votre rendez-vous. Choisissez-en une autre.';
    case 'modifie': return 'Votre rendez-vous vient de changer. Réessayez dans un instant, ou écrivez à la Maison.';
    case 'lien': return 'Ce lien ne vaut plus. Retrouvez votre rendez-vous avec votre code, ou écrivez à la Maison.';
    default: return 'Le déplacement ne répond pas. Votre rendez-vous n’a pas bougé : réessayez dans un moment, ou écrivez à la Maison sur WhatsApp.';
  }
}

/** Ce que l'écran « Rendez-vous déplacé » dit de la suite : la Maison prévenue, et la référence qui ne change pas. */
export function suiteDuDeplacementDite(o: { confirmation: 'envoyee' | 'plus-tard' | 'sans' | 'deja'; reference: string }): string {
  const message = o.confirmation === 'sans'
    ? 'La Maison est prévenue.'
    : o.confirmation === 'plus-tard'
      ? 'La Maison est prévenue et vous confirme cette nouvelle date sur WhatsApp.'
      : 'Un message de confirmation arrive sur votre WhatsApp, et la Maison est prévenue.';
  return `${message} Votre référence ne change pas : ${o.reference}.`;
}
