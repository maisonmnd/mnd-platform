/* ══ LE TICKET DE LA CAISSE ET LE SOLDE D'UNE PIÈCE — 10 octobre 2026 ══
   Revue de code de la Maison. Quatre fautes d'argent vivaient dans des
   calculs écrits à même les écrans (Caisse, Factures), là où aucun banc ne
   pouvait les rejouer. Elles se calculent désormais ici, sans magasin ni
   React, et `scripts/verifie-revue-vente-bis` les éprouve une à une.

   1. LE CODE QUI GAGNE REMPLACE LA REMISE DÉJÀ POSÉE, il ne s'y ajoute pas.
      L'écran disait « on garde le code, la remise déjà posée est écartée »,
      et le net retranchait pourtant les deux : 80 000 F, −10 %, un code à
      12 000 F, et la cliente payait 60 000 F au lieu de 68 000 F.
   2. LE RITUEL REPRIS AU TICKET Y APPORTE SA REMISE ET SON ACOMPTE. Les
      lignes se posent à leur part du brut (`partsDuRituelXof`) ; la remise du
      rendez-vous (pourcentage, francs, forfait) et l'argent déjà reçu
      (acompte vérifié, versements) restaient au Carnet : la cliente payait le
      brut, et l'acompte une seconde fois.
   3. CHAQUE NATURE D'ARGENT A SON VERSEMENT. Sans versements écrits, la
      pièce en fabriquait un seul, du total entier, au moyen du comptant :
      la part avoir passait pour des billets au tiroir et à la clôture.
   4. « MARQUER PAYÉE » ÉCRIT LE VERSEMENT DU JOUR. Le simple statut rangeait
      l'argent au jour de la facture, sans caisse, et taisait le reste d'une
      pièce déjà réglée en partie. */

import { laMeilleureEnFrancs, type CumulEnFrancs } from '../../../../shared/promos';
import {
  invoiceReglements, invoiceResteXof,
  type Invoice, type InvoicePayment, type PaymentMethod,
} from '../../../../shared/finance';
import type { Appointment } from '../../../../shared/agenda';

const f = (x: number): number => Math.max(0, Math.round(Number.isFinite(x) ? x : 0));

export type EntreeDuTicket = {
  /** Les lignes du ticket, remises de ligne comprises. */
  sousTotalXof: number;
  /** Les seules lignes de PRESTATION, remises de ligne comprises. */
  prestationsXof: number;
  /** La remise globale posée à la main : le pourcentage, puis les francs. */
  remisePct: number;
  remiseXof: number;
  /** La remise que le rendez-vous soldé porte déjà (son brut moins son net). */
  remiseDuRendezVousXof: number;
  /** Ce que le rendez-vous a déjà reçu : acompte vérifié et versements. */
  dejaRecuXof: number;
  /** Ce que le code tapé retirerait, et son nom. */
  promoBrutXof: number;
  nomDuCode: string;
};

export type Ticket = {
  cumul: CumulEnFrancs;
  /** Les remises qui s'appliquent VRAIMENT (zéro quand le code les écarte). */
  remisePct: number;
  remiseXof: number;
  remiseDuRendezVousXof: number;
  promoXof: number;
  /** Le net de la pièce : ce que vaut le ticket. */
  netXof: number;
  /** Ce que valent les prestations du ticket, toutes remises déduites. */
  partNetteXof: number;
  /** L'argent déjà reçu par le rendez-vous, imputé à ce ticket. */
  acompteXof: number;
  /** Ce qui reste à régler au comptoir (comptant et avoir). */
  aPayerXof: number;
};

/** LE TICKET, AU FRANC PRÈS. Même ordre que `invoiceTotal` : le pourcentage,
    puis les francs. La remise du rendez-vous compte comme « déjà posée » face
    au code : deux remises qui s'empilent se défendent mal (shared/promos). */
