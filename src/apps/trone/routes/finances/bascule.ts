/* LA BASCULE D'OCTOBRE, APPLIQUÉE — 4 octobre 2026.
   La règle vit dans `shared/bascule-des-caisses-pur.ts` ; ici, les magasins
   qu'elle réécrit, chacun par sa propre synchronisation (envoi par tranches,
   garde-fous intacts). Rien ne s'efface : chaque case changée garde son
   ancien nom, et `annuleLaBascule` le lui rend. */
import type { Store } from '../../../../shared/store';
import {
  cashboxesStore, invoicesStore, expensesStore, coffreStore, transfertsStore, creditMovementsStore,
  entreesHorsActiviteStore, empruntsStore,
} from '../../../../shared/finance';
import { appointmentsStore } from '../../../../shared/agenda';
import { remboursementsStore } from '../../../../shared/avances';
import { cloturesStore } from '../../../../shared/caisse-du-soir';
import { versementsEngagementStore } from '../../../../shared/engagements';
import { pretsStore } from '../../../../shared/foyer';
import { advancesStore } from '../equipe/payroll';
import { settingsStore } from '../../../../shared/settings';
import {
  basculeLEcriture, rendsLEcriture, caissesApres, caissesRendues, casesDe, compteLaBascule, MOIS_DE_DEPART,
  type Plan, type Sorte,
} from '../../../../shared/bascule-des-caisses-pur';

type Lot = { sorte: Sorte; store: Store<unknown[]> };
const LOTS: readonly Lot[] = [
  { sorte: 'factures', store: invoicesStore as unknown as Store<unknown[]> },
  { sorte: 'depenses', store: expensesStore as unknown as Store<unknown[]> },
  { sorte: 'coffre', store: coffreStore as unknown as Store<unknown[]> },
  { sorte: 'transferts', store: transfertsStore as unknown as Store<unknown[]> },
  { sorte: 'avoirs', store: creditMovementsStore as unknown as Store<unknown[]> },
  { sorte: 'horsActivite', store: entreesHorsActiviteStore as unknown as Store<unknown[]> },
  { sorte: 'emprunts', store: empruntsStore as unknown as Store<unknown[]> },
  { sorte: 'rendezVous', store: appointmentsStore as unknown as Store<unknown[]> },
  { sorte: 'remboursements', store: remboursementsStore as unknown as Store<unknown[]> },
  { sorte: 'clotures', store: cloturesStore as unknown as Store<unknown[]> },
  { sorte: 'engagements', store: versementsEngagementStore as unknown as Store<unknown[]> },
  { sorte: 'prets', store: pretsStore as unknown as Store<unknown[]> },
  { sorte: 'avances', store: advancesStore as unknown as Store<unknown[]> },
];

/** Une écriture de la branche (celles d'avant le champ n'en portent pas). */
const deLaBranche = (branchId: string) => (r: unknown): boolean => {
  const b = (r as { branchId?: string }).branchId;
  return !b || b === branchId;
};

/** Toutes les écritures de la branche, par sorte. */
export function lisLesLots(branchId: string): Partial<Record<Sorte, unknown[]>> {
  const out: Partial<Record<Sorte, unknown[]>> = {};
  for (const l of LOTS) out[l.sorte] = l.store.get().filter(deLaBranche(branchId));
  return out;
}

/** Ce qui reste à basculer : 0 et 0 quand tout est fait (et que la
    synchronisation n'a rien défait). */
export const resteAFaire = (plan: Plan, branchId: string) => compteLaBascule(plan, lisLesLots(branchId));

/** Applique la bascule. Refuse si une écriture d'octobre n'a pas sa pièce. */
export function appliqueLaBascule(plan: Plan, branchId: string, le = new Date().toISOString()): { ok: true } | { ok: false; pourquoi: string } {
  const avant = compteLaBascule(plan, lisLesLots(branchId));
  const manquent = Object.keys(avant.manquantes);
  if (manquent.length) return { ok: false, pourquoi: `Choisissez la pièce des écritures d’octobre de : ${manquent.join(', ')}.` };
  cashboxesStore.set((prev) => caissesApres(prev, branchId, plan, le, (n) => `cb-${n.role}-${branchId}-${Date.now().toString(36)}`));
  const garde = deLaBranche(branchId);
  for (const l of LOTS) {
    l.store.set((prev) => prev.map((r) => (garde(r) ? basculeLEcriture(l.sorte, r, plan) : r)));
  }
  settingsStore.set((prev) => ({
    ...prev,
    /* Une relance garde la date et le départ d'avant la PREMIÈRE bascule. */
    basculeDesCaisses: prev.basculeDesCaisses ?? { le, ...(prev.caissesDepuis ? { depuisAvant: prev.caissesDepuis } : {}) },
    caissesDepuis: MOIS_DE_DEPART,
  }));
  return { ok: true };
}

/** Le retour en arrière : chaque case reprend son ancien nom, les caisses
    leurs noms et soldes d'ouverture, les rangées reviennent ; les neuves que
    plus rien ne nomme s'en vont. */
export function annuleLaBascule(branchId: string): void {
  const garde = deLaBranche(branchId);
  for (const l of LOTS) {
    l.store.set((prev) => prev.map((r) => (garde(r) ? rendsLEcriture(l.sorte, r) : r)));
  }
  const utilises = new Set<string>();
  for (const [sorte, liste] of Object.entries(lisLesLots(branchId)) as [Sorte, unknown[]][]) {
    for (const e of liste) for (const c of casesDe(sorte, e)) if (typeof c.nom === 'string' && c.nom) utilises.add(c.nom);
  }
  cashboxesStore.set((prev) => caissesRendues(prev, branchId, utilises));
  settingsStore.set((prev) => {
    const { basculeDesCaisses, caissesDepuis: _d, ...reste } = prev;
    return { ...reste, ...(basculeDesCaisses?.depuisAvant ? { caissesDepuis: basculeDesCaisses.depuisAvant } : {}) };
  });
}
