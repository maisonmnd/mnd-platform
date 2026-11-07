/* ══ LA PIÈCE EN PDF, UNE SEULE RÈGLE POUR DEUX PORTES — 7 novembre 2026 ══
   « Il faut avoir une autre façon d'écrire les rendez-vous qui sont déjà
   passés et qui sont déjà réglés, pouvoir télécharger le PDF » (Yéman, la
   page maisonmnd.com/rdv/). La facture que la cliente télécharge sur le
   site doit être LA MÊME que celle du Trône : le corps de `buildPdfData`
   (routes/vente/pdf-de-la-piece.ts) vit ici, pur, et les deux portes
   l'appellent. Le Trône lui tend ses magasins (la fiche, la branche, le
   catalogue, MND PAY) ; le site, ce que la fonction `terminer-et-regler`
   rend de la pièce soldée (billet-regle-pur.ts).

   PUR : ni magasin, ni synchronisation, ni identité de la Maison (le site
   public ne charge jamais la synchronisation). Ce que le crochet lisait
   dans les magasins arrive par le contexte. Le banc verifie-le-billet-regle
   rejoue l'ancien corps à côté de celui-ci sur des pièces fictives : la
   sortie doit être identique, au caractère près. */
import { fmtMoney } from './currency';
import { invoiceTotal, ligneNetXof, invoiceReglements, invoiceResteXof } from './finance-pur';
import type { Invoice, InvoiceLine } from './finance';
import type { InvoicePdfData } from './pdf';

/** LES REMISES DU PAPIER, CHACUNE À SA LIGNE — 23 octobre 2026. Le PDF
    additionnait en une seule « Remise » celles des lignes (la remise gamme
    comprise) et celle du code : la cliente lisait « ROSE15 » sur une somme
    qui touchait aussi ses produits. Séparées, chacune garde son nom, dans
    l'ordre d'`invoiceTotal`, et leur somme fait le sous-total moins le total.
    (Venue de pdf-de-la-piece.ts le 7 novembre 2026, qui la réexporte.) */
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

/** La date du papier, en toutes lettres et avec l'année : « 1ᵉʳ novembre 2026 ».
    (Venue de pdf-de-la-piece.ts le 7 novembre 2026, qui la réexporte.) */
export const fmtDateFr = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  const s = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return s.replace(/^1 /, '1ᵉʳ ');
};

/** CE QUE LA LIGNE PORTE, TOUJOURS EN TABLEAU — 31 octobre 2026.

    La pièce MND-2026-0165 (Carnet des Trois, ABO-2026-001, 100 000 F) a fait
    planter l'écran Factures : « .map is not a function ». Son `detail` était
    une CHAÎNE, « 3 × Resserrage · 2 × Lavage », pas un tableau : la fonction
    du serveur qui écrit la pièce au premier versement d'un abonnement
    (`verse_sur_l_abonnement`, migration 0138) agrégeait les prestations par
    `string_agg` dans un `text`, et `data jsonb` arrive au Trône tel quel.
    `l.detail?.length` était vrai sur une chaîne, l'écran lui appliquait
    `.map`, et la page tombait. La migration 0148 écrit désormais un tableau ;
    les pièces déjà en base, et toute forme inattendue à venir, passent ici :
    une chaîne non vide devient un tableau d'un élément, tout ce qui n'est
    ni chaîne ni tableau devient vide. L'écran ne tombe plus pour une pièce.
    (Venue de pdf-de-la-piece.ts le 7 novembre 2026, qui la réexporte.) */
export const detailPorte = (detail: unknown): string[] => {
  if (Array.isArray(detail)) {
    return detail.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  }
  if (typeof detail === 'string') {
    const t = detail.trim();
    return t ? [t] : [];
  }
  return [];
};

/** La ligne sous le verrou, la même sur la facture et sur le papier du
    foyer : la ville de la branche, puis « l'art de la couronne ». */
export const ligneSousLeVerrou = (ville: string | undefined): string | undefined =>
  (ville ? `${ville} · l'art de la couronne` : undefined);

