import { useRef, useState } from 'react';
import { Button, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, rateToXof } from '../../../../shared/currency';
import { CURRENCIES } from '../../../../shared/geo';
import { useSettings } from '../../../../shared/settings';
import { useClients, clientsStore, useFamilies, familiesStore, aUnPrixConvenu } from '../../../../shared/clients';
import { appointmentsStore, useAppointments, apptPayeurId, venuesHonorees, type Appointment, type ApptPayment } from '../../../../shared/agenda';
import { useCategories, fondeLaCouronne, type Service } from '../../../../shared/catalog';
import {
  invoicesStore, useCashboxes, invoiceTotal, ligneNetXof, usePaymentMethods, cashboxCurrency, nouvelleFacture, ligneFacture,
  useCredits, creditMovementsStore, creditBalanceOf, invoiceReglements, invoiceRegleXof, invoiceSoldee, useInvoices,
  type Invoice, type InvoiceLine, type InvoicePayment, type PaymentMethod, type CreditHolder, caisseParDefaut } from '../../../../shared/finance';
import { holderOf, payerClientIdOf, estDependant } from '../../../../shared/accounts';
import { duDuCompte, peutPartirDevant, tetesDuCompte } from '../../../../shared/compte';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, splitByWeights } from '../../../../shared/pricing';
import { pointsRateStore, pointsHistoryStore, pointsEnabledStore, estDuCercle, cercleSeuilStore } from '../../../../shared/offers';
import { uid } from '../../../../shared/store';
import { sameName } from '../../../../shared/text';
import { addTipPartage, repartirPourboire, retirerPourboiresDesFactures, PART_POURBOIRE_DEFAUT } from '../../../../shared/tips';
import { waLink, autoConfigStore, automationsActiveStore, REVIEW_LINK_DEFAUT, lienPaiementMomo } from '../equipe/data';
import { signeLeMessage } from '../../../../shared/identite';
import { consommerPourRituel, rembobinerRituel, retirerParReferences } from '../../../../shared/stock';
import { detacherFacture } from '../../../../shared/laboratoire';
import { useStaff } from '../equipe/data';
import { Toggle } from '../equipe/ui';
import '../equipe/equipe.css'; // styles du Toggle partagé (tre-toggle)
import {
  apptLabel, apptServices, apptNetXof, apptTotalXof, apptDueXof, svcPriceForAppt, remiseDeLigne, forfaitTauxPct, frShort, todayISO, useServicesById,
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
  /* LE CERCLE EST INDIVIDUEL, À PLEIN TARIF (25 août). Les points ne se gagnent
     que sur SA PROPRE venue : un rituel réglé pour un membre du foyer nourrit le
     Foyer, pas le Cercle de la payeuse (`estVenuePropre`). Une tête à prix
     convenu — sa reconnaissance est déjà son prix — et une tête dépendante n'en
     gagnent pas. On compte SES venues (par tête, pas par la payeuse), celle-ci
     comprise, sauf si un autre de SES rituels du même jour l'a déjà comptée. */
  const acquises = appointmentsStore.get();
  const beneficiaireClient = clientsStore.get().find((c) => c.id === beneficiaire);
  const families = familiesStore.get();
  const estVenuePropre = appt.clientId === beneficiaire;
  const dejaSaVenue = acquises.some((a) =>
    a.id !== appt.id && a.status === 'honoré' && a.date === appt.date && a.clientId === beneficiaire);
  const venues = venuesHonorees(acquises, beneficiaire, false) + (estVenuePropre && !dejaSaVenue ? 1 : 0);
  const eligible = estVenuePropre
    && !!beneficiaireClient
    && !aUnPrixConvenu(beneficiaireClient)
    && !estDependant(beneficiaireClient, families)
    && estDuCercle(venues, cercleSeuilStore.get());

  const awarded = appt.pointsAwarded || !eligible
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

  /* ── LA COURONNE NAÎT ICI — 19 août 2026 ─────────────────────────
     Un rituel honoré qui porte une création VÈKPÈ inscrit la date de la
     couronne au profil (« Couronne depuis »), à la date DU RITUEL — pas du
     clic. SEULEMENT si la fiche n'en porte pas déjà une : une seconde
     création (refonte) ne rajeunit pas une couronne, et une date posée à la
     main reste la vérité de la Maison. C'est ce champ qui nourrit le
     Couronnement (jour 365) — il ne se remplissait qu'à la main, donc
     presque jamais. S'honore = a eu lieu : l'encaissement, lui, ne fonde
     rien (on peut payer d'avance une couronne qui n'est pas née). */
  if (appt.clientId && appt.serviceIds.some((id) => {
    const sv = byId.get(id);
    return sv && fondeLaCouronne(sv);
  })) {
    clientsStore.set((prev) => prev.map((c) => (c.id === appt.clientId && !c.crownSince
      ? { ...c, crownSince: appt.date }
      : c)));
  }
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
    /* Les parts de pourboire de ces pièces s'en vont avec elles — 19 août :
       « quand je supprime une facture de pourboire, ça doit supprimer le
       pourboire inscrit chez chacun ». L'encaissement annulé, personne n'a
       touché cet argent. */
    retirerPourboiresDesFactures(ids);
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

/** ÉMETTRE LA FACTURE D'UN RITUEL NON ENCAISSÉ (15 août) — « comment je gère
    une facture impayée ? Je dois l'envoyer au client, j'ai besoin de
    télécharger la pièce. »

    Jusqu'ici, une pièce ne naissait qu'à l'ENCAISSEMENT : un rituel rendu et
    non payé n'avait rien à envoyer, et il fallait ressaisir ses lignes à la
    main dans Factures & devis pour réclamer son dû.

    La série est MND, jamais F : la série F est forcée « payée » par le
    constructeur, et la lecture des résidus (F + envoyée = encaissement
    annulé) resterait fausse. Cette pièce-ci naît « envoyée » — un dû réclamé,
    pas un franc encaissé. Elle n'entre dans aucune caisse et ne change pas
    l'état de paiement du rituel : encaisser plus tard suivra son chemin
    normal.

    Idempotente : un rituel qui porte déjà sa facture ouverte ne la réémet pas
    — deux réclamations pour la même dette, c'est une dette qui double. */
export function factureAEnvoyer(
  appt: Appointment,
  byId: Map<string, Service>,
  branchId: string,
): { ok: true; inv: Invoice; deja: boolean } | { ok: false; erreur: string } {
  const du = apptDueXof(appt, byId);
  if (du <= 0) return { ok: false, erreur: 'Ce rituel ne doit rien, il n’y a pas de facture à réclamer.' };
  const dejaLa = invoicesStore.get().find((i) => i.apptId === appt.id && i.kind === 'facture' && i.status !== 'payée');
  if (dejaLa) return { ok: true, inv: dejaLa, deja: true };

  const services = apptServices(appt, byId);
  const brut = services.reduce((n, sv) => n + svcPriceForAppt(appt, sv), 0);
  const net = apptNetXof(appt, byId);
  /* UNE LIGNE PAR PRESTATION, à leur prix plein : la cliente doit reconnaître
     son rituel dans la pièce. L'écart avec le net (remise, forfait) se dit en
     remise globale plutôt que de se cacher dans les prix. */
  const lignes = services.length
    ? services.map((sv) => ligneFacture(sv.name, svcPriceForAppt(appt, sv)))
    : [ligneFacture(apptLabel(appt, byId), net)];
  const remise = services.length && brut > net ? brut - net : 0;
  const inv = nouvelleFacture({
    branchId,
    serie: 'MND',
    status: 'envoyée',
    /* LA PIÈCE PORTE LE JOUR DU RITUEL, PAS CELUI OÙ ON LA RÉCLAME.
       Sans cette ligne, `nouvelleFacture` retombait sur aujourd'hui : une
       facture éditée avec trois semaines de retard datait du jour de la
       saisie, et le chiffre d'affaires du mois de la prestation partait
       grossir celui du mois du rattrapage. La voie « Encaisser » le faisait
       déjà (`invDate = appt.date`) ; celle-ci l'avait oublié.
       Repli sur aujourd'hui seulement si le rituel n'a pas de date. */
    date: appt.date || undefined,
    clientId: apptPayeurId(appt),
    clientName: appt.clientName,
    lines: lignes,
    globalDiscountXof: remise || undefined,
    discountLabel: remise > 0 && appt.remiseFamille ? 'Remise famille' : undefined,
    theme: 'Aube',
    master: appt.master,
    note: `Rituel du ${appt.date}${(appt.paidXof ?? 0) > 0 ? ` · déjà réglé ${appt.paidXof}, reste ${du}` : ''}`,
  });
  const avecLien: Invoice = { ...inv, apptId: appt.id };
  invoicesStore.set((prev) => [avecLien, ...prev]);
  return { ok: true, inv: avecLien, deja: false };
}

export function PayAppointmentModal({ appt: apptEntrant, onClose, onRetour }: {
  appt: Appointment;
  onClose: () => void;
  /** RETOUR AU RITUEL — 17 août 2026, demande de Yéman : « quand j'arrive à la
      page encaisser le rituel je dois pouvoir aller en arrière ». L'écran
      d'encaissement s'ouvre DEPUIS la fiche du rendez-vous, qui se referme
      derrière lui : sans ce chemin, revenir corriger une prestation obligeait
      à fermer, retrouver la ligne au carnet, et rouvrir. */
  onRetour?: () => void;
}) {
  /* LE RITUEL RELU DANS LE MAGASIN À CHAQUE RENDU — 17 août 2026.

     Celui qu'on reçoit en prop a été capturé à l'OUVERTURE de la modale. Tant
     qu'on encaissait puis fermait, il ne pouvait pas vieillir. Depuis qu'on
     peut « enregistrer et en ajouter un autre », il ment dès le premier
     versement : `paidXof`, le reste dû et l'acompte restent ceux d'avant, et le
     second règlement se calcule sur un solde périmé — c'est ce qui a fait
     disparaître un des deux encaissements d'Hermine D..

     Le magasin, lui, est à jour à l'instant du geste. Même règle que partout
     ailleurs ici : on ne juge jamais sur une copie qu'on tient en main. */
  const [tousLesRdv] = useAppointments();
  const appt = tousLesRdv.find((a: Appointment) => a.id === apptEntrant.id) ?? apptEntrant;

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
  /* LA LONGUEUR DU RITUEL, PAS LE SILENCE — 17 août 2026.
     `pricingOf` seul ne porte que la longueur de la FICHE, souvent vide : toute
     prestation à grille retombait alors sur son prix « court », et la caisse
     calculait d'autres prix que le rendez-vous pour la même tête. Sur le rituel
     d'Hermine, 22 000 + 20 000 + 25 000 = 67 000 là où la modale disait 81 000.

     La somme des prix pleins passant SOUS le net encaissé, la branche de secours
     « on répartit pour coller » s'ouvrait et ventilait 81 000 F au prorata :
     26 597 / 24 179 / 30 224. Total juste, ventilation fausse — et une facture
     qui ne ressemble plus au rituel qu'elle atteste.

     Même résolution que la modale du rendez-vous, dans le même ordre : la
     longueur FIGÉE du rituel prime (relire mars ne le retarife pas), puis celle
     de la fiche, puis Mi-Long — le cas courant au fauteuil. */
  const pricing = {
    ...pricingOf(client, bands, sets, categories),
    longueur: appt.longueur ?? client?.longueur ?? 'mi-long',
  };
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
  /* LA MONNAIE DE LA MAISON PASSE D’ABORD — 24 août 2026. Voir
     `caisseParDefaut` : un tiroir en euros ne se propose pas pour encaisser
     des francs. */
  const [cashbox, setCashbox] = useState(caisseParDefaut(branchBoxes, branch.id, currency)?.name ?? '');
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

  /* ── LE PLAFOND DE CRÉDIT, AU MOMENT OÙ IL DÉCIDE (26 août) ────────
     Un plafond qui ne vit que sur la fiche ne sert à rien : la question « peut
     elle partir en devant ? » ne se pose qu'ICI, la main sur le tiroir. Le dû
     comparé est celui des AUTRES rituels — celui-ci est encore sur la table —
     plus ce qu'elle laisserait aujourd'hui.

     La Maison AVERTIT, elle ne bloque pas : c'est Yéman qui tient le comptoir,
     pas l'écran. Un blocage dur ferait contourner la caisse, et la trace se
     perdrait — exactement ce qu'on cherche à éviter. */
  const tetesDuFoyer = payerClient ? tetesDuCompte(payerClient, clients, families) : [payerId];
  const duAilleurs = Math.max(0, duDuCompte(tousLesRdv, tetesDuFoyer, (a) => apptDueXof(a, byId)) - due);
  const verdict = peutPartirDevant(payerClient?.plafondCreditXof, duAilleurs, remainingAfter);
  const alerteCredit = remainingAfter > 0 && !verdict.autorise;

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

  /* ── UN BLOCAGE DOIT SE DIRE — 18 août 2026 ─────────────────────
     « Quand je veux encaisser les 100 euros la case est grisée » (Yéman).

     Le bouton se grisait SANS UN MOT. La raison est bonne — un billet en euros
     doit avoir son tiroir, sinon il fausserait le bocal en francs, et la
     trésorerie additionnerait des euros à des francs. Mais une règle juste qui
     ne se dit pas devient une panne : on croit l'application cassée, on
     n'encaisse pas, et l'argent attend.

     La règle reste ; elle parle, et elle ouvre la porte qu'elle exige. */
  const [, setCashboxes] = useCashboxes();
  const creerLaCaisseDevise = () => {
    const nom = `Tiroir ${payCurrency}`;
    setCashboxes((prev) => [...prev, {
      id: `cb-${uid()}`, branchId: branch.id, name: nom, sub: `Billets en ${payCurrency}`,
      glyph: '', openingXof: 0, currency: payCurrency,
    }]);
    setCashbox(nom);
    toast(`Caisse « ${nom} » créée, les billets en ${payCurrency} y entreront.`);
  };

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

  /* LA PIÈCE DU RITUEL, LUE EN DIRECT — c'est elle qui porte le journal des
     versements depuis le 17 août. On la relit dans le magasin à chaque rendu :
     celle qu'on aurait capturée à l'ouverture vieillirait dès la première
     correction. */
  const [toutesLesPieces] = useInvoices();
  const pieceDuRituelOuverte = toutesLesPieces.find((i: Invoice) =>
    i.kind === 'facture'
    && (i.apptId === appt.id || i.id === appt.invoiceId
        || (appt.payments ?? []).some((p) => p.invoiceId === i.id)));

  /* Corriger QUAND et COMMENT — jamais COMBIEN. La correction va sur la pièce
     (la vérité de l'argent) ET sur le carnet quand il porte le même versement,
     pour que les deux registres ne divergent pas. */
  const corrigerVersement = (idVersement: string, patch: Partial<InvoicePayment>) => {
    if (!pieceDuRituelOuverte) return;
    const journal = invoiceReglements(pieceDuRituelOuverte)
      .map((p) => (p.id === idVersement ? { ...p, ...patch } : p));
    invoicesStore.set((prev) => prev.map((i) => (i.id === pieceDuRituelOuverte.id
      ? { ...i, payments: journal, payment: journal[0]?.method ?? i.payment, cashbox: journal[0]?.cashbox ?? i.cashbox }
      : i)));
    appointmentsStore.set((prev) => prev.map((a) => (a.id === appt.id
      ? { ...a, payments: (a.payments ?? []).map((p) => (p.id === idVersement ? { ...p, ...patch } : p)) }
      : a)));
  };

  const submitting = useRef(false); // garde-fou anti double-clic (double facture / double pourboire)
  const fullyPaid = remainingAfter === 0;

  const confirm = (garderOuvert = false) => {
    if (submitting.current) return; // évite la double-soumission (double-clic rapide)
    if (amount <= 0 && avoirApplied <= 0 && tip <= 0 && !depositJustConfirmed && !reschedule) return;
    submitting.current = true;
    /* La pièce que CE geste écrit — le pourboire s'y attache (19 août). */
    let idPieceEncaissee: string | undefined;
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

      /* ── UNE PIÈCE PAR RITUEL, PLUSIEURS RÈGLEMENTS — 17 août 2026 ────
         « Hermine D. devrait avoir tous ces règlements sur une même facture
         avec différentes dates de paiement ou différents moyens de paiement.
         Pas besoin de deux factures différentes le même jour. Ensuite besoin de
         savoir le montant de chaque prestation. Je ne veux pas tout en un
         bloc. » (Yéman)

         LA PIÈCE VAUT DÉSORMAIS LE RITUEL ENTIER, pas le versement du jour.
         C'est ce qui rend le détail honnête : on ne peut pas ventiler trois
         prestations sur 30 000 F quand le rituel en vaut 81 000 sans les
         proratiser — et proratiser, c'est écrire des prix que la Maison n'a
         jamais annoncés. Le bloc « Règlement · A + B + C » était la CONSÉQUENCE
         du découpage en deux pièces, pas une décision d'affichage.

         Les prestations se détaillent donc TOUJOURS, à leur prix plein, et
         l'écart avec le net du rituel se lit en remise globale — jamais en
         rabotant les lignes. */
      const lignesDuRituel = (): InvoiceLine[] => {
        if (services.length === 0) return [ligneFacture(nomForfait || apptLabel(appt, byId), net)];
        /* LA REMISE DE LIGNE RESTE SUR SA LIGNE — 18 août 2026 : « je dois
           voir la remise de 20 000 F sur la ligne de la prestation, avec les
           60 000 F barrés ». Elle était fondue dans la remise globale de la
           pièce : le total tombait juste, mais la ligne mentait par omission —
           on ne savait plus QUELLE prestation portait le geste. La ligne porte
           donc son prix plein ET sa remise ; seule la part restante (forfait,
           geste global) va à la remise globale. */
        /* L'index vient de `serviceIds`, pas de `services` — même garde que
           dans `alignerFacturesDuRituel` : les deux divergent dès qu'une fiche
           a quitté le catalogue, et la remise irait au geste voisin. */
        const posRituel = services.map((sv) => appt.serviceIds.indexOf(sv.id));
        const l = services.map((sv, idx) => {
          const ligne = ligneFacture(sv.name, svcWeights[idx]);
          const r = remiseDeLigne(appt, posRituel[idx] >= 0 ? posRituel[idx] : idx);
          if (r.pct > 0) ligne.discountPct = r.pct;
          if (r.xof > 0) ligne.discountXof = r.xof;
          return ligne;
        });
        /* Cas rare : le net dépasse la somme des prix pleins (montant convenu
           au-dessus du barème). On l'ajoute en clair plutôt que de gonfler les
           lignes — même geste que `alignerFacturesDuRituel`. */
        if (net > grossSum) l.push(ligneFacture('Ajustement · prix consenti ce jour-là', net - grossSum));
        return l;
      };
      const lines = lignesDuRituel();
      /* La remise GLOBALE se mesure contre le net des LIGNES — les remises de
         ligne étant déjà écrites sur elles, ne la mesurer que contre les prix
         pleins les compterait deux fois. */
      const netDesLignes = lines.reduce((s, l) => s + ligneNetXof(l), 0);
      const detailRemise = services.length > 0 && netDesLignes > net ? netDesLignes - net : 0;

      /* LES VERSEMENTS DE CE PASSAGE. Un par NATURE d'argent, car ils ne
         voyagent pas ensemble : le comptant entre en caisse, l'avoir est un
         crédit consommé, l'acompte est entré un autre jour dans une autre
         caisse. Les confondre en un seul montant, c'est perdre la trace de
         ce qui est réellement passé au comptoir. */
      const versements: InvoicePayment[] = [];
      if (depositCredit > 0) {
        versements.push({
          id: `ip-${uid()}`,
          date: appt.depositConfirmedAt ?? invDate,
          amountXof: depositCredit,
          method: 'Acompte',
          note: 'Acompte reçu avant le comptoir',
        });
      }
      if (amount > 0) {
        versements.push({
          id: `ip-${uid()}`, date: payDate, amountXof: amount,
          method: pay, cashbox: activeBox,
          /* LA DEVISE VIT SUR LE VERSEMENT — les 100 € de Stevie A., 18 août.
             Posée sur la seule pièce, elle se perdait dès que le versement
             s'inscrivait sur une pièce existante : tiroir EUR vide, PDF muet. */
          ...(fxOn && fxAmount > 0 ? { fx: { code: fxCode, rate: fxRateNum, amount: fxAmount } } : {}),
        });
      }
      if (avoirApplied > 0) {
        versements.push({
          id: `ip-${uid()}`, date: payDate, amountXof: avoirApplied,
          method: 'Avoir', note: 'Réglé par avoir, crédit du compte',
        });
      }
      /* Compte famille : la facture est au nom du PARENT PAYEUR, la cliente soignée
         en mention (forClientId). */
      const avoirNote = avoirApplied > 0 ? `Réglé par avoir : ${fmtMoney(avoirApplied, currency)}${amount > 0 ? ` · comptant ${fmtMoney(amount, currency)}` : ''}` : '';
      const partialNote = fullyPaid ? '' : `Paiement partiel, reste ${fmtMoney(remainingAfter, currency)}`;
      /* Le forfait se dit sur la pièce, avec le prix plein en regard : une
         remise consentie et tue n'est pas un cadeau, c'est un prix qu'on
         n'explique pas. */
      const forfaitNote = forfaitPose
        ? `${nomForfait} · ${fmtMoney(forfaitNum, currency)} au lieu de ${fmtMoney(grossActuel, currency)}`
        : '';
      /* LA PIÈCE DU RITUEL, S'IL EN A DÉJÀ UNE. Un second règlement s'y INSCRIT
         au lieu d'ouvrir une pièce jumelle le même jour. Le lien se lit des
         trois côtés — la pièce nomme son rituel, le rituel nomme sa dernière
         facture, et chaque versement du carnet nomme la sienne — parce qu'aucun
         seul ne couvre tous les chemins d'émission. */
      const pieceDuRituel = invoicesStore.get().find((i) =>
        i.kind === 'facture'
        && (i.apptId === appt.id || i.id === appt.invoiceId
            || (appt.payments ?? []).some((p) => p.invoiceId === i.id)));

      const creee: Invoice = nouvelleFacture({
        branchId: branch.id,
        /* Série F : l'encaissement de rituel. Le constructeur la force
           « payée » ; on rétablit ensuite le statut d'après l'argent REÇU —
           une pièce à moitié réglée est une créance, pas une attestation. */
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

      /* LE STATUT SUIT L'ARGENT, IL NE LE DÉCIDE PAS. Soldée quand les
         versements couvrent le total ; sinon « envoyée » — et les écrans de
         créances la comptent alors pour ce qui RESTE, pas pour son total. */
      const solder = (i: Invoice): Invoice =>
        ({ ...i, status: invoiceSoldee(i) ? 'payée' : 'envoyée' });

      let inv: Invoice;
      if (pieceDuRituel) {
        const journal = [...invoiceReglements(pieceDuRituel), ...versements];
        const premier = journal[0];
        inv = solder({
          ...pieceDuRituel,
          /* Les lignes se reconforment au rituel d'aujourd'hui — c'est la même
             pièce qui grandit, pas une pièce neuve. */
          lines,
          globalDiscountPct: 0,
          globalDiscountXof: detailRemise > 0 ? detailRemise : undefined,
          discountLabel: detailRemise > 0 && appt.remiseFamille ? 'Remise famille' : undefined,
          payments: journal,
          /* Reflet du PREMIER versement : les écrans qui ne lisent qu'un moyen
             de paiement continuent de dire vrai. */
          payment: premier?.method ?? pieceDuRituel.payment,
          cashbox: premier?.cashbox ?? pieceDuRituel.cashbox,
          avoirXof: ((pieceDuRituel.avoirXof ?? 0) + avoirApplied) || undefined,
          depositCreditXof: ((pieceDuRituel.depositCreditXof ?? 0) + depositCredit) || undefined,
          tipXof: ((pieceDuRituel.tipXof ?? 0) + (partage.length > 0 ? tip : 0)) || undefined,
          /* La devise du jour se dit AUSSI sur la pièce — pour les écrans qui
             ne lisent qu'elle ; la vérité par versement est dans le journal. */
          fx: fxOn && fxAmount > 0 ? { code: fxCode, rate: fxRateNum, amount: fxAmount } : pieceDuRituel.fx,
          note: [forfaitNote, avoirNote, partialNote].filter(Boolean).join(' · ') || undefined,
          apptId: appt.id,
        });
        const fige = inv;
        invoicesStore.set((prev) => prev.map((x) => (x.id === fige.id ? fige : x)));
      } else {
        inv = solder({ ...creee, payments: versements, apptId: appt.id });
        const fige = inv;
        invoicesStore.set((prev) => [fige, ...prev]);
      }
      idPieceEncaissee = inv.id;
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
       rituel est déjà soldé. LA NOTE PORTE LA CLIENTE — 19 août 2026 :
       « besoin de savoir c'est le pourboire de quelle cliente » ; une part
       sans provenance ne se relit pas dans « Mon mois ». */
    const partsEcrites = tip > 0
      ? addTipPartage(beneficiaires, tip, invDate, client?.name ?? appt.clientName ?? undefined, idPieceEncaissee)
      : [];
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

    /* ── L'AVIS GOOGLE DE LA PREMIÈRE VENUE — 18 août 2026 ─────────────
       « Je veux que mes nouvelles clientes de passage laissent un avis
       Google une fois la prestation terminée. »

       Le moment est CELUI-CI : le rituel vient d'être soldé, la cliente est
       encore à la porte, contente. On ouvre WhatsApp avec le message déjà
       écrit — un seul geste pour l'envoyer, rien ne part sans la main du
       comptoir. Seulement à la PREMIÈRE pièce soldée de cette tête : une
       habituée relancée à chaque passage finirait par ne plus rien laisser.

       L'envoi VRAIMENT automatique attend l'API WhatsApp Business (dossier
       Meta) — ceci est la voie qui marche aujourd'hui, sans clé ni coût. */
    if (settleTotal > 0 && fullyPaid && (automationsActiveStore.get()['avis-premiere-venue'] !== false)) {
      const tete = clients.find((c) => c.id === appt.clientId);
      const tel = (tete?.phone ?? '').replace(/\D/g, '');
      const lien = (autoConfigStore.get().reviewLink || REVIEW_LINK_DEFAUT).trim();
      /* Les pièces d'AVANT : celles des autres rituels de cette tête. La pièce
         de CE rituel s'exclut par son lien au rendez-vous, pas par une
         variable de bloc. */
      const dejaReglees = invoicesStore.get().filter((i) =>
        i.kind === 'facture' && i.clientId === appt.clientId
        && i.apptId !== appt.id && i.id !== appt.invoiceId
        && invoiceRegleXof(i) > 0).length;
      /* L'AVIS SANS MAIN A LA PRIORITÉ — 19 août 2026 : quand l'interrupteur
         des Paramètres est allumé, c'est la fonction planifiée `avis-google`
         qui écrit à la cliente (API Meta). Ouvrir WhatsApp ici en plus, ce
         serait la relancer deux fois pour le même passage. */
      if (tel && lien && dejaReglees === 0 && autoConfigStore.get().avisAuto !== true) {
        const prenom = (tete?.name ?? '').trim().split(/\s+/)[0];
        const mot = `Merci pour votre passage à la Maison MND${prenom ? `, ${prenom}` : ''}. `
          + `Si le cœur vous en dit, un avis nous aiderait beaucoup : ${lien}`;
        window.open(waLink(tel, mot), '_blank', 'noopener');
      }
    }

    /* RESTER POUR LE SECOND RÈGLEMENT — « je veux enregistrer un premier
       paiement sur cette facture, et ensuite le deuxième mode de paiement dans
       la même facture sans sortir ». Le versement est écrit ; on remet les
       champs à zéro pour le suivant, et le bandeau du reste dû se recalcule
       tout seul depuis le magasin. Fermer aurait obligé à retrouver le rituel
       au carnet entre deux moyens de paiement. */
    if (garderOuvert) {
      submitting.current = false;
      setAmountStr('');
      setAvoirStr('0');
      setTipStr('0');
    } else {
      onClose();
    }
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
        {/* LE CHEMIN DU RETOUR, EN HAUT — là où l'œil cherche à revenir. */}
        {onRetour && (
          <button
            type="button"
            onClick={onRetour}
            style={{
              alignSelf: 'flex-start', cursor: 'pointer', background: 'none', border: 'none',
              padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)',
            }}
          >
            ‹ Retour au rituel
          </button>
        )}
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
          {/* LE LIEN DE PAIEMENT EN UN CLIC — la page payer.html au montant du
              reste, envoyée à la PAYEUSE sur WhatsApp. Pour la cliente à
              distance qui règle par Mobile Money avant de passer. */}
          {due > 0 && (() => {
            const lien = lienPaiementMomo(due);
            const tel = (payerClient?.phone ?? client?.phone ?? '').replace(/\D/g, '');
            if (!lien || !tel) return null;
            const prenom = (payerClient?.name ?? client?.name ?? '').split(' ')[0];
            const msg = signeLeMessage(
              `${branch.name} · votre rituel\nBonjour ${prenom}, pour régler ${fmtMoney(due, currency)} par Mobile Money, ouvrez cette page : le code à composer s'y affiche, montant compris.\n${lien}`,
            );
            return (
              <a
                href={`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'inline-block', marginTop: 9, fontSize: 11.5, fontWeight: 600, color: 'var(--copper-200)', textDecoration: 'none' }}
              >
                Envoyer le lien de paiement par WhatsApp
              </a>
            );
          })()}
        </div>

        {isFamilyPayer && (
          <div style={{ fontSize: 11.5, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-pill)', padding: '4px 11px', alignSelf: 'flex-start' }}>
            Compte famille, facturé à {payerClient?.name ?? 'au parent payeur'}
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
            Acompte de <b>{fmtMoney(deposit, currency)}</b> demandé · <b>non vérifié</b>, il n’est PAS déduit
            tant que sa réception n’est pas confirmée ci-dessous.
          </div>
        )}
        {deposit > 0 && !appt.depositConfirmed && (
          <label style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', lineHeight: 1.45 }}>
            <input type="checkbox" checked={depositReceived} onChange={toggleDepositReceived} style={{ marginTop: 2 }} />
            <span>Acompte reçu et vérifié (MoMo contrôlé), le déduire du reste à encaisser</span>
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
        {/* Le journal vit sur la PIÈCE depuis le 17 août ; le carnet n'en garde
            qu'un écho. Se fier à `appt.payments` cachait le bloc entier quand la
            pièce, elle, portait bien ses versements. */}
        {((pieceDuRituelOuverte ? invoiceReglements(pieceDuRituelOuverte).length : 0)
          + (appt.payments ?? []).length) > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--color-sable)', borderRadius: 4 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 6 }}>
              Versements déjà reçus
            </div>
            {/* CORRIGER UN VERSEMENT — 17 août 2026. On rectifie QUAND et
                COMMENT l'argent est entré : une date saisie de travers range le
                règlement dans le mauvais mois, un moyen erroné fausse la caisse.

                LE MONTANT NE SE RETOUCHE PAS ICI, et c'est délibéré : changer
                une somme reçue, c'est dire qu'on a encaissé autre chose que ce
                qu'atteste la pièce. Ce geste-là existe, il s'appelle « Annuler
                l'encaissement », il supprime la facture et le dit. Le laisser
                passer pour une correction de frappe reviendrait à réécrire un
                chiffre d'affaires sans trace. */}
            {pieceDuRituelOuverte && invoiceReglements(pieceDuRituelOuverte).map((v) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                <Input
                  type="date"
                  value={v.date}
                  onChange={(e) => corrigerVersement(v.id, { date: e.target.value || v.date })}
                  style={{ width: 138, flex: 'none', fontSize: 12 }}
                  aria-label="Jour où cet argent est entré"
                />
                <Select
                  value={v.method}
                  onChange={(e) => corrigerVersement(v.id, { method: e.target.value })}
                  style={{ width: 128, flex: 'none', fontSize: 12 }}
                  aria-label="Moyen de ce versement"
                >
                  {[...new Set([v.method, ...methods, 'Avoir', 'Acompte'])].filter(Boolean).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
                <Select
                  value={v.cashbox ?? ''}
                  onChange={(e) => corrigerVersement(v.id, { cashbox: e.target.value || undefined })}
                  style={{ width: 118, flex: 'none', fontSize: 12 }}
                  aria-label="Caisse créditée"
                >
                  <option value="">, hors caisse</option>
                  {branchBoxes.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </Select>
                {/* LA DEVISE SE RÉPARE ICI — un versement rangé dans un tiroir
                    étranger SANS ses billets (encaissé avant le 18 août) se
                    corrige d'un chiffre : on saisit ce qui a été tendu, le taux
                    s'en déduit. C'est le seul champ : `amountXof` reste la
                    vérité comptable, on ne la retouche pas. */}
                {(() => {
                  const caisse = branchBoxes.find((c) => c.name === v.cashbox);
                  const dev = caisse ? cashboxCurrency(caisse) : currency;
                  if (dev === currency) return null;
                  return (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                      reçu
                      <Input
                        inputMode="decimal"
                        value={v.fx?.code === dev ? String(v.fx.amount) : ''}
                        placeholder="0"
                        onChange={(e) => {
                          const n = Math.max(0, Number(e.target.value.replace(',', '.')) || 0);
                          corrigerVersement(v.id, {
                            fx: n > 0
                              ? { code: dev, rate: Math.round((v.amountXof / n) * 100) / 100, amount: n }
                              : undefined,
                          });
                        }}
                        style={{ width: 74, flex: 'none', fontSize: 12, textAlign: 'right' }}
                        aria-label={`Billets reçus en ${dev}`}
                      />
                      {dev}
                    </label>
                  );
                })()}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-sans)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoney(v.amountXof, currency)}
                  {v.fx && (
                    <span style={{ color: 'var(--copper-700)', marginLeft: 6 }}>
                      {v.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {v.fx.code}
                    </span>
                  )}
                </span>
              </div>
            ))}
            {!pieceDuRituelOuverte && (appt.payments ?? []).map((v) => (
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
              Crédit prépayé du compte{account.type === 'family' ? ' famille' : ''}, déduit sans passer par la caisse.
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

        {alerteCredit && (
          <div style={{
            borderRadius: 3, padding: '10px 13px', fontSize: 12.5, lineHeight: 1.6,
            background: 'var(--copper-50)', border: '1px solid var(--copper-300)',
          }}>
            {verdict.plafond === 0 ? (
              <>
                <b style={{ fontWeight: 600 }}>Aucun plafond de crédit sur ce compte.</b>{' '}
                {payerClient?.name ? `${payerClient.name.split(' ')[0]} règle avant de partir.` : 'Elle règle avant de partir.'}
                {duAilleurs > 0 && ` Elle doit déjà ${fmtMoney(duAilleurs, currency)} par ailleurs.`}
                {' '}Le crédit se pose nommément, onglet Compte de sa fiche.
              </>
            ) : (
              <>
                <b style={{ fontWeight: 600 }}>Plafond dépassé de {fmtMoney(verdict.depassementXof, currency)}.</b>{' '}
                Elle partirait en devant {fmtMoney(verdict.apres, currency)} pour un plafond de {fmtMoney(verdict.plafond, currency)}
                {duAilleurs > 0 ? ` (dont ${fmtMoney(duAilleurs, currency)} déjà dus)` : ''}.
              </>
            )}
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
        <Field label="Pourboire (F CFA), partagé entre l’équipe">
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
            Aucun membre du personnel dans cette branche, le pourboire ne pourra pas être partagé.
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
                Un RDV « confirmé » identique sera créé pour {client?.name ?? 'la cliente'}, mêmes prestations, même prix (remise comprise), même maître, à honorer et encaisser le jour venu.
              </div>
            </>
          )}
        </div>

        {/* ENREGISTRER SANS SORTIR — le second moyen de paiement s'inscrit sur
            LA MÊME facture. N'apparaît que s'il resterait quelque chose à
            encaisser après ce versement : proposer « un autre règlement » sur
            un rituel soldé n'aurait aucun sens. */}
        {fxBlocked && (
          <div className="trc-alerte" style={{ marginTop: 4 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6 }}>
              Aucune caisse ne tient des billets en <b>{payCurrency}</b>. Un billet étranger ne peut pas
              entrer dans une caisse en {currency}, la trésorerie additionnerait des euros à des francs.
            </div>
            <Button variant="copper" size="sm" style={{ marginTop: 9 }} onClick={creerLaCaisseDevise}>
              Créer la caisse « Tiroir {payCurrency} »
            </Button>
          </div>
        )}
        {settleTotal > 0 && remainingAfter > 0 && (
          <Button
            variant="ghost"
            onClick={() => confirm(true)}
            disabled={(fxOn && fxAmount <= 0) || fxBlocked}
            style={{ marginTop: 4 }}
          >
            Enregistrer ce règlement et en ajouter un autre
          </Button>
        )}
        <Button
          variant="copper"
          onClick={() => confirm()}
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
