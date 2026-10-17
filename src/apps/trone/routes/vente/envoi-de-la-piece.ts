import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients } from '../../../../shared/clients';
import { useSettings } from '../../../../shared/settings';
import { maisonNom } from '../../../../shared/identite';
import { invoiceResteXof, invoiceTotal, invoicesStore, quiEncaisse } from '../../../../shared/finance';
import { demandeLePaiement, mndPayOuvert, versionDeMndPay } from '../../../../shared/mnd-pay';
import { jourLocal, paiementTapGoDeLaPiece, saitLesFactures } from '../../../../shared/mnd-pay-pur';
import { envoieLeRecu } from '../../../../shared/recu-whatsapp';
import { envoieLaFactureARegler } from '../../../../shared/facture-whatsapp';
import { toast } from '../../../../ds/components';
import { useLaPieceEnPdf } from './pdf-de-la-piece';

/* ══ LA PIÈCE PART SEULE CHEZ ELLE — 17 octobre 2026 ═════════════════════
   « Cette facture doit aller instantanément chez le client » (Yéman). Deux
   moments, un seul chemin :
     · APRÈS UN RÈGLEMENT (encaisser le rituel) : le reçu, modèle
       `recu_de_paiement`, la facture en pièce jointe ;
     · UNE FACTURE À RÉGLER (honorer sans encaisser, au Carnet, au tableau de
       bord, à l'écran d'encaissement) : modèle `facture_du_rituel`.
   Dans les deux cas, LA DATE MÉTIER DÉCIDE : seulement pour l'argent reçu
   aujourd'hui, ou le rituel d'aujourd'hui. Un rattrapage (une année passée,
   un rituel d'hier honoré ce matin) ne réveille pas une cliente avec un
   vieux papier. Et avant le PDF, l'attente Tap & Go du reste (une par
   pièce, quarante-cinq jours, serveur 17-b), pour que le paiement par le QR
   revienne seul sur cette facture et sur son rendez-vous. */
export function useEnvoiDeLaPiece() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [settings] = useSettings();
  const { buildPdfData } = useLaPieceEnPdf();
  /* Le jour LOCAL (celui du comptoir), jamais celui de Greenwich. */
  const aujourdhui = () => jourLocal(new Date().toISOString());

  const preparer = async (pieceId: string) => {
    const piece = invoicesStore.get().find((i) => i.id === pieceId);
    if (!piece) return null;
    const payeuse = clients.find((c) => c.id === piece.clientId);
    const soignee = clients.find((c) => c.id === (piece.forClientId ?? piece.clientId));
    const destinataire = payeuse?.phone?.trim() ? payeuse : soignee;
    if (!destinataire?.phone?.trim()) { toast(`Facture ${piece.number} non envoyée : pas de numéro sur la fiche.`); return null; }
    const reste = invoiceResteXof(piece);
    if (reste > 0 && mndPayOuvert(settings.mndPay) && paiementTapGoDeLaPiece(reste, settings.mndPay) && saitLesFactures(await versionDeMndPay())) {
      const attente = await demandeLePaiement({
        branchId: branch.id, genre: 'lien', moyen: 'tapgo', montantXof: reste, pieceId: piece.id, pieceNumero: piece.number,
        clientId: destinataire.id, libelle: `${maisonNom()} · ${piece.number}`, reglages: settings.mndPay,
      });
      if (!attente.ok) console.warn('[envoi de la pièce] attente Tap & Go :', attente.erreur);
    }
    return { piece, destinataire };
  };

  const dit = (numero: string, r: { ok: true; enAttente?: true } | { ok: false; erreur: string }) => toast(r.ok
    ? (r.enAttente ? `Facture ${numero} gardée : elle partira sur son WhatsApp au retour du réseau.` : `Facture ${numero} envoyée sur son WhatsApp.`)
    : `Facture ${numero} non envoyée : ${r.erreur}`);

  /** Après un règlement reçu `jourDuPaiement` : seulement s'il est d'aujourd'hui. */
  const apresReglement = async (pieceId: string, montantXof: number, jourDuPaiement: string) => {
    if (jourDuPaiement !== aujourdhui() || !(montantXof > 0)) return;
    const p = await preparer(pieceId);
    if (!p) return;
    const r = await envoieLeRecu({
      client: { ...p.destinataire, branchId: p.destinataire.branchId }, pdf: buildPdfData(p.piece),
      montant: fmtMoney(montantXof, currency), jourIso: jourDuPaiement, parQui: quiEncaisse(),
    });
    dit(p.piece.number, r);
  };

  /** Une facture à régler, pour le rituel de `jourDuRituel` : seulement s'il est d'aujourd'hui. */
  const aRegler = async (pieceId: string, jourDuRituel: string) => {
    if (jourDuRituel !== aujourdhui()) return;
    const p = await preparer(pieceId);
    if (!p) return;
    const r = await envoieLaFactureARegler({
      client: { ...p.destinataire, branchId: p.destinataire.branchId }, pdf: buildPdfData(p.piece),
      numero: p.piece.number, montant: fmtMoney(invoiceTotal(p.piece), currency), jourIso: jourDuRituel, parQui: quiEncaisse(),
    });
    dit(p.piece.number, r);
  };

  return { apresReglement, aRegler };
}