/** Le mot du Maître par défaut, sous la pièce : l'appel de la cliente, puis
    la main qui a officié, sinon le premier maître de la branche, sinon la
    Maison. Le Trône (`defaultNoteFor`) et le site le lisent ici. */
export const motDuPapierParDefaut = (appel: string, master: string | undefined, maitreDeRepli: string | undefined): string =>
  `${appel}, ce fut un honneur de veiller sur votre couronne. Elle vous va à merveille.\n${master ?? maitreDeRepli ?? 'la Maison'}`;

/** CE QUE LE CROCHET DU TRÔNE LISAIT DANS SES MAGASINS, tendu à la règle. */
export type ContexteDuPdfDeLaPiece = {
  /** Le nom de la branche, en tête du papier. */
  maison: string;
  /** La ligne sous le verrou (« Cotonou · l'art de la couronne »). */
  sousLeVerrou?: string;
  /** La devise de la branche : chaque montant s'y dit. */
  devise: string;
  /** La ligne légale au pied (`maisonRaisonDuPdfAu` au Trône) : absente
      pour une pièce d'avant la bascule du 10 octobre 2026. */
  legal?: string;
  /** Le nom de la tête soignée, tel que le papier le porte (`clientNameForPdf`). */
  nomPourLePdf: string;
  /** Celle qui règle, seulement quand ce n'est pas la tête soignée. */
  payeuse?: string;
  telephone?: string;
  /** L'appel du mot par défaut (« Mme Awa », ou le prénom seul). */
  appel: string;
  /** Le premier maître de la branche, pour le mot par défaut. */
  maitreDeRepli?: string;
  /** De quoi payer le reste (le Trône : `paiementDeLaPiece`). Absent (le
      site, dont la pièce est soldée), le papier n'invite pas à payer. */
  momoPour?: (resteXof: number) => InvoicePdfData['momo'];
  /** Ce que contient une ligne, sans prix (`contenuDUneLigne` au Trône). */
  contenuDeLaLigne: (d: Invoice, l: InvoiceLine) => string[];
};

/** LES DONNÉES DU VRAI PDF DE MARQUE, à partir d'une pièce. Le corps de
    l'ancien `buildPdfData`, au caractère près. */
export function donneesDuPdfDeLaPiece(d: Invoice, ctx: ContexteDuPdfDeLaPiece): InvoicePdfData {
  const currency = ctx.devise;
  const gross = d.lines.reduce((s, l) => s + l.qty * l.unitXof, 0);
  const net = invoiceTotal(d);
  const disc = gross - net;
  return {
    kind: d.kind,
    number: d.number,
    houseName: ctx.maison,
    houseSub: ctx.sousLeVerrou,
    date: fmtDateFr(d.date),
    /* Le registre au pied du PDF (10 oct. 2026), pour une pièce datée de la
       bascule ou après : le PDF d'avant n'avait pas de ligne légale. */
    legal: ctx.legal,
    clientName: ctx.nomPourLePdf,
    ...(ctx.payeuse ? { payeurName: ctx.payeuse } : {}),
    clientPhone: ctx.telephone,
    master: d.master,
    /* DE QUOI PAYER — seulement s'il reste à régler : une facture soldée
       n'invite pas à payer. Un devis non plus : rien n'est dû avant l'accord.
       17 OCTOBRE 2026 : « corrige le code USSD avec celui du Tap & Go de
       FedaPay ; remets le bon QR avec le montant restant » (Yéman). Le code
       est celui de Tap & Go (*601*14*<code>*<total>#, tout réseau), le QR
       ouvre la page qui le compose, frais ajoutés pour la cliente (sa
       règle de MND PAY). L'ancien MoMoPay (ACIA1) ne reste qu'en repli,
       Tap & Go éteint. */
    momo: d.kind === 'facture' && invoiceResteXof(d) > 0 && ctx.momoPour
      ? ctx.momoPour(invoiceResteXof(d))
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
      const contenu = ctx.contenuDeLaLigne(d, l);
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
    note: d.note?.trim() || motDuPapierParDefaut(ctx.appel, d.master, ctx.maitreDeRepli),
  };
}
