/* ══ LA LISTE D'ATTENTE D'UN JOUR PLEIN — 26 novembre 2026 ═══════════════
   Audit du Trône, point B3, « Remplir la semaine et les fins d'après-midi »,
   validé par Yéman (« construis ») : quand un jour est plein, la cliente
   demande à être prévenue ; une place libérée se propose d'abord à la
   première de la file.

   LE CHEMIN :
     - sur le site (Réserver) et dans Ma Couronne (la réservation), un jour
       complet offre « Prévenez-moi si une place se libère ce jour-là ». La
       demande part à la fonction `demande-submit` (`{ prevenir: 'place' }`),
       qui seule écrit la table `liste_d_attente` (0252) : le navigateur d'une
       cliente n'y a aucun droit ;
     - au Trône, le Calendrier dit les jours qui ont une file et, dès qu'une
       place y est libre (une annulation, un déplacement, un « à
       reprogrammer » : peu importe la cause, la place se constate), la
       première de la file, son heure, et un message prêt à partir PAR LA MAIN
       (lot 1 : aucun envoi automatique) ;
     - « Elle l'a prise », « Pas intéressée », « Pas de réponse » : la file
       avance ; une demande dont le jour est passé ne se montre plus.

   Le bloc ⟨liste-d-attente⟩ est RECOPIÉ dans `demande-submit` : la relecture
   de ce que la porte reçoit est la même des deux côtés (douze lunes R8,
   `scripts/verifie-remplir-la-semaine.mjs`). Rien n'y entre qui ne puisse
   vivre dans une fonction Edge. */

/* ⟨liste-d-attente⟩ */
/** La table, écrite par `demande-submit` seule (0252). */
export const TABLE_DE_L_ATTENTE = 'liste_d_attente';
/** Jusqu'où l'on peut attendre : l'horizon de la réservation en ligne (ce mois et les trois suivants). */
export const HORIZON_DE_L_ATTENTE_JOURS = 124;
/** Les demandes encore vivantes d'un même numéro, au plus. */
export const ATTENTES_PAR_NUMERO = 3;

export type SourceDeLAttente = 'site' | 'couronne';
/** attend : dans la file ; proposee : la place lui a été proposée, on attend
    sa réponse ; les trois autres closent sa demande. */
export type StatutDeLAttente = 'attend' | 'proposee' | 'prise' | 'pas-interessee' | 'sans-reponse';

export type DemandeDAttente = {
  id: string;
  branchId: string;
  /** Le jour plein qu'elle attend (AAAA-MM-JJ, jour de Cotonou). */
  jour: string;
  /** Le dépôt (ISO) : il fait son rang dans la file. */
  creeLe: string;
  source: SourceDeLAttente;
  prenom: string;
  /** E.164, posé par le serveur. */
  telephone: string;
  /** Sa fiche, quand elle vient de Ma Couronne. */
  clientId?: string;
  /** Ce qu'elle voulait réserver ce jour-là. */
  serviceIds: string[];
  /** La durée que la page lui montrait, en minutes. */
  dureeMin?: number;
  /** Une tête de 150 locks ou plus (la règle des deux têtes). */
  lourde?: boolean;
  statut: StatutDeLAttente;
  /** L'heure proposée, quand, par qui. */
  proposee?: { heure: string; le: string; par?: string };
  /** Quand sa demande s'est close, et par qui. */
  closeLe?: string;
  closePar?: string;
};

const JOUR_DE_L_ATTENTE = /^\d{4}-\d{2}-\d{2}$/;
const midiDeLAttente = (j: string): number => Date.UTC(Number(j.slice(0, 4)), Number(j.slice(5, 7)) - 1, Number(j.slice(8, 10)), 12);
/** Les jours de `du` à `au` (négatif si `au` est avant). */
export const ecartDeLAttente = (du: string, au: string): number => Math.round((midiDeLAttente(au) - midiDeLAttente(du)) / 86_400_000);
const propreDeLAttente = (v: unknown, max: number): string => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export type AttenteLue =
  | { ok: true; jour: string; prenom: string; serviceIds: string[]; dureeMin: number; lourde: boolean }
  | { ok: false; raison: 'jour' | 'passe' | 'loin' | 'prenom' | 'gestes' };

