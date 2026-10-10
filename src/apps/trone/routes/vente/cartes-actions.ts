import { creditMovementsStore, type CreditHolder } from '../../../../shared/finance';
import { jourLocal } from '../../../../shared/paliers';
import {
  cartesCadeauxStore, creditDeLaCarte, genereCode, aleaDuNavigateur, valableJusquau, rattacheLeCredit,
  pourquoiOnNeRattachePas, VALIDITE_MOIS, type CarteCadeau,
} from '../../../../shared/cartes-cadeaux';

/* LES GESTES DU REGISTRE DES CARTES — 2 octobre 2026. L'écran « Cartes
   cadeaux » et l'encaissement d'un rituel les partagent : une seule façon
   d'encaisser une carte, une seule façon de la rattacher. */

const change = (id: string, f: (c: CarteCadeau) => CarteCadeau) =>
  cartesCadeauxStore.set((prev) => prev.map((c) => (c.id === id ? f(c) : c)));

/** Un code qui n'existe pas encore dans le registre (la base refuserait un
    doublon ; on ne lui en présente pas). */
function codeNeuf(): string {
  const pris = new Set(cartesCadeauxStore.get().flatMap((c) => [c.code, ...(c.anciensCodes ?? [])]));
  for (;;) { const code = genereCode(aleaDuNavigateur); if (!pris.has(code)) return code; }
}

/** ENCAISSER À LA MAISON une carte à régler : la Maison dit le montant, la
    caisse et le moyen ; le code naît, et l'avoir que porte la carte entre
    dans cette caisse aujourd'hui. */
export function encaisseLaCarte(c: CarteCadeau, o: { montantXof: number; cashbox: string; methode: string }): string {
  const maintenant = new Date().toISOString();
  const code = codeNeuf();
  /* LE DÉPÔT SE DATE DU JOUR LOCAL — 10 octobre 2026 (revue). Daté en ISO
     complet, il sortait de la période d'un jour de la clôture du soir (« 2026-
     10-10T13:22Z » est plus grand que « 2026-10-10 ») : faux excédent le jour
     de la vente, puis retour le lendemain. Et l'horodatage UTC rangeait une
     vente de minuit et demie à la veille. L'heure exacte reste sur la carte
     (`payeLe`). */
  const credit = creditDeLaCarte(c, { montantXof: o.montantXof, cashbox: o.cashbox, methode: o.methode, date: jourLocal(), code });
  creditMovementsStore.set((prev) => (prev.some((m) => m.id === credit.id) ? prev : [...prev, credit]));
  change(c.id, (x) => ({
    ...x, statut: 'reglee', montantXof: o.montantXof, code, valableJusquau: valableJusquau(maintenant),
    payeLe: maintenant, cashbox: o.cashbox, methode: o.methode, creditId: credit.id,
  }));
  return code;
}

/** UNE CARTE VENDUE AU COMPTOIR : elle naît au Trône, puis s'encaisse. */
export function vendsUneCarte(c: CarteCadeau, o: { montantXof: number; cashbox: string; methode: string }): string {
  cartesCadeauxStore.set((prev) => [...prev, c]);
  return encaisseLaCarte(c, o);
}

/** RATTACHER : le dépôt de la carte passe au compte qui paie. Rend la
    raison d'un refus, ou `null`. */
export function rattacheLaCarte(c: CarteCadeau, porteur: CreditHolder, clientId: string, parQui?: string): string | null {
  const refus = pourquoiOnNeRattachePas(c, new Date().toISOString());
  if (refus) return refus;
  const credit = creditMovementsStore.get().find((m) => m.id === c.creditId);
  if (!credit) return 'L’avoir de cette carte n’est pas encore arrivé sur cet appareil. Patientez une minute, puis réessayez.';
  creditMovementsStore.set((prev) => prev.map((m) => (m.id === credit.id ? rattacheLeCredit(m, porteur) : m)));
  change(c.id, (x) => ({ ...x, statut: 'rattachee', clientId, rattacheeLe: new Date().toISOString(), rattacheePar: parQui }));
  return null;
}

export const marqueRemise = (c: CarteCadeau) => change(c.id, (x) => ({ ...x, remiseLe: new Date().toISOString() }));

/** CARTE PERDUE : un code neuf, le même avoir. L'ancien code ne vaut plus. */
export function remplaceLeCode(c: CarteCadeau): string {
  const code = codeNeuf();
  change(c.id, (x) => ({ ...x, code, anciensCodes: [...(x.anciensCodes ?? []), ...(x.code ? [x.code] : [])] }));
  creditMovementsStore.set((prev) => prev.map((m) => (m.id === c.creditId && m.note && c.code ? { ...m, note: m.note.replace(c.code, code) } : m)));
  return code;
}

/** PROLONGER une carte échue : un an de plus, à compter d'aujourd'hui. */
export function prolonge(c: CarteCadeau): void {
  change(c.id, (x) => ({ ...x, valableJusquau: valableJusquau(new Date().toISOString()) }));
}

/** ÉCARTER une commande jamais réglée (doublon, erreur). Une carte réglée ne
    s'écarte pas : son argent est entré. */
export function ecarte(c: CarteCadeau, motif: string): void {
  if (c.statut !== 'a-regler') return;
  change(c.id, (x) => ({ ...x, statut: 'annulee', annuleeLe: new Date().toISOString(), motif }));
}

export { VALIDITE_MOIS };