export function leTicket(e: EntreeDuTicket): Ticket {
  const sous = Math.max(0, e.sousTotalXof);
  const prest = Math.min(sous, Math.max(0, e.prestationsXof));
  const pct = Math.max(0, Math.min(100, e.remisePct));
  const xof = f(e.remiseXof);
  /* La remise du rendez-vous ne dépasse jamais ce que ses prestations valent
     au ticket : une ligne retirée n'emporte pas un geste plus grand qu'elle. */
  const rdv = Math.min(f(e.remiseDuRendezVousXof), Math.round(prest));
  const dejaPose = Math.round(sous * (pct / 100)) + xof + rdv;
  const cumul = laMeilleureEnFrancs(dejaPose, e.promoBrutXof, e.nomDuCode);
  const promoXof = cumul.codeConsomme ? f(e.promoBrutXof) : 0;
  /* LE CODE QUI GAGNE ÉCARTE TOUT CE QUI ÉTAIT POSÉ : c'est ce que l'écran
     annonce, c'est donc ce que le net retranche. */
  const pctEff = cumul.codeConsomme ? 0 : pct;
  const xofEff = cumul.codeConsomme ? 0 : xof;
  const rdvEff = cumul.codeConsomme ? 0 : rdv;
  const netXof = Math.max(0, Math.round(sous * (1 - pctEff / 100)) - xofEff - rdvEff - promoXof);
  const partNetteXof = Math.max(0, Math.round(prest * (1 - pctEff / 100)) - xofEff - rdvEff - promoXof);
  const acompteXof = Math.min(f(e.dejaRecuXof), partNetteXof, netXof);
  return {
    cumul, remisePct: pctEff, remiseXof: xofEff, remiseDuRendezVousXof: rdvEff, promoXof,
    netXof, partNetteXof, acompteXof, aPayerXof: Math.max(0, netXof - acompteXof),
  };
}

/** Un argent que le rendez-vous a reçu avant le comptoir. */
export type DejaRecu = { date: string; amountXof: number; note: string };

/** CE QUE LE RENDEZ-VOUS A DÉJÀ REÇU, VERSEMENT PAR VERSEMENT — 10 octobre
    2026, reprise de la revue. L'acompte vérifié au jour où il a été reconnu
    (ou, à défaut, au jour du rituel, comme le compte `apptCashOnDay`), puis
    chaque versement du journal à SA date. Un journal d'avant (le seul
    `paidXof`) ne dit pas son jour : il prend celui de la vente. La somme vaut
    l'acompte vérifié plus `apptPaidXof`, c'est-à-dire ce qu'`apptDueXof`
    retire déjà. */
export function lArgentDejaRecu(
  a: Pick<Appointment, 'date' | 'depositConfirmed' | 'depositXof' | 'depositConfirmedAt' | 'payments' | 'paidXof'>,
  jourDeLaVente: string,
): DejaRecu[] {
  const out: DejaRecu[] = [];
  if (a.depositConfirmed && f(Number(a.depositXof) || 0) > 0) {
    out.push({ date: (a.depositConfirmedAt ?? a.date ?? jourDeLaVente).slice(0, 10), amountXof: f(Number(a.depositXof) || 0), note: 'Acompte reçu avant le comptoir' });
  }
  if (a.payments?.length) {
    for (const p of a.payments) {
      const m = f(Number(p.amountXof) || 0);
      if (m > 0) out.push({ date: (p.date || jourDeLaVente).slice(0, 10), amountXof: m, note: 'Reçu au Carnet avant le comptoir' });
    }
  } else if (f(Number(a.paidXof) || 0) > 0) {
    out.push({ date: jourDeLaVente, amountXof: f(Number(a.paidXof) || 0), note: 'Reçu au Carnet avant le comptoir' });
  }
  /* Dans l'ordre où l'argent est entré : c'est le plus ancien qui s'impute
     d'abord quand le ticket n'en prend qu'une part. */
  return out.map((d, i) => ({ d, i })).sort((x, y) => (x.d.date < y.d.date ? -1 : x.d.date > y.d.date ? 1 : x.i - y.i)).map((x) => x.d);
}

/** LE RITUEL QUI A DÉJÀ SA PIÈCE NE SE REPREND PAS AU TICKET — 10 octobre
    2026, reprise de la revue. Le Carnet tient « une pièce par rituel » : un
    second règlement s'inscrit sur la pièce existante, et l'acompte n'y est
    consommé qu'une fois (actions.tsx). La Caisse, elle, en ouvre toujours une
    neuve ; un rituel dont une pièce existe encore (après la suppression de
    la dernière de deux, par exemple) y réécrivait en « Acompte » l'argent de
    l'autre pièce, compté alors deux fois au chiffre d'affaires. Le lien se lit
    des trois côtés, comme au Carnet : la pièce nomme le rituel, le rituel
    nomme sa pièce, un versement nomme la sienne. */
export function aDejaSaPiece(
  a: Pick<Appointment, 'id' | 'invoiceId' | 'payments'>,
  pieces: readonly Pick<Invoice, 'id' | 'kind' | 'apptId'>[],
): boolean {
  return pieces.some((i) => i.kind === 'facture'
    && (i.apptId === a.id || (!!a.invoiceId && i.id === a.invoiceId) || (a.payments ?? []).some((p) => p.invoiceId === i.id)));
}

