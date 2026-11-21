/* L'ÉQUIPE DU MATIN, AU TRÔNE · 21 novembre 2026.

   Le document `mnd_equipe_du_matin` n'est écrit que par la fonction
   `equipe-du-matin` : la question du matin (« À 9 h » ou « À 10 h ») et ce
   qui en a été décidé. Le Trône le LIT pour la carte d'Aujourd'hui, et rend
   la réponse d'un toucher à la fonction, qui juge (la limite, un seul choix,
   un rendez-vous arrivé avant 11 h) et seule écrit. Les règles :
   `equipe-du-matin-pur.ts`. */
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { supabase } from './supabase';
import { etatDuMatin, type EtatDuMatin } from './equipe-du-matin-pur';

export const CLE_DE_L_EQUIPE_DU_MATIN = 'mnd_equipe_du_matin';
const equipeDuMatinStore = createStore<unknown>(CLE_DE_L_EQUIPE_DU_MATIN, { propositions: [] });
bindDocument(equipeDuMatinStore, CLE_DE_L_EQUIPE_DU_MATIN);

export const useEquipeDuMatin = (): EtatDuMatin => etatDuMatin(useStore(equipeDuMatinStore)[0]);

export type ReponseDuMatin = { ok: boolean; motif?: string; heure?: number };

/** « À 9 h » ou « À 10 h », depuis le Trône : la fonction juge et répond. */
export async function repondsAuMatin(heure: number, branchId: string): Promise<ReponseDuMatin> {
  if (!supabase) return { ok: false, motif: 'Le Trône est hors ligne : rien n’a changé.' };
  const { data, error } = await supabase.functions.invoke('equipe-du-matin', { body: { geste: 'repondre', heure, branchId } });
  if (error) return { ok: false, motif: 'La Maison n’a pas pu répondre : rien n’a changé.' };
  const r = (data ?? {}) as { ok?: unknown; motif?: unknown; heure?: unknown };
  return {
    ok: r.ok === true,
    ...(typeof r.motif === 'string' ? { motif: r.motif } : {}),
    ...(typeof r.heure === 'number' ? { heure: r.heure } : {}),
  };
}
