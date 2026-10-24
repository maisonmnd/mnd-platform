import { useEffect } from 'react';
import { appointmentsStore } from '../../../../shared/agenda';
import { invoicesStore } from '../../../../shared/finance';
import { productsStore } from '../../../../shared/catalog';
import { quandTablePrete } from '../../../../shared/sync';
import { gammePayeeSurSesPieces, piecesDuRendezVous, type LigneGamme } from '../../../../shared/gamme';

/* ══ LA GAMME DÉJÀ PAYÉE À LA CAISSE, REGRAVÉE — 24 octobre 2026 ═══════════
   Les rendez-vous encaissés à la Caisse du comptoir avant ce jour portent une
   Gamme payée mais pas gravée (voir `gammePayeeSurSesPieces`, shared/gamme).
   Une fois par séance, quand les rendez-vous, les pièces et le catalogue sont
   lus, les lignes que leurs pièces payées couvrent se gravent au jour de la
   pièce. Rien d'autre ne change sur le rendez-vous.

   On attend les trois tables : graver sur un cache pas encore relu
   réécrirait de vieilles lignes par-dessus le serveur. */

let faite = false;

/** Regrave ce qui doit l'être ; rend le nombre de rendez-vous touchés. */
export function regraveLaGammePayee(): number {
  const pieces = invoicesStore.get();
  const noms = new Map(productsStore.get().map((p) => [p.id, p.name]));
  const regravees = new Map<string, LigneGamme[]>();
  for (const a of appointmentsStore.get()) {
    if (!a.gamme?.some((l) => !l.regleeAt)) continue;
    const g = gammePayeeSurSesPieces(a.gamme, piecesDuRendezVous(a, pieces), (id) => noms.get(id));
    if (g && g !== a.gamme) regravees.set(a.id, [...g]);
  }
  if (regravees.size > 0) {
    appointmentsStore.set((prev) => prev.map((a) => {
      const g = regravees.get(a.id);
      return g ? { ...a, gamme: g } : a;
    }));
  }
  return regravees.size;
}

/** Une fois par séance, dès que les trois tables sont lues. */
export function useLaGammePayeeRegravee(): void {
  useEffect(() => {
    if (faite) return;
    const tables = ['appointments', 'invoices', 'catalog_products'];
    let restantes = tables.length;
    const uneDePlus = () => {
      restantes -= 1;
      if (restantes > 0 || faite) return;
      faite = true;
      regraveLaGammePayee();
    };
    for (const t of tables) quandTablePrete(t, uneDePlus);
  }, []);
}
