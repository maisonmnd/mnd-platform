import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment } from '../../shared/agenda';

/* ══ MA COURONNE PASSE PAR LE SERVEUR · 17 novembre 2026 ═════════════════
   Ma Couronne ne pose plus son rendez-vous elle-même (Yéman, « La
   consultation en affiches »). Elle dit à la Maison ce qu'elle VEUT (la tête,
   les gestes, les séances, le maître souhaité), et `demande-submit`
   (`{ couronne: 'reserver' }`) décide du reste, avec sa session : la durée au
   calibre de sa fiche, la place sous verrou, le statut, l'acompte, la remise
   des places. Le prix ne se fige plus depuis l'appareil : ce qu'elle a vu
   part pour la note du comptoir, pas comme un prix.

   Ce fichier ne fait que parler au serveur et relire sa réponse, sans la
   croire sur parole. `injoignable` : la fonction n'a pas répondu, ou c'est
   une version d'avant qui ne connaît pas ce geste ; Ma Couronne garde alors
   l'ancien chemin (l'écriture directe, que la base ramène à « en attente »,
   0224) : on ne perd pas une réservation pour une panne. */

export type DemandeALaMaison = {
  /** La tête : elle, ou son enfant. */
  pour: string;
  nom: string;
  branchId: string;
  serviceIds: string[];
  /** `id` : celui que l'acompte en ligne a porté chez KkiaPay, pour la première séance. */
  seances: { date: string; time: string; id?: string }[];
  /** Le maître qu'elle a vu ; la Maison le garde s'il est libre. */
  maitre: string;
  notes: string[];
  /** L'écran montrait la remise des places limitées de ce jour. */
  placeAttendue: boolean;
  /** L'écran ne montrait aucune place limitée : le serveur n'en pose pas en silence. */
  tarifDeLaMaison: boolean;
  /** Ce qu'elle a vu, pour la note du comptoir : jamais un prix qui fait foi. */
  vu: { totalXof: number; remiseXof: number; dureeMin: number };
  transactionId?: string;
};

export type ReponseDeLaMaison =
  | { etat: 'pose'; rdvs: Appointment[]; ferme: boolean }
  | { etat: 'refus'; raison: 'prise' | 'place-partie' | 'refusee' }
  | { etat: 'injoignable' };

/** Ce que le serveur a rendu, relu. Un refus de place se dit « prise » ; la
    dernière place limitée partie, « place-partie » ; tout ce qu'on ne sait pas
    lire est une fonction injoignable, jamais une réservation réussie. */
export function reponseDeLaMaisonLue(data: unknown): ReponseDeLaMaison {
  const x = (data && typeof data === 'object' ? data : null) as { ok?: unknown; etat?: unknown; rdvs?: unknown; error?: unknown } | null;
  if (x && x.ok === true && Array.isArray(x.rdvs) && (x.etat === 'confirme' || x.etat === 'en-attente')) {
    const rdvs = (x.rdvs as Appointment[]).filter((a) => !!a && typeof a.id === 'string' && typeof a.date === 'string'
      && typeof a.time === 'string' && (a.status === 'confirmé' || a.status === 'en attente'));
    if (rdvs.length !== (x.rdvs as unknown[]).length) return { etat: 'injoignable' };
    return { etat: 'pose', rdvs, ferme: x.etat === 'confirme' };
  }
  const e = String(x?.error ?? '');
  if (e === 'places_limitees') return { etat: 'refus', raison: 'place-partie' };
  if (/^creneau_/.test(e)) return { etat: 'refus', raison: 'prise' };
  if (e === 'prestation_inconnue' || e === 'prestation_hors_fenetre' || e === 'tete' || e === 'rate_limited') return { etat: 'refus', raison: 'refusee' };
  return { etat: 'injoignable' };
}

/** Demande la réservation à la Maison. Ne lève jamais. */
export async function reserveALaMaison(sb: SupabaseClient, demande: DemandeALaMaison): Promise<ReponseDeLaMaison> {
  try {
    const { data, error } = await sb.functions.invoke('demande-submit', { body: { couronne: 'reserver', data: demande } });
    if (!error) return reponseDeLaMaisonLue(data);
    /* Un refus jugé (409, 403, 429) porte son corps ; une panne n'en porte pas. */
    const rep = (error as { context?: Response } | null)?.context;
    const corps = rep && typeof rep.json === 'function' ? await rep.json().catch(() => null) : null;
    return reponseDeLaMaisonLue(corps);
  } catch {
    return { etat: 'injoignable' };
  }
}
