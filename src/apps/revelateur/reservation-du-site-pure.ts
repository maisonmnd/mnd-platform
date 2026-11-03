/* LA RÉSERVATION DU SITE, SES RÈGLES PURES — 3 novembre 2026.

   « Make these changes on maisonmnd.com » (Yéman, 3 novembre 2026) : sept
   changements sur la réservation. Ce module garde ce qui se décide sans
   écran ni réseau, pour que le banc (verifie-la-reservation-du-site) le
   lise tel que la page le dit :
   · la BARRE DU TOTAL, collante au bas du formulaire, qui dit en direct le
     nombre de gestes, la durée et le prix ;
   · la PRÉSÉLECTION par l'adresse (`?geste=`), et le parcours dit en clair ;
   · la RÉFÉRENCE du rendez-vous, dite à l'écran avant WhatsApp, recalculée
     ici quand une ancienne fonction ne la rend pas encore ;
   · le CHARGEUR des places, qui passe au repli après douze secondes ;
   · le RETOUR d'une cliente, dont la phrase ne révèle jamais si un numéro est
     connu de la Maison ;
   · la PAGE DU RENDEZ-VOUS (/rdv/), ce qu'elle montre de la réponse.
   Ni React, ni Supabase, ni DOM. */
import { fmtMoney } from '../../shared/currency';
import { FORME_DE_LA_REFERENCE, referenceDuRendezVous } from '../../shared/lien-du-rdv-pur';
import type { Besoin } from '../../shared/qualification';

/** Une durée dite comme on parle : « 45 min », « 1 h », « 2 h 30 ». */
export const dureeDite = (min?: number): string => {
  if (!min) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};

/** « 10:00 » se dit « 10 h », « 14:30 » se dit « 14 h 30 ». */
export const heureDite = (hhmm: string): string => {
  const [h, m] = String(hhmm ?? '').split(':');
  if (!h) return '';
  return m && m !== '00' ? `${Number(h)} h ${m}` : `${Number(h)} h`;
};

/* ── 1. LA BARRE DU TOTAL ─────────────────────────────────────────────
   Rien tant qu'aucun geste n'est coché. Le prix suit les règles du reste du
   formulaire : « à partir de » dès qu'un geste n'a pas de prix ferme, et
   « prix à la Maison » quand rien ne se chiffre. */
export type BarreDuTotal = { gestes: string; duree: string; prix: string };
export function barreDuTotal(o: { nombre: number; dureeMin: number; prix: number; flou: boolean; devise: string }): BarreDuTotal | null {
  if (!o.nombre || o.nombre < 1) return null;
  return {
    gestes: `${o.nombre} ${o.nombre > 1 ? 'gestes' : 'geste'}`,
    duree: dureeDite(o.dureeMin),
    prix: o.prix > 0 ? `${o.flou ? 'à partir de ' : ''}${fmtMoney(o.prix, o.devise)}` : 'prix à la Maison',
  };
}
/** La barre en une phrase, celle que lit un lecteur d'écran. */
export const texteDeLaBarre = (b: BarreDuTotal | null): string =>
  b ? [b.gestes, b.duree, b.prix].filter(Boolean).join(' · ') : '';

/* ── 2. LA PRÉSÉLECTION ───────────────────────────────────────────────
   `?geste=sv-a,sv-b` précoche ces gestes s'ils se réservent par cette
   porte. La même forme d'identifiant que le lien préparé (lienLu) : ce qui
   ne l'a pas est écarté sans bruit, un doublon ne compte qu'une fois. */
export const ID_DE_GESTE = /^[A-Za-z0-9_-]{1,80}$/;
export function gestesDeLAdresse(recherche: string): string[] {
  try {
    const brut = new URLSearchParams(recherche).getAll('geste').join(',');
    return [...new Set(brut.split(',').map((g) => g.trim()).filter((g) => ID_DE_GESTE.test(g)))];
  } catch {
    return [];
  }
}
/** Ceux des gestes demandés que la porte offre vraiment, au plafond près. */
export const gestesAPrecocher = (demandes: readonly string[], offerts: readonly { id: string }[], plafond: number): string[] =>
  demandes.filter((id) => offerts.some((p) => p.id === id)).slice(0, plafond);

