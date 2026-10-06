import { ENCRES_PDF, espacesNormalises, monogrammeDeLaMaison, pdfSafe, pieDeLaMaison } from './pdf';
import { dateEnLettres, type ElementAAssembler, type Lettre, type LigneDeBordereau } from './bourse';
import type { PieceChargee } from './bourse-coffre';

/* ══ LES PAPIERS DU DOSSIER DE BOURSE — 6 octobre 2026 ═══════════════════

   Deux outils, chacun à sa place. jsPDF ÉCRIT : la lettre, les attestations,
   les quittances, le bordereau, en A4, comme toutes les pièces de la Maison
   (`pdf.ts`). pdf-lib ASSEMBLE : il recoud dans un seul fichier ce que jsPDF
   a écrit et ce que le coffre garde, PDF ou photos, dans l'ordre de la liste
   de l'Ambassade. jsPDF ne sait pas ouvrir un PDF existant ; pdf-lib ne sait
   pas composer un texte en français avec ses polices. Les deux se chargent à
   la demande : un Trône qui n'ouvre jamais ce dossier ne les télécharge pas.

   LA DEVISE NE SIGNE QUE CE QUE LA MAISON SIGNE. Une lettre de la famille à
   l'Ambassade n'est pas un papier de la Maison : pas de monogramme, pas de
   pied. L'attestation que la Maison délivre comme employeur, elle, les porte. */

const { INDIGO, INK, SOFT, FILET } = ENCRES_PDF;
const W = 210, H = 297, M = 22;

type Doc = any;

async function nouveauDoc(): Promise<Doc> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  espacesNormalises(doc);
  return doc;
}

/** Écrit un paragraphe justifié à gauche, renvoie la hauteur consommée. */
function paragraphe(doc: Doc, texte: string, x: number, y: number, largeur: number, o: { taille?: number; couleur?: string; interligne?: number; gras?: boolean } = {}): number {
  const taille = o.taille ?? 11;
  doc.setFont('helvetica', o.gras ? 'bold' : 'normal');
  doc.setFontSize(taille);
  doc.setTextColor(o.couleur ?? INK);
  const lignes: string[] = doc.splitTextToSize(pdfSafe(texte), largeur);
  const pas = (o.interligne ?? 1.45) * taille * 0.3528;
  lignes.forEach((l, i) => doc.text(l, x, y + i * pas));
  return lignes.length * pas;
}

/** LA LETTRE EN A4. Une page le plus souvent ; la seconde s'ouvre d'elle-même
    quand le texte déborde, la signature ne se sépare jamais du dernier
    paragraphe. */
export async function lettrePdf(l: Lettre): Promise<ArrayBuffer> {
  const doc = await nouveauDoc();
  let y = 24;
  const largeur = W - 2 * M;
  const sautSi = (besoin: number) => { if (y + besoin > H - 28) { doc.addPage(); y = 24; } };

  if (l.deLaMaison) {
    const mono = await monogrammeDeLaMaison();
    if (mono) { try { doc.addImage(mono, 'PNG', M, y - 6, 14, 14, undefined, 'FAST'); } catch { /* indisponible */ } }
    const x = mono ? M + 18 : M;
    l.entete.forEach((ligne, i) => { y += paragraphe(doc, ligne, x, y, largeur - 18, { taille: i === 0 ? 13 : 9.5, couleur: i === 0 ? INDIGO : SOFT, gras: i === 0 }); });
    y += 2;
    doc.setDrawColor(ENCRES_PDF.COPPER); doc.setLineWidth(0.5); doc.line(M, y, W - M, y);
    y += 8;
  } else {
    l.entete.forEach((ligne, i) => { y += paragraphe(doc, ligne, M, y, largeur, { taille: i === 0 ? 11.5 : 10, gras: i === 0, couleur: i === 0 ? INDIGO : INK, interligne: 1.3 }); });
    y += 4;
  }
  if (l.destinataire?.length) {
    const xd = W / 2 + 10;
    l.destinataire.forEach((ligne) => { y += paragraphe(doc, ligne, xd, y, W - M - xd, { taille: 10, interligne: 1.3 }); });
    y += 4;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(INK);
  doc.text(pdfSafe(l.lieuDate), W - M, y, { align: 'right' });
  y += 12;
  if (l.titre) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(INDIGO);
    doc.text(pdfSafe(l.titre.toUpperCase()), W / 2, y, { align: 'center' });
    y += 8;
  }
  if (l.objet) { y += paragraphe(doc, l.objet, M, y, largeur, { taille: 11, gras: !l.titre, couleur: l.titre ? SOFT : INK }); y += 4; }
  for (const p of l.paragraphes) {
    const h = paragraphe(doc, p, M, -1000, largeur); // mesure à blanc
    sautSi(h + 4);
    y += paragraphe(doc, p, M, y, largeur) + 3.5;
  }
  sautSi(34);
  y += 18;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(SOFT);
  const sigs = l.signatures.filter(Boolean);
  if (sigs.length === 1) doc.text(pdfSafe(sigs[0]), W - M, y, { align: 'right' });
  else sigs.forEach((s, i) => doc.text(pdfSafe(s), i === 0 ? M : W - M, y, { align: i === 0 ? 'left' : 'right' }));
  if (l.deLaMaison) await pieDeLaMaison(doc, W, H - 14);
  return doc.output('arraybuffer');
}

