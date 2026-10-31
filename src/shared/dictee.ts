import { supabase } from './supabase';
import { type ModeDictee, type ReponseDictee } from './dictee-pur';

/* ══ LA DICTÉE MND, CÔTÉ TRÔNE — 31 octobre 2026 ═══════════════════════════
   L'écran envoie ce que l'oreille du téléphone a entendu ; la fonction
   `dictee-au-propre` rend le texte propre. Une mise au propre ne s'attend
   pas : hors ligne, on le dit tout de suite et l'écran se rabat sur la mise
   au propre de secours (`auPropreIci`). */

export type IssueDictee =
  | { ok: true; propre: string; mode: ModeDictee; modele: string }
  | { ok: false; erreur: string; motif: string };

const DIT_DU_MOTIF: Record<string, string> = {
  'hors-ligne': 'Hors ligne : la mise au propre demande le réseau.',
  'pas-de-maison': 'Pas de connexion à la Maison.',
  'pas-en-ligne': 'La fonction dictee-au-propre n’est pas encore en ligne.',
  'reserve-au-personnel': 'Réservé au personnel connecté.',
  'cle-claude-absente': 'La clé de Claude n’est pas posée dans Supabase.',
  plafond: 'Le plafond du mois est atteint : la Dictée reprend le mois prochain.',
  claude: 'Claude n’a pas répondu. Réessayez dans un instant.',
  texte: 'Rien à mettre au propre.',
  serveur: 'Le serveur n’a pas répondu.',
};
const refus = (motif: string): IssueDictee => ({ ok: false, motif, erreur: DIT_DU_MOTIF[motif] ?? DIT_DU_MOTIF.serveur });

export async function metsAuPropre(texte: string, mode: ModeDictee, source: 'telephone' | 'ordinateur' = 'telephone'): Promise<IssueDictee> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return refus('hors-ligne');
  if (!supabase) return refus('pas-de-maison');
  try {
    const { data, error } = await supabase.functions.invoke('dictee-au-propre', { body: { texte, mode, source } });
    if (error) {
      const statut = (error as { context?: { status?: number } }).context?.status;
      if (statut === 404 || /404|not found/i.test(String(error.message))) return refus('pas-en-ligne');
      if (statut === 403) return refus('reserve-au-personnel');
      return refus('serveur');
    }
    const r = (data ?? null) as ReponseDictee | null;
    if (!r || r.ok !== true) return refus(r && 'motif' in r ? r.motif : 'serveur');
    return { ok: true, propre: r.propre, mode: r.mode, modele: r.modele };
  } catch {
    return refus('serveur');
  }
}

/** GET sans rien envoyer : la version en ligne, et si la clé de Claude est posée. */
export async function santeDeLaDictee(): Promise<{ version: string; claude: boolean } | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('dictee-au-propre', { method: 'GET' });
    if (error) return null;
    const d = (data ?? {}) as { version?: string; claude?: string };
    return { version: d.version ?? '', claude: d.claude === 'oui' };
  } catch {
    return null;
  }
}