/** LE PARCOURS, DIT EN CLAIR : la cliente venue d'une page voit d'où elle
    vient, et peut changer. */
export const NOM_DU_PARCOURS: Readonly<Record<Besoin, string>> = {
  entretien: 'Entretien',
  reparation: 'Réparation',
  creation: 'Première Couronne',
  enfant: 'MND Kids',
  formation: 'Formation',
  inconnu: 'À choisir',
};

/* ── 6. LA RÉFÉRENCE ──────────────────────────────────────────────────
   Le serveur la rend (`reference`) ; une ancienne fonction encore en ligne
   ne rend que `apptId`, et la référence se calcule alors ici, par la même
   règle (lien-du-rdv-pur) : la même partout. Sans rendez-vous posé, pas de
   référence. */
export function referenceDeLaReponse(r: { reference?: unknown; apptId?: unknown } | null | undefined): string {
  const donnee = typeof r?.reference === 'string' ? r.reference.trim().toUpperCase() : '';
  if (FORME_DE_LA_REFERENCE.test(donnee)) return donnee;
  const id = typeof r?.apptId === 'string' ? r.apptId.trim() : '';
  return id ? referenceDuRendezVous(id) : '';
}

/* ── 5. LE CHARGEUR DES PLACES ────────────────────────────────────────
   Douze secondes d'attente, puis le repli : « Les places ne se chargent
   pas », Réessayer, et WhatsApp. Une panne y va tout de suite. */
export const DELAI_DU_CHARGEUR_MS = 12_000;
export type EtatDuChargeur = 'charge' | 'lent' | 'panne' | 'pret';
export function etatDuChargeur(etat: 'attente' | 'frais' | 'panne', depuisMs: number): EtatDuChargeur {
  if (etat === 'frais') return 'pret';
  if (etat === 'panne') return 'panne';
  return depuisMs >= DELAI_DU_CHARGEUR_MS ? 'lent' : 'charge';
}
export const PHRASE_DU_REPLI_DES_PLACES = 'Les places ne se chargent pas.';
export const PHRASE_DU_REPLI_DU_CALENDRIER = 'Le calendrier ne se charge pas.';

/* ── 7. LE RETOUR D'UNE CLIENTE ───────────────────────────────────────
   Le serveur répond toujours `{ ok: true }` à un numéro bien formé, qu'il
   soit connu ou non (s'il l'est, le WhatsApp part) : la page dit donc UNE
   phrase, la même pour toutes. Seuls un numéro mal formé et le trop-plein
   se disent autrement. */
export const PHRASE_DU_RETOUR = 'Si ce numéro est celui d’une cliente de la Maison, un WhatsApp arrive dans la minute avec votre réservation préparée. Sinon, continuez ici, c’est rapide.';
export const PHRASE_DU_RETOUR_TROP = 'Beaucoup de demandes d’un coup : réessayez dans quelques minutes, ou continuez ici.';
export type DitDuRetour = { phrase: string; faute: 'telephone' | 'trop' | 'panne' | null };
export function ditLeRetour(r: { ok?: unknown; error?: unknown } | null | undefined, statut?: number): DitDuRetour {
  if (statut === 429 || r?.error === 'rate_limited') return { phrase: PHRASE_DU_RETOUR_TROP, faute: 'trop' };
  if (r?.error === 'telephone') return { phrase: 'Ce numéro ne semble pas complet. Vérifiez-le, avec son indicatif.', faute: 'telephone' };
  if (r?.ok === true) return { phrase: PHRASE_DU_RETOUR, faute: null };
  return { phrase: 'L’envoi n’a pas abouti. Continuez ici, c’est rapide.', faute: 'panne' };
}
/** La fiche relue par le jeton d'identité, ramenée à ce que le formulaire
    remplit. `dial` vide : le numéro vient entier, en +international, et le
    pays du formulaire ne bouge pas (le serveur lit un numéro qui commence
    par +). */