/** LE BORDEREAU, en tête du dossier : l'index que la section consulaire lit en premier. */
export async function bordereauPdf(o: { titre: string; sousTitre: string; lignes: LigneDeBordereau[]; date: string }): Promise<ArrayBuffer> {
  const doc = await nouveauDoc();
  let y = 26;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(ENCRES_PDF.COPPER);
  doc.text(pdfSafe(o.sousTitre.toUpperCase()), M, y); y += 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(INDIGO);
  doc.text(pdfSafe(o.titre), M, y); y += 10;
  y += paragraphe(doc, `Ce bordereau ouvre le dossier et en est l’index : les pièces suivent dans cet ordre, numérotées. Établi le ${dateEnLettres(o.date)}.`, M, y, W - 2 * M, { taille: 10, couleur: SOFT }) + 6;
  const cols = [M, M + 14, W - M - 44];
  doc.setDrawColor(INDIGO); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(INDIGO);
  doc.text('N°', cols[0], y); doc.text('PIÈCE', cols[1], y); doc.text('ÉTAT', cols[2], y); y += 3;
  doc.setDrawColor(FILET); doc.line(M, y, W - M, y); y += 5;
  for (const l of o.lignes) {
    if (y > H - 30) { doc.addPage(); y = 24; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(ENCRES_PDF.COPPER); doc.text(l.n, cols[0], y);
    const h = paragraphe(doc, l.piece, cols[1], y, cols[2] - cols[1] - 6, { taille: 10 });
    paragraphe(doc, l.etat, cols[2], y, W - M - cols[2], { taille: 9.5, couleur: SOFT });
    y += Math.max(h, 5) + 1.5;
    doc.setDrawColor(FILET); doc.line(M, y, W - M, y); y += 4.5;
  }
  return doc.output('arraybuffer');
}

/* ── L'assemblage ───────────────────────────────────────────────────────── */
export type SourceAssemblee =
  | { element: ElementAAssembler; pdf: ArrayBuffer }
  | { element: ElementAAssembler; piece: PieceChargee; nom: string };

/** RECOUDRE le dossier en un seul PDF, dans l'ordre reçu. Une pièce qui ne
    se lit pas est remplacée par une page qui le dit : le dossier reste
    complet dans sa numérotation, et l'absence se voit au lieu de se perdre. */
export async function assembleLeDossier(sources: readonly SourceAssemblee[]): Promise<{ octets: Uint8Array; pages: number; manquees: string[] }> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const sortie = await PDFDocument.create();
  const police = await sortie.embedFont(StandardFonts.Helvetica);
  const manquees: string[] = [];
  const pageQuiDit = (texte: string) => {
    const page = sortie.addPage([595.28, 841.89]);
    page.drawText(texte, { x: 60, y: 760, size: 12, font: police, color: rgb(0.27, 0.27, 0.31), maxWidth: 475, lineHeight: 16 });
  };
  for (const s of sources) {
    try {
      if ('pdf' in s) {
        const d = await PDFDocument.load(s.pdf);
        (await sortie.copyPages(d, d.getPageIndices())).forEach((p) => sortie.addPage(p));
      } else if (s.piece?.type === 'pdf') {
        const d = await PDFDocument.load(s.piece.octets, { ignoreEncryption: true });
        (await sortie.copyPages(d, d.getPageIndices())).forEach((p) => sortie.addPage(p));
      } else if (s.piece?.type === 'image') {
        const img = await sortie.embedJpg(s.piece.donnees);
        const page = sortie.addPage([595.28, 841.89]);
        const marge = 36, lmax = 595.28 - 2 * marge, hmax = 841.89 - 2 * marge;
        const echelle = Math.min(lmax / img.width, hmax / img.height);
        const l = img.width * echelle, h = img.height * echelle;
        page.drawImage(img, { x: (595.28 - l) / 2, y: (841.89 - h) / 2, width: l, height: h });
      } else {
        manquees.push(s.nom);
        pageQuiDit(`Piece non lisible depuis le coffre : ${s.nom}. A joindre a la main.`);
      }
    } catch (e) {
      const nom = 'nom' in s ? s.nom : 'document redige';
      console.warn('[mnd-bourse] assemblage :', nom, e);
      manquees.push(nom);
      pageQuiDit(`Piece non lisible : ${nom}. A joindre a la main.`);
    }
  }
  return { octets: await sortie.save(), pages: sortie.getPageCount(), manquees };
}

/** Déposer un fichier sur le poste. */
export function telechargeLeFichier(octets: ArrayBuffer | Uint8Array, nom: string, type = 'application/pdf'): void {
  const blob = new Blob([octets as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
