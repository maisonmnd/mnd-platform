import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import { supabase } from './supabase';
import type { ClotureDuJour, EffacementLu, PieceLue } from './cloture-du-jour-pur';

/* ══ LA CLÔTURE DE GRENAT, AU TRÔNE — 4 novembre 2026 ═══════════════════
   La règle vit dans `cloture-du-jour-pur.ts` ; ce fichier tient ce que le
   Trône lit de la base :
     · LES COMPTES RENDUS de Grenat (`clotures_de_grenat`, 0156), écrits par
       la fonction `cloture-du-jour` seule, à 15 h, à 19 h et au mot du
       matin : l'écran « La journée » dit le dernier passage, « La veille à
       valider » celui de la veille ;
     · LES DÉCISIONS de la direction (`cloture_decisions`) : une pièce payée
       effacée tranchée, un constat accepté. Écrites par le souverain seul
       (la base le garde), jamais effacées ;
     · LES PIÈCES EFFACÉES du jour, lues dans `traces` : la base ne les
       montre qu'à la direction (0092) ; les autres lisent les alarmes du
       compte rendu de Grenat. */

/** Ce qu'un passage de Grenat écrit. `moment` : « 15 », « 19 », « matin ». */
export type CompteRenduDeGrenat = {
  id: string;
  branchId: string;
  jour: string;
  moment: string;
  heures?: number[];
  source?: string;
  version?: string;
  ecritLe: string;
  notifieLe?: string;
  cloture: ClotureDuJour;
  gestesFaits?: { genre: string; cle: string; dit: string }[];
  gestesPasses?: { cle: string; pourquoi: string }[];
};

/** Ce que la direction a tranché. L'identifiant est « <branche>|<clé> » :
    trancher deux fois réécrit la même décision, jamais une seconde. */
export type DecisionDeCloture = { id: string; branchId: string; cle: string; par: string; le: string; mot?: string };

export const comptesRendusStore = createStore<CompteRenduDeGrenat[]>('mnd_clotures_de_grenat', []);
export const useComptesRendusDeGrenat = () => useStore(comptesRendusStore);
bindCollection(comptesRendusStore, 'clotures_de_grenat');

export const decisionsDeClotureStore = createStore<DecisionDeCloture[]>('mnd_cloture_decisions', []);
export const useDecisionsDeCloture = () => useStore(decisionsDeClotureStore);
bindCollection(decisionsDeClotureStore, 'cloture_decisions');

/** Le moment d'un passage, dit : « 15 h », « 19 h », « le mot du matin ». */
export const momentDit = (m: string): string => (m === 'matin' ? 'le mot du matin' : /^\d+$/.test(m) ? `${Number(m)} h` : m);

/** Le DERNIER passage de Grenat pour une maison et un jour : le plus
    récemment écrit. */
export function dernierPassage(crs: readonly CompteRenduDeGrenat[], branchId: string, jour: string): CompteRenduDeGrenat | undefined {
  return crs.filter((c) => c.branchId === branchId && c.jour === jour)
    .sort((a, b) => b.ecritLe.localeCompare(a.ecritLe))[0];
}

/** TRANCHER : la direction ferme un constat ou une alarme, avec son mot. */
export function tranche(o: { branchId: string; cle: string; par: string; mot?: string }): void {
  const id = `${o.branchId}|${o.cle}`.slice(0, 200);
  const d: DecisionDeCloture = { id, branchId: o.branchId, cle: o.cle, par: o.par, le: new Date().toISOString(), ...(o.mot?.trim() ? { mot: o.mot.trim() } : {}) };
  decisionsDeClotureStore.set((prev) => [...prev.filter((x) => x.id !== id), d]);
}

/** LES PIÈCES EFFACÉES D'UN JOUR, lues dans la trace de la base. Seule la
    direction les lit (0092) : pour les autres, la base rend une liste vide,
    et l'écran lit les alarmes du compte rendu de Grenat. `null` : la trace
    n'a pas pu être lue (hors ligne, droits). */
export async function effacementsDuJour(jour: string): Promise<EffacementLu[] | null> {
  if (!supabase) return null;
  const debut = new Date(Date.parse(`${jour}T00:00:00Z`) - 60 * 60_000).toISOString();
  const fin = new Date(Date.parse(`${jour}T00:00:00Z`) + 23 * 60 * 60_000).toISOString();
  const { data, error } = await supabase.from('traces').select('id, piece_id, fait_le, compte_nom, porte, avant')
    .eq('table_name', 'invoices').eq('operation', 'efface').gte('fait_le', debut).lt('fait_le', fin).limit(1000);
  if (error) return null;
  return ((data ?? []) as { id: number | string; piece_id: string; fait_le: string; compte_nom?: string; porte?: string; avant?: PieceLue | null }[])
    .map((t) => ({
      traceId: String(t.id), pieceId: String(t.piece_id), faitLe: t.fait_le, par: t.compte_nom ?? undefined, porte: t.porte ?? undefined,
      avant: t.avant ? { ...t.avant, id: String(t.piece_id) } : null,
    }));
}

/** LE GESTE DE LA DIRECTION DEPUIS FACTURES : effacer une pièce payée, avec
    son motif écrit, en une transaction au serveur (`efface_la_piece_payee`,
    0156). Rend `null` quand c'est fait, sinon pourquoi. Sans serveur (le
    Trône hors ligne de démonstration), rien ne se juge ici : `null`. */
export async function effaceLaPiecePayee(id: string, motif: string): Promise<string | null> {
  if (!supabase) return null;
  if (motif.trim().length < 3) return 'Écrivez le motif : une facture payée ne s’efface pas sans lui.';
  const { data, error } = await supabase.rpc('efface_la_piece_payee', { p_id: id, p_motif: motif.trim() });
  if (error) {
    const m = String(error.message ?? '');
    if (/PIECE_PAYEE/.test(m)) return m.replace(/^.*PIECE_PAYEE\s*:\s*/, '').replace(/^./, (x) => x.toUpperCase());
    if (/efface_la_piece_payee|PGRST202|42883/i.test(`${m} ${error.code ?? ''}`)) return 'Le serveur ne connaît pas encore ce geste (0156) : la pièce n’est pas effacée.';
    return `La pièce n’a pas pu être effacée au serveur : ${m || 'sans réponse'}.`;
  }
  const r = data as { ok?: boolean; motif?: string } | null;
  /* Déjà partie du serveur : l'écran la retire comme avant. */
  if (r && r.ok === false && r.motif !== 'introuvable') return 'La pièce n’a pas pu être effacée au serveur.';
  return null;
}
