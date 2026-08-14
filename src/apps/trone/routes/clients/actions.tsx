import { useRef, useState } from 'react';
import { Button, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, rateToXof } from '../../../../shared/currency';
import { CURRENCIES } from '../../../../shared/geo';
import { useSettings } from '../../../../shared/settings';
import { useClients, clientsStore, useFamilies } from '../../../../shared/clients';
import { appointmentsStore, apptPayeurId, venuesHonorees, type Appointment, type ApptPayment } from '../../../../shared/agenda';
import { useCategories, type Service } from '../../../../shared/catalog';
import {
  invoicesStore, useCashboxes, invoiceTotal, usePaymentMethods, cashboxCurrency, nouvelleFacture, ligneFacture,
  useCredits, creditMovementsStore, creditBalanceOf,
  type Invoice, type InvoiceLine, type PaymentMethod, type CreditHolder,
} from '../../../../shared/finance';
import { holderOf, payerClientIdOf } from '../../../../shared/accounts';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, splitByWeights } from '../../../../shared/pricing';
import { pointsRateStore, pointsHistoryStore, pointsEnabledStore, estDuCercle } from '../../../../shared/offers';
import { uid } from '../../../../shared/store';
import { sameName } from '../../../../shared/text';
import { addTipPartage, repartirPourboire, PART_POURBOIRE_DEFAUT } from '../../../../shared/tips';
import { consommerPourRituel, rembobinerRituel, retirerParReferences } from '../../../../shared/stock';
import { detacherFacture } from '../../../../shared/laboratoire';
import { useStaff } from '../equipe/data';
import { Toggle } from '../equipe/ui';
import '../equipe/equipe.css'; // styles du Toggle partagé (tre-toggle)
import {
  apptLabel, apptServices, apptNetXof, apptTotalXof, forfaitTauxPct, frShort, todayISO, useServicesById,
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

/** Passe un RDV à « honoré » et attribue les points Cercle une seule fois.

    LE CERCLE SE GAGNE AU 3ᵉ PASSAGE. Un passage ne l'ouvre pas : ce qui se donne
    à tout le monde ne récompense personne. On compte donc ses venues AVANT
    d'écrire — celle-ci comprise, puisqu'elle a lieu — et on n'attribue rien tant
    que le seuil n'est pas atteint. Les deux premières venues ne sont pas
    créditées après coup : elle entre au 3ᵉ passage, elle gagne à partir de là. */
export function honorAppointment(appt: Appointment, byId: Map<string, Service>): number {
  const total = apptNetXof(appt, byId);
  /* LES POINTS SUIVENT L'ARGENT. Un rituel offert reconnaît celle qui l'a payé,
     pas celle qui s'est assise : c'est elle qui a sorti les 110 000 F. Le rituel
     reste au parcours de la soignée — seule la reconnaissance change de main. */
  const beneficiaire = apptPayeurId(appt);
  /* Le rendez-vous n'est pas encore « honoré » dans le magasin : on compte les
     venues déjà acquises et on ajoute celle-ci, sauf si un autre rituel du même
     jour l'a déjà comptée (deux gestes le même jour = une seule venue). */
  const acquises = appointmentsStore.get();
  const dejaCeJour = acquises.some((a) =>
    a.id !== appt.id && a.status === 'honoré' && a.date === appt.date && apptPayeurId(a) === beneficiaire);
  const venues = venuesHonorees(acquises, beneficiaire, true) + (dejaCeJour ? 0 : 1);

  const awarded = appt.pointsAwarded || !estDuCercle(venues)
    ? 0
    : awardLoyalty(beneficiaire, total, `Rituel honoré · ${frShort(appt.date)}`);
  appointmentsStore.set((prev) =>
    prev.map((a) => (a.id === appt.id ? { ...a, status: 'honoré', pointsAwarded: true } : a)),
  );
  /* LE STOCK SUIT LE GESTE. La recette des services consommés s'écrit au journal
     des mouvements (référence rdv:<id>) — une seule fois : ré-honorer un rituel
     déjà consommé ne reconsomme rien. Un service sans recette ne décrémente
     rien, sans erreur. Voir shared/stock.ts. */
  consommerPourRituel({ id: appt.id, branchId: appt.branchId, serviceIds: appt.serviceIds }, todayISO());
  return awarded;
}

/* ---------- Annulation d'encaissement ----------
   Deux registres vivent côte à côte : la FACTURE (pièce comptable) et le RDV
   (paidXof, statut, points). Supprimer une facture ne rembobinait pas le RDV —
   il restait « payé » à jamais. Ces fonctions font l'annulation COMPLÈTE. */

/** Reprend les points Cercle attribués à l'honneur du RDV, si on retrouve
    l'attribution exacte dans l'historique. Renvoie les points repris (0 sinon). */
function reverseHonorPoints(appt: Appointment): number {
  /* On reprend LÀ OÙ ON A DONNÉ — chez la payeuse quand le rituel était offert.
     Viser la soignée retirerait des points à quelqu'un qui n'en a jamais reçu. */
  const beneficiaire = apptPayeurId(appt);
  if (!appt.pointsAwarded || !beneficiaire) return 0;
  const label = `Rituel honoré · ${frShort(appt.date)}`;
  const entry = pointsHistoryStore.get().find((e) => e.clientId === beneficiaire && e.label === label && e.pts > 0);
  if (!entry) return 0;
  clientsStore.set((prev) =>
    prev.map((c) => (c.id === beneficiaire ? { ...c, loyaltyPoints: Math.max(0, (c.loyaltyPoints ?? 0) - entry.pts) } : c)),
  );
  pointsHistoryStore.set((prev) => [
    { id: `pt-${uid()}`, clientId: beneficiaire, clientName: entry.clientName, label: `Encaissement annulé · ${frShort(appt.date)}`, pts: -entry.pts, at: new Date().toISOString() },
    ...prev,
  ]);
  return entry.pts;
}

/** Annule l'encaissement d'un rituel : le RDV redevient impayé et les pièces
    émises pour ce règlement sont supprimées. IL NE TOUCHE NI À L'HONNEUR NI AUX
    POINTS — voir la note dans le corps de la fonction. */
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

export function cancelAppointmentPayment(appt: Appointment): { invoicesRemoved: number } {
  /* TOUTES LES PIÈCES QUE CET ENCAISSEMENT A PRODUITES, pas seulement la
     dernière. Le rendez-vous ne retient qu'un `invoiceId` ; un rituel réglé en
     plusieurs fois porte autant de factures que de versements, et chacune se
     nomme dans le journal. Or l'annulation efface le journal ENTIER (`payments`
     et `paidXof` repartent à zéro) : ne traiter que la dernière laissait les
     précédentes « payée » et détachées — elles continuaient de compter au
     chiffre d'affaires pendant que le rituel, lui, redevenait impayé. */
  const ids = new Set<string>();
  if (appt.invoiceId) ids.add(appt.invoiceId);
  for (const p of appt.payments ?? []) if (p.invoiceId) ids.add(p.invoiceId);

  /* ON SUPPRIME LA PIÈCE, ON NE L'ABANDONNE PAS. Elle repassait « envoyée » et
     restait dans la base, détachée de son rituel : une créance fantôme qui
     gonflait les impayés, alertait sans fin dans le tiroir, et s'offrait au
     « Solder par l'avoir » que les pièces liées, elles, refusent. Le 8 août, un
     même rituel repris cinq fois au comptoir en avait laissé quatre derrière
     lui, pour 212 000 F d'impayés qui n'existaient pas. Une facture atteste un
     paiement : le paiement annulé, elle n'a plus d'objet.
     L'avoir consommé est rendu d'abord — sinon le compte de la cliente reste
     débité d'un crédit détruit avec la pièce. */
  for (const id of ids) restituerAvoir(id);
  const aSupprimer = invoicesStore.get().filter((i) => ids.has(i.id));
  const invoicesRemoved = aSupprimer.length;
  if (invoicesRemoved > 0) {
    invoicesStore.set((prev) => prev.filter((i) => !ids.has(i.id)));
    /* LA PIÈCE EMPORTE SES VENTES DE PRODUITS : les sorties de stock
       référencées sur son numéro se rembobinent — ré-encaisser réécrira les
       siennes, sinon chaque cycle de correction décomptait une fois de plus.
       Et si une préparation du Laboratoire pointait cette pièce, elle est
       libérée plutôt que murée sur une facture disparue. */
    retirerParReferences(aSupprimer.map((i) => i.number));
    detacherFacture(aSupprimer.map((i) => i.id));
  }
  /* ANNULER UN ENCAISSEMENT N'EFFACE QUE DE L'ARGENT. Ce geste faisait aussi
     retomber le rituel de « honoré » à « confirmé » et reprenait les points de
     l'honneur — il défaisait un geste qu'il n'avait jamais posé. Encaisser
     n'honore pas (c'est écrit plus bas : on encaisse d'avance un rituel qui n'a
     pas encore eu lieu) ; annuler ne doit donc pas dés-honorer. Un rituel a eu
     lieu ou non — que la cliente ait payé ne change rien à ce fait.
     Le prix de cette confusion : le rituel dé-honoré ne comptait PLUS NULLE PART
     (`apptRev` ne retient que les honorés sans facture, `invRev` que les pièces
     payées — et la pièce venait d'être supprimée). Le chiffre d'affaires perdait
     le montant en silence. Il revient désormais au Carnet, et le rituel rejoint
     les impayés, ce qu'il est. Dés-honorer reste possible au Carnet, à la main,
     quand c'est bien l'honneur qui était faux. */
  appointmentsStore.set((prev) => prev.map((a) => (a.id === appt.id
    ? {
        ...a,
        paidXof: undefined,
        /* LE JOURNAL SUIT L'ANNULATION. Il survivait a l'encaissement annule :
           le reste du revenait au total, mais la trace du versement restait
           affichee — un argent rendu qui continuait de figurer comme recu. */
        payments: undefined,
        invoiceId: undefined,
      }
    : a)));
  return { invoicesRemoved };
}

/** À la SUPPRESSION d'une facture : rembobine le rituel qu'elle réglait — le
    montant seul. L'honneur et les points ne bougent pas (même raison que dans
    `cancelAppointmentPayment`). Renvoie le RDV touché, ou null si la facture ne
    réglait aucun rituel. */
export function rewindPaymentForDeletedInvoice(invoiceId: string, amountXof: number): Appointment | null {
  restituerAvoir(invoiceId);
  const tous = appointmentsStore.get();
  /* LE RITUEL QUE CETTE PIÈCE RÉGLAIT. Par le lien du rendez-vous — qui ne
     retient que sa DERNIÈRE facture — ou, à défaut, par le versement qui nomme
     la pièce : un rituel réglé en deux fois porte deux factures, et supprimer la
     première ne rembobinait rien du tout. */
  const appt = tous.find((a) => a.invoiceId === invoiceId)
    ?? tous.find((a) => (a.payments ?? []).some((p) => p.invoiceId === invoiceId));
  if (!appt) return null;
  const newPaid = Math.max(0, (appt.paidXof ?? 0) - Math.max(0, amountXof));
  /* LA PIÈCE EMPORTE SES PROPRES VERSEMENTS dès qu'ils la nomment. Sans ce lien
     (journaux d'avant), on rembobine du même montant, du versement le plus
     récent au plus ancien — ce qui reprenait l'argent de la mauvaise date. */
  const journalInitial = appt.payments ?? [];
  const siens = journalInitial.some((p) => p.invoiceId === invoiceId);
  let journal: ApptPayment[];
  if (siens) {
    journal = journalInitial.filter((p) => p.invoiceId !== invoiceId);
  } else {
    journal = [...journalInitial];
    let aReprendre = Math.max(0, amountXof);
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
  }
  /* SUPPRIMER UNE PIÈCE N'EFFACE QUE DE L'ARGENT — comme l'annulation, et pour
     la même raison : un rituel a eu lieu ou non, le sort de sa facture n'y
     change rien. Le dés-honorer le faisait sortir de TOUS les chiffres à la
     fois, faute d'être encore compté ni par le Carnet ni par une pièce. */
  appointmentsStore.set((prev) => prev.map((a) => (a.id === appt.id
    ? {
        ...a,
        paidXof: newPaid > 0 ? newPaid : undefined,
        payments: journal.length ? journal : undefined,
        /* On ne coupe le lien que si c'est BIEN cette pièce-là. Supprimer le
           premier règlement d'un rituel qui en compte deux ne doit pas détacher
           la facture qui, elle, existe toujours. */
        invoiceId: a.invoiceId === invoiceId ? undefined : a.invoiceId,
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
  for (const a of linked) {
    reverseHonorPoints(a); // reprise best-effort avant de couper le lien
    /* Le stock rembobine avec l'encaissement : les sorties de la recette
       disparaissent du journal, la réserve remonte. Sans cela, annuler puis
       ré-encaisser consommerait la recette deux fois. */
    rembobinerRituel(a.id);
  }
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

  /* Suppression des factures payées (les numéros repartiront de zéro) — et
     avec elles, d'un seul geste, toutes les sorties de stock qu'elles
     référencent, plus les préparations qu'elles tenaient. */
  invoicesStore.set((prev) => prev.filter((i) => !paidIds.has(i.id)));
  retirerParReferences(paid.map((i) => i.number));
  detacherFacture(paid.map((i) => i.id));

  return { invoices: paid.length, appts: linked.length, avoirsRestored: usages.length };
}

/* ---------- Encaisser un RDV — Tableau de bord / Calendrier / Carnet ---------- */

/* LES PALIERS DE L'ENCAISSEMENT (14 août, maquette validée par Yéman) :
   ce qu'elle doit · comment elle règle · et ensuite. L'argent se compte à voix
   haute, dans cet ordre. */
function PalierEnc({ n, titre, aide }: { n: number; titre: string; aide?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
      <span style={{
        flex: 'none', width: 21, height: 21, borderRadius: '50%', border: '1px solid var(--color-copper)',
        color: 'var(--copper-700)', fontFamily: 'var(--font-serif)', fontSize: 11.5,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{titre}</span>
      {aide && <span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{aide}</span>}
    </div>
  );
}

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
  /* QUI EST FACTURÉ. Un rituel OFFERT se facture à celle qui l'offre — sans
     quoi la pièce nommerait l'une et la fiche remercierait l'autre. Le geste
     ponctuel prime sur le compte famille : il est plus précis, et il a été posé
     sur ce rendez-vous-là. */
  const payerId = appt.offertPar || (client ? payerClientIdOf(client, families) : appt.clientId);
  const payerClient = clients.find((c) => c.id === payerId);
  const isFamilyPayer = payerId !== appt.clientId; // payeur distinct : famille OU rituel offert

  const services = apptServices(appt, byId);
  /* Contexte tarifaire de la cliente — la facture ventile chaque prestation selon
     SON prix personnalisé (le même qu'au rendez-vous), jamais le prix catalogue. */
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [categories] = useCategories();
  const pricing = pricingOf(client, bands, sets, categories);
  /* LE FORFAIT DE CAISSE — l'ensemble des gestes à un total négocié, posé ici ou
     déjà promis à la réservation. Il ne touche pas aux prestations : chacune
     reçoit sa part du total au prorata, et les mains, les primes, les
     commissions et le Bilan continuent de compter juste (voir `apptNetXof`). */
  const grossActuel = apptTotalXof(appt, byId);
  const [forfaitOn, setForfaitOn] = useState(!!appt.forfait);
  /* Le nom du forfait se LIT (il vient du rendez-vous) ; il ne s'écrit plus
     ici depuis que le forfait ne se pose qu'au rituel — 14 août. */
  const [forfaitNom] = useState(appt.forfait?.nom ?? '');
  const [forfaitStr, setForfaitStr] = useState(appt.forfait ? String(appt.forfait.totalXof) : '');
  const forfaitNum = Math.max(0, Math.round(Number(String(forfaitStr).replace(/[^0-9]/g, '')) || 0));
  const forfaitPose = forfaitOn && String(forfaitStr).trim() !== '';
  const nomForfait = forfaitPose ? forfaitNom.trim() || 'Forfait' : '';
  /* LE NET DE CET ÉCRAN. Le forfait qu'on est en train de poser prime sur celui
     qui est enregistré — sinon le montant proposé mentirait d'un geste. Sans
     forfait, on relit le rituel comme s'il n'en avait jamais porté. */
  const net = forfaitPose ? forfaitNum : apptNetXof({ ...appt, forfait: undefined }, byId);
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
  /* Les deux dates sont JUSTES par défaut (facture = jour du rituel, paiement =
     aujourd'hui) : elles se replient en une ligne, « Modifier » les rouvre. */
  const [datesOuvertes, setDatesOuvertes] = useState(false);
  /* Avoir appliqué à ce règlement — plafonné au solde ET au reste dû. Le comptant
     ne couvre alors que ce qui reste après l'avoir. */
  const [avoirStr, setAvoirStr] = useState('0');
  const avoirApplied = Math.max(0, Math.min(Math.min(avoirBal, due), Math.round(Number(avoirStr) || 0)));
  const cashMax = Math.max(0, due - avoirApplied);
  const [amountStr, setAmountStr] = useState(String(due));
  const amount = Math.max(0, Math.min(cashMax, Math.round(Number(amountStr) || 0)));
  const settleTotal = amount + avoirApplied; // ce qui solde le rituel ce coup-ci (comptant + avoir)

  /* Toucher au forfait recale le montant proposé, comme le fait l'acompte : un
     champ qui garderait l'ancien dû ferait encaisser le mauvais montant au
     premier geste distrait. Un seul chemin, quel que soit le champ touché. */
  const majForfait = (pose: boolean, str: string) => {
    setForfaitOn(pose);
    setForfaitStr(str);
    const n = Math.max(0, Math.round(Number(String(str).replace(/[^0-9]/g, '')) || 0));
    const nouveauNet = pose && String(str).trim() !== '' ? n : apptNetXof({ ...appt, forfait: undefined }, byId);
    setAmountStr(String(Math.max(0, nouveauNet - alreadyPaid - (depositReceived ? deposit : 0))));
  };
  const majForfaitParPct = (v: string) => {
    const p = Math.max(0, Math.min(100, Number(String(v).replace(',', '.')) || 0));
    majForfait(true, String(Math.max(0, Math.round(grossActuel * (1 - p / 100)))));
  };

  /* Cocher/décocher l'acompte recale le montant proposé sur le nouveau dû. */
  const toggleDepositReceived = () =>
    setDepositReceived((v) => {
      const next = !v;
      setAmountStr(String(Math.max(0, net - alreadyPaid - (next ? deposit : 0))));
      return next;
    });
  const [tipStr, setTipStr] = useState('0');
  const tip = Math.max(0, Math.round(Number(tipStr) || 0));
  /* LE POURBOIRE SE PARTAGE ENTRE TOUS. Il allait auparavant au seul maître
     officiant, retrouvé par son nom — une majuscule de différence suffisait
     alors à le faire disparaître. Ce n'est pas la règle de la Maison : le
     pourboire revient à l'équipe entière, qu'on ait touché la tête ou non,
     chacun selon sa part. Plus aucun nom à faire correspondre, donc plus
     aucun pourboire perdu. */
  const beneficiaires = team
    .filter((s) => s.branchId === branch.id)
    .map((s) => ({ id: s.id, part: s.partPourboire ?? PART_POURBOIRE_DEFAUT }));
  const partage = repartirPourboire(tip, beneficiaires);
  const nomDe = (id: string) => team.find((s) => s.id === id)?.name ?? '—';
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
        lines = services.map((sv, idx) => ligneFacture(sv.name, svcWeights[idx]));
      } else if (detailed) {
        const shares = splitByWeights(settleTotal, svcWeights);
        lines = services.map((sv, idx) => ligneFacture(sv.name, shares[idx]));
      } else {
        /* Le forfait donne son nom à la pièce : c'est ce que la cliente a
           négocié, et c'est sous ce nom qu'elle le relira. */
        lines = [ligneFacture(
          fullyPaid && alreadyPaid === 0
            ? nomForfait || apptLabel(appt, byId)
            : `Règlement · ${nomForfait || apptLabel(appt, byId)}`,
          factureTotal,
        )];
      }
      /* Compte famille : la facture est au nom du PARENT PAYEUR, la cliente soignée
         en mention (forClientId). */
      const avoirNote = avoirApplied > 0 ? `Réglé par avoir : ${fmtMoney(avoirApplied, currency)}${amount > 0 ? ` · comptant ${fmtMoney(amount, currency)}` : ''}` : '';
      const partialNote = fullyPaid ? '' : `Paiement partiel — reste ${fmtMoney(remainingAfter, currency)}`;
      /* Le forfait se dit sur la pièce, avec le prix plein en regard : une
         remise consentie et tue n'est pas un cadeau, c'est un prix qu'on
         n'explique pas. */
      const forfaitNote = forfaitPose
        ? `${nomForfait} · ${fmtMoney(forfaitNum, currency)} au lieu de ${fmtMoney(grossActuel, currency)}`
        : '';
      const inv: Invoice = nouvelleFacture({
        branchId: branch.id,
        /* Série F : l'encaissement de rituel. Le constructeur la force « payée » —
           c'est ce qui garde vraie la lecture des résidus (F + envoyée = annulé). */
        serie: 'F',
        clientId: payerId,
        date: invDate,
        lines,
        /* Remise VISIBLE : l'écart entre les prix pleins et le net encaissé —
           NOMMÉE quand c'est l'avantage du compte famille. */
        globalDiscountXof: detailRemise > 0 ? detailRemise : undefined,
        discountLabel: detailRemise > 0 && appt.remiseFamille ? 'Remise famille' : undefined,
        theme: 'Rose',
        payment: amount > 0 ? pay : 'Avoir',
        cashbox: activeBox,
        clientName: payerClient?.name ?? client?.name,
        forClientId: isFamilyPayer ? appt.clientId : undefined,
        master: appt.master,
        note: [forfaitNote, avoirNote, partialNote].filter(Boolean).join(' · ') || undefined,
        /* Le pourboire rejoint la MÊME caisse que le paiement — traçable, mais
           toujours hors chiffre d'affaires (invoiceTotal l'exclut). Seulement s'il est
           partageable, pour que « à reverser aux maîtres » reste juste. */
        tipXof: partage.length > 0 ? tip : undefined,
        /* Part réglée par avoir (crédit du compte) — hors caisse physique. */
        avoirXof: avoirApplied > 0 ? avoirApplied : undefined,
        /* Part déjà REÇUE avant ce comptoir (acompte confirmé) : elle est entrée
           un autre jour, dans une autre caisse. La porter ici évite qu'elle soit
           créditée une seconde fois au solde. */
        depositCreditXof: depositCredit > 0 ? depositCredit : undefined,
        /* Ce qui a été REÇU au comptoir — règlement COMPTANT + pourboire (l'avoir
           n'est pas une devise étrangère). Le rituel reste chiffré en {currency}. */
        fx: fxOn && fxAmount > 0 ? { code: fxCode, rate: fxRateNum, amount: fxAmount } : undefined,
      });
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
            /* LE FORFAIT S'INSCRIT SUR LE RITUEL, pas seulement sur la pièce :
               c'est lui qui commande le net, donc les mains, les primes, les
               commissions et le Bilan. `baseXof` se réaffirme ici — c'est le
               prix plein contre lequel la Maison vient de consentir ce total.
               Un forfait posé efface les remises : on ne remise pas un prix
               déjà négocié. */
            forfait: forfaitPose
              ? {
                  nom: forfaitNom.trim() || undefined,
                  totalXof: forfaitNum,
                  baseXof: grossActuel,
                  poseAt: a.forfait && a.forfait.totalXof === forfaitNum ? a.forfait.poseAt : todayISO(),
                }
              : undefined,
            ...(forfaitPose ? { discountPct: undefined, discountXof: undefined } : {}),
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
                  /* La piece que ce versement vient d'emettre : c'est par ce lien
                     que le registre des encaissements la datera du jour ou
                     l'argent est entre, et non du jour du rituel. */
                  invoiceId: inv.id,
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
    } else if (partage.length > 0) {
      /* Pourboire seul sur un rituel déjà soldé : on crée une facture minimale à 0 F
         (invoiceTotal=0 → aucun chiffre d'affaires) portant le pourboire, pour qu'il
         reste tracé dans la caisse et reversable au maître. */
      const inv: Invoice = nouvelleFacture({
        branchId: branch.id,
        serie: 'F',
        clientId: appt.clientId,
        date: invDate,
        lines: [ligneFacture(`Pourboire · ${appt.master}`, 0)],
        theme: 'Rose',
        payment: pay,
        cashbox: activeBox,
        clientName: client?.name,
        master: appt.master,
        note: 'Pourboire',
        tipXof: tip,
      });
      invoicesStore.set((prev) => [inv, ...prev]);
    }

    /* Pourboire — PARTAGÉ entre toute l'équipe, une ligne par bénéficiaire.
       Jamais dans la facture ni dans le chiffre d'affaires. Possible même si le
       rituel est déjà soldé. */
    const partsEcrites = tip > 0 ? addTipPartage(beneficiaires, tip, invDate) : [];
    const tipRecorded = tip > 0 && partsEcrites.length > 0;

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
      : tipRecorded ? ` · pourboire ${fmtMoney(tip, currency)} partagé en ${partsEcrites.length} parts`
      : ` · pourboire ${fmtMoney(tip, currency)} NON attribué (aucun membre du personnel dans cette branche)`;
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
        {/* ═══ LE BANDEAU VIVANT (14 août, maquette validée) — il ne bouge
            jamais. Le nombre qu'on cherche en ouvrant, c'est le RESTE À
            ENCAISSER : il vivait au milieu de la coulée, après le total, le
            forfait, l'acompte et les versements. Il monte en tête, en grand. */}
        <div style={{
          position: 'sticky', top: -1, zIndex: 3, margin: '-4px -2px 0',
          background: 'var(--color-indigo)', borderRadius: 3, padding: '13px 16px',
        }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-ivoire)' }}>
            Encaisser · {client?.name ?? 'Cliente'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-invert-soft, #C9C3DB)', marginTop: 4 }}>
            {apptLabel(appt, byId)} · {frShort(appt.date)}{appt.master ? ` · avec ${appt.master}` : ''}
          </div>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14,
            marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--hairline-invert)',
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-invert-soft, #C9C3DB)' }}>
              Reste à encaisser
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 30, color: 'var(--copper-200)', lineHeight: 1, whiteSpace: 'nowrap' }}>
              {fmtMoney(due, currency)}
            </span>
          </div>
        </div>

        {isFamilyPayer && (
          <div style={{ fontSize: 11.5, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-pill)', padding: '4px 11px', alignSelf: 'flex-start' }}>
            Compte famille — facturé à {payerClient?.name ?? 'au parent payeur'}
          </div>
        )}

        {/* ① CE QU'ELLE DOIT — le compte du rituel, avant tout règlement. */}
        <PalierEnc n={1} titre="Ce qu’elle doit" />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="mnd-muted">
            {forfaitPose ? `Total · ${nomForfait}` : `Total${appt.discountPct ? ` (remise −${appt.discountPct}%)` : ''}`}
          </span>
          <span style={{ fontFamily: 'var(--font-serif)' }}>{fmtMoney(net, currency)}</span>
        </div>

        {/* LE FORFAIT — un total négocié pour l'ensemble des gestes. DISCRET :
            une ligne quand il n'est pas posé (retour d'écran du 10 août — le
            cadre permanent pesait sur chaque encaissement), le détail ne
            s'ouvre qu'au geste. Les prestations restent entières dessous :
            leur montant porte les mains, la production, les commissions. */}
        {/* LE FORFAIT NE SE POSE PLUS ICI (14 août, Yéman) : « un total négocié
            pour l'ensemble » se dit AU RENDEZ-VOUS, palier « Le prix », où le
            geste appartient. Le redemander à l'encaissement faisait écrire deux
            fois la même négociation — et laissait deux endroits se contredire.
            Un forfait DÉJÀ posé reste lisible : la ligne « Total · son nom »
            au-dessus le nomme, et la bande ci-dessous rattrape le seul cas qui
            demande encore une main — la composition a bougé depuis la promesse. */}
        <div>
          {/* LA COMPOSITION A BOUGÉ DEPUIS LA PROMESSE. Le total tient — la
              Maison a dit un prix — mais le comptoir doit le savoir, et pouvoir
              reporter le même taux d'un geste plutôt qu'à la calculette. */}
          {appt.forfait && Math.round(appt.forfait.baseXof) !== Math.round(grossActuel) && (
            <div style={{ fontSize: 11.5, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5, marginTop: 10 }}>
              Les prestations ont changé depuis ce forfait : il portait sur{' '}
              <b>{fmtMoney(appt.forfait.baseXof, currency)}</b>, le rituel en vaut{' '}
              <b>{fmtMoney(grossActuel, currency)}</b> aujourd’hui. Le total promis tient.
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => majForfaitParPct(String(forfaitTauxPct(appt.forfait!)))}
                  style={{ cursor: 'pointer', background: 'var(--color-copper)', color: 'var(--color-ivoire)', border: 'none', borderRadius: 3, padding: '6px 12px', fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 600 }}
                >
                  Reporter le même taux (−{Math.round(forfaitTauxPct(appt.forfait) * 10) / 10} %) ·{' '}
                  {fmtMoney(Math.round(grossActuel * (1 - forfaitTauxPct(appt.forfait) / 100)), currency)}
                </button>
              </div>
            </div>
          )}
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
        {/* Le total DÛ ferme le palier ① — le « reste à encaisser » a pris la
            tête de l'écran, dans le bandeau. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-serif)', fontSize: 18, borderTop: '1px solid var(--hairline)', paddingTop: 9 }}>
          <span>Total dû</span><span className="mnd-copper">{fmtMoney(due, currency)}</span>
        </div>
        {alreadyPaid > 0 && (
          <button
            type="button"
            className="tre-link-btn tre-link-btn--danger"
            style={{ alignSelf: 'flex-start', marginTop: -4 }}
            onClick={() => {
              if (!window.confirm(
                `Annuler l'encaissement de ${fmtMoney(alreadyPaid, currency)} ?\n\n` +
                `Le rituel redevient impayé et la ou les factures émises pour ce règlement ` +
                `sont SUPPRIMÉES : une pièce atteste un paiement, le paiement annulé elle ` +
                `n'a plus d'objet. L'avoir consommé est rendu au compte.\n\n` +
                `Le rituel reste HONORÉ et garde ses points : ce geste n'efface que de ` +
                `l'argent. S'il n'a pas eu lieu, dés-honorez-le au Carnet.\n\n` +
                `La suppression des pièces est irréversible.`,
              )) return;
              const r = cancelAppointmentPayment(appt);
              const pieces = r.invoicesRemoved > 1 ? `${r.invoicesRemoved} factures supprimées` : 'facture supprimée';
              toast(`Encaissement annulé · ${fmtMoney(alreadyPaid, currency)}${r.invoicesRemoved > 0 ? ` · ${pieces}` : ''}`);
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
        {/* LES DEUX DATES, REPLIÉES EN UNE LIGNE : justes par défaut (facture =
            jour du rituel, paiement = aujourd'hui), elles n'occupent l'écran
            que si on les change. La règle reste vraie : c'est la date du
            PAIEMENT qui range l'encaissement dans le bon mois. */}
        {/* ② COMMENT ELLE RÈGLE — deux tiroirs, un seul total. L'avoir et le
            comptant sont deux façons de payer la même somme : ils vivaient en
            deux champs qui ne s'additionnaient jamais devant la main, et rien
            ne disait si le compte tombait juste. Le moyen de paiement et la
            caisse ne concernent QUE l'argent qui entre vraiment : ils se
            rangent dans le tiroir du comptant. */}
        <PalierEnc n={2} titre="Comment elle règle" aide={avoirBal > 0 ? 'deux tiroirs, un seul total' : undefined} />

        {avoirBal > 0 && (
          <div className="mnd-bande" style={{ padding: '12px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-indigo)' }}>Sur son avoir</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>disponible {fmtMoney(avoirBal, currency)}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 9 }}>
              <Input type="number" min={0} max={Math.min(avoirBal, due)} value={avoirStr} onChange={(e) => setAvoirStr(e.target.value)} style={{ textAlign: 'right', flex: 1, minWidth: 0 }} aria-label="Montant réglé par l'avoir" />
              <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" style={{ flex: 'none' }} onClick={() => { const v = Math.min(avoirBal, due); setAvoirStr(String(v)); setAmountStr(String(Math.max(0, due - v))); }}>Tout</button>
            </div>
            <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
              Crédit prépayé du compte{account.type === 'family' ? ' famille' : ''} — déduit sans passer par la caisse.
            </div>
          </div>
        )}

        <div className="mnd-bande" style={{ padding: '12px 13px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-indigo)' }}>Comptant, maintenant</span>
            <span className="mnd-muted" style={{ fontSize: 12 }}>ce qui entre en caisse</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 9 }}>
            <Input type="number" min={0} max={cashMax} value={amountStr} onChange={(e) => setAmountStr(e.target.value)} style={{ textAlign: 'right', flex: 1, minWidth: 0 }} aria-label="Montant encaissé comptant" />
            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" style={{ flex: 'none' }} onClick={() => setAmountStr(String(cashMax))}>Le reste</button>
          </div>
          {amount > 0 && (
            <div className="tr-grid tr-grid--2" style={{ gap: 10, marginTop: 10 }}>
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
            </div>
          )}
        </div>

        {/* LA LIGNE QUI ADDITIONNE — elle dit tout haut si le compte tombe
            juste, ou ce qu'il manque. C'est elle qui manquait. */}
        {due > 0 && settleTotal > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            borderRadius: 3, padding: '10px 13px', fontSize: 13,
            background: remainingAfter === 0 ? 'var(--color-sable)' : 'var(--copper-50)',
            border: `1px solid ${remainingAfter === 0 ? 'var(--hairline)' : 'var(--copper-300)'}`,
          }}>
            <span className="mnd-muted">
              {avoirApplied > 0 ? `${fmtMoney(avoirApplied, currency)} sur l’avoir` : ''}
              {avoirApplied > 0 && amount > 0 ? ' + ' : ''}
              {amount > 0 ? `${fmtMoney(amount, currency)} comptant` : ''}
            </span>
            <b style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 400, color: remainingAfter === 0 ? 'var(--color-indigo)' : 'var(--copper-700)' }}>
              {remainingAfter === 0 ? 'tout est réglé' : `il resterait ${fmtMoney(remainingAfter, currency)} dû`}
            </b>
          </div>
        )}

        {/* LES DEUX DATES, REPLIÉES EN UNE LIGNE : justes par défaut (facture =
            jour du rituel, paiement = aujourd'hui), elles n'occupent l'écran
            que si on les change. La règle reste vraie : c'est la date du
            PAIEMENT qui range l'encaissement dans le bon mois. */}
        {!datesOuvertes ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 12 }}>
            <span className="mnd-muted">
              Facture au {frShort(invDate)} (jour du rituel) · argent entré le {frShort(payDate)}
            </span>
            <button type="button" className="tre-link-btn" onClick={() => setDatesOuvertes(true)}>Modifier</button>
          </div>
        ) : (
          <div className="tr-grid tr-grid--2" style={{ gap: 10 }}>
            <Field label="Facture (jour du rituel)">
              <Input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
            </Field>
            <Field label="Paiement (l’argent entre)">
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5 }}>
                C’est elle qui range l’encaissement dans le bon mois.
              </div>
            </Field>
          </div>
        )}

        {/* ③ ET ENSUITE — ce qui suit le paiement et n'entre pas dans son calcul. */}
        <PalierEnc n={3} titre="Et ensuite" aide="facultatif" />
        <Field label="Pourboire (F CFA) — partagé entre l’équipe">
          <Input type="number" min={0} value={tipStr} onChange={(e) => setTipStr(e.target.value)} style={{ textAlign: 'right' }} />
        </Field>
        {/* LE PARTAGE SE MONTRE AVANT D'ÊTRE ÉCRIT. Une règle de répartition
            qu'on ne voit pas est une règle qu'on finit par croire fausse : le
            détail lève le doute au comptoir, pas au bulletin de paie. */}
        {tip > 0 && partage.length > 0 && (
          <div style={{ marginTop: -4, padding: '9px 12px', background: 'var(--color-sable)', borderRadius: 4 }}>
            {partage.map((p) => (
              <div key={p.staffId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 12.5, marginBottom: 2 }}>
                <span>{nomDe(p.staffId)}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(p.amountXof, currency)}</span>
              </div>
            ))}
          </div>
        )}
        {tip > 0 && partage.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--trf-error, #8f3b30)', marginTop: -6 }}>
            Aucun membre du personnel dans cette branche — le pourboire ne pourra pas être partagé.
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
          disabled={(settleTotal <= 0 && (tip <= 0 || partage.length === 0) && !depositJustConfirmed && !reschedule) || (fxOn && fxAmount <= 0) || fxBlocked}
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
