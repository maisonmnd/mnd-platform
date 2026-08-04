import { useRef, useState } from 'react';
import { Button, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, rateToXof } from '../../../../shared/currency';
import { CURRENCIES } from '../../../../shared/geo';
import { useSettings } from '../../../../shared/settings';
import { useClients, clientsStore, useFamilies } from '../../../../shared/clients';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { type Service } from '../../../../shared/catalog';
import {
  invoicesStore, useCashboxes, invoiceTotal, usePaymentMethods, cashboxCurrency, nextInvoiceNumber,
  useCredits, creditMovementsStore, creditBalanceOf,
  type Invoice, type InvoiceLine, type PaymentMethod, type CreditHolder,
} from '../../../../shared/finance';
import { holderOf, payerClientIdOf } from '../../../../shared/accounts';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, splitByWeights } from '../../../../shared/pricing';
import { pointsRateStore, pointsHistoryStore, pointsEnabledStore } from '../../../../shared/offers';
import { uid } from '../../../../shared/store';
import { sameName } from '../../../../shared/text';
import { addTip } from '../../../../shared/tips';
import { useStaff } from '../equipe/data';
import { Toggle } from '../equipe/ui';
import '../equipe/equipe.css'; // styles du Toggle partagé (tre-toggle)
import {
  apptLabel, apptServices, apptNetXof, apptTotalXof, frShort, todayISO, useServicesById,
} from './_shared';

/* Actions transverses Clients & Agenda : fidélité (points Cercle) + encaissement d'un RDV. */

/* ---------- Fidélité — points attribués à l'honneur d'un RDV ---------- */

/** Attribue les points Cercle MND correspondant à un montant (1 point / `taux` F).
    N'écrit RIEN tant que le programme n'est pas activé (Cercle MND). */
export function awardLoyalty(clientId: string, amountXof: number, label: string): number {
  if (!pointsEnabledStore.get()) return 0;
  const rate = pointsRateStore.get() || 100;
  const pts = Math.max(0, Math.floor(amountXof / rate));
  if (pts <= 0 || !clientId) return 0;
  const client = clientsStore.get().find((c) => c.id === clientId);
  clientsStore.set((prev) =>
    prev.map((c) => (c.id === clientId ? { ...c, loyaltyPoints: (c.loyaltyPoints ?? 0) + pts } : c)),
  );
  pointsHistoryStore.set((prev) => [
    { id: `pt-${uid()}`, clientId, clientName: client?.name ?? '—', label, pts, at: new Date().toISOString() },
    ...prev,
  ]);
  return pts;
}

/** Passe un RDV à « honoré » et attribue les points Cercle une seule fois. */
export function honorAppointment(appt: Appointment, byId: Map<string, Service>): number {
  const total = apptNetXof(appt, byId);
  const awarded = appt.pointsAwarded ? 0 : awardLoyalty(appt.clientId, total, `Rituel honoré · ${frShort(appt.date)}`);
  appointmentsStore.set((prev) =>
    prev.map((a) => (a.id === appt.id ? { ...a, status: 'honoré', pointsAwarded: true } : a)),
  );
  return awarded;
}

/* ---------- Annulation d'encaissement ----------
   Deux registres vivent côte à côte : la FACTURE (pièce comptable) et le RDV
   (paidXof, statut, points). Supprimer une facture ne rembobinait pas le RDV —
   il restait « payé » à jamais. Ces fonctions font l'annulation COMPLÈTE. */

/** Reprend les points Cercle attribués à l'honneur du RDV, si on retrouve
    l'attribution exacte dans l'historique. Renvoie les points repris (0 sinon). */
function reverseHonorPoints(appt: Appointment): number {
  if (!appt.pointsAwarded || !appt.clientId) return 0;
  const label = `Rituel honoré · ${frShort(appt.date)}`;
  const entry = pointsHistoryStore.get().find((e) => e.clientId === appt.clientId && e.label === label && e.pts > 0);
  if (!entry) return 0;
  clientsStore.set((prev) =>
    prev.map((c) => (c.id === appt.clientId ? { ...c, loyaltyPoints: Math.max(0, (c.loyaltyPoints ?? 0) - entry.pts) } : c)),
  );
  pointsHistoryStore.set((prev) => [
    { id: `pt-${uid()}`, clientId: appt.clientId, clientName: entry.clientName, label: `Encaissement annulé · ${frShort(appt.date)}`, pts: -entry.pts, at: new Date().toISOString() },
    ...prev,
  ]);
  return entry.pts;
}

/** Annule l'encaissement d'un rituel : le RDV redevient impayé (honoré →
    confirmé), sa facture liée repasse « envoyée » (émise, impayée), et les
    points de l'honneur sont repris quand on retrouve leur attribution. */
/* RENDRE L'AVOIR CONSOMME PAR UNE FACTURE. Sans ce geste, annuler ou supprimer
   un encaissement remettait le rituel « impaye » tout en laissant le compte de
   la cliente debite : elle payait deux fois, une fois avec son credit detruit,
   une fois au re-encaissement. `resetAllPaidInvoices` savait deja le faire ;
   les deux chemins courants, non. */
