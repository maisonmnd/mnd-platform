/* ══ QUI TIENT LA CONVERSATION, ET SON BADGE · 4 novembre 2026 ══════════
   « L'interface actuelle est trop chargée, on s'y perd. L'utilisateur doit
   comprendre en un coup d'œil : qui a besoin d'une réponse ? quelles sont
   les nouvelles demandes ? où en est chaque conversation ? » (Yéman).
   Maquette PeKLwgLpMsmupgqHCyUSuc ; ses quatre choix, au sélecteur :
   · LA SALLE D'ATTENTE, ce sont les clientes que personne ne tient encore
     (les envois retenus avant de partir s'appellent désormais « Ce qui
     part ») ;
   · NOUVEAU : le premier message d'un numéro sans fiche, sur WhatsApp ou le
     chat du site, jusqu'à ce que quelqu'un la prenne ;
   · GÉRÉE PAR : vous, Perle, l'automate, ou une personne de l'équipe ;
   · le fond blanc et gris clair sur cet écran seulement.

   Ce module dit, pour une boîte (`boite-unique-pur`) :
   · QUI LA TIENT : la personne qui l'a prise (le document partagé
     `mnd_qui_tient`), sinon l'automate qui tient son fil, sinon Perle si
     c'est elle qui a écrit en dernier, sinon la personne de l'équipe qui lui
     a écrit dans les 48 dernières heures, sinon personne ;
   · SON BADGE, un seul, en mots simples, posé sur la pastille d'À traiter
     (`pastilleDe`) quand elle dit l'urgence ou la demande ;
   · si elle est EN ATTENTE D'ELLE : la Maison a écrit la dernière, il y a
     moins de 7 jours, et rien ne l'attend.
   Rien n'est deviné de ses mots. Pur : `scripts/verifie-qui-tient.mjs` le
   prouve (et `--prouve`). */

import type { Boite } from './boite-unique-pur';
import type { Pastille } from './a-traiter-pur';

const HEURE_MS = 3_600_000;
const JOUR_MS = 86_400_000;
/** Une personne de l'équipe qui a écrit dans ce délai tient encore la conversation. */
export const TENUE_HUMAINE_MS = 48 * HEURE_MS;
/** Au-delà, la Maison n'attend plus sa réponse : elle sort d'« En attente ». */
export const ATTENTE_MS = 7 * JOUR_MS;

/* ── LE DOCUMENT PARTAGÉ : qui a pris quelle boîte ─────────────────────── */

/** Une prise : la personne qui la tient (son nom tel que l'équipe le lit),
    quand, et qui a fait le geste (elle-même, ou une autre qui la lui confie). */
export type Prise = { nom: string; le: string; par?: string };
export type PrisesDesBoites = Record<string, Prise>;

/* ── QUI LA TIENT ──────────────────────────────────────────────────────── */

/** `voix` : le nom que porte la machine qui répond, quand ses messages le
    disent (« Opale », qui remplace l'automate sur le numéro de la Maison
    depuis le 4 novembre 2026). */
export type Tenue =
  | { qui: 'equipe'; nom: string; depuis?: string; prise: boolean }
  | { qui: 'perle'; depuis?: string; voix?: string }
  | { qui: 'automate'; depuis?: string; voix?: string }
  | { qui: 'personne' };

/** Les voix nommées des machines de la Maison ; une autre signature garde le nom générique. */
const VOIX_NOMMEES = ['Opale'];
const voixDe = (parQui: string | undefined): string | undefined => VOIX_NOMMEES.find((v) => (parQui ?? '').trim().toLowerCase() === v.toLowerCase());

type BoiteTenue = Pick<Boite, 'cle' | 'bulles' | 'fil'>;

const age = (iso: string | undefined, maintenant: number): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? maintenant - t : Number.POSITIVE_INFINITY;
};

/** QUI TIENT CETTE BOÎTE. La prise écrite d'abord (elle vaut jusqu'à ce
    qu'on la change) ; puis l'automate qui tient son fil ; puis la dernière
    voix de la Maison : Perle, ou une personne de l'équipe de moins de 48 h. */
export function quiTient(b: BoiteTenue, prises: PrisesDesBoites | null | undefined, maintenant: number): Tenue {
  const prise = prises?.[b.cle];
  if (prise?.nom?.trim()) return { qui: 'equipe', nom: prise.nom.trim(), depuis: prise.le, prise: true };
  if (b.fil?.automate?.tenue === 'tenu') {
    const nommee = voixDe([...b.bulles].reverse().find((x) => x.auteur === 'automate' || x.auteur === 'assistant')?.parQui);
    return nommee ? { qui: 'automate', voix: nommee } : { qui: 'automate' };
  }
  const voix = [...b.bulles].reverse().find((x) => x.auteur === 'equipe' || x.auteur === 'assistant');
  if (voix?.auteur === 'assistant') { const nommee = voixDe(voix.parQui); return nommee ? { qui: 'perle', depuis: voix.quand, voix: nommee } : { qui: 'perle', depuis: voix.quand }; }
  if (voix?.auteur === 'equipe' && voix.parQui?.trim() && age(voix.quand, maintenant) < TENUE_HUMAINE_MS) {
    return { qui: 'equipe', nom: voix.parQui.trim(), depuis: voix.quand, prise: false };
  }
  return { qui: 'personne' };
}