export type CoordonneesDuRetour = { prenom: string; nom: string; civilite: '' | 'madame' | 'mademoiselle' | 'monsieur'; numero: string; dial: string };
export function coordonneesLues(r: unknown): CoordonneesDuRetour | null {
  const c = (r as { ok?: unknown; cliente?: Record<string, unknown> } | null)?.cliente;
  if ((r as { ok?: unknown } | null)?.ok !== true || !c || typeof c !== 'object') return null;
  const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const civ = c.civilite === 'madame' || c.civilite === 'mademoiselle' || c.civilite === 'monsieur' ? c.civilite : '';
  const numero = texte(c.numero, 24);
  const dial = /^\+\d{1,4}$/.test(texte(c.dial, 6)) ? texte(c.dial, 6) : '';
  if (!numero) return null;
  return { prenom: texte(c.prenom, 60), nom: texte(c.nom, 60), civilite: civ, numero, dial };
}
/** « Mme A. », « M. Jean », ou le prénom seul quand la civilité manque : la
    Maison ne la suppose jamais. */
export const appelDuRetour = (c: Pick<CoordonneesDuRetour, 'prenom' | 'civilite'>): string => {
  const prenom = c.prenom.split(' ')[0] ?? '';
  const titre = c.civilite === 'madame' ? 'Mme' : c.civilite === 'mademoiselle' ? 'Mlle' : c.civilite === 'monsieur' ? 'M.' : '';
  return [titre, prenom].filter(Boolean).join(' ');
};

/* ── 8. LA PAGE DU RENDEZ-VOUS ────────────────────────────────────────
   Ce que la page /rdv/?v= fait de la réponse `{ rdv: 'lire' }` : le
   rendez-vous à venir (avec déplacer, annuler, l'agenda), passé ou annulé
   (dits sans les boutons), ou un lien qui ne vaut plus. Le jeton ne se
   montre jamais. */
export type RendezVousLu = { reference: string; date: string; heure: string; dureeMin: number; gestes: string[]; appel: string; statut: 'a-venir' | 'passe' | 'annule' };
export type LectureDuRdv = { etat: 'pret'; rdv: RendezVousLu } | { etat: 'lien' } | { etat: 'trop' } | { etat: 'panne' };
export function lectureDuRdv(r: unknown, statut?: number): LectureDuRdv {
  if (statut === 429 || (r as { error?: unknown } | null)?.error === 'rate_limited') return { etat: 'trop' };
  const x = r as { ok?: unknown; error?: unknown; rdv?: Record<string, unknown> } | null;
  if (!x || typeof x !== 'object') return { etat: 'panne' };
  if (x.ok !== true) return x.error === 'lien' || x.error === 'introuvable' ? { etat: 'lien' } : { etat: 'panne' };
  const d = x.rdv;
  if (!d || typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || typeof d.heure !== 'string' || !/^\d{2}:\d{2}$/.test(d.heure)) return { etat: 'lien' };
  const statutLu = d.statut === 'passe' || d.statut === 'annule' ? d.statut : 'a-venir';
  return {
    etat: 'pret',
    rdv: {
      reference: typeof d.reference === 'string' && FORME_DE_LA_REFERENCE.test(d.reference) ? d.reference : '',
      date: d.date, heure: d.heure,
      dureeMin: Math.max(0, Math.round(Number(d.dureeMin) || 0)),
      gestes: Array.isArray(d.gestes) ? (d.gestes as unknown[]).filter((g): g is string => typeof g === 'string').slice(0, 6) : [],
      appel: typeof d.appel === 'string' ? d.appel.slice(0, 60) : '',
      statut: statutLu,
    },
  };
}
/** Le nom du fichier d'agenda : « maison-mnd-2026-11-08.ics ». */
export const nomDuFichierAgenda = (date: string): string => `maison-mnd-${date}.ics`;
/** Le jeton lu dans l'adresse, tel quel : la fonction le juge. */
export const jetonDeLAdresse = (recherche: string): string => {
  try { return (new URLSearchParams(recherche).get('v') ?? '').trim().slice(0, 200); } catch { return ''; }
};
