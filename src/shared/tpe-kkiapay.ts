import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { recuDuRegistre, FENETRE_DU_TPE_MIN, type RecuDuTpe, type VerdictDeLaReference } from './tpe-kkiapay-pur';

/* ══ LE TPE KKIAPAY, CÔTÉ TRÔNE — 22 novembre 2026 ════════════════════════
   Voie 1 : les paiements que KkiaPay a signalés (registre `payments`, sans
   cible), relus toutes les six secondes tant que l'encaissement est ouvert.
   Voie 2 : la référence tapée, demandée à KkiaPay par `kkiapay-tpe`.
   Voir tpe-kkiapay-pur.ts. */

const PAS_MS = 6_000;

/** Les paiements du TPE des trois dernières heures (le personnel lit le
    registre : RLS `is_staff`). Vide hors ligne, ou tant que `actif` est faux. */
export function useRecusDuTpe(actif: boolean): { recus: RecuDuTpe[]; lu: boolean } {
  const [recus, setRecus] = useState<RecuDuTpe[]>([]);
  const [lu, setLu] = useState(false);
  useEffect(() => {
    if (!actif || !supabase) return;
    const sb = supabase;
    let vivant = true;
    const lis = async () => {
      const depuis = new Date(Date.now() - FENETRE_DU_TPE_MIN * 60_000).toISOString();
      const { data, error } = await sb.from('payments').select('id, branch_id, data')
        .eq('data->>provider', 'kkiapay').gte('data->>at', depuis).limit(50);
      if (!vivant || error) return;
      setRecus((data ?? []).map(recuDuRegistre).filter((r): r is RecuDuTpe => !!r));
      setLu(true);
    };
    void lis();
    const minuterie = setInterval(() => { void lis(); }, PAS_MS);
    return () => { vivant = false; clearInterval(minuterie); };
  }, [actif]);
  return { recus, lu };
}

/** La référence demandée à KkiaPay. Hors ligne, ou si la fonction ne répond
    pas : `injoignable` (la référence se garde et se pointe le soir). */
export async function verifieLaReference(reference: string, branchId: string): Promise<VerdictDeLaReference> {
  if (!supabase) return { ok: false, raison: 'injoignable' };
  try {
    const { data, error } = await supabase.functions.invoke('kkiapay-tpe', { body: { reference, branchId } });
    const d = (data ?? null) as (VerdictDeLaReference & { version?: string }) | null;
    if (d && typeof d.ok === 'boolean') {
      if (d.ok) return { ok: true, ref: d.ref, montantXof: Number(d.montantXof) || 0, fraisXof: Number(d.fraisXof) || 0, ...(d.source ? { source: d.source } : {}) };
      return { ok: false, raison: d.raison, ...(d.statut ? { statut: d.statut } : {}) };
    }
    /* Un 403 arrive en erreur : la réponse porte encore sa raison. */
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      const lu = await ctx.json().catch(() => null) as { raison?: string } | null;
      if (lu?.raison === 'refusee') return { ok: false, raison: 'refusee' };
      if (lu?.raison === 'mal-formee') return { ok: false, raison: 'mal-formee' };
    }
    return { ok: false, raison: 'injoignable' };
  } catch {
    return { ok: false, raison: 'injoignable' };
  }
}
