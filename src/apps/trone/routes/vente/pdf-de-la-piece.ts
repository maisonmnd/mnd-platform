import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { maisonNom, maisonRaisonDuPdfAu } from '../../../../shared/identite';
import { useServices } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useSubscribers, usePlans, libellesInclus } from '../../../../shared/abonnements';
import { detailDuForfait } from '../../../../shared/kids';
import { invoiceTotal, ligneNetXof, invoiceReglements, invoiceResteXof, type Invoice, type InvoiceLine } from '../../../../shared/finance';
import { appelDe } from '../../../../shared/civilite';
import { useSettings } from '../../../../shared/settings';
import { paiementTapGoDeLaPiece, type ReglagesMndPay } from '../../../../shared/mnd-pay-pur';
import type { InvoicePdfData } from '../../../../shared/pdf';
import { paiementMomoDeLaMaison } from '../equipe/data';

/** LES REMISES DU PAPIER, CHACUNE À SA LIGNE — 23 octobre 2026. Le PDF
    additionnait en une seule « Remise » celles des lignes (la remise gamme
    comprise) et celle du code : la cliente lisait « ROSE15 » sur une somme
    qui touchait aussi ses produits. Séparées, chacune garde son nom, dans
    l'ordre d'`invoiceTotal`, et leur somme fait le sous-total moins le total. */
export const remisesDuPapier = (
  d: Pick<Invoice, 'lines' | 'globalDiscountPct' | 'globalDiscountXof' | 'discountLabel'>,
  fmt: (n: number) => string,
): { label: string; value: string }[] => {
  const brut = d.lines.reduce((s, l) => s + l.qty * l.unitXof, 0);
  const apresLignes = d.lines.reduce((s, l) => s + ligneNetXof(l), 0);
  const pct = Math.max(0, d.globalDiscountPct ?? 0);
  const lignes = Math.round(brut) - Math.round(apresLignes);
  const partPct = Math.round(apresLignes) - Math.round(apresLignes * (1 - pct / 100));
  const francs = Math.max(0, Math.round(d.globalDiscountXof ?? 0));
  const out: { label: string; value: string }[] = [];
  if (lignes > 0) out.push({ label: 'Remises sur les lignes', value: `− ${fmt(lignes)}` });
  if (partPct > 0) out.push({ label: `Remise globale · −${pct} %`, value: `− ${fmt(partPct)}` });
  if (francs > 0) out.push({ label: d.discountLabel ?? 'Remise', value: `− ${fmt(francs)}` });
  return out;
};

/* ══ LA PIÈCE EN PDF, UNE SEULE FOIS — 17 octobre 2026 ═══════════════════
   « Cette facture doit aller instantanément chez le client » (Yéman). La
   facture que l'encaissement du rituel envoie sur son WhatsApp doit être LA
   MÊME que celle des Factures : ses données vivaient dans l'écran des
   Factures ; elles vivent ici, et les deux écrans les lisent. Deux copies
   du même papier finissent par diverger, et c'est la cliente qui le voit. */

export const fmtDateFr = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  const s = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return s.replace(/^1 /, '1ᵉʳ ');
};

/** DE QUOI PAYER LE RESTE : Tap & Go quand il est ouvert (le code et le QR de
    la page qui le compose, frais compris) ; sinon l'ancien MoMoPay. */
export function paiementDeLaPiece(resteXof: number, reglages: ReglagesMndPay | undefined): InvoicePdfData['momo'] {
  const tg = paiementTapGoDeLaPiece(resteXof, reglages);
  if (!tg) return paiementMomoDeLaMaison(resteXof);
  return {
    genre: 'tapgo',
    qr: tg.qr,
    code: tg.code,
    marchand: `${maisonNom()} · ${fmtMoney(tg.totalXof, 'XOF')}${tg.fraisXof > 0 ? ' frais compris' : ''}`,
  };
}

