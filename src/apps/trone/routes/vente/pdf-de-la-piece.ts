import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { maisonNom, maisonRaisonDuPdfAu } from '../../../../shared/identite';
import { useServices, type Service } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useSubscribers, usePlans, libellesInclus, type Plan, type Subscriber } from '../../../../shared/abonnements';
import { detailDuForfait } from '../../../../shared/kids';
import { invoiceTotal, ligneNetXof, invoiceReglements, invoiceResteXof, type Invoice, type InvoiceLine } from '../../../../shared/finance';
import { detailPorte, donneesDuPdfDeLaPiece, fmtDateFr, ligneSousLeVerrou, motDuPapierParDefaut } from '../../../../shared/pdf-de-la-piece-pur';
import { appelDe, prenomDUsage } from '../../../../shared/civilite';
import { useSettings } from '../../../../shared/settings';
import { paiementTapGoDeLaPiece, type ReglagesMndPay } from '../../../../shared/mnd-pay-pur';
import { montantMomopayFraisCompris, TAUX_MOMOPAY_PCT } from '../../../../shared/momopay-de-la-maison-pur';
import type { InvoicePdfData } from '../../../../shared/pdf';
import { paiementMomoDeLaMaison } from '../equipe/data';

/* LES REMISES DU PAPIER, LA DATE DU PAPIER, CE QUE LA LIGNE PORTE : depuis
   le 7 novembre 2026 dans shared/pdf-de-la-piece-pur.ts, avec le corps du
   PDF de la pièce (maisonmnd.com/rdv/ le construit aussi, pour une pièce
   soldée). Réexportés ici : les écrans qui les importent d'ici ne changent pas. */
export { remisesDuPapier, fmtDateFr, detailPorte } from '../../../../shared/pdf-de-la-piece-pur';

/* ══ LA PIÈCE EN PDF, UNE SEULE FOIS — 17 octobre 2026 ═══════════════════
   « Cette facture doit aller instantanément chez le client » (Yéman). La
   facture que l'encaissement du rituel envoie sur son WhatsApp doit être LA
   MÊME que celle des Factures : ses données vivaient dans l'écran des
   Factures ; elles vivent ici, et les deux écrans les lisent. Deux copies
   du même papier finissent par diverger, et c'est la cliente qui le voit. */

/** LE JOUR DE L'ARGENT DÉJÀ REÇU — 2 novembre 2026 : « il faut montrer le
    paiement de 40 000 F à la date du samedi » (Yéman, facture du foyer d'E.
    et N.). Tout l'argent du papier entré le même jour : « Avance reçue le
    31 octobre 2026 ». Plusieurs jours : « Avances reçues », sans en choisir un. */
const avanceRecueLe = (pieces: readonly Invoice[]): string => {
  const jours = [...new Set(pieces.flatMap((p) => invoiceReglements(p).map((v) => v.date)).filter(Boolean))];
  return jours.length === 1 ? `Avance reçue le ${fmtDateFr(jours[0])}` : 'Avances reçues';
};

const enListe = (mots: readonly string[]): string =>
  mots.length > 1 ? `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}` : mots.join('');

/** TOUS LES ENFANTS EN TÊTE DU PAPIER — 2 novembre 2026 : « pour la cliente qui
    est sur le PDF, il faut absolument avoir le nom de tous les enfants »
    (Yéman). Un même nom de famille se dit une fois : « Elikya et Neliah
    Bassama » ; sinon chaque nom complet. */
export const nomsDuFoyer = (noms: readonly string[]): string => {
  const uniques = [...new Set(noms.map((n) => n.trim()).filter(Boolean))];
  const parts = uniques.map((n) => { const i = n.indexOf(' '); return i > 0 ? [n.slice(0, i), n.slice(i + 1)] : [n, '']; });
  const famille = parts[0]?.[1] ?? '';
  return famille && parts.every(([, f]) => f === famille)
    ? `${enListe(parts.map(([p]) => p))} ${famille}`
    : enListe(uniques);
};

