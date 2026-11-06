/* LA FICHE DE CONGÉS, EN PDF · 6 novembre 2026.

   « Je dois pouvoir générer une fiche PDF PRO quand je pose les congés du
   staff » (Yéman). Maquette 1Jc1m2bUp8rovJ5tmejBAo. Le dessin reprend les
   fiches de janvier 2027 qu'elle a reçues (Drive « Planning janvier 2027 ») :
   le monogramme et MAISON MND, le prénom, chaque congé et sa reprise dans
   deux cartes (cuivre pâle, indigo pâle), numérotés, « puis » entre deux,
   le total, ce qui reste du droit, « Brice et Yéman » et la place de sa
   signature.

   jsPDF le dessine sans boîte d'impression, comme les lettres du prêt : il se
   range au coffre. Le texte vient de `ficheDeConges` (shared/vacances-pur) :
   ici, seulement la mise en page. UNE PAGE : au-delà de quatre congés, les
   cartes se resserrent, elles ne débordent pas. */
import { ENCRES_PDF, espacesNormalises, monogrammeDeLaMaison, pdfSafe } from '../../../../../shared/pdf';
import type { FicheDeConges } from '../../../../../shared/vacances-pur';

const LARGEUR = 210;
const HAUTEUR = 297;
const MARGE = 18;
const CUIVRE_PALE = '#F3E1C8';
const INDIGO_PALE = '#E7E8F2';

type Doc = any; // jsPDF, chargé à la demande

const espace = (s: string) => s.split('').join(' ');

