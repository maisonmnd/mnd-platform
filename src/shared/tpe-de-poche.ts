import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { jourDuTpe, type LigneDesEspeces, type LigneDuTpe } from './tpe-de-poche-pur';

/* ══ LE TPE DE POCHE, CÔTÉ TRÔNE — 25 novembre 2026 ══════════════════════
   La direction lit la table `tpe_de_poche` (RLS `est_direction`, 0246) et
   passe ses trois gestes par la fonction `tpe-de-poche` : autoriser,
   préparer un code d'activation, couper. Elle n'écrit jamais la table
   elle-même : aucune politique d'écriture n'existe. Voir tpe-de-poche-pur.ts. */

export type GesteDuTpe = 'autoriser' | 'preparer' | 'couper' | 'especes-permises' | 'especes-traitees';
export type ReponseDuGeste = { ok: boolean; raison?: string; code?: string; expireLe?: string; etat?: string; especes?: boolean; statut?: string };

/** Un geste de la direction. Hors ligne ou sans réponse : `injoignable`. */
export async function gesteDuTpe(action: GesteDuTpe, corps: Record<string, unknown>): Promise<ReponseDuGeste> {
  if (!supabase) return { ok: false, raison: 'injoignable' };
  try {
    const { data, error } = await supabase.functions.invoke('tpe-de-poche', { body: { action, ...corps } });
    const d = (data ?? null) as ReponseDuGeste | null;
    if (d && typeof d.ok === 'boolean') return d;
    /* Un 403 ou un 400 arrive en erreur : la réponse porte encore sa raison. */
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      const lu = await ctx.json().catch(() => null) as ReponseDuGeste | null;
      if (lu && typeof lu.ok === 'boolean') return lu;
    }
    return { ok: false, raison: 'injoignable' };
  } catch {
    return { ok: false, raison: 'injoignable' };
  }
}

const PAS_MS = 10_000;

/** Les TPE d'une branche, relus toutes les dix secondes tant que l'écran est ouvert. */
export function useLesTpe(branchId: string): { lignes: LigneDuTpe[]; lu: boolean; erreur: boolean; relis: () => void } {
  const [etat, setEtat] = useState<{ lignes: LigneDuTpe[]; lu: boolean; erreur: boolean }>({ lignes: [], lu: false, erreur: false });
  const relis = useCallback(() => {
    if (!supabase || !branchId) return;
    void supabase.from('tpe_de_poche').select('*').eq('branch_id', branchId).then(({ data, error }) => {
      if (error) { setEtat((e) => ({ ...e, lu: true, erreur: true })); return; }
      setEtat({ lignes: (data ?? []) as LigneDuTpe[], lu: true, erreur: false });
    });
  }, [branchId]);
  useEffect(() => {
    relis();
    const minuterie = setInterval(relis, PAS_MS);
    return () => clearInterval(minuterie);
  }, [relis]);
  return { ...etat, relis };
}

/** LES ESPÈCES DES TPE (lot 2, 26 novembre 2026) : celles encore à remettre,
    et celles du jour déjà traitées. La table se lit (RLS `est_direction`,
    0247) ; elle ne s'écrit que par la fonction. */
export function useLesEspeces(branchId: string): { lignes: LigneDesEspeces[]; lu: boolean; erreur: boolean; relis: () => void } {
  const [etat, setEtat] = useState<{ lignes: LigneDesEspeces[]; lu: boolean; erreur: boolean }>({ lignes: [], lu: false, erreur: false });
  const relis = useCallback(() => {
    if (!supabase || !branchId) return;
    const debut = `${jourDuTpe(Date.now())}T00:00:00+01:00`;
    void supabase.from('tpe_especes').select('*').eq('branch_id', branchId).or(`statut.eq.a-remettre,declare_le.gte.${debut}`)
      .order('declare_le', { ascending: false }).limit(200).then(({ data, error }) => {
        if (error) { setEtat((e) => ({ ...e, lu: true, erreur: true })); return; }
        setEtat({ lignes: (data ?? []) as LigneDesEspeces[], lu: true, erreur: false });
      });
  }, [branchId]);
  useEffect(() => {
    relis();
    const minuterie = setInterval(relis, PAS_MS);
    return () => clearInterval(minuterie);
  }, [relis]);
  return { ...etat, relis };
}