/** LE MOT DU PAPIER DU FOYER — 2 novembre 2026 : « retirez la phrase de
    facture de la journée réunie en une ; donnez des messages concrets qui
    font plaisir aux clients, comme le code MoMo *880*41*909099*montant# »
    (Yéman). Le merci seul ; le code à composer vit sous le QR, un peu plus
    grand (épreuve en main, le même jour). */
export const motDuFoyer = (prenoms: readonly string[]): string =>
  `Merci pour votre confiance, c'était un plaisir de recevoir ${enListe(prenoms)} à la Maison.`;

/** DE QUOI PAYER LE RESTE — 28 octobre 2026 : « il faut mettre à jour le code
    QR à celui de Maison MND 909099 » (Yéman), et au sélecteur, le code Tap &
    Go gardé dessous. Le QR porte l'identifiant MoMoPay de la Maison, que
    l'appli MoMo lit ; le code est celui de Tap & Go, tout réseau, frais
    compris, pour qui ne paie pas chez MTN. Tap & Go éteint : le MoMoPay seul,
    son QR et son code.

    LE MÊME JOUR, ÉPREUVE EN MAIN : « remets le code QR de FedaPay et enlève
    Maison MND du bas du QR code » (Yéman). Le QR redevient celui de Tap &
    Go, montant compris ; dessous, le montant et le code, sans le nom :
    « Maison MND · Code Marchand 909099 » se lit au pied, sous le RCCM. */
export function paiementDeLaPiece(resteXof: number, reglages: ReglagesMndPay | undefined): InvoicePdfData['momo'] {
  const momopay = paiementMomoDeLaMaison(resteXof);
  const tg = paiementTapGoDeLaPiece(resteXof, reglages);
  if (!tg) return { qr: momopay.qr, code: momopay.code };
  return {
    genre: 'tapgo',
    qr: tg.qr,
    codeDit: `${fmtMoney(tg.totalXof, 'XOF')}${tg.fraisXof > 0 ? ' frais compris' : ''}`,
    code: tg.code,
  };
}

/** LE FOYER SUR LE PAPIER DES FACTURES — 28 octobre 2026. « La facture du
    récapitulatif du foyer doit être pareille que les factures PDF : même
    schéma, mêmes couleurs, pas de différence avec le code QR » (Yéman).

    Le récapitulatif (l'écran des Factures) et la facture du foyer (l'envoi
    WhatsApp) sortent de ce seul constructeur, sur le papier des factures :
    une ligne par facture, au nom de la tête soignée, avec sa date et son
    numéro ; ses prestations dessous, chacune à son prix, et la remise s'il y
    en a. Depuis le 2 novembre 2026, la ligne porte le prix de sa facture, le
    total la somme des factures, puis l'avance reçue et le reste à régler,
    celui que le QR et le code font payer. */