/** CE QUE LA PORTE REÇOIT, RELU. Un jour réel, d'aujourd'hui (Cotonou) à
    l'horizon ; un prénom quand la page doit le dire (le site) ; les gestes
    voulus (un au moins, six au plus) ; une durée bornée à douze heures. */
export function demandeDAttenteLue(d: unknown, aujourdhui: string, prenomExige = true): AttenteLue {
  const x = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  const jour = String(x.jour ?? '').slice(0, 10);
  if (!JOUR_DE_L_ATTENTE.test(jour) || Number.isNaN(midiDeLAttente(jour)) || new Date(midiDeLAttente(jour)).toISOString().slice(0, 10) !== jour) return { ok: false, raison: 'jour' };
  if (jour < aujourdhui) return { ok: false, raison: 'passe' };
  if (ecartDeLAttente(aujourdhui, jour) > HORIZON_DE_L_ATTENTE_JOURS) return { ok: false, raison: 'loin' };
  const prenom = propreDeLAttente(x.prenom, 60);
  if (prenomExige && prenom.length < 2) return { ok: false, raison: 'prenom' };
  const serviceIds = (Array.isArray(x.serviceIds) ? x.serviceIds : []).slice(0, 6).map((s) => propreDeLAttente(s, 60)).filter(Boolean);
  if (serviceIds.length === 0) return { ok: false, raison: 'gestes' };
  const duree = Math.round(Number(x.dureeMin) || 0);
  return { ok: true, jour, prenom, serviceIds, dureeMin: Math.max(0, Math.min(720, duree)), lourde: x.lourde === true };
}

/** Une demande vit-elle encore ? Dans la file ou proposée, et son jour pas passé. */
export const attenteVivante = (a: Pick<DemandeDAttente, 'statut' | 'jour'>, aujourdhui: string): boolean =>
  (a.statut === 'attend' || a.statut === 'proposee') && String(a.jour ?? '') >= aujourdhui;
/* ⟨/liste-d-attente⟩ */

/* ── AU TRÔNE ─────────────────────────────────────────────────────────── */

/** LA FILE D'UN JOUR : ses demandes vivantes, la plus ancienne d'abord. */
export function fileDuJour<T extends DemandeDAttente>(attentes: readonly T[], jour: string, aujourdhui: string, branchId?: string): T[] {
  return attentes
    .filter((a) => !!a && a.jour === jour && attenteVivante(a, aujourdhui) && (!branchId || a.branchId === branchId))
    .sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe)) || String(a.id).localeCompare(String(b.id)));
}

/** LES JOURS QUI ATTENDENT, dans l'ordre du calendrier, chacun sa file. */
export function joursQuiAttendent<T extends DemandeDAttente>(attentes: readonly T[], aujourdhui: string, branchId?: string): { jour: string; file: T[] }[] {
  const jours = [...new Set(attentes.filter((a) => !!a && attenteVivante(a, aujourdhui) && (!branchId || a.branchId === branchId)).map((a) => a.jour))].sort();
  return jours.map((jour) => ({ jour, file: fileDuJour(attentes, jour, aujourdhui, branchId) }));
}

/** L'heure à lui offrir : la première place libre du jour qui tient sa durée. */
export const laPlaceAOffrir = (heures: readonly string[]): string | null => heures[0] ?? null;

