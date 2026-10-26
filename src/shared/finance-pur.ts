/* ══ LE TOTAL ET LE RESTE DÛ D'UNE PIÈCE, PURS — 27 octobre 2026 ══════════
   Sortis de `finance.ts` (qui tire la synchronisation) pour la fonction
   serveur de l'Assistant Maison : « jamais d'envie ni de remise tant qu'un
   reste est dû ». `finance.ts` les réexporte, un seul juge. */
import type { Invoice, InvoiceLine, InvoicePayment } from './finance';

/** Ce que vaut UNE ligne, remises de ligne comprises — pourcentage d'abord,
    francs ensuite, jamais négatif. Une seule définition : trois écrans
    recalculaient la ligne à la main, et le jour où la remise en francs est
    arrivée, ils auraient divergé un par un. */
export const ligneNetXof = (l: InvoiceLine): number =>
  Math.max(0, l.qty * l.unitXof * (1 - l.discountPct / 100) - (l.discountXof ?? 0));

export const invoiceTotal = (inv: Invoice): number => {
  const sub = inv.lines.reduce((s, l) => s + ligneNetXof(l), 0);
  return Math.max(0, Math.round(sub * (1 - inv.globalDiscountPct / 100)) - (inv.globalDiscountXof ?? 0));
};

/** LES RÈGLEMENTS D'UNE PIÈCE — la liste, ou sa lecture rétro-compatible.

    Les pièces d'avant le 17 août ne portent pas de journal : elles ont un seul
    moyen (`payment`), une seule caisse et un statut. On leur en FABRIQUE un
    d'une entrée quand elles sont soldées, pour que tous les lecteurs — caisse,
    Synthèse, Bilan, reçus — n'aient plus qu'UNE façon de lire l'argent d'une
    facture. Sans ce repli, chaque écran aurait dû connaître les deux formes,
    et c'est ainsi qu'un chiffre finit par diverger d'un écran à l'autre. */
export const invoiceReglements = (inv: Invoice): InvoicePayment[] => {
  if (inv.payments && inv.payments.length > 0) return inv.payments;
  if (inv.status !== 'payée') return [];
  return [{
    id: `ip-${inv.id}`,
    date: inv.date,
    amountXof: invoiceTotal(inv),
    method: inv.payment ?? 'Espèces',
    cashbox: inv.cashbox,
    time: inv.time,
    /* La devise de la pièce d'avant descend sur son versement unique : les
       lectures par versement (tiroir en devise, PDF) n'ont ainsi qu'UNE forme. */
    ...(inv.fx ? { fx: inv.fx } : {}),
    ...(inv.encaissePar ? { encaissePar: inv.encaissePar } : {}),
  }];
};

/** CE QUI A ÉTÉ RÉELLEMENT REÇU sur la pièce, tous versements confondus. */
export const invoiceRegleXof = (inv: Invoice): number =>
  invoiceReglements(inv).reduce((s, p) => s + p.amountXof, 0);

/** CE QUI RESTE DÛ. Jamais négatif : un trop-perçu est un avoir, pas une dette
    en creux — il se traite ailleurs, il ne se soustrait pas ici. */
export const invoiceResteXof = (inv: Invoice): number =>
  Math.max(0, invoiceTotal(inv) - invoiceRegleXof(inv));
