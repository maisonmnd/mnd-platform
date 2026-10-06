/* ══ LA CAISSE DU VERSEMENT, SUR LA PIÈCE — 4 octobre 2026 ═════════════

   « Que le paiement du RDV avec la caisse principale soit reporté sur la
   facture et qu'on puisse modifier au besoin. Branche le tout » (Yéman).

   LA CAISSE VOYAGEAIT DÉJÀ, MAIS EN SILENCE. Chaque versement d'un rituel
   porte sa caisse (`InvoicePayment.cashbox`) ; l'éditeur de la pièce, lui,
   ne montrait qu'un « Moyen de paiement » qui écrivait le MIROIR
   (`Invoice.payment`), que ni le tiroir ni le journal ne lisent. Corriger
   une caisse se faisait donc nulle part.

   ICI, UN VERSEMENT SE CORRIGE (moyen, caisse, date) et LE RENDEZ-VOUS
   SUIT : son journal porte le même versement, et le laisser dire autre chose
   ferait deux vérités sur un seul billet. Au Trône seulement : le document
   remis à la cliente ne nomme pas les tiroirs de la Maison. */
import { invoiceReglements, type Invoice, type InvoicePayment } from './finance';
import type { Appointment } from './agenda';

export type CorrectionDeVersement = Partial<Pick<InvoicePayment, 'method' | 'cashbox' | 'date'>>;

/** Ce qui ne passe par aucun tiroir : l'avoir et l'acompte reçu avant. */
export const sansTiroir = (p: InvoicePayment): boolean => p.method === 'Avoir' || p.method === 'Acompte';

/** Corrige UN versement de la pièce. Une pièce d'avant le journal reçoit le
    sien d'abord (celui qu'`invoiceReglements` lui prête), pour que la
    correction s'écrive quelque part. Le miroir suit le PREMIER versement. */
export function corrigeLeVersement(inv: Invoice, id: string, c: CorrectionDeVersement): Invoice {
  const journal = invoiceReglements(inv).map((p) => {
    if (p.id !== id) return p;
    const n: InvoicePayment = { ...p, ...c };
    if (!n.cashbox) delete n.cashbox;
    return n;
  });
  if (journal.length === 0) return inv;
  const premier = journal[0];
  return { ...inv, payments: journal, payment: premier.method, cashbox: premier.cashbox };
}

/** Le rendez-vous qui porte les versements de cette pièce, réaligné sur elle.
    Un versement du carnet se reconnaît à son identifiant, ou à défaut à son
    montant et à sa date d'AVANT la correction (le comptoir donne deux
    identifiants différents au même billet). Rien ne se devine au-delà :
    un versement qu'on ne reconnaît pas reste tel quel. */
export function aligneLeRituel(appt: Appointment, avant: Invoice, apres: Invoice): Appointment {
  const anciens = invoiceReglements(avant);
  const nouveaux = new Map(invoiceReglements(apres).map((p) => [p.id, p]));
  let change = false;
  const pris = new Set<string>();
  const payments = (appt.payments ?? []).map((v) => {
    if (v.invoiceId !== avant.id) return v;
    const jumeau = anciens.find((p) => !pris.has(p.id) && p.id === v.id)
      ?? anciens.find((p) => !pris.has(p.id) && !sansTiroir(p) && p.amountXof === v.amountXof && p.date === v.date);
    if (!jumeau) return v;
    pris.add(jumeau.id);
    const n = nouveaux.get(jumeau.id);
    if (!n) return v;
    if (v.method === n.method && (v.cashbox ?? '') === (n.cashbox ?? '') && v.date === n.date) return v;
    change = true;
    const r = { ...v, method: n.method, date: n.date, cashbox: n.cashbox };
    if (!r.cashbox) delete r.cashbox;
    return r;
  });
  return change ? { ...appt, payments } : appt;
}

/** Les rendez-vous liés à la pièce, par l'un des trois liens. */
export const estLieALaPiece = (a: Appointment, inv: Invoice): boolean =>
  a.id === inv.apptId || a.invoiceId === inv.id || (a.payments ?? []).some((p) => p.invoiceId === inv.id);
