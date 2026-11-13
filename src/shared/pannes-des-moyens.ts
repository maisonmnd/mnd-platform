import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Prestataire } from './choix-du-moyen-pur';
import type { SourceDeLaPanne } from './pannes-dites-pur';
import type { PanneLue } from './cloture-du-jour-pur';

/* ══ LES PANNES DITES, AU TRÔNE · 12 novembre 2026 (le choix du moyen, lot D) ══
   Ce que le Trône dit à la base, et ce qu'il en relit (0204) :
     · `inscrisLaPanne` : un échec vu (`vois_une_panne`). La base tient
       l'épisode, prévient la direction une fois, et ne garde rien d'un moyen
       fermé. Les règles de ce qui s'inscrit sont dans
       `pannes-dites-pur.ts` ; `clients/sante-des-moyens.ts` les applique ;
     · `finisLaPanne` : une vraie demande est passée (`une_demande_repasse`) ;
     · `usePannesDuJour` : les épisodes d'un jour et d'une maison, que
       « La journée » dit avec la règle de la clôture (`pannesDuJour`).
   Sans base ou sans réseau, rien ne part et rien ne se garde pour plus tard :
   une panne vue hors ligne n'est la panne d'aucun prestataire. */

/** UN ÉCHEC VU, inscrit en base. `true` : la base l'a pris (ou l'a dit fermé). */
export async function inscrisLaPanne(p: Prestataire, source: SourceDeLaPanne, branche: string): Promise<boolean> {
  if (!supabase || !branche) return false;
  try {
    const { error } = await supabase.rpc('vois_une_panne', { p_prestataire: p, p_branche: branche, p_source: source });
    return !error;
  } catch {
    return false;
  }
}

/** UNE VRAIE DEMANDE EST PASSÉE : l'épisode ouvert de cette maison finit. */
export async function finisLaPanne(p: Prestataire, branche: string): Promise<boolean> {
  if (!supabase || !branche) return false;
  try {
    const { error } = await supabase.rpc('une_demande_repasse', { p_prestataire: p, p_branche: branche });
    return !error;
  } catch {
    return false;
  }
}

type LigneDePanne = { id: string; prestataire: string; branch_id: string | null; debut: string; derniere_vue: string; fin: string | null; fin_par: string | null; vues: number | null };
const versPanneLue = (l: LigneDePanne): PanneLue => ({
  id: String(l.id), prestataire: String(l.prestataire ?? ''), branchId: l.branch_id ?? undefined,
  debut: String(l.debut ?? ''), derniereVue: String(l.derniere_vue ?? l.debut ?? ''),
  fin: l.fin ?? null, finPar: l.fin_par ?? null, vues: Number(l.vues) || 1,
});

/** Minuit d'un jour de Cotonou (UTC + 1), en ISO UTC. */
const minuitACotonou = (jour: string, plusJours = 0): string =>
  new Date(Date.parse(`${jour}T00:00:00Z`) + plusJours * 86_400_000 - 60 * 60_000).toISOString();

/** LES PANNES D'UN JOUR ET D'UNE MAISON, lues en base (le personnel lit), relues
    chaque minute tant que l'écran est visible. `undefined` : pas (encore) lues
    (sans base, ou 0204 pas encore passée) ; une relecture ratée garde la
    dernière lecture. */
export function usePannesDuJour(jour: string, branche: string): PanneLue[] | undefined {
  const [pannes, setPannes] = useState<PanneLue[] | undefined>(undefined);
  useEffect(() => {
    setPannes(undefined);
    if (!supabase || !branche) return;
    const sb = supabase;
    let vivant = true;
    const lis = () => {
      void Promise.resolve(sb.from('pannes_des_moyens')
        .select('id, prestataire, branch_id, debut, derniere_vue, fin, fin_par, vues')
        .eq('branch_id', branche).gte('debut', minuitACotonou(jour)).lt('debut', minuitACotonou(jour, 1))
        .order('debut', { ascending: true }).limit(500))
        .then(({ data, error }) => {
          if (!vivant || error) return;
          setPannes(((data ?? []) as LigneDePanne[]).map(versPanneLue));
        }, () => undefined);
    };
    lis();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') lis(); }, 60_000);
    return () => { vivant = false; window.clearInterval(t); };
  }, [jour, branche]);
  return pannes;
}
