/* LA FACTURE DU BILLET, TÉLÉCHARGÉE — 7 novembre 2026. « Pouvoir
   télécharger le PDF » d'un rendez-vous passé et réglé (Yéman, la page
   maisonmnd.com/rdv/). La règle du papier (shared/pdf-de-la-piece-pur.ts,
   celle du Trône) et son constructeur (shared/pdf.ts, jsPDF) ne se chargent
   qu'au toucher du bouton : la page du rendez-vous reste légère, et rien de
   la synchronisation du Trône ne vient avec eux (identite-du-papier.ts).
   Le fichier porte le nom qu'il a au Trône : « Facture-<numéro>.pdf ». */
import { papierDuBillet, type FactureDuBillet } from '../../shared/billet-regle-pur';

/** Construit et télécharge la facture d'un rendez-vous réglé ; rend le nom du fichier. */
export async function telechargeLaFactureDuBillet(f: FactureDuBillet): Promise<string> {
  const [regle, { invoicePdf }] = await Promise.all([import('../../shared/pdf-de-la-piece-pur'), import('../../shared/pdf')]);
  return invoicePdf(papierDuBillet(f, regle));
}