export function pdfDuFoyer(o: {
  pieces: readonly Invoice[];
  titre: string;
  nomDuFichier: string;
  /** Le jour du papier. */
  jourIso: string;
  client: { name: string; phone?: string };
  /** La ligne sous le verrou, comme sur la facture (« Suru-Lere · l'art de la couronne »). */
  houseSub?: string;
  /** Le nom de la tête soignée d'une pièce. */
  nomDe: (p: Invoice) => string;
  /** Le jour du rituel d'une pièce (sa date, par défaut). */
  jourDe?: (p: Invoice) => string;
  /** Ce que contient une ligne de forfait (`contenuDeLaLigne`) : c'est ce
      papier-là que le parent lit avant de payer. */
  contenuDe?: (p: Invoice, l: InvoiceLine) => string[];
  fmt: (n: number) => string;
  reglages: ReglagesMndPay | undefined;
  note: string;
}): InvoicePdfData {
  /* LA LIGNE DIT CE QUE VAUT LA FACTURE, LES TOTAUX DISENT L'ARGENT — 2 novembre
     2026 : « pourquoi le prix unitaire est 30 000, total 10 000 ? Il faut me
     rendre cette ligne claire » (Yéman). Chaque ligne porte le prix de sa
     facture des deux côtés ; l'avance et le reste se lisent sous le total :
     60 000 F, avance reçue − 40 000 F, reste à régler 20 000 F. */
  const totalXof = o.pieces.reduce((n, p) => n + invoiceTotal(p), 0);
  const resteXof = o.pieces.reduce((n, p) => n + invoiceResteXof(p), 0);
  const avanceXof = totalXof - resteXof;
  /* PAR MOMOPAY, FRAIS COMPRIS (2 novembre 2026, au sélecteur) : le reste à
     régler ne bouge pas ; le code et le montant sous le QR portent les 1,2 %
     que MTN prend à la Maison. Payé en espèces, la cliente doit le reste. */
  const parMomo = montantMomopayFraisCompris(resteXof);
  const momopay = paiementMomoDeLaMaison(parMomo);
  return {
    kind: 'releve',
    titre: o.titre,
    nomDuFichier: o.nomDuFichier,
    number: `${o.jourIso.replace(/-/g, '')}-${(o.client.phone ?? '').replace(/\D/g, '').slice(-4)}`,
    houseName: maisonNom(),
    ...(o.houseSub ? { houseSub: o.houseSub } : {}),
    date: fmtDateFr(o.jourIso),
    clientName: o.client.name,
    ...(new Set(o.pieces.map((p) => p.forClientId ?? p.clientId)).size > 1 ? { clientLabel: 'CLIENTES' } : {}),
    clientPhone: o.client.phone,
    lines: o.pieces.map((p) => {
      const detail = p.lines.flatMap((l) => [
        `${l.qty > 1 ? `${l.label} ×${l.qty}` : l.label} · ${o.fmt(Math.round(ligneNetXof(l)))}`,
        ...(o.contenuDe ? o.contenuDe(p, l).map((t) => `dont ${t}`) : []),
      ]);
      const remise = Math.round(p.lines.reduce((s, l) => s + ligneNetXof(l), 0)) - invoiceTotal(p);
      if (remise > 0) detail.push(`Remise · − ${o.fmt(remise)}`);
      return {
        label: `${o.nomDe(p)} · ${fmtDateFr(o.jourDe ? o.jourDe(p) : p.date)} · ${p.number}`,
        qty: 1,
        unit: o.fmt(invoiceTotal(p)),
        total: o.fmt(invoiceTotal(p)),
        detail,
      };
    }),
    subtotal: o.fmt(totalXof),
    total: o.fmt(totalXof),
    ...(avanceXof > 0 ? { deposit: `− ${o.fmt(avanceXof)}`, depositLabel: avanceRecueLe(o.pieces) } : {}),
    reste: o.fmt(resteXof),
    note: o.note,
    /* LE CODE MOMO DE LA MAISON, celui que le mot cite (2 novembre 2026) : un seul
       code sur le papier, *880*41*909099*montant#, montant compris. */
    ...(resteXof > 0 ? { momo: { qr: momopay.qr, code: momopay.code, codeDit: `${o.fmt(parMomo)}, frais MoMo ${String(TAUX_MOMOPAY_PCT).replace('.', ',')} % compris` } } : {}),
    legal: maisonRaisonDuPdfAu(o.jourIso),
  };
}

/** De quoi retrouver le contenu d'une ligne qui n'en porte pas (voir
    `contenuDUneLigne`) : le catalogue, les contrats, les formules, l'argent. */
export type SourcesDuContenu = {
  services: readonly Service[];
  abonnes: readonly Subscriber[];
  formules: readonly Plan[];
  fmt: (x: number) => string;
  nomDuService: (id: string) => string;
};