export async function ficheDeCongesPdf(f: FicheDeConges, o?: { signataires?: string; maison?: string }): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc: Doc = new jsPDF({ unit: 'mm', format: 'a4' });
  espacesNormalises(doc);
  const mono = await monogrammeDeLaMaison();
  const maison = (o?.maison ?? 'Maison MND').trim() || 'Maison MND';
  const signataires = (o?.signataires ?? 'Brice et Yéman').trim();

  /* ── L'en-tête ── */
  let y = 22;
  if (mono) { try { doc.addImage(mono, 'PNG', MARGE, y - 10, 14, 14, undefined, 'FAST'); } catch { /* image indisponible */ } }
  const g = mono ? MARGE + 18 : MARGE;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(ENCRES_PDF.INDIGO);
  doc.text(pdfSafe(espace('MAISON')), g, y - 5);
  doc.setFont('times', 'normal'); doc.setFontSize(20);
  doc.text(pdfSafe(espace(maison.replace(/^Maison\s+/i, '').toUpperCase())), g, y + 2);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(ENCRES_PDF.COPPER);
  doc.text(pdfSafe(f.sourcil.toUpperCase()), LARGEUR - MARGE, y - 2, { align: 'right' });
  y += 8;
  doc.setDrawColor(ENCRES_PDF.COPPER); doc.setLineWidth(0.35); doc.line(MARGE, y, LARGEUR - MARGE, y);

  /* ── Le prénom ── */
  y += 12;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(ENCRES_PDF.COPPER);
  doc.text(pdfSafe(f.titre.toUpperCase()), MARGE, y);
  y += 13;
  doc.setFont('times', 'normal'); doc.setFontSize(34); doc.setTextColor(ENCRES_PDF.INDIGO);
  doc.text(pdfSafe(f.prenom), MARGE, y);
  y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(ENCRES_PDF.COPPER);
  doc.text(pdfSafe(f.lead), MARGE, y);
  y += 8;

  /* ── Les congés ── */
  const n = f.sections.length;
  const serre = n > 4;
  const hCarte = serre ? 22 : 30;
  const pas = serre ? hCarte + 10 : hCarte + 18;
  const lCarte = (LARGEUR - 2 * MARGE - 6 - 6) * 0.58;
  const xReprise = MARGE + 6 + lCarte + 6;
  const lReprise = LARGEUR - MARGE - xReprise;
  f.sections.forEach((s, i) => {
    /* Le numéro et le titre */
    doc.setFillColor(ENCRES_PDF.INDIGO); doc.circle(MARGE + 9, y, 3.2, 'F');
    doc.setFont('times', 'bold'); doc.setFontSize(9); doc.setTextColor('#FFFFFF');
    doc.text(String(s.numero), MARGE + 9, y + 1.2, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(ENCRES_PDF.INDIGO);
    doc.text(pdfSafe(s.titre.toUpperCase()), MARGE + 16, y + 1.2);
    const yc = y + 5;
    /* La règle de cuivre à gauche */
    doc.setFillColor(ENCRES_PDF.COPPER); doc.rect(MARGE, y - 3, 1.1, hCarte + 8, 'F');
    /* La carte du congé */
    doc.setFillColor(CUIVRE_PALE); doc.setDrawColor(ENCRES_PDF.COPPER); doc.setLineWidth(0.3);
    doc.roundedRect(MARGE + 6, yc, lCarte, hCarte, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(ENCRES_PDF.SOFT);
    doc.text(pdfSafe(s.libelleConge.toUpperCase()), MARGE + 10, yc + 5.5);
    doc.setFont('times', 'normal'); doc.setFontSize(serre ? 11 : 13.5); doc.setTextColor(ENCRES_PDF.INDIGO);
    const lignes = doc.splitTextToSize(pdfSafe(`du ${s.du} au ${s.au} inclus`), lCarte - 8);
    doc.text(lignes.slice(0, 3), MARGE + 10, yc + (serre ? 10.5 : 12));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(serre ? 7.5 : 8.5); doc.setTextColor(ENCRES_PDF.COPPER);
    doc.text(pdfSafe(`soit ${s.jours} jour${s.jours > 1 ? 's' : ''} de congé${s.note ? ` · ${s.note}` : ''}`), MARGE + 10, yc + hCarte - 3.5);
    /* La carte de la reprise */
    doc.setFillColor(INDIGO_PALE); doc.setDrawColor(ENCRES_PDF.INDIGO);
    doc.roundedRect(xReprise, yc, lReprise, hCarte, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(ENCRES_PDF.SOFT);
    doc.text(pdfSafe(s.libelleReprise.toUpperCase()), xReprise + 4, yc + 5.5);
    doc.setFont('times', 'normal'); doc.setFontSize(serre ? 11 : 13.5); doc.setTextColor(ENCRES_PDF.INDIGO);
    doc.text(doc.splitTextToSize(pdfSafe(s.reprise), lReprise - 8).slice(0, 3), xReprise + 4, yc + (serre ? 10.5 : 12));
    y += pas;
    /* « puis » entre deux congés */
    if (i < n - 1) {
      const yp = y - (serre ? 4 : 7);
      doc.setDrawColor(ENCRES_PDF.COPPER); doc.setLineWidth(0.2);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(MARGE, yp, LARGEUR / 2 - 8, yp); doc.line(LARGEUR / 2 + 8, yp, LARGEUR - MARGE, yp);
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(ENCRES_PDF.COPPER);
      doc.text('P U I S', LARGEUR / 2, yp + 1, { align: 'center' });
    }
  });

  /* ── Le total, le reste ── */
  y += 2;
  doc.setDrawColor(ENCRES_PDF.COPPER); doc.setLineWidth(0.35); doc.line(MARGE, y, LARGEUR - MARGE, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(ENCRES_PDF.INDIGO);
  doc.text(pdfSafe(f.libelleTotal.toUpperCase()), MARGE + 2, y + 8.5);
  doc.setFont('times', 'normal'); doc.setFontSize(18);
  doc.text(pdfSafe(f.total), LARGEUR - MARGE - 2, y + 9, { align: 'right' });
  y += 14;
  doc.line(MARGE, y, LARGEUR - MARGE, y);
  y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(ENCRES_PDF.INK);
  if (f.reste) { doc.text(pdfSafe(f.reste), MARGE, y); y += 5; }
  doc.text(pdfSafe('En dehors de ces dates, vos horaires habituels ne changent pas.'), MARGE, y);

  /* ── Le pied : la Maison et la signature ── */
  const yp = HAUTEUR - 36;
  doc.setDrawColor(ENCRES_PDF.FILET); doc.setLineWidth(0.3); doc.line(MARGE, yp, LARGEUR - MARGE, yp);
  doc.setFont('times', 'italic'); doc.setFontSize(14); doc.setTextColor(ENCRES_PDF.INDIGO);
  doc.text(pdfSafe(signataires), MARGE, yp + 9);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(ENCRES_PDF.COPPER);
  doc.text(pdfSafe(espace(maison.toUpperCase())), MARGE, yp + 15);
  doc.setFontSize(8.5); doc.setTextColor(ENCRES_PDF.INK);
  doc.text(pdfSafe('Remis le ............................................'), LARGEUR - MARGE, yp + 9, { align: 'right' });
  doc.text(pdfSafe('Signature ............................................'), LARGEUR - MARGE, yp + 16, { align: 'right' });

  return doc.output('blob') as Blob;
}
