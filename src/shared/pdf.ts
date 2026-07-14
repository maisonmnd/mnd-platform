/* Génération de vrais PDF côté client (jsPDF, chargé à la demande).
   Utilisé pour les factures/devis, reçus de caisse et résumés de consultation.
   Le fichier est téléchargé ; l'envoi WhatsApp d'une PIÈCE JOINTE nécessite
   l'API WhatsApp Business (serveur) — ici on télécharge le PDF puis on ouvre le
   chat pré-rempli pour que l'utilisateur joigne le fichier en un geste. */

const INDIGO = '#1E2150';
const COPPER = '#B97A4A';
const INK = '#14141B';
const SOFT = '#6b6b73';

/** Charge le sceau MND (cuivre) en data-URL pour l'insérer dans le PDF. */
async function loadSeal(): Promise<string | null> {
  try {
    const url = import.meta.env.BASE_URL.replace(/\/$/, '') + '/assets/monograms/mono-copper.png';
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export type PdfLine = { label: string; qty: number; unit: string; total: string };

export type InvoicePdfData = {
  kind: 'facture' | 'devis';
  number: string;
  houseName: string;
  houseSub?: string;
  date: string;
  clientName: string;
  clientPhone?: string;
  master?: string;
  lines: PdfLine[];
  subtotal: string;
  discount?: string;
  total: string;
  deposit?: string;
  reste?: string;
  payment?: string;
  status?: string;
  note?: string;
};

/** Construit et télécharge le PDF d'une facture / d'un devis. Renvoie le nom du fichier. */
export async function invoicePdf(d: InvoicePdfData): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 18;
  let y = 22;

  // — Entête (sceau MND + nom de la Maison) —
  const seal = await loadSeal();
  if (seal) {
    try { doc.addImage(seal, 'PNG', M, 14, 13, 13); } catch { /* image indisponible */ }
  }
  const nameX = seal ? M + 16 : M;
  doc.setFont('times', 'normal');
  doc.setTextColor(INDIGO);
  doc.setFontSize(22);
  doc.text(d.houseName, nameX, y);
  if (d.houseSub) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(SOFT);
    doc.text(d.houseSub, nameX, y + 5);
  }
  // Titre document (droite)
  doc.setFont('times', 'normal');
  doc.setTextColor(COPPER);
  doc.setFontSize(15);
  doc.text(d.kind === 'devis' ? 'DEVIS' : 'FACTURE', W - M, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(SOFT);
  doc.text(d.number, W - M, y + 5.5, { align: 'right' });
  doc.text(d.date, W - M, y + 10, { align: 'right' });

  y += 16;
  doc.setDrawColor(COPPER);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 10;

  // — Cliente —
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(SOFT);
  doc.text('CLIENTE', M, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(INK);
  doc.text(d.clientName, M, y + 6);
  const cmeta = [d.clientPhone, d.master ? `Maître · ${d.master}` : ''].filter(Boolean).join('   ·   ');
  if (cmeta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(SOFT);
    doc.text(cmeta, M, y + 11);
  }
  y += 20;

  // — Tableau des lignes —
  doc.setFillColor(INDIGO);
  doc.rect(M, y, W - 2 * M, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor('#FFFFFF');
  doc.text('PRESTATION', M + 3, y + 5.4);
  doc.text('QTÉ', W - M - 58, y + 5.4, { align: 'right' });
  doc.text('P.U.', W - M - 32, y + 5.4, { align: 'right' });
  doc.text('TOTAL', W - M - 3, y + 5.4, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(INK);
  for (const l of d.lines) {
    y += 8;
    doc.text(l.label.slice(0, 60), M + 3, y - 1.5);
    doc.text(String(l.qty), W - M - 58, y - 1.5, { align: 'right' });
    doc.text(l.unit, W - M - 32, y - 1.5, { align: 'right' });
    doc.text(l.total, W - M - 3, y - 1.5, { align: 'right' });
    doc.setDrawColor('#e3dacb');
    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
  }

  // — Totaux —
  y += 10;
  const rx = W - M;
  const lx = W - M - 70;
  const row = (label: string, value: string, bold = false, color = INK) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(bold ? INDIGO : SOFT);
    doc.text(label, lx, y);
    doc.setTextColor(color);
    doc.text(value, rx, y, { align: 'right' });
    y += bold ? 8 : 6;
  };
  row('Sous-total', d.subtotal);
  if (d.discount) row('Remise', d.discount, false, COPPER);
  row('Total', d.total, true);
  if (d.deposit) row('Acompte', d.deposit, false, COPPER);
  if (d.reste) row('Reste à régler', d.reste);
  if (d.payment) row('Règlement', d.payment);
  if (d.status) row('Statut', d.status);

  // — Note —
  if (d.note) {
    y += 6;
    doc.setDrawColor(COPPER);
    doc.setLineWidth(0.4);
    doc.line(M, y, M + 24, y);
    y += 6;
    doc.setFont('times', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(INK);
    doc.text(doc.splitTextToSize(d.note, W - 2 * M), M, y);
  }

  // — Pied —
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(SOFT);
  doc.text('Le cheveu est une couronne. La Maison veille.', W / 2, 285, { align: 'center' });

  const filename = `${d.kind === 'devis' ? 'Devis' : 'Facture'}-${d.number}.pdf`;
  doc.save(filename);
  return filename;
}

export type SummarySection = { heading: string; rows: { label: string; value?: string }[] };

/** PDF générique — résumé de consultation, etc. Télécharge le fichier. */
export async function summaryPdf(o: {
  eyebrow?: string;
  title: string;
  houseName: string;
  meta?: string[];
  sections: SummarySection[];
  footer?: string;
  filename: string;
}): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 18;
  let y = 20;

  // Sceau MND centré + signature de la Maison
  const seal = await loadSeal();
  if (seal) {
    const s = 20;
    try { doc.addImage(seal, 'PNG', W / 2 - s / 2, y, s, s); } catch { /* image indisponible */ }
    y += s + 3;
    doc.setFont('times', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(COPPER);
    doc.text('MND', W / 2, y, { align: 'center' });
    y += 8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(SOFT);
  doc.text(o.houseName.toUpperCase(), M, y);
  if (o.eyebrow) {
    doc.setTextColor(COPPER);
    doc.text(o.eyebrow.toUpperCase(), W - M, y, { align: 'right' });
  }
  y += 8;
  doc.setFont('times', 'normal');
  doc.setFontSize(22);
  doc.setTextColor(INDIGO);
  doc.text(o.title, M, y);
  y += 4;
  if (o.meta?.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(SOFT);
    for (const m of o.meta) { y += 5.5; doc.text(m, M, y); }
  }
  y += 6;
  doc.setDrawColor(COPPER);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 10;

  for (const sec of o.sections) {
    if (y > 265) { doc.addPage(); y = 24; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(COPPER);
    doc.text(sec.heading.toUpperCase(), M, y);
    y += 6;
    doc.setTextColor(INK);
    for (const r of sec.rows) {
      if (y > 275) { doc.addPage(); y = 24; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(INK);
      const wrapped = doc.splitTextToSize(r.label, W - 2 * M - (r.value ? 50 : 0));
      doc.text(wrapped, M, y);
      if (r.value) {
        doc.setTextColor(SOFT);
        doc.text(r.value, W - M, y, { align: 'right' });
      }
      y += wrapped.length * 5 + 2;
    }
    y += 5;
  }

  if (o.footer) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(SOFT);
    doc.text(o.footer, W / 2, 285, { align: 'center' });
  }
  doc.save(o.filename);
  return o.filename;
}

/* ---------- Bulletin de paie (mise en page soignée + signature & tampon) ---------- */

export type PayslipRow = { label: string; value: string; strong?: boolean; sub?: boolean };
export type PayslipData = {
  houseName: string;
  houseSub?: string;
  employeeName: string;
  role?: string;
  period: string;
  rows: PayslipRow[];
  net: string;
  paid?: { line: string; by: string };
  gerantName?: string;
  filename: string;
};

/** Bulletin de paie MND — en-tête au sceau, encadré NET, zone signature Gérant +
    tampon de la Maison + mention PAYÉ. Toutes les valeurs doivent être en ASCII
    (espaces simples) : le PDF n'affiche pas les espaces fins Unicode. */
export async function payslipPdf(d: PayslipData): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 18;
  let y = 22;

  // — En-tête —
  const seal = await loadSeal();
  if (seal) { try { doc.addImage(seal, 'PNG', M, 14, 13, 13); } catch { /* indisponible */ } }
  const nameX = seal ? M + 16 : M;
  doc.setFont('times', 'normal'); doc.setTextColor(INDIGO); doc.setFontSize(20);
  doc.text(d.houseName, nameX, y);
  if (d.houseSub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(SOFT); doc.text(d.houseSub, nameX, y + 5); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(COPPER);
  doc.text('BULLETIN DE PAIE', W - M, y - 1, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(SOFT);
  doc.text(d.period, W - M, y + 4.5, { align: 'right' });
  y += 12;
  doc.setDrawColor(COPPER); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
  y += 11;

  // — Salarié —
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(SOFT); doc.text('MAÎTRE', M, y);
  doc.setFont('times', 'normal'); doc.setFontSize(17); doc.setTextColor(INK); doc.text(d.employeeName, M, y + 8);
  if (d.role) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(SOFT); doc.text(d.role, M, y + 13.5); }
  y += 22;

  // — Rémunération —
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(COPPER); doc.text('RÉMUNÉRATION', M, y); y += 8;
  for (const r of d.rows) {
    doc.setFont('helvetica', r.strong ? 'bold' : 'normal');
    doc.setFontSize(r.sub ? 9.5 : 10.5);
    doc.setTextColor(r.sub ? SOFT : INK);
    doc.text(r.label, M + (r.sub ? 4 : 0), y);
    doc.setTextColor(r.strong ? INDIGO : SOFT);
    doc.text(r.value, W - M, y, { align: 'right' });
    doc.setDrawColor(232); doc.setLineWidth(0.1); doc.line(M, y + 2.4, W - M, y + 2.4);
    y += r.sub ? 6 : 7.5;
  }
  y += 4;

  // — Encadré NET À VERSER —
  doc.setFillColor(INDIGO); doc.roundedRect(M, y, W - 2 * M, 17, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor('#C9A98A'); doc.text('NET À VERSER', M + 7, y + 10.5);
  doc.setFont('times', 'normal'); doc.setFontSize(19); doc.setTextColor('#FFFFFF'); doc.text(d.net, W - M - 7, y + 11.5, { align: 'right' });
  y += 26;

  // — Règlement —
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(COPPER); doc.text('RÈGLEMENT', M, y); y += 6.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK);
  doc.text(d.paid ? d.paid.line : 'En attente de règlement — non confirmé à ce jour.', M, y); y += 5.5;
  if (d.paid) { doc.setTextColor(SOFT); doc.setFontSize(9); doc.text(d.paid.by, M, y); }

  // — Zone de signatures (bas de page) —
  const zY = 238;
  doc.setDrawColor(210); doc.setLineWidth(0.2); doc.line(M, zY - 8, W - M, zY - 8);

  // Le Gérant (gauche)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(SOFT); doc.text('LE GÉRANT', M, zY);
  doc.setDrawColor(170); doc.setLineWidth(0.35); doc.line(M, zY + 22, M + 62, zY + 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(SOFT);
  doc.text(`Signature${d.gerantName ? ` · ${d.gerantName}` : ''}`, M, zY + 27);

  // Tampon de la Maison (droite) — emplacement réservé (double cercle cuivre)
  const cx = W - M - 22; const cy = zY + 13; const R = 17;
  doc.setDrawColor(COPPER); doc.setLineWidth(0.6); doc.circle(cx, cy, R, 'S'); doc.setLineWidth(0.3); doc.circle(cx, cy, R - 2.6, 'S');
  doc.setFont('times', 'normal'); doc.setFontSize(12); doc.setTextColor(COPPER); doc.text('MND', cx, cy + 0.5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.text('MAISON MND', cx, cy + 5, { align: 'center' });
  doc.setFontSize(7.5); doc.setTextColor(SOFT); doc.text('Tampon de la Maison', cx, zY, { align: 'center' });

  // Mention PAYÉ (centre) — cadre cuivre si réglé, sinon EN ATTENTE grisé
  const px = W / 2 - 20; const py = zY + 4;
  if (d.paid) {
    doc.setDrawColor(COPPER); doc.setLineWidth(0.9); doc.roundedRect(px, py, 40, 15, 2, 2, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(COPPER); doc.text('PAYÉ', px + 20, py + 10, { align: 'center' });
  } else {
    doc.setDrawColor(200); doc.setLineWidth(0.5); doc.roundedRect(px, py, 40, 15, 2, 2, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(SOFT); doc.text('EN ATTENTE', px + 20, py + 9.5, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(SOFT);
  doc.text('Document généré par Le Trône · Maison MND', W / 2, 288, { align: 'center' });
  doc.save(d.filename);
  return d.filename;
}
