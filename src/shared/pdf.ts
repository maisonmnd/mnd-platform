/* Génération de vrais PDF côté client (jsPDF, chargé à la demande).
   Utilisé pour les factures/devis, reçus de caisse et résumés de consultation.
   Le fichier est téléchargé ; l'envoi WhatsApp d'une PIÈCE JOINTE nécessite
   l'API WhatsApp Business (serveur) — ici on télécharge le PDF puis on ouvre le
   chat pré-rempli pour que l'utilisateur joigne le fichier en un geste. */

import { maisonNom } from './identite';

const INDIGO = '#1E2150';
const COPPER = '#B97A4A';
const INK = '#14141B';
const SOFT = '#6b6b73';

/* Les polices standard du PDF (WinAnsi) n'ont pas les espaces fines / insécables —
   dont le séparateur de milliers fr-FR (U+202F) que produit `toLocaleString`. jsPDF
   les rend alors comme un glyphe parasite (« 14 / 000 F »). On les remplace par une
   espace normale sur CHAQUE texte tracé, pour tous les documents. */
const PDF_BAD_CODES = [0x00a0, 0x202f, 0x2007, 0x2008, 0x2009, 0x2060, 0x3000, 0xfeff];
const PDF_BAD_SPACES = new RegExp('[' + PDF_BAD_CODES.map((c) => String.fromCharCode(c)).join('') + ']', 'g');

/* LES LETTRES FON N'EXISTENT PAS EN WinAnsi — et jsPDF ne dégrade pas un
   caractère, il dégrade LA LIGNE : un seul « Ɔ » dans « KLƆKLƆ™ » bascule tout
   le texte en 16 bits et l'objet d'un reçu sortait en
   « &K&L&†&K&L&†&™& » (11 août). Sur le papier, on translittère : KLƆKLƆ™
   s'imprime KLOKLO™ — lisible et assumé, la graphie fon vit à l'écran. */
const PDF_TRANSLIT: Record<string, string> = {
  'Ɔ': 'O', 'ɔ': 'o', 'Ɖ': 'D', 'ɖ': 'd', 'Ɛ': 'E', 'ɛ': 'e',
  'Ŋ': 'N', 'ŋ': 'n', 'Ʋ': 'V', 'ʋ': 'v',
  /* Ponctuation typographique hors table : le signe moins de la remise
     (« − 18 000 F ») sortait en « ? » — un tiret dit la même chose. */
  '−': '-', '‑': '-',
};
/* Ce que WinAnsi sait tracer : Latin-1 entier, plus ses quelques extras. */
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const winAnsiOk = (ch: string): boolean => ch.charCodeAt(0) <= 0xff || WINANSI_EXTRA.includes(ch);

function pdfSafe(s: string): string {
  let t = s.normalize('NFC').replace(PDF_BAD_SPACES, ' ');
  /* Translittérer PUIS recomposer : « ɔ́ » (ɔ + accent flottant) devient
     « o + accent », que NFC referme en « ó » — un vrai glyphe WinAnsi. */
  t = t.replace(/[ƆɔƉɖƐɛŊŋƲʋ−‑]/g, (c) => PDF_TRANSLIT[c]).normalize('NFC');
  /* Dernier filet, caractère par caractère : perdre l'accent plutôt que la
     ligne ; « ? » quand on ne sait vraiment pas — une perte qui se voit vaut
     mieux qu'une ligne entière de charabia. */
  return [...t].map((ch) => {
    if (winAnsiOk(ch)) return ch;
    const bare = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
    if (bare === '') return '';
    return [...bare].every(winAnsiOk) ? bare : '?';
  }).join('');
}

function normalizeSpaces(doc: { text: (...args: any[]) => any }): void {
  const orig = doc.text.bind(doc);
  const fix = (s: unknown) => (typeof s === 'string' ? pdfSafe(s) : s);
  doc.text = ((text: any, ...rest: any[]) =>
    orig(Array.isArray(text) ? text.map(fix) : fix(text), ...rest)) as any;
}

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
  /** LE RELEVÉ DE COMPTE (15 août) — ni une facture ni un devis : l'état de
      ce qu'une cliente doit, rituel par rituel. Même papier, même en-tête ;
      seuls le titre et le nom du fichier changent. */
  kind: 'facture' | 'devis' | 'releve';
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
  /** Pourboire remis avec le règlement — HORS total : il appartient aux
      maîtres, pas au chiffre de la Maison. Affiché pour que la pièce dise
      tout ce qui a été remis (demande de Yéman, 11 août). */
  tip?: string;
  payment?: string;
  status?: string;
  note?: string;
};

/** Construit et télécharge le PDF d'une facture / d'un devis. Renvoie le nom du fichier. */
export async function invoicePdf(d: InvoicePdfData): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  normalizeSpaces(doc);
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
  doc.text(d.kind === 'devis' ? 'DEVIS' : d.kind === 'releve' ? 'RELEVÉ DE COMPTE' : 'FACTURE', W - M, y, { align: 'right' });
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
  /* Le pourboire se dit APRÈS le total — il ne s'y additionne pas : c'est un
     merci aux mains, pas une ligne de la Maison. */
  if (d.tip) row('Pourboire — merci', d.tip, false, COPPER);
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

  const filename = `${d.kind === 'devis' ? 'Devis' : d.kind === 'releve' ? 'Releve' : 'Facture'}-${d.number}.pdf`;
  doc.save(filename);
  return filename;
}

