import { supabase } from './supabase';
import { lisLeDefaire, texteDeConsigne, estStatutDeConsigne, type Consigne } from './consignes-pur';

/* ══ UNE CONSIGNE AUX ASSISTANTS, CÔTÉ TRÔNE : 5 novembre 2026, lot 1 ══════
   La direction écrit à un assistant (table `assistants_consignes`, 0162), et
   lit le fil. LECTURE ET ÉCRITURE PAR LE CLIENT SUPABASE, SOUS RLS : la
   direction souveraine seule lit, écrit à son nom (`de_user_id` = son compte)
   et retouche (Défaire). L'assistant, lui, passe par la fonction
   `assistants-maison` avec son jeton. Rien en temps réel (les tables voisines
   n'en ont pas) : l'écran relit. */

type LigneConsigne = {
  id: string; de: string; de_user_id: string | null; pour: string; texte: string; statut: string; reponse: string | null;
  defaire: unknown; decision_id: string | null; ecrite_le: string; lue_le: string | null; faite_le: string | null;
  passee_de: string | null; passee_le: string | null; passee_mot: string | null; notifie_le: string | null;
  defaite_le: string | null; defaite_par: string | null;
};

const enConsigne = (l: LigneConsigne): Consigne => {
  const d = lisLeDefaire(l.defaire);
  return {
    id: l.id, de: l.de, deUserId: l.de_user_id, pour: l.pour, texte: l.texte, statut: estStatutDeConsigne(l.statut) ? l.statut : 'envoyee',
    reponse: l.reponse, defaire: d.ok ? d.gestes : null, decisionId: l.decision_id, ecriteLe: l.ecrite_le, lueLe: l.lue_le, faiteLe: l.faite_le,
    passeeDe: l.passee_de, passeeLe: l.passee_le, passeeMot: l.passee_mot, notifieLe: l.notifie_le, defaiteLe: l.defaite_le, defaitePar: l.defaite_par,
  };
};

const tableAbsente = (e: { message?: string; code?: string } | null): boolean =>
  !!e && (e.code === '42P01' || /does not exist|schema cache|not find the table/i.test(e.message ?? ''));

/** Le fil : les plus récentes d'abord. `absente` : la migration 0162 n'est pas encore passée. */
export async function litLesConsignes(limite = 40): Promise<{ consignes: Consigne[]; absente: boolean }> {
  if (!supabase) return { consignes: [], absente: false };
  const { data, error } = await supabase.from('assistants_consignes').select('*').order('ecrite_le', { ascending: false }).limit(limite);
  if (error) return { consignes: [], absente: tableAbsente(error) };
  return { consignes: ((data ?? []) as LigneConsigne[]).map(enConsigne), absente: false };
}

export type IssueDeLaConsigne = { ok: true; consigne: Consigne } | { ok: false; erreur: string };

/** Écrire une consigne, au nom de qui la tape. */
export async function envoieUneConsigne(o: { pour: string; texte: string; de: string; deUserId: string | null; branchId?: string | null }): Promise<IssueDeLaConsigne> {
  const t = texteDeConsigne(o.texte);
  if (!t.ok) return { ok: false, erreur: t.motif === 'texte-vide' ? 'La consigne est vide.' : 'La consigne dépasse mille caractères : coupez-la en deux.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, erreur: 'Hors ligne : une consigne demande le réseau.' };
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison : la consigne ne peut pas partir de ce poste.' };
  if (!o.deUserId) return { ok: false, erreur: 'Connectez-vous d’abord : une consigne porte le nom de qui l’écrit.' };
  const id = `consigne-${globalThis.crypto.randomUUID()}`;
  const ligne = { id, de: o.de, de_user_id: o.deUserId, pour: o.pour, texte: t.texte, statut: 'envoyee', ...(o.branchId ? { branch_id: o.branchId } : {}) };
  const { data, error } = await supabase.from('assistants_consignes').insert(ligne).select('*').maybeSingle();
  if (error) {
    if (tableAbsente(error)) return { ok: false, erreur: 'La table des consignes n’est pas encore en ligne (migration 0162).' };
    return { ok: false, erreur: 'La consigne n’a pas pu s’écrire au Trône : réservé à la direction connectée.' };
  }
  return { ok: true, consigne: enConsigne((data ?? { ...ligne, ecrite_le: new Date().toISOString() }) as LigneConsigne) };
}

/** Défaire est fait par les magasins du Trône ; la consigne le note, au nom de qui l'a touché. */
export async function noteLeDefaire(id: string, par: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  const { error } = await supabase.from('assistants_consignes').update({ defaite_le: new Date().toISOString(), defaite_par: par }).eq('id', id);
  return error ? { ok: false, erreur: 'Le fil n’a pas pu noter le défaire : les rendez-vous, eux, sont revenus.' } : { ok: true };
}