function restituerAvoir(invoiceId: string): void {
  const usages = creditMovementsStore.get().filter((m) => m.kind === 'usage' && m.invoiceId === invoiceId);
  if (!usages.length) return;
  const ids = new Set(usages.map((m) => m.id));
  creditMovementsStore.set((prev) => prev.filter((m) => !ids.has(m.id)));
}

export function cancelAppointmentPayment(appt: Appointment): { invoiceUpdated: boolean; pointsReversed: number } {
  let invoiceUpdated = false;
  if (appt.invoiceId) {
    invoicesStore.set((prev) => prev.map((i) => {
      if (i.id !== appt.invoiceId || i.status !== 'payée') return i;
      invoiceUpdated = true;
      return { ...i, status: 'envoyée' as const };
    }));
  }
  if (appt.invoiceId) restituerAvoir(appt.invoiceId);
  const pointsReversed = reverseHonorPoints(appt);
  appointmentsStore.set((prev) => prev.map((a) => (a.id === appt.id
    ? {
        ...a,
        paidXof: undefined,
        /* LE JOURNAL SUIT L'ANNULATION. Il survivait a l'encaissement annule :
           le reste du revenait au total, mais la trace du versement restait
           affichee — un argent rendu qui continuait de figurer comme recu. */
        payments: undefined,
        invoiceId: undefined,
        status: a.status === 'honoré' ? 'confirmé' : a.status,
        /* Points repris → une future ré-attribution redevient légitime. Pas
           retrouvés → on garde le verrou pour ne jamais les doubler. */
        ...(pointsReversed > 0 ? { pointsAwarded: false } : {}),
      }
    : a)));
  return { invoiceUpdated, pointsReversed };
}

/** À la SUPPRESSION d'une facture : rembobine le rituel qu'elle réglait
    (déduit le montant ; à zéro, dés-honore et reprend les points). Renvoie le
    RDV touché, ou null si la facture ne réglait aucun rituel. */
export function rewindPaymentForDeletedInvoice(invoiceId: string, amountXof: number): Appointment | null {
  restituerAvoir(invoiceId);
  const appt = appointmentsStore.get().find((a) => a.invoiceId === invoiceId);
  if (!appt) return null;
  const newPaid = Math.max(0, (appt.paidXof ?? 0) - Math.max(0, amountXof));
  /* Le journal se rembobine du meme montant, du versement le plus recent au
     plus ancien : la piece supprimee emporte les versements qu'elle portait. */
  let aReprendre = Math.max(0, amountXof);
  const journal = [...(appt.payments ?? [])];
  while (aReprendre > 0 && journal.length) {
    const dernier = journal[journal.length - 1];
    if (dernier.amountXof <= aReprendre) {
      aReprendre -= dernier.amountXof;
      journal.pop();
    } else {
      journal[journal.length - 1] = { ...dernier, amountXof: dernier.amountXof - aReprendre };
      aReprendre = 0;
    }
  }
  const fully = newPaid === 0;
  const pointsReversed = fully ? reverseHonorPoints(appt) : 0;
  appointmentsStore.set((prev) => prev.map((a) => (a.id === appt.id
    ? {
        ...a,
        paidXof: newPaid > 0 ? newPaid : undefined,
        payments: journal.length ? journal : undefined,
        invoiceId: undefined,
        status: fully && a.status === 'honoré' ? 'confirmé' : a.status,
        ...(pointsReversed > 0 ? { pointsAwarded: false } : {}),
      }
    : a)));
  return appt;
}

/** REMISE À ZÉRO des encaissements : SUPPRIME toutes les factures PAYÉES d'une
    branche et rembobine leurs rituels (impayés, honoré → confirmé, points repris),
    pour re-passer chaque paiement à la main avec des factures neuves. Les usages
    d'avoir liés sont annulés (le solde du compte est restauré). Ne touche NI les
    devis, NI les factures non payées (brouillon/envoyée). Renvoie le décompte.
    ⚠ Destructif : à faire APRÈS une sauvegarde. Les pourboires déjà saisis
    (magasin séparé) ne sont pas repris — à vérifier à la main. */