export type ReceiptPdfData = {
  /** Numéro du reçu — dérivé de l'encaissement, donc reproductible. */
  number: string;
  houseName: string;
  houseSub?: string;
  date: string;
  clientName: string;
  /** Ce qui a été réglé, en clair. */
  label: string;
  /** Nature : Facture, Acompte, Formation… */
  kind: string;
  amount: string;
  method: string;
  cashbox?: string;
  /** Preuve d'origine : n° de facture, référence de transaction. */
  ref?: string;
  note?: string;
};

/** Reçu d'encaissement — la preuve que la Maison a reçu cette somme, ce jour-là.
    Format A5 paysage : un reçu n'est pas une facture, il tient sur une demi-page
    et se glisse dans un carnet. Télécharge le fichier, renvoie son nom. */
export async function receiptPdf(d: ReceiptPdfData): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  normalizeSpaces(doc);
  const W = 210;
  const M = 16;
  let y = 20;

  const seal = await loadSeal();
  if (seal) {
    try { doc.addImage(seal, 'PNG', M, 12, 11, 11); } catch { /* image indisponible */ }
  }
  const nameX = seal ? M + 14 : M;
  doc.setFont('times', 'normal');
  doc.setTextColor(INDIGO);
  doc.setFontSize(18);
  doc.text(d.houseName, nameX, y);
  if (d.houseSub) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(SOFT);
    doc.text(d.houseSub, nameX, y + 4.5);
  }
  doc.setFont('times', 'normal');
  doc.setTextColor(COPPER);
  doc.setFontSize(13);
  doc.text('REÇU', W - M, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(SOFT);
  doc.text(d.number, W - M, y + 5, { align: 'right' });
  doc.text(d.date, W - M, y + 9, { align: 'right' });

  y += 14;
  doc.setDrawColor(COPPER);
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(SOFT);
  doc.text('REÇU DE', M, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(INK);
  doc.text(d.clientName, M, y + 6);

  /* Le montant en grand : c'est la seule chose qu'on cherche des yeux sur un reçu. */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(SOFT);
  doc.text('LA SOMME DE', W - M, y, { align: 'right' });
  doc.setFont('times', 'normal');
  doc.setFontSize(24);
  doc.setTextColor(INDIGO);
  doc.text(d.amount, W - M, y + 9, { align: 'right' });

  y += 20;
  const row = (label: string, value?: string) => {
    if (!value) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(SOFT);
    doc.text(label, M, y);
    doc.setFontSize(9.5);
    doc.setTextColor(INK);
    doc.text(value, M + 34, y);
    y += 6;
  };
  row('Objet', d.label);
  row('Nature', d.kind);
  row('Moyen', d.method);
  row('Caisse', d.cashbox);
  row('Référence', d.ref);
  if (d.note) row('Note', d.note);

  doc.setDrawColor('#e3dacb');
  doc.setLineWidth(0.3);
  doc.line(M, 122, W - M, 122);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(SOFT);
  /* ⚠ Pas de devise en fon ici : les polices standard du PDF (WinAnsi) n'ont ni
     « ɔ » ni « ɖ » ni « ɛ » — jsPDF tracerait des glyphes parasites. La devise
     vit dans les messages et à l'écran, pas dans les documents imprimés. */
  doc.text(`Reçu émis par Le Trône · ${maisonNom()}`, W / 2, 128, { align: 'center' });

  const filename = `Recu-${d.number}.pdf`;
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
  normalizeSpaces(doc);
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
  /** Libellés surchargeables — pour réutiliser sur un reçu prestataire. */
  docLabel?: string; // défaut « BULLETIN DE PAIE »
  partyLabel?: string; // défaut « MAÎTRE »
  netLabel?: string; // défaut « NET À VERSER »
};

/** Bulletin de paie MND — en-tête au sceau, encadré NET, zone signature Gérant +
    tampon de la Maison + mention PAYÉ. Toutes les valeurs doivent être en ASCII
    (espaces simples) : le PDF n'affiche pas les espaces fins Unicode. */
export async function payslipPdf(d: PayslipData): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  normalizeSpaces(doc);
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
  doc.text(d.docLabel ?? 'BULLETIN DE PAIE', W - M, y - 1, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(SOFT);
  doc.text(d.period, W - M, y + 4.5, { align: 'right' });
  y += 12;
  doc.setDrawColor(COPPER); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
  y += 11;

  // — Salarié —
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(SOFT); doc.text(d.partyLabel ?? 'MAÎTRE', M, y);
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
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor('#C9A98A'); doc.text(d.netLabel ?? 'NET À VERSER', M + 7, y + 10.5);
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
  doc.text(`Document généré par Le Trône · ${maisonNom()}`, W / 2, 288, { align: 'center' });
  doc.save(d.filename);
  return d.filename;
}