/** LES VERSEMENTS DE LA PIÈCE DU TICKET, un par nature d'argent, comme
    l'écran d'encaissement (actions.tsx) : le comptant entre au tiroir,
    l'avoir est un crédit consommé, l'acompte est entré un autre jour. Leur
    somme égale le net de la pièce. */
export function versementsDuTicket(v: {
  nouvelId: () => string;
  date: string;
  time?: string;
  encaissePar?: string;
  comptantXof: number;
  moyen: PaymentMethod;
  caisse?: string;
  fx?: { code: string; rate: number; amount: number };
  avoirXof: number;
  acompteXof: number;
  acompteDate?: string;
  /** L'argent déjà reçu, versement par versement (`lArgentDejaRecu`). */
  dejaRecu?: readonly DejaRecu[];
}): InvoicePayment[] {
  const out: InvoicePayment[] = [];
  /* L'ARGENT DÉJÀ REÇU GARDE SES DATES — 10 octobre 2026, reprise de la
     revue. Fondu en un seul « Acompte » au jour de l'acompte ou de la vente,
     un versement de septembre posé au Carnet passait en octobre au chiffre
     d'affaires (`invoiceRegleAu` range chaque versement à SA date). Chacun
     s'inscrit donc à son jour, dans l'ordre où il est entré, jusqu'à ce que
     le ticket impute ; aucun ne porte de caisse : il est entré un autre
     jour, le tiroir d'aujourd'hui ne le reçoit pas. */
  let reste = f(v.acompteXof);
  for (const d of v.dejaRecu ?? []) {
    if (reste <= 0) break;
    const m = Math.min(reste, f(d.amountXof));
    if (m <= 0) continue;
    out.push({ id: v.nouvelId(), date: d.date || v.date, amountXof: m, method: 'Acompte', note: d.note });
    reste -= m;
  }
  if (reste > 0) {
    out.push({
      id: v.nouvelId(), date: v.acompteDate || v.date, amountXof: reste,
      method: 'Acompte', note: 'Reçu avant le comptoir',
    });
  }
  if (f(v.comptantXof) > 0) {
    out.push({
      id: v.nouvelId(), date: v.date, amountXof: f(v.comptantXof), method: v.moyen,
      ...(v.caisse ? { cashbox: v.caisse } : {}),
      ...(v.time ? { time: v.time } : {}),
      ...(v.encaissePar ? { encaissePar: v.encaissePar } : {}),
      ...(v.fx ? { fx: v.fx } : {}),
    });
  }
  if (f(v.avoirXof) > 0) {
    out.push({
      id: v.nouvelId(), date: v.date, amountXof: f(v.avoirXof), method: 'Avoir',
      note: 'Réglé par avoir, crédit du compte',
    });
  }
  return out;
}

/** CE QUE LE RENDEZ-VOUS REÇOIT DE CE TICKET. L'acompte y est déjà compté
    (`apptDueXof` le retire) : seul l'argent du jour s'y inscrit, l'avoir
    d'abord sur le rituel, le comptant pour le reste. */
export function ceQueLeRendezVousRecoit(e: { partNetteXof: number; acompteXof: number; avoirXof: number }): { comptantXof: number; avoirXof: number } {
  const duJour = Math.max(0, f(e.partNetteXof) - f(e.acompteXof));
  const avoir = Math.min(f(e.avoirXof), duJour);
  return { comptantXof: duJour - avoir, avoirXof: avoir };
}

/** « MARQUER PAYÉE » : la pièce passe payée PAR UN VERSEMENT, daté du jour où
    l'argent entre, à la caisse choisie, du reste dû et de lui seul. Les
    versements déjà reçus restent tels quels. */
export function soldeDeLaPiece(
  inv: Invoice,
  v: { id: string; jour: string; moyen: PaymentMethod; caisse?: string; time?: string; encaissePar?: string },
): Pick<Invoice, 'status' | 'payment' | 'payments'> {
  const deja = invoiceReglements(inv);
  const reste = invoiceResteXof(inv);
  const payments = reste > 0
    ? [...deja, {
      id: v.id, date: v.jour, amountXof: reste, method: v.moyen,
      ...(v.caisse ? { cashbox: v.caisse } : {}),
      ...(v.time ? { time: v.time } : {}),
      ...(v.encaissePar ? { encaissePar: v.encaissePar } : {}),
    }]
    : deja;
  return { status: 'payée', payment: v.moyen, payments };
}

/** Le bouton attend sa caisse quand la branche en a. */
export const caisseManquante = (caisse: string, caissesDeLaBranche: number): boolean =>
  caissesDeLaBranche > 0 && !caisse;
