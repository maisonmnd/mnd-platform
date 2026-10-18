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

/* ══ L'ARGENT DE LA PIÈCE QUE LE CARNET NE CONNAÎT PAS — 18 octobre 2026 ══
   Le rituel d'Annick A. : un envoi perdu (un vieil état du rendez-vous arrivé
   au serveur après le récent) a effacé le versement du CARNET, pas celui de
   la FACTURE. Le Carnet disait « dû », l'encaissement a été refait, et la
   facture a porté deux fois 10 000 F. La fenêtre d'encaissement le voit
   désormais AVANT : ce que la pièce porte au-delà de ce que le rendez-vous
   sait avoir reçu ne s'encaisse pas une seconde fois, il s'inscrit au carnet.

   On ne compte ni l'acompte reçu avant le comptoir (le rendez-vous le tient à
   part), ni la Gamme (les produits ont leur propre versement), et le rendez-
   vous compte pour le plus grand de son journal et de son `paidXof` (les
   journaux d'avant le 17 août n'ont que la somme). */
const horsDuRituel = (p: InvoicePayment): boolean => p.method === 'Acompte' || /^Gamme\b/.test(p.note ?? '');

export function argentHorsDuCarnet(appt: Appointment, piece: Invoice | undefined): number {
  if (!piece?.payments?.length) return 0;
  const surLaPiece = piece.payments.filter((p) => !horsDuRituel(p)).reduce((s, p) => s + (p.amountXof || 0), 0);
  const auCarnet = (appt.payments ?? []).filter((v) => v.invoiceId === piece.id).reduce((s, v) => s + (v.amountXof || 0), 0);
  return Math.max(0, surLaPiece - Math.max(auCarnet, appt.paidXof ?? 0));
}

/** Les versements de la pièce à recopier au carnet, sous LEUR identifiant :
    ceux qui n'y ont pas de jumeau (même identifiant, ou même montant le même
    jour). */
export function versementsAInscrireAuCarnet(appt: Appointment, piece: Invoice): InvoicePayment[] {
  const carnet = (appt.payments ?? []).filter((v) => !v.invoiceId || v.invoiceId === piece.id);
  const pris = new Set<number>();
  const out: InvoicePayment[] = [];
  for (const p of piece.payments ?? []) {
    if (horsDuRituel(p)) continue;
    const k = carnet.findIndex((v, i) => !pris.has(i) && (v.id === p.id || (v.amountXof === p.amountXof && v.date === p.date)));
    if (k >= 0) { pris.add(k); continue; }
    out.push(p);
  }
  return out;
}