export function resetAllPaidInvoices(branchId: string): { invoices: number; appts: number; avoirsRestored: number } {
  const paid = invoicesStore.get().filter((i) => i.branchId === branchId && i.kind === 'facture' && i.status === 'payée');
  if (paid.length === 0) return { invoices: 0, appts: 0, avoirsRestored: 0 };
  const paidIds = new Set(paid.map((i) => i.id));

  /* Rituels réglés par ces factures (lien invoiceId) → rembobinés d'un bloc. */
  const linked = appointmentsStore.get().filter((a) => a.invoiceId && paidIds.has(a.invoiceId));
  for (const a of linked) reverseHonorPoints(a); // reprise best-effort avant de couper le lien
  if (linked.length) {
    const linkedIds = new Set(linked.map((a) => a.id));
    appointmentsStore.set((prev) => prev.map((a) => (linkedIds.has(a.id)
      ? { ...a, paidXof: undefined, invoiceId: undefined, status: a.status === 'honoré' ? 'confirmé' : a.status, pointsAwarded: false }
      : a)));
  }

  /* Avoirs consommés par ces factures : on retire l'écriture d'usage → le solde
     du compte remonte, comme si l'encaissement n'avait jamais eu lieu. */
  const usages = creditMovementsStore.get().filter((m) => m.kind === 'usage' && m.invoiceId && paidIds.has(m.invoiceId));
  if (usages.length) {
    const usageIds = new Set(usages.map((m) => m.id));
    creditMovementsStore.set((prev) => prev.filter((m) => !usageIds.has(m.id)));
  }

  /* Suppression des factures payées (les numéros repartiront de zéro). */
  invoicesStore.set((prev) => prev.filter((i) => !paidIds.has(i.id)));

  return { invoices: paid.length, appts: linked.length, avoirsRestored: usages.length };
}

/* ---------- Encaisser un RDV — Tableau de bord / Calendrier / Carnet ---------- */

