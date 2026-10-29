import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { CLE_DU_TRI, TRI_VIDE, triLu, type TriDesMessages, type VerdictDuTri } from './tri-des-messages-pur';

/* ══ LE TRI DES DÉMARCHEURS, AU TRÔNE — 29 octobre 2026 ══════════════════
   Le registre (`mnd_tri_des_messages`) n'est écrit que par la fonction
   `tri-des-messages` : le Trône le lit, toutes les minutes et après chaque
   geste, et passe par la fonction pour bloquer, débloquer, rendre à
   « À traiter » et relire les dernières 24 heures (le blocage WhatsApp
   demande le jeton de Meta, qui ne quitte jamais le serveur). */

/** Le registre, relu toutes les minutes ; `relis` après un geste. */
export function useTriDesMessages(): { tri: TriDesMessages; relis: () => void } {
  const [tri, setTri] = useState<TriDesMessages>(TRI_VIDE);
  const [tour, setTour] = useState(0);
  const relis = useCallback(() => setTour((n) => n + 1), []);
  useEffect(() => {
    const sb = supabase;
    if (!sb) return undefined;
    let vivant = true;
    const lis = async () => {
      const { data, error } = await sb.from('documents').select('data').eq('key', CLE_DU_TRI).maybeSingle();
      if (vivant && !error) setTri(triLu(data?.data));
    };
    void lis();
    const t = window.setInterval(() => { void lis(); }, 60_000);
    return () => { vivant = false; window.clearInterval(t); };
  }, [tour]);
  return { tri, relis };
}

export type ProposeParLaPasse = { numero: string; nom: string; extrait: string; verdict: VerdictDuTri; motif: string };

type Issue<T> = { ok: true; data: T } | { ok: false; erreur: string };

async function appelle<T>(corps: Record<string, unknown>): Promise<Issue<T>> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  try {
    const { data, error } = await supabase.functions.invoke('tri-des-messages', { body: corps });
    if (error) return { ok: false, erreur: /404|not found/i.test(String(error.message)) ? 'La fonction tri-des-messages n’est pas encore collée.' : 'Le serveur n’a pas répondu.' };
    const d = (data ?? {}) as { ok?: boolean; motif?: string } & T;
    if (d.ok !== true) return { ok: false, erreur: d.motif === 'cle-claude-absente' ? 'La clé de Claude manque aux secrets.' : 'Le serveur a refusé.' };
    return { ok: true, data: d };
  } catch {
    return { ok: false, erreur: 'Le serveur n’a pas répondu.' };
  }
}

/** Bloquer un ou plusieurs numéros chez WhatsApp (jamais une fiche ni un échange passé : le serveur refuse). */
export const bloqueLesNumeros = (numeros: readonly string[]) => appelle<{ bloques: number; refuses: number }>({ geste: 'bloquer', numeros });
/** Débloquer : retour dans « À traiter », plus jamais jugé. */
export const debloqueLeNumero = (numero: string) => appelle<{ meta: boolean }>({ geste: 'debloquer', numero });
/** Une proposition rendue à « À traiter » : plus jamais jugée. */
export const rendsLaCliente = (numero: string) => appelle<{ meta: boolean }>({ geste: 'cliente', numero });
/** Relire les fils sans fiche des dernières 24 heures : rien n'est rangé, la direction valide. */
export const relisLesDernieresHeures = () => appelle<{ lus: number; proposes: ProposeParLaPasse[] }>({ geste: 'passe' });