/** Le nom comparé sans accents ni majuscules : « Yéman » et « yeman » sont la même personne. */
const plat = (t: string | null | undefined): string => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
export const estMoi = (t: Tenue, moi: string | null | undefined): boolean => t.qui === 'equipe' && !!plat(moi) && plat(t.nom) === plat(moi);

/** CE QUE LA LIGNE DIT DE QUI LA TIENT : « Vous », un prénom, « Perle », « L’automate », « Personne ». */
export function tenueDite(t: Tenue, moi: string | null | undefined): { dit: string; initiale: string; ton: 'vous' | 'equipe' | 'perle' | 'automate' | 'personne' } {
  if (t.qui === 'equipe') {
    if (estMoi(t, moi)) return { dit: 'Vous', initiale: (t.nom[0] ?? 'V').toUpperCase(), ton: 'vous' };
    const prenom = t.nom.split(/\s+/)[0] ?? t.nom;
    return { dit: prenom, initiale: (prenom[0] ?? '·').toUpperCase(), ton: 'equipe' };
  }
  if (t.qui === 'perle') return t.voix ? { dit: t.voix, initiale: t.voix[0].toUpperCase(), ton: 'perle' } : { dit: 'Perle', initiale: 'P', ton: 'perle' };
  if (t.qui === 'automate') return t.voix ? { dit: t.voix, initiale: t.voix[0].toUpperCase(), ton: 'automate' } : { dit: 'L’automate', initiale: 'A', ton: 'automate' };
  return { dit: 'Personne', initiale: '?', ton: 'personne' };
}

/* ── LA SALLE D'ATTENTE, LA NOUVELLE, L'ATTENTE D'ELLE ────────────────── */

type BoiteJugee = BoiteTenue & Pick<Boite, 'attendUneReponse' | 'sansFiche' | 'tri' | 'pourquoi' | 'rangee' | 'derniere'>;

/** EN SALLE D'ATTENTE : elle attend une réponse, et personne ne la tient. */
export const enSalleDAttente = (b: BoiteJugee, t: Tenue): boolean => b.attendUneReponse && !b.tri && t.qui === 'personne';

/** NOUVELLE : un numéro sans fiche écrit pour la première fois (WhatsApp ou
    le chat du site), et personne de la Maison ne lui a encore répondu de sa
    main ni ne l'a prise. Le tri des démarcheurs l'a laissée passer. */
export function estNouvelle(b: BoiteJugee, t: Tenue): boolean {
  if (!b.attendUneReponse || !b.sansFiche || b.tri) return false;
  if (t.qui === 'equipe') return false;
  if (!b.pourquoi.length || !b.pourquoi.every((p) => p === 'whatsapp' || p === 'chat')) return false;
  return !b.bulles.some((x) => x.auteur === 'equipe');
}

/** EN ATTENTE D'ELLE : rien ne l'attend, la Maison a écrit la dernière (de
    sa main, Perle, l'automate ou le chat ; jamais un modèle parti seul, un
    rappel n'est pas une conversation), il y a moins de 7 jours. */
export function enAttenteDElle(b: BoiteJugee, maintenant: number): boolean {
  if (b.attendUneReponse || b.tri || b.rangee || !b.derniere) return false;
  if (!['equipe', 'assistant', 'automate', 'chat'].includes(b.derniere.auteur)) return false;
  return age(b.derniere.quand, maintenant) < ATTENTE_MS;
}

/* ── LE BADGE : un seul par ligne ──────────────────────────────────────── */

export type CleDuBadge = 'nouveau' | 'urgent' | 'demande' | 'merci' | 'en-cours' | 'repondre' | 'range' | 'auto' | 'attente' | 'calme';
export type TonDuBadge = 'vert' | 'terre' | 'indigo' | 'calme' | 'indigo-pale' | 'cuivre' | 'contour' | 'gris';
export type Badge = { cle: CleDuBadge; dit: string; ton: TonDuBadge };

/** LE BADGE D'UNE LIGNE. L'urgence et la demande gardent les mots de la
    pastille d'À traiter (« Santé · rappeler sous 24 h », « Confirmer sa
    place ») ; le reste se dit en un mot. `merci` : son groupe d'À traiter. */
export function badgeDe(b: BoiteJugee, o: { pastille: Pastille; tenue: Tenue; merci: boolean; maintenant: number }): Badge {
  const { pastille: p, tenue: t } = o;
  if (b.attendUneReponse) {
    if (p.ton === 'terre') return { cle: 'urgent', dit: p.dit, ton: 'terre' };
    if (estNouvelle(b, t)) return { cle: 'nouveau', dit: 'Nouveau', ton: 'vert' };
    if (o.merci) return { cle: 'merci', dit: 'Un merci', ton: 'calme' };
    if (b.pourquoi.includes('demande')) return { cle: 'demande', dit: p.dit, ton: 'indigo' };
    if (t.qui === 'equipe') return { cle: 'en-cours', dit: 'En cours', ton: 'indigo-pale' };
    return { cle: 'repondre', dit: 'À répondre', ton: 'cuivre' };
  }
  if (b.rangee) return { cle: 'range', dit: 'Rien à répondre', ton: 'vert' };
  if (t.qui === 'automate' || (t.qui === 'perle' && !enAttenteDElle(b, o.maintenant))) return { cle: 'auto', dit: 'Automatisé', ton: 'contour' };
  if (enAttenteDElle(b, o.maintenant)) return { cle: 'attente', dit: 'En attente', ton: 'gris' };
  return { cle: 'calme', dit: p.dit, ton: 'calme' };
}