export function PayAppointmentModal({ appt, onClose }: { appt: Appointment; onClose: () => void }) {
  const { branch, currency } = useBranch();
  const byId = useServicesById();
  const [clients] = useClients();
  const [cashboxes] = useCashboxes();
  const [team] = useStaff();
  const [methods] = usePaymentMethods();
  const [families] = useFamilies();
  const [credits] = useCredits();
  const branchBoxes = cashboxes.filter((c) => c.branchId === branch.id);
  const client = clients.find((c) => c.id === appt.clientId);
  /* Avoir : porté par le COMPTE (famille du parent payeur, ou cliente solo). Le
     payeur de la facture est le parent quand la cliente est rattachée à une famille. */
  const account: CreditHolder = client ? holderOf(client, families) : { type: 'client', id: appt.clientId };
  const avoirBal = creditBalanceOf(credits, account);
  const payerId = client ? payerClientIdOf(client, families) : appt.clientId;
  const payerClient = clients.find((c) => c.id === payerId);
  const isFamilyPayer = payerId !== appt.clientId;

  const services = apptServices(appt, byId);
  /* Contexte tarifaire de la cliente — la facture ventile chaque prestation selon
     SON prix personnalisé (le même qu'au rendez-vous), jamais le prix catalogue. */
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const pricing = pricingOf(client, bands, sets);
  const net = apptNetXof(appt, byId);
  const deposit = appt.depositXof ?? 0;
  const alreadyPaid = appt.paidXof ?? 0;

  /* Acompte : DEMANDÉ tant qu'il n'est pas VÉRIFIÉ reçu. Une réservation en ligne
     le pose au clic, sans preuve de paiement — il ne se déduit du dû qu'une fois
     la case « acompte reçu » cochée (et persistée à l'enregistrement). */
  const [depositReceived, setDepositReceived] = useState(!!appt.depositConfirmed);
  const depositJustConfirmed = depositReceived && !appt.depositConfirmed;
  const due = Math.max(0, net - alreadyPaid - (depositReceived ? deposit : 0));

  const [pay, setPay] = useState<PaymentMethod>(methods[0] ?? 'Espèces');
  const [cashbox, setCashbox] = useState(branchBoxes[0]?.name ?? '');
  /* La facture garde la date du RITUEL (le jour de la prestation), pas celle du
     jour où l'on encaisse — modifiable au besoin. */
  const [invDate, setInvDate] = useState(appt.date || todayISO());
  /* LA DATE DU PAIEMENT N'EST PAS CELLE DE LA FACTURE. La piece porte le jour du
     rituel ; l'argent, lui, entre le jour ou il est remis. Prunelle a prepaye en
     juillet un rituel du 8 aout : forcer les deux a la meme date rangeait ses
     68 000 F dans les encaissements d'aout, ou ils ne sont jamais entres. */
  const [payDate, setPayDate] = useState(todayISO());
  /* Avoir appliqué à ce règlement — plafonné au solde ET au reste dû. Le comptant
     ne couvre alors que ce qui reste après l'avoir. */
  const [avoirStr, setAvoirStr] = useState('0');
  const avoirApplied = Math.max(0, Math.min(Math.min(avoirBal, due), Math.round(Number(avoirStr) || 0)));
  const cashMax = Math.max(0, due - avoirApplied);
  const [amountStr, setAmountStr] = useState(String(due));
  const amount = Math.max(0, Math.min(cashMax, Math.round(Number(amountStr) || 0)));
  const settleTotal = amount + avoirApplied; // ce qui solde le rituel ce coup-ci (comptant + avoir)

  /* Cocher/décocher l'acompte recale le montant proposé sur le nouveau dû. */
  const toggleDepositReceived = () =>
    setDepositReceived((v) => {
      const next = !v;
      setAmountStr(String(Math.max(0, net - alreadyPaid - (next ? deposit : 0))));
      return next;
    });
  const [tipStr, setTipStr] = useState('0');
  const tip = Math.max(0, Math.round(Number(tipStr) || 0));
  /* Le maître officiant, retrouvé dans le personnel par son nom — reçoit le
     pourboire. Comparaison NORMALISÉE (accents, casse, espaces) : une majuscule
     de différence privait le maître de son pourboire. */
  const tipMaster = team.find((s) => sameName(s.name, appt.master));
  const remainingAfter = Math.max(0, due - settleTotal);

  /* Devise étrangère — exceptionnel, ouvert depuis Paramètres (comme à la Caisse). */
  const [settings] = useSettings();
  const [fxOn, setFxOn] = useState(false);
  const [fxCode, setFxCode] = useState('EUR');
  const [fxRate, setFxRate] = useState(String(rateToXof('EUR') || ''));
  const fxRateNum = Math.max(0, Number(fxRate) || 0);
  /* Ce qui traverse VRAIMENT le comptoir : le règlement ET le pourboire. À la
     Caisse c'était le net de la facture ; ici la cliente tend les deux d'un bloc,
     et convertir le seul règlement lui ferait payer le pourboire en francs. */
  const tenderXof = amount + tip;
  const fxAmount = fxOn && fxRateNum > 0 ? Math.round((tenderXof / fxRateNum) * 100) / 100 : 0;
  /* Une caisse ne reçoit que sa devise : les euros vont au tiroir en euros, pas
     à celui de la maison. Sans caisse dans la devise reçue, on refuse plutôt que
     de fausser deux soldes d'un coup. */
  const payCurrency = fxOn ? fxCode : currency;
  const eligibleBoxes = branchBoxes.filter((c) => cashboxCurrency(c) === payCurrency);
  const activeBox = eligibleBoxes.some((c) => c.name === cashbox) ? cashbox : eligibleBoxes[0]?.name ?? '';
  const fxBlocked = fxOn && eligibleBoxes.length === 0;

  /* Reprogrammation automatique : au moment d'encaisser, poser d'un geste le
     prochain RDV (résserrage/soin de suite), même cliente / prestations / maître. */
  const addDaysISO = (iso: string, days: number) => {
    const d = new Date(`${iso || todayISO()}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const [reschedule, setReschedule] = useState(false);
  const [nextDate, setNextDate] = useState(() => {
    const d = addDaysISO(appt.date, 28); // 4 semaines par défaut
    return d > todayISO() ? d : addDaysISO(todayISO(), 28);
  });
  const [nextTime, setNextTime] = useState(appt.time || '09:00');
  const setNextIn = (days: number) => {
    const d = addDaysISO(appt.date, days);
    setNextDate(d > todayISO() ? d : addDaysISO(todayISO(), days));
  };

  const submitting = useRef(false); // garde-fou anti double-clic (double facture / double pourboire)
  const fullyPaid = remainingAfter === 0;

  const confirm = () => {
    if (submitting.current) return; // évite la double-soumission (double-clic rapide)
    if (amount <= 0 && avoirApplied <= 0 && tip <= 0 && !depositJustConfirmed && !reschedule) return;
    submitting.current = true;
    if (settleTotal > 0) {
      /* Facture DÉTAILLÉE : une ligne PAR prestation quand on solde tout d'un coup
         (sans acompte CRÉDITÉ ni règlement antérieur), pour que la cliente voie le
         détail. Sinon (paiement partiel / acompte), une seule ligne « Règlement ».
         Chaque prestation est facturée à son PRIX PERSONNALISÉ PLEIN (le même qu'au
         rendez-vous). Quand le net encaissé est INFÉRIEUR à la somme des prix pleins
         (prix d'origine conservé, geste commercial…), l'écart devient une REMISE
         VISIBLE (globalDiscountXof) — lisible à tout moment, plutôt que de raboter
         chaque ligne. Cas inverse rare (net > prix pleins) : on répartit pour coller. */
      const svcWeights = services.map((sv) => personalPriceXof(sv, pricing));
      const grossSum = svcWeights.reduce((s, w) => s + w, 0);
      /* L'ACOMPTE N'EST CONSOMME QU'UNE FOIS — a la PREMIERE facture du rituel.
         Il etait jusqu'ici reporte sur chaque reglement partiel suivant, ce qui
         faisait disparaitre le second versement du registre de caisse. */
      const depositCredit = depositReceived && alreadyPaid === 0 ? deposit : 0;

      /* CE QUE LA FACTURE PORTE. `settleTotal` est le seul RESTE encaisse ce
         coup-ci ; la facture doit valoir en plus l'acompte qu'elle consomme,
         sans quoi cet argent n'apparait dans AUCUN chiffre d'affaires (le rituel,
         portant desormais un invoiceId, est compte par sa facture et par elle
         seule). C'est la convention que `depositCreditXof` documente dans
         finance.ts : le total INCLUT l'acompte, et le champ sert uniquement a ne
         pas crediter la caisse du comptoir d'un argent entre un autre jour. */
      const factureTotal = settleTotal + depositCredit;

      /* Le montant facturé ce coup-ci = comptant + avoir appliqué. L'avoir est du
         REVENU (il compte au CA) mais pas de l'argent physique : on le porte à part
         (avoirXof), la Synthèse le route hors caisse. */
      const detailed = fullyPaid && alreadyPaid === 0 && depositCredit === 0 && services.length > 1 && grossSum > 0;
      const detailRemise = detailed && grossSum > settleTotal ? grossSum - settleTotal : 0;
      let lines: InvoiceLine[];
      if (detailed && grossSum >= settleTotal) {
        lines = services.map((sv, idx) => ({ id: `il-${uid()}`, label: sv.name, qty: 1, unitXof: svcWeights[idx], discountPct: 0 }));
      } else if (detailed) {
        const shares = splitByWeights(settleTotal, svcWeights);
        lines = services.map((sv, idx) => ({ id: `il-${uid()}`, label: sv.name, qty: 1, unitXof: shares[idx], discountPct: 0 }));
      } else {
        lines = [{
          id: `il-${uid()}`,
          label: fullyPaid && alreadyPaid === 0 ? apptLabel(appt, byId) : `Règlement · ${apptLabel(appt, byId)}`,
          qty: 1, unitXof: factureTotal, discountPct: 0,
        }];
      }
      /* Compte famille : la facture est au nom du PARENT PAYEUR, la cliente soignée
         en mention (forClientId). */
      const avoirNote = avoirApplied > 0 ? `Réglé par avoir : ${fmtMoney(avoirApplied, currency)}${amount > 0 ? ` · comptant ${fmtMoney(amount, currency)}` : ''}` : '';
      const partialNote = fullyPaid ? '' : `Paiement partiel — reste ${fmtMoney(remainingAfter, currency)}`;
      const inv: Invoice = {
        id: `inv-${uid()}`,
        branchId: branch.id,
        kind: 'facture',
        number: nextInvoiceNumber(invoicesStore.get(), 'F'),
        clientId: payerId,
        date: invDate,
        lines,
        globalDiscountPct: 0,
        /* Remise VISIBLE : l'écart entre les prix pleins et le net encaissé. */
        globalDiscountXof: detailRemise > 0 ? detailRemise : undefined,
        theme: 'Rose',
        status: 'payée',
        payment: amount > 0 ? pay : 'Avoir',
        cashbox: activeBox,
        time: new Date().toTimeString().slice(0, 5),
        clientName: payerClient?.name ?? client?.name,
        forClientId: isFamilyPayer ? appt.clientId : undefined,
        master: appt.master,
        note: [avoirNote, partialNote].filter(Boolean).join(' · ') || undefined,
        /* Le pourboire rejoint la MÊME caisse que le paiement — traçable, mais
           toujours hors chiffre d'affaires (invoiceTotal l'exclut). Seulement s'il est
           attribuable à un maître, pour que « à reverser aux maîtres » reste juste. */
        tipXof: tip > 0 && tipMaster ? tip : undefined,
        /* Part réglée par avoir (crédit du compte) — hors caisse physique. */
        avoirXof: avoirApplied > 0 ? avoirApplied : undefined,
        /* Part déjà REÇUE avant ce comptoir (acompte confirmé) : elle est entrée
           un autre jour, dans une autre caisse. La porter ici évite qu'elle soit
           créditée une seconde fois au solde. */
        depositCreditXof: depositCredit > 0 ? depositCredit : undefined,
        /* Ce qui a été REÇU au comptoir — règlement COMPTANT + pourboire (l'avoir
           n'est pas une devise étrangère). Le rituel reste chiffré en {currency}. */
        fx: fxOn && fxAmount > 0 ? { code: fxCode, rate: fxRateNum, amount: fxAmount } : undefined,
      };
      invoicesStore.set((prev) => [inv, ...prev]);
      /* Avoir consommé : une écriture d'usage (−) sur le compte porteur. */
      if (avoirApplied > 0) {
        creditMovementsStore.set((prev) => [...prev, {
          id: uid(), branchId: branch.id, holderType: account.type, holderId: account.id,
          kind: 'usage', amountXof: avoirApplied, date: invDate, forClientId: appt.clientId, invoiceId: inv.id,
        }]);
      }
      /* ENCAISSER ≠ HONORER : l'argent entre ici, mais le rituel n'est « honoré »
         que par le geste dédié (Carnet / Tableau de bord → Marquer honoré) — on
         peut encaisser d'avance un rituel qui n'a pas encore eu lieu.
         Un rituel SOLDÉ fige son prix (priceXof) au tarif du jour de la vente :
         le catalogue bougera, l'histoire non. */
      const freeze = fullyPaid && appt.priceXof == null ? { priceXof: apptTotalXof(appt, byId) } : {};
      appointmentsStore.set((prev) => prev.map((a) => (a.id === appt.id
        ? {
            ...a,
            invoiceId: inv.id,
            paidXof: alreadyPaid + settleTotal,
            /* LE JOURNAL DES VERSEMENTS. Une somme ne sait pas dire quand
               l'argent est entre : chaque reglement s'inscrit ici avec SA date,
               son moyen et sa caisse. `paidXof` reste tenu a jour pour tout ce
               qui le lit encore. */
            ...(settleTotal > 0 ? {
              payments: [
                ...(a.payments ?? []),
                {
                  id: `pay-${uid()}`,
                  amountXof: settleTotal,
                  date: payDate,
                  method: pay,
                  cashbox: activeBox || undefined,
                  ...(avoirApplied > 0 ? { note: `dont ${avoirApplied} F par avoir` } : {}),
                },
              ],
            } : {}),
            /* La DATE de reconnaissance de l'acompte : c'est ce jour-là qu'il
               entre au registre des encaissements, pas celui du rituel. */
            ...(depositReceived ? { depositConfirmed: true, depositConfirmedAt: appt.depositConfirmedAt ?? invDate } : {}),
            ...freeze,
          }
        : a)));
    } else if (tip > 0 && tipMaster) {
      /* Pourboire seul sur un rituel déjà soldé : on crée une facture minimale à 0 F
         (invoiceTotal=0 → aucun chiffre d'affaires) portant le pourboire, pour qu'il
         reste tracé dans la caisse et reversable au maître. */
      const inv: Invoice = {
        id: `inv-${uid()}`,
        branchId: branch.id,
        kind: 'facture',
        number: nextInvoiceNumber(invoicesStore.get(), 'F'),
        clientId: appt.clientId,
        date: invDate,
        lines: [{ id: `il-${uid()}`, label: `Pourboire · ${appt.master}`, qty: 1, unitXof: 0, discountPct: 0 }],
        globalDiscountPct: 0,
        theme: 'Rose',
        status: 'payée',
        payment: pay,
        cashbox: activeBox,
        time: new Date().toTimeString().slice(0, 5),
        clientName: client?.name,
        master: appt.master,
        note: 'Pourboire',
        tipXof: tip,
      };
      invoicesStore.set((prev) => [inv, ...prev]);
    }

    /* Pourboire — enregistré séparément sur le maître officiant (jamais dans la
       facture ni le chiffre d'affaires). Possible même si le rituel est déjà soldé,
       à condition que le maître soit bien dans le personnel. */
    const tipRecorded = tip > 0 && !!tipMaster;
    if (tip > 0 && tipMaster) addTip(tipMaster.id, tip, invDate);

    /* Confirmation d'acompte SANS encaissement : on la persiste quand même.
       (L'honneur du rituel reste un geste séparé — Marquer honoré.) */
    if (depositJustConfirmed && settleTotal <= 0) {
      appointmentsStore.set((prev) => prev.map((x) => (x.id === appt.id
        ? { ...x, depositConfirmed: true, depositConfirmedAt: x.depositConfirmedAt ?? todayISO() }
        : x)));
    }

    /* Reprogrammation automatique : nouveau RDV « confirmé » À L'IDENTIQUE — même
       cliente, mêmes prestations, même maître, MÊME PRIX et MÊME REMISE. On fige le
       prix (avant remise) et on reporte la remise (% et CFA) pour que le prochain RDV
       porte exactement le même net. Impayé, à honorer et encaisser le moment venu. */
    let rescheduled = false;
    if (reschedule && nextDate) {
      const newAppt: Appointment = {
        id: `appt-${uid()}`,
        branchId: appt.branchId,
        clientId: appt.clientId,
        clientName: appt.clientName ?? client?.name,
        serviceIds: appt.serviceIds,
        date: nextDate,
        time: nextTime || appt.time || '09:00',
        master: appt.master,
        status: 'confirmé',
        source: 'trone',
        priceXof: appt.priceXof ?? apptTotalXof(appt, byId), // prix figé, à l'identique
        ...(appt.discountXof != null ? { discountXof: appt.discountXof } : {}),
        ...(appt.discountPct != null ? { discountPct: appt.discountPct } : {}),
        note: 'Reprogrammé depuis l’encaissement',
      };
      appointmentsStore.set((prev) => [...prev, newAppt]);
      rescheduled = true;
    }

    onClose();
    /* Alerte honnête : on ne prétend jamais avoir attribué un pourboire perdu. */
    const avoirMsg = avoirApplied > 0 ? ` (dont ${fmtMoney(avoirApplied, currency)} par avoir)` : '';
    const payMsg = settleTotal > 0
      ? (fullyPaid
          ? `Réglé en totalité · ${fmtMoney(settleTotal, currency)}${avoirMsg}. Marquez le rituel « honoré » quand il a eu lieu.`
          : `Paiement partiel enregistré · ${fmtMoney(settleTotal, currency)}${avoirMsg} · reste ${fmtMoney(remainingAfter, currency)}.`)
      : '';
    const tipMsg = tip <= 0 ? ''
      : tipRecorded ? ` · pourboire ${fmtMoney(tip, currency)} pour ${appt.master}`
      : ` · pourboire ${fmtMoney(tip, currency)} NON attribué (maître « ${appt.master || '—'} » introuvable dans le personnel)`;
    const depMsg = depositJustConfirmed ? `Acompte de ${fmtMoney(deposit, currency)} confirmé reçu. ` : '';
    const reschedMsg = rescheduled
      ? `Prochain RDV reprogrammé le ${new Date(`${nextDate}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${nextTime}.`
      : '';
    const msg = [(depMsg + (payMsg + tipMsg).replace(/^ · /, '')).trim(), reschedMsg].filter(Boolean).join(' · ') || 'Enregistré.';
    /* Succès → toast (zéro clic, la caissière enchaîne). Un pourboire NON
       attribuable, lui, doit être VU : il reste en alerte bloquante. */
    if (tip > 0 && !tipRecorded) window.setTimeout(() => window.alert(msg), 30);
    else toast(msg);
  };

  return (
    <Modal title="Encaisser le rituel" onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="mnd-muted" style={{ fontSize: 13 }}>
          {client?.name ?? 'Cliente'} · {apptLabel(appt, byId)}
        </div>
        {isFamilyPayer && (
          <div style={{ fontSize: 11.5, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-pill)', padding: '4px 11px', alignSelf: 'flex-start' }}>
            Compte famille — facturé à {payerClient?.name ?? 'au parent payeur'}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="mnd-muted">Total{appt.discountPct ? ` (remise −${appt.discountPct}%)` : ''}</span>
          <span style={{ fontFamily: 'var(--font-serif)' }}>{fmtMoney(net, currency)}</span>
        </div>
        {deposit > 0 && depositReceived && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="mnd-muted">Acompte reçu{appt.depositConfirmed ? ' · vérifié' : ''}</span><span>−{fmtMoney(deposit, currency)}</span>
          </div>
        )}
        {deposit > 0 && !depositReceived && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Acompte de <b>{fmtMoney(deposit, currency)}</b> demandé · <b>non vérifié</b> — il n’est PAS déduit
            tant que sa réception n’est pas confirmée ci-dessous.
          </div>
        )}
        {deposit > 0 && !appt.depositConfirmed && (
          <label style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', lineHeight: 1.45 }}>
            <input type="checkbox" checked={depositReceived} onChange={toggleDepositReceived} style={{ marginTop: 2 }} />
            <span>Acompte reçu et vérifié (MoMo contrôlé) — le déduire du reste à encaisser</span>
          </label>
        )}
        {alreadyPaid > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="mnd-muted">Déjà encaissé</span><span>−{fmtMoney(alreadyPaid, currency)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-serif)', fontSize: 18 }}>
          <span>Reste à encaisser</span><span className="mnd-copper">{fmtMoney(due, currency)}</span>
        </div>
        {alreadyPaid > 0 && (
          <button
            type="button"
            className="tre-link-btn tre-link-btn--danger"
            style={{ alignSelf: 'flex-start', marginTop: -4 }}
            onClick={() => {
              if (!window.confirm(
                `Annuler l'encaissement de ${fmtMoney(alreadyPaid, currency)} ?\n\n` +
                `Le rituel redevient impayé (honoré → confirmé), sa facture liée repasse ` +
                `« envoyée » (impayée), et les points Cercle attribués sont repris quand ` +
                `on retrouve leur attribution. Cette action se voit dans l'historique.`,
              )) return;
              const r = cancelAppointmentPayment(appt);
              toast(
                `Encaissement annulé · ${fmtMoney(alreadyPaid, currency)}${r.invoiceUpdated ? ' · facture repassée en impayée' : ''}` +
                `${r.pointsReversed > 0 ? ` · ${r.pointsReversed} points repris` : ''}`,
              );
              onClose();
            }}
          >
            Annuler l’encaissement ({fmtMoney(alreadyPaid, currency)})
          </button>
        )}
        {(appt.payments ?? []).length > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--color-sable)', borderRadius: 4 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 6 }}>
              Versements déjà reçus
            </div>
            {(appt.payments ?? []).map((v) => (
              <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 12.5, marginBottom: 3 }}>
                <span>{v.date}{v.method ? ` · ${v.method}` : ''}{v.cashbox ? ` · ${v.cashbox}` : ''}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(v.amountXof, currency)}</span>
              </div>
            ))}
          </div>
        )}
        <Field label="Date de la facture (jour du rituel)">
          <Input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
        </Field>
        {avoirBal > 0 && (
          <Field label={`Régler par l'avoir · disponible ${fmtMoney(avoirBal, currency)}`}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Input type="number" min={0} max={Math.min(avoirBal, due)} value={avoirStr} onChange={(e) => setAvoirStr(e.target.value)} style={{ textAlign: 'right', flex: 1, minWidth: 0 }} />
              <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" style={{ flex: 'none' }} onClick={() => { const v = Math.min(avoirBal, due); setAvoirStr(String(v)); setAmountStr(String(Math.max(0, due - v))); }}>Max</button>
            </div>
            <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5 }}>
              Crédit prépayé du compte{account.type === 'family' ? ' famille' : ''} — déduit sans passer par la caisse.
            </div>
          </Field>
        )}
        <Field label="Date du paiement (jour où l’argent entre)">
          <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 5, lineHeight: 1.5 }}>
            Distincte de la date de la facture : celle-ci porte le jour du rituel, celle-là le jour où
            la somme est réellement remise. C’est elle qui range l’encaissement dans le bon mois.
          </div>
        </Field>
        <Field label="Montant encaissé maintenant (comptant)">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Input type="number" min={0} max={cashMax} value={amountStr} onChange={(e) => setAmountStr(e.target.value)} style={{ textAlign: 'right', flex: 1, minWidth: 0 }} />
            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" style={{ flex: 'none' }} onClick={() => setAmountStr(String(cashMax))}>Tout</button>
          </div>
        </Field>
        <Field label="Moyen de paiement">
          <Select value={pay} onChange={(e) => setPay(e.target.value as PaymentMethod)}>
            {methods.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        {eligibleBoxes.length > 0 && (
          <Field label="Caisse">
            <Select value={activeBox} onChange={(e) => setCashbox(e.target.value)}>
              {eligibleBoxes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={`Pourboire (F CFA) — pour ${appt.master || 'le maître'}`}>
          <Input type="number" min={0} value={tipStr} onChange={(e) => setTipStr(e.target.value)} style={{ textAlign: 'right' }} />
        </Field>
        {tip > 0 && !tipMaster && (
          <div style={{ fontSize: 12, color: 'var(--trf-error, #8f3b30)', marginTop: -6 }}>
            « {appt.master || '—'} » n'est pas dans le personnel — le pourboire ne pourra pas être attribué.
          </div>
        )}

        {/* Devise étrangère — le rituel reste chiffré en {currency} ; on ne note
            ici que ce que la cliente tend au comptoir, et à quel taux. */}
        {settings.fxEnabled && (
          <div style={{ border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '11px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>
                Régler en devise étrangère
              </span>
              <Toggle on={fxOn} onToggle={() => setFxOn((v) => !v)} />
            </div>
            {fxOn && (
              <>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Select
                    value={fxCode}
                    onChange={(e) => { setFxCode(e.target.value); setFxRate(String(rateToXof(e.target.value) || '')); }}
                    style={{ flex: '1 1 120px' }}
                    aria-label="Devise reçue"
                  >
                    {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                      <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={fxRate}
                    onChange={(e) => setFxRate(e.target.value)}
                    placeholder="Taux"
                    style={{ width: 104, textAlign: 'right' }}
                    aria-label={`Taux : 1 ${fxCode} en ${currency}`}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--copper-700)', marginTop: 8, lineHeight: 1.5 }}>
                  1 {fxCode} = {fxRateNum > 0 ? `${fxRateNum} ${currency}` : '…'} · taux du jour, à corriger si besoin
                  {tip > 0 && ' · pourboire inclus'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--copper-300)' }}>
                  <span style={{ fontSize: 12, color: 'var(--copper-700)' }}>À encaisser</span>
                  <span className="mnd-serif" style={{ fontSize: 20, color: 'var(--color-indigo)' }}>
                    {fxAmount > 0 ? `${fxAmount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${fxCode}` : '—'}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Reprogrammation automatique du prochain rendez-vous. */}
        <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '11px 13px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-indigo)' }}>
              Reprogrammer le prochain rendez-vous
            </span>
            <Toggle on={reschedule} onToggle={() => setReschedule((v) => !v)} />
          </div>
          {reschedule && (
            <>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {[{ l: '4 sem.', d: 28 }, { l: '6 sem.', d: 42 }, { l: '8 sem.', d: 56 }].map(({ l, d }) => (
                  <button key={d} type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" style={{ flex: 'none' }} onClick={() => setNextIn(d)}>{l}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Input type="date" value={nextDate} min={todayISO()} onChange={(e) => setNextDate(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                <Input type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} style={{ width: 108, flex: 'none' }} />
              </div>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.5 }}>
                Un RDV « confirmé » identique sera créé pour {client?.name ?? 'la cliente'} — mêmes prestations, même prix (remise comprise), même maître — à honorer et encaisser le jour venu.
              </div>
            </>
          )}
        </div>

        <Button
          variant="copper"
          onClick={confirm}
          disabled={(settleTotal <= 0 && (tip <= 0 || !tipMaster) && !depositJustConfirmed && !reschedule) || (fxOn && fxAmount <= 0) || fxBlocked}
          style={{ marginTop: 4 }}
        >
          {fxOn && fxAmount > 0
            ? `Encaisser ${fxAmount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${fxCode}`
            : settleTotal <= 0 && tip > 0
              ? `Enregistrer le pourboire ${fmtMoney(tip, currency)}`
              : settleTotal <= 0 && depositJustConfirmed
                ? 'Confirmer l’acompte reçu'
                : settleTotal <= 0 && reschedule
                  ? 'Reprogrammer le rendez-vous'
                  : fullyPaid ? `Encaisser ${fmtMoney(settleTotal, currency)}` : `Encaisser ${fmtMoney(settleTotal, currency)} (partiel)`}
        </Button>
      </div>
    </Modal>
  );
}