export function useLaPieceEnPdf() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [settings] = useSettings();
  const reglagesMnd = settings.mndPay;
  const [services] = useServices();
  /* ══ CE QUE PORTE UNE LIGNE D'ABONNEMENT — 1er septembre 2026 ══════
     Les pièces écrites À PARTIR D'AUJOURD'HUI portent leur contenu (`detail`).
     Celles d'AVANT ne portent rien : la facture de septembre existait déjà
     quand la demande est arrivée, et la laisser muette aurait réglé le problème
     pour les factures futures seulement — c'est-à-dire pour personne dans
     l'immédiat. On retrouve donc leur contenu par l'abonnement qui les a fait
     naître, faute de mieux, et jamais à la place de ce qui est écrit. */
  const [abonnes] = useSubscribers();
  const [formules] = usePlans();
  const nomDuService = (id: string) => services.find((sv) => sv.id === id)?.name ?? 'Prestation retirée';
  const contenuDeLaLigne = (piece: Invoice, l: InvoiceLine): string[] => {
    if (l.detail?.length) return l.detail;
    /* UN FORFAIT ÉMIS AVANT LE 4 SEPTEMBRE NE PORTE RIEN. On retrouve son
       contenu par la prestation qui porte le même nom, faute de mieux, et
       jamais à la place de ce qui est écrit. */
    const forfait = services.find((sv) => sv.name === l.label && (sv.includes?.length ?? 0) > 0);
    /* LE PRIX DE LA LIGNE, pas celui du catalogue d'aujourd'hui : c'est déjà la
       règle du prix d'époque, et le PACK Kids a maintenant deux prix. */
    if (forfait) return detailDuForfait(forfait, services, (x) => fmtMoney(x, currency), l.unitXof);
    const abo = abonnes.find((a) => a.invoiceId === piece.id);
    if (!abo || piece.lines.length !== 1) return [];
    return libellesInclus(abo, formules.find((f) => f.id === abo.planId), nomDuService);
  };
  /* ── LA TÊTE SOIGNÉE ET CELLE QUI RÈGLE — 28 août 2026 ─────────────
     « Comment garder le nom des enfants sur la facture mais dire que c'est
     Merine le parent qui paye ? Sinon cela sème la confusion : le parent
     oublie si le service lui appartient » (Yéman).

     La pièce nommait la PAYEUSE (`clientId`) et perdait la tête servie : la
     mère lisait son propre nom sur le rituel de sa fille, et ne savait plus à
     qui la couronne appartenait. `forClientId` porte la tête réellement
     soignée depuis toujours — il n'était simplement affiché nulle part.

     LA FACTURE NOMME LA TÊTE SOIGNÉE. La payeuse se dit dessous, en petit :
     deux noms, deux rôles. Le reçu, lui, garde la payeuse en tête — c'est
     d'elle que l'argent est venu. */
  const payeurDe = (d: Invoice) => clients.find((c) => c.id === d.clientId);
  const clientOf = (d: Invoice) => clients.find((c) => c.id === (d.forClientId ?? d.clientId));
  const clientNameOf = (d: Invoice) => clientOf(d)?.name ?? d.clientName ?? 'Walk-in';
  const prenomOf = (d: Invoice) => clientNameOf(d).split(' ')[0];
  /** Dans un MESSAGE, la Maison dit « Madame Naffi » (2 octobre 2026) ; sur la pièce, le prénom seul. */
  const appelOf = (d: Invoice) => appelDe(clientOf(d), clientNameOf(d));
  /** Le nom de la payeuse, seulement quand ce n'est pas la tête soignée. */
  const payeurAutreQue = (d: Invoice): string | undefined => {
    if (!d.forClientId || d.forClientId === d.clientId) return undefined;
    return payeurDe(d)?.name;
  };

  /* Nom pour le PDF — la cliente au CRM, sinon un nom libre, sinon « Cliente de passage ». */
  const clientNameForPdf = (d: Invoice) => {
    const c = clientOf(d);
    if (c) return c.name;
    const n = d.clientName?.trim();
    return n && n.toLowerCase() !== 'walk-in' ? n : 'Cliente de passage';
  };

  /* Le mot du Maître par défaut, pour un document donné. */
  const defaultNoteFor = (d: Invoice) =>
    `${appelOf(d)}, ce fut un honneur de veiller sur votre couronne. Elle vous va à merveille.\n${d.master ?? branch.masters[0] ?? 'la Maison'}`;

  /* Construit les données du vrai PDF de marque à partir d'un document. */
  const buildPdfData = (d: Invoice): InvoicePdfData => {
    const gross = d.lines.reduce((s, l) => s + l.qty * l.unitXof, 0);
    const net = invoiceTotal(d);
    const disc = gross - net;
    return {
      kind: d.kind,
      number: d.number,
      houseName: branch.name,
      houseSub: branch.city ? `${branch.city} · l'art de la couronne` : undefined,
      date: fmtDateFr(d.date),
      /* Le registre au pied du PDF (10 oct. 2026), pour une pièce datée de la
         bascule ou après : le PDF d'avant n'avait pas de ligne légale. */
      legal: maisonRaisonDuPdfAu(d.date),
      clientName: clientNameForPdf(d),
      ...(payeurAutreQue(d) ? { payeurName: payeurAutreQue(d) } : {}),
      clientPhone: clientOf(d)?.phone,
      master: d.master,
      /* DE QUOI PAYER — seulement s'il reste à régler : une facture soldée
         n'invite pas à payer. Un devis non plus : rien n'est dû avant l'accord.
         17 OCTOBRE 2026 : « corrige le code USSD avec celui du Tap & Go de
         FedaPay ; remets le bon QR avec le montant restant » (Yéman). Le code
         est celui de Tap & Go (*601*14*<code>*<total>#, tout réseau), le QR
         ouvre la page qui le compose, frais ajoutés pour la cliente (sa
         règle de MND PAY). L'ancien MoMoPay (ACIA1) ne reste qu'en repli,
         Tap & Go éteint. */
      momo: d.kind === 'facture' && invoiceResteXof(d) > 0
        ? paiementDeLaPiece(invoiceResteXof(d), reglagesMnd)
        : undefined,
      /* Le papier dit QUAND, pas seulement COMMENT — un versement par ligne,
         avec sa date et sa part. */
      reglements: invoiceReglements(d)
        .filter((p) => p.amountXof > 0)
        .map((p) => ({
          date: fmtDateFr(p.date),
          /* Le versement en devise se dit sur le papier aussi — la cliente
             doit retrouver les billets qu'elle a tendus. */
          method: p.fx
            ? `${p.method} · ${p.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${p.fx.code} reçus (1 ${p.fx.code} = ${p.fx.rate} ${currency})`
            : p.method,
          amount: fmtMoney(p.amountXof, currency),
        })),
      lines: d.lines.map((l) => {
        /* LE GESTE SE DIT SUR LE PAPIER AUSSI (16 août) : la pièce écran
           montrait « remise −100 % », le PDF affichait un 0 F sans raison.
           Un cadeau qu'on ne voit pas n'est pas reçu. 18 août : même dette
           pour la remise en FRANCS — le PDF l'ignorait jusque dans le calcul
           de la ligne. */
        const remise = [
          l.discountPct > 0 ? `−${l.discountPct} %` : '',
          (l.discountXof ?? 0) > 0 ? `−${fmtMoney(l.discountXof!, currency)}` : '',
        ].filter(Boolean).join(' puis ');
        const contenu = contenuDeLaLigne(d, l);
        return {
          label: remise ? `${l.label} · remise ${remise}` : l.label,
          qty: l.qty,
          unit: fmtMoney(l.unitXof, currency),
          total: fmtMoney(ligneNetXof(l), currency),
          /* LE PDF EST LA PIÈCE QU'ELLE GARDE — c'est celui-là, pas l'écran,
             qu'elle ressortira dans six mois. */
          ...(contenu.length > 0 ? { detail: contenu } : {}),
        };
      }),
      subtotal: fmtMoney(Math.round(gross), currency),
      discount: disc > 0 ? `− ${fmtMoney(Math.round(disc), currency)}` : undefined,
      remises: remisesDuPapier(d, (n) => fmtMoney(n, currency)),
      total: fmtMoney(net, currency),
      /* Le pourboire remis avec le règlement — hors total, il appartient aux
         mains. La pièce doit dire TOUT ce que la cliente a tendu. */
      tip: (d.tipXof ?? 0) > 0 ? fmtMoney(d.tipXof!, currency) : undefined,
      /* Le PDF porte la devise reçue et son taux — c'est la pièce que la cliente
         garde ; elle doit y retrouver ce qu'elle a tendu. */
      payment: d.fx
        ? `${d.payment} · ${d.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${d.fx.code} (1 ${d.fx.code} = ${d.fx.rate} ${currency})`
        : d.payment,
      status: d.status,
      note: d.note?.trim() || defaultNoteFor(d),
    };
  };

  return {
    payeurDe, clientOf, clientNameOf, prenomOf, appelOf, payeurAutreQue, clientNameForPdf,
    defaultNoteFor, contenuDeLaLigne, buildPdfData,
  };
}