/** CE QUE CONTIENT UNE LIGNE, sans prix en face : ce qu'elle porte (`detail`),
    sinon le forfait du même nom, sinon l'abonnement né de cette pièce.
    Toujours un tableau de chaînes, quoi qu'ait écrit la base. Pure : c'est
    elle que le banc éprouve ; le crochet `useLaPieceEnPdf` lui tend ses
    magasins. */
export const contenuDUneLigne = (piece: Invoice, l: InvoiceLine, s: SourcesDuContenu): string[] => {
  const porte = detailPorte(l.detail);
  if (porte.length > 0) return porte;
  /* UN FORFAIT ÉMIS AVANT LE 4 SEPTEMBRE NE PORTE RIEN. On retrouve son
     contenu par la prestation qui porte le même nom, faute de mieux, et
     jamais à la place de ce qui est écrit. */
  const forfait = s.services.find((sv) => sv.name === l.label && (sv.includes?.length ?? 0) > 0);
  /* LE PRIX DE LA LIGNE, pas celui du catalogue d'aujourd'hui : c'est déjà la
     règle du prix d'époque, et le PACK Kids a maintenant deux prix. */
  if (forfait) return detailPorte(detailDuForfait(forfait, s.services, s.fmt, l.unitXof));
  const abo = s.abonnes.find((a) => a.invoiceId === piece.id);
  if (!abo || piece.lines.length !== 1) return [];
  return detailPorte(libellesInclus(abo, s.formules.find((f) => f.id === abo.planId), s.nomDuService));
};

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
  /* La règle est dans `contenuDUneLigne` (pure, éprouvée au banc) ; ici,
     seulement les magasins qu'elle lit. */
  const contenuDeLaLigne = (piece: Invoice, l: InvoiceLine): string[] =>
    contenuDUneLigne(piece, l, { services, abonnes, formules, fmt: (x) => fmtMoney(x, currency), nomDuService });
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
  /** Sur la pièce, tout le prénom composé (7 novembre 2026) : « Pour Anne Marie, ». */
  const prenomOf = (d: Invoice) => prenomDUsage(clientOf(d), clientNameOf(d));
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

  /* Le mot du Maître par défaut, pour un document donné : la même phrase que
     le PDF (motDuPapierParDefaut, 7 novembre 2026). */
  const defaultNoteFor = (d: Invoice) => motDuPapierParDefaut(appelOf(d), d.master, branch.masters[0]);

  /** La ligne sous le verrou : la même sur la facture et sur le papier du foyer. */
  const sousLeVerrou = ligneSousLeVerrou(branch.city);

  /* Construit les données du vrai PDF de marque à partir d'un document.
     LA RÈGLE EST DANS `donneesDuPdfDeLaPiece` (7 novembre 2026, pure : le
     site public construit la même facture pour un rendez-vous soldé) ; ici,
     seulement ce que les magasins lui tendent. Le reste dû est le même que
     celui que la règle lit (`invoiceResteXof`). */
  const buildPdfData = (d: Invoice): InvoicePdfData => donneesDuPdfDeLaPiece(d, {
    maison: branch.name,
    sousLeVerrou,
    devise: currency,
    legal: maisonRaisonDuPdfAu(d.date),
    nomPourLePdf: clientNameForPdf(d),
    payeuse: payeurAutreQue(d),
    telephone: clientOf(d)?.phone,
    appel: appelOf(d),
    maitreDeRepli: branch.masters[0],
    momoPour: () => paiementDeLaPiece(invoiceResteXof(d), reglagesMnd),
    contenuDeLaLigne,
  });

  return {
    payeurDe, clientOf, clientNameOf, prenomOf, appelOf, payeurAutreQue, clientNameForPdf,
    defaultNoteFor, contenuDeLaLigne, buildPdfData, reglagesMnd, sousLeVerrou,
  };
}
