/* FONDRE UNE CAISSE DANS UNE AUTRE, APPLIQUÉ — 17 octobre 2026.
   « Reprise 2025 » : « tout fondre dans Années passées » (Yéman). La règle
   vit dans `shared/caisses-des-caissiers-pur.ts` ; ici, les magasins qu'elle
   réécrit, les mêmes treize que la bascule d'octobre, chacun par sa propre
   synchronisation (envoi par tranches, garde-fous intacts). Rien ne
   s'efface : chaque case garde son ancien nom (`…AvantFusion`), et
   `defaisLaFusion` le lui rend. */
import { cashboxesStore, type Cashbox } from '../../../../shared/finance';
import {
  CAISSE_ANNEES_PASSEES, caisseDesAnneesPassees, caissesApresDefaire, caissesApresFusion, casesQuiNomment,
  defaisLaFusionDeLEcriture, fusionneLEcriture,
} from '../../../../shared/caisses-des-caissiers-pur';
import { LOTS, deLaBranche, lisLesLots } from './bascule';

/** La caisse neuve qui reçoit, quand elle n'existe pas encore. */
const neuvePour = (branchId: string, vers: string): Cashbox => (vers === CAISSE_ANNEES_PASSEES
  ? caisseDesAnneesPassees(branchId)
  : { id: `cb-fusion-${branchId}-${vers.replace(/\W+/g, '-').toLowerCase()}`, branchId, name: vers, sub: 'Caisse', glyph: '◈', openingXof: 0 });

/** Combien de cases nomment encore la caisse dans la branche. */
export const casesDeLaCaisse = (branchId: string, nom: string): number => casesQuiNomment(lisLesLots(branchId), nom);

export function fondsLaCaisse(branchId: string, de: string, vers: string, le = new Date().toISOString()): void {
  cashboxesStore.set((prev) => caissesApresFusion(prev, branchId, de, vers, le, () => neuvePour(branchId, vers)));
  const garde = deLaBranche(branchId);
  for (const l of LOTS) {
    l.store.set((prev) => prev.map((r) => (garde(r) ? fusionneLEcriture(l.sorte, r, de, vers) : r)));
  }
}

/** Le retour : seules les cases qui portaient `de` le reprennent. */
export function defaisLaFusion(branchId: string, de: string): void {
  const garde = deLaBranche(branchId);
  for (const l of LOTS) {
    l.store.set((prev) => prev.map((r) => (garde(r) ? defaisLaFusionDeLEcriture(l.sorte, r, de) : r)));
  }
  cashboxesStore.set((prev) => caissesApresDefaire(prev, branchId, de));
}