const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « samedi 28 novembre », lu à midi UTC sur la date seule. */
export function jourDitDeLAttente(jour: string): string {
  if (!JOUR_DE_L_ATTENTE.test(jour)) return '';
  const d = new Date(midiDeLAttente(jour));
  const n = d.getUTCDate();
  return `${JOURS_DITS[d.getUTCDay()]} ${n === 1 ? '1er' : n} ${MOIS_DITS[d.getUTCMonth()]}`;
}
/** « 14 h », « 14 h 30 ». */
export const heureDiteDeLAttente = (hhmm: string): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  return m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`;
};

/** « 2 clientes attendent une place ce samedi 28 novembre. » */
export function phraseDeLaFile(n: number, jour: string): string {
  const quand = jourDitDeLAttente(jour);
  return n <= 1 ? `Une cliente attend une place le ${quand}.` : `${n} clientes attendent une place le ${quand}.`;
}

/** LE MESSAGE QUI PART PAR LA MAIN : la place exacte, et la question. Texte
    de la Maison, écrit par le code ; l'écran le signe (`signeLeMessage`) au
    moment de l'envoyer, comme tout message prêt du Trône. */
export function messageDeLaPlaceLiberee(a: Pick<DemandeDAttente, 'prenom' | 'jour'>, heure: string): string {
  const bonjour = a.prenom ? `Bonjour ${a.prenom},` : 'Bonjour,';
  return `${bonjour} vous nous aviez demandé de vous prévenir : une place s’est libérée le ${jourDitDeLAttente(a.jour)} à ${heureDiteDeLAttente(heure)} à la Maison MND. Souhaitez-vous que nous vous la gardions ?`;
}

export type GesteDeLAttente =
  | { k: 'proposer'; heure: string }
  | { k: 'prise' }
  | { k: 'pas-interessee' }
  | { k: 'sans-reponse' };

/** CE QU'UN GESTE ÉCRIT. Proposer garde la demande dans la file (proposée) ;
    les trois réponses la closent, et la suivante devient la première. */
export function apresLeGeste<T extends DemandeDAttente>(a: T, g: GesteDeLAttente, par: string, le: string): T {
  if (g.k === 'proposer') return { ...a, statut: 'proposee', proposee: { heure: g.heure, le, ...(par ? { par } : {}) } };
  return { ...a, statut: g.k, closeLe: le, ...(par ? { closePar: par } : {}) };
}

/** Ce que dit l'état d'une demande dans sa carte. */
export function etatDeLAttenteDit(a: DemandeDAttente): string {
  if (a.statut === 'proposee' && a.proposee) return `${heureDiteDeLAttente(a.proposee.heure)} proposée, en attente de sa réponse`;
  if (a.statut === 'prise') return 'Elle a pris la place';
  if (a.statut === 'pas-interessee') return 'Pas intéressée';
  if (a.statut === 'sans-reponse') return 'Pas de réponse';
  return 'Dans la file';
}

/** LES JOURS COMPLETS QU'UNE PAGE PEUT PROPOSER : ni fermés ni passés, et
    plus aucune heure pour ce rituel ; les plus proches d'abord. */
export function joursCompletsAProposer(cases: readonly { iso?: string | null; complet: boolean }[], aujourdhui: string, combien = 12): string[] {
  return [...new Set(cases.filter((c) => !!c.iso && c.complet && (c.iso as string) >= aujourdhui).map((c) => c.iso as string))]
    .sort()
    .slice(0, Math.max(0, combien));
}

/** Ce qu'une page dit après l'envoi, selon la réponse de la Maison. */
export function reponseDeLAttenteDite(r: { ok?: unknown; deja?: unknown; error?: unknown } | null | undefined): { ok: boolean; texte: string } {
  if (r?.ok === true) {
    return { ok: true, texte: r.deja === true ? 'Vous êtes déjà sur la liste de ce jour. Nous vous écrirons sur WhatsApp si une place se libère.' : 'C’est noté. Si une place se libère ce jour-là, nous vous écrirons sur WhatsApp.' };
  }
  const e = String(r?.error ?? '');
  if (e === 'telephone') return { ok: false, texte: 'Ce numéro ne semble pas complet. Vérifiez-le, avec son indicatif.' };
  if (e === 'prenom') return { ok: false, texte: 'Votre prénom, pour que nous sachions qui prévenir.' };
  if (e === 'trop') return { ok: false, texte: 'Vous attendez déjà une place sur trois jours. Écrivez-nous sur WhatsApp pour un autre.' };
  if (e === 'ferme') return { ok: false, texte: 'La Maison est fermée ce jour-là.' };
  if (e === 'rate_limited') return { ok: false, texte: 'Trop d’envois d’un coup. Réessayez dans quelques minutes.' };
  return { ok: false, texte: 'La demande n’est pas partie. Réessayez, ou écrivez-nous sur WhatsApp.' };
}
