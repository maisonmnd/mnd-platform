/* Génération de vrais PDF côté client (jsPDF, chargé à la demande).
   Utilisé pour les factures/devis, reçus de caisse et résumés de consultation.
   Le fichier est téléchargé ; l'envoi WhatsApp d'une PIÈCE JOINTE nécessite
   l'API WhatsApp Business (serveur) — ici on télécharge le PDF puis on ouvre le
   chat pré-rempli pour que l'utilisateur joigne le fichier en un geste. */

import { maisonNom, DEVISE_COMPLETE } from './identite';
import { DEVISE_FON_B64 } from './devise-fon-b64';

const INDIGO = '#1E2150';
const COPPER = '#B97A4A';
const INK = '#14141B';
const SOFT = '#6b6b73';
const VERT = '#4A6B52';
const BRIQUE = '#96412E';

/* Les polices standard du PDF (WinAnsi) n'ont pas les espaces fines / insécables —
   dont le séparateur de milliers fr-FR (U+202F) que produit `toLocaleString`. jsPDF
   les rend alors comme un glyphe parasite (« 14 / 000 F »). On les remplace par une
   espace normale sur CHAQUE texte tracé, pour tous les documents. */
const PDF_BAD_CODES = [0x00a0, 0x202f, 0x2007, 0x2008, 0x2009, 0x2060, 0x3000, 0xfeff];
const PDF_BAD_SPACES = new RegExp('[' + PDF_BAD_CODES.map((c) => String.fromCharCode(c)).join('') + ']', 'g');

/* LES CARACTÈRES DE CONTRÔLE PASSENT WinAnsi (code <= 0xFF) MAIS CASSENT LA
   LIGNE — un \r, un \t ou un octet de contrôle glissé par la sync dans un nom
   de cliente déplace le texte tracé. On les réduit à une espace ; seul le saut
   de ligne \n (0x0A) survit, jsPDF sait le rendre. */
const PDF_CONTROLS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;

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
  let t = s.replace(PDF_CONTROLS, ' ').normalize('NFC').replace(PDF_BAD_SPACES, ' ');
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
  /* Mis de côté pour la devise : elle s’écrit en fon, dans sa propre police,
     et ne doit surtout pas passer par la translittération. */
  (doc as any).__texteBrut = orig;
  const fix = (s: unknown) => (typeof s === 'string' ? pdfSafe(s) : s);
  doc.text = ((text: any, ...rest: any[]) =>
    orig(Array.isArray(text) ? text.map(fix) : fix(text), ...rest)) as any;
}

/* LES LETTRES FON RESTENT SUR LE PAPIER — règle de marque : elles ne se
   translittèrent JAMAIS. La police `DeviseFon` (sous-ensemble EB Garamond de la
   devise) porte Ɔ ɔ Ɖ ɖ Ɛ ɛ ; ces caractères-là se tracent dans cette police,
   le reste dans la police du document — exactement comme l'écran par
   `unicode-range`. Les lettres fon HORS sous-ensemble (Ŋ Ʋ) n'y figurent pas et
   retombent, elles seules, sur la translittération. */
const FON_PDF = 'ƆɔƉɖƐɛ';

/** Comme `pdfSafe`, mais GARDE les lettres fon couvertes, pour qu'elles
    survivent jusqu'au tracé dans leur police. Le reste est translittéré/borné
    comme d'habitude (les fon non couvertes Ŋ Ʋ et la ponctuation comprises). */
function pdfSafeGardeFon(s: string): string {
  let t = s.replace(PDF_CONTROLS, ' ').normalize('NFC').replace(PDF_BAD_SPACES, ' ');
  t = t.replace(/[ŊŋƲʋ−‑]/g, (c) => PDF_TRANSLIT[c]).normalize('NFC');
  return [...t].map((ch) => {
    if (FON_PDF.includes(ch)) return ch;
    if (winAnsiOk(ch)) return ch;
    const bare = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
    if (bare === '') return '';
    return [...bare].every(winAnsiOk) ? bare : '?';
  }).join('');
}

/** Trace un texte en respectant les lettres fon : chaque Ɔ ɔ Ɖ ɖ Ɛ ɛ passe dans
    la police `DeviseFon`, le reste garde la police courante, caractère par
    caractère (comme l'écran). `texte` doit déjà être passé par `pdfSafeGardeFon`.
    REPLI : sans la police fon prête, on laisse `doc.text` translittérer
    (KLƆKLƆ™ → KLOKLO™) plutôt que d'imprimer des carrés vides. */
function texteFon(doc: any, texte: string, x: number, y: number): void {
  if (!doc.__fonPrete) { doc.text(texte, x, y); return; }
  const brut = doc.__texteBrut ?? doc.text.bind(doc);
  const police = doc.getFont();
  let cx = x;
  let i = 0;
  while (i < texte.length) {
    const estFon = FON_PDF.includes(texte[i]);
    let j = i + 1;
    while (j < texte.length && FON_PDF.includes(texte[j]) === estFon) j += 1;
    const seg = texte.slice(i, j);
    if (estFon) doc.setFont(POLICE_FON, 'normal');
    brut(seg, cx, y);
    cx += doc.getTextWidth(seg);
    if (estFon) doc.setFont(police.fontName, police.fontStyle);
    i = j;
  }
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

/* ── LA DEVISE S'IMPRIME EN FON — 22 août 2026 ──────────────────────
   « S'écrit comme ça : mi nyɔ́ ɖɛkpɛ • la maison veille, au lieu de mi nyó
   dekpe. Respectez les polices fon ! » (Yéman).

   CE QUI BLOQUAIT. Les quatorze polices intégrées d'un PDF n'écrivent que le
   WinAnsi : ni ɔ, ni ɖ, ni ɛ. On translittérait donc — « mi nyó dekpe » — et
   c'était un pis-aller, pas une graphie. Pire : les DEUX polices de la Maison,
   Cormorant Garamond et Jost, ne portent pas ces lettres non plus. À l'écran
   comme sur le papier, le fon empruntait le dessin d'une police de secours
   choisie par la machine.

   CE QU'ON EMBARQUE. `public/assets/fonts/devise-fon.ttf` — EB Garamond,
   réduite aux seules lettres de la devise (21 ko). Un Garamond, comme
   Cormorant : la devise ne dépareille pas à côté du reste. Licence OFL, voir
   le LISEZ-MOI du dossier.

   L'ACCENT SE POSE À LA MAIN. « ɔ́ » n'existe pas en un seul caractère : c'est
   ɔ suivi d'un accent flottant, que les navigateurs recalent grâce aux tables
   de composition. jsPDF n'a pas de moteur de composition — il dessinerait
   l'accent centré sur le point d'arrivée du ɔ, donc à sa droite, dans le
   blanc. On l'écrit donc séparément, reculé de ce qu'il faut pour retomber sur
   le ventre de la lettre. La mesure vient de la police elle-même : le ɔ avance
   de 439/1000 d'em et son centre visuel est à 220 — l'accent recule donc de
   219 millièmes. */

const FICHIER_FON = 'devise-fon.ttf';
const POLICE_FON = 'DeviseFon';
/** ɔ avance de 439 millièmes d'em, son centre est à 220 : l'accent recule de 219. */
const RECUL_DE_L_ACCENT = 0.219;
const ACCENT = '́';

let deviseEnBase64: string | null | undefined;

/** Charge la police fon une fois pour toutes. `null` = indisponible. */
async function policeFon(): Promise<string | null> {
  /* EMBARQUÉE EN DUR (devise-fon-b64.ts), plus de fetch : jsPDF a besoin des
     octets de la police, et le chargement réseau échouait selon le serveur ou
     le chemin (le PDF sortait alors translittéré, « KLOKLO™ »). Les octets sont
     maintenant dans le bundle — la police est toujours disponible. */
  return DEVISE_FON_B64;
}

/** Embarque la police fon dans le document, UNE seule fois (le pied signe chaque
    page ; réembarquer gonflerait le fichier). Rend `true` si elle est prête —
    sinon l'appelant translittère. Partagée par `pieDeLaMaison` et `texteFon`. */
async function assureFon(doc: any): Promise<boolean> {
  if (doc.__fonPrete) return true;
  const b64 = await policeFon();
  if (!b64) return false;
  try {
    doc.addFileToVFS(FICHIER_FON, b64);
    doc.addFont(FICHIER_FON, POLICE_FON, 'normal');
    doc.__fonPrete = true;
    return true;
  } catch {
    return false;
  }
}

/* ── LE PIED DE LA MAISON ────────────────────────────────────────────
   Le nom ET la devise dans la MÊME police (DeviseFon) : le sous-ensemble
   EB Garamond porte l'alphabet latin complet, le nom « Maison MND » y compris
   (demande du 24 août — le nom en helvetica jurait à côté de la devise en
   garamond). L'ensemble est centré. Si la police fon manque (fichier absent,
   hors ligne), on retombe sur la translittération dans la police du document
   plutôt que sur des glyphes parasites : une ligne approchée vaut mieux qu'une
   suite de carrés vides. */
export async function pieDeLaMaison(
  doc: any,
  W: number,
  y: number,
  o: { taille?: number; couleur?: string; nom?: string } = {},
): Promise<void> {
  const taille = o.taille ?? 8;
  const couleur = o.couleur ?? SOFT;
  /* L'apostrophe typographique ’ (U+2019) n'est PAS dans le sous-ensemble de la
     police : « L'atelier MND » sortirait en carré. On la ramène à l'apostrophe
     droite ' (U+0027), qui, elle, y est. */
  const prefixe = `${(o.nom ?? maisonNom()).replace(/[‘’]/g, "'")} · `;
  const fonPrete = await assureFon(doc);

  doc.setFontSize(taille);
  doc.setTextColor(couleur);

  if (!fonPrete) {
    doc.setFont('helvetica', 'normal');
    doc.text(prefixe + DEVISE_COMPLETE, W / 2, y, { align: 'center' });
    return;
  }

  /* Le texte brut : `normalizeSpaces` translittère tout ce qui passe par
     `doc.text`, et c'est précisément ce qu'on ne veut pas ici — ni pour la
     devise, ni pour le nom (qui vit maintenant dans la même police). */
  const brut = (doc as any).__texteBrut ?? doc.text.bind(doc);
  const sansAccent = DEVISE_COMPLETE.replace(ACCENT, '');
  const iAccent = DEVISE_COMPLETE.indexOf(ACCENT);
  const avant = DEVISE_COMPLETE.slice(0, iAccent).replace(ACCENT, '');

  doc.setFont(POLICE_FON, 'normal');
  doc.setFontSize(taille);
  const largeurNom = doc.getTextWidth(prefixe);
  const largeurDevise = doc.getTextWidth(sansAccent);
  const x0 = (W - (largeurNom + largeurDevise)) / 2;

  doc.setTextColor(couleur);
  brut(prefixe, x0, y);
  brut(sansAccent, x0 + largeurNom, y);
  if (iAccent > 0) {
    const recul = RECUL_DE_L_ACCENT * taille * 25.4 / 72;
    brut(ACCENT, x0 + largeurNom + doc.getTextWidth(avant) - recul, y);
  }
  doc.setFont('helvetica', 'normal');
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
  /** LES RÈGLEMENTS, UN PAR UN — « reporte la date du règlement sur la
      facture » (Yéman, 17 août). Le PDF n'annonçait que le moyen ; c'est la
      DATE qui prouve. Absent = on retombe sur `payment` seul, comme avant. */
  reglements?: { date: string; method: string; amount: string }[];
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
  /* LA PRESTATION SE REPLIE, ELLE NE SE COUPE PLUS (15 août). La ligne était
     tranchée à 60 caractères, sans le dire : un rituel de trois gestes
     n'affichait que le premier, et le prix du tout se lisait en face du geste
     le moins cher. Elle tient désormais sur TROIS lignes dans sa colonne — les
     noms de la Maison font 45 signes chacun, deux lignes n'en portaient pas
     deux — et au-delà les points de suspension AVOUENT la coupe. */
  const COL = W - M - 58 - (M + 3) - 4;
  const INTER = 4.4;
  const MAX_LIGNES = 3;
  /* LES NOMS DE LA MAISON GARDENT LEURS LETTRES FON — KLƆKLƆ™ s'imprime avec le
     Ɔ, jamais « KLOKLO™ » (règle de marque). On embarque la police fon, on
     garde les lettres couvertes au repli (`pdfSafeGardeFon`), et `texteFon`
     bascule caractère par caractère au tracé. */
  await assureFon(doc);
  for (const l of d.lines) {
    /* La découpe voit la chaîne AVEC ses lettres fon (elles ont à peu près la
       largeur de leur translittération) ; le tracé les rend dans leur police. */
    const replie = doc.splitTextToSize(pdfSafeGardeFon(l.label), COL) as string[];
    const bouts = replie.length ? replie.slice(0, MAX_LIGNES) : [''];
    if (replie.length > MAX_LIGNES) {
      bouts[MAX_LIGNES - 1] = `${bouts[MAX_LIGNES - 1].slice(0, -1)}…`;
    }
    const base = y + 6.5;
    bouts.forEach((t, i) => texteFon(doc, t, M + 3, base + i * INTER));
    doc.text(String(l.qty), W - M - 58, base, { align: 'right' });
    doc.text(l.unit, W - M - 32, base, { align: 'right' });
    doc.text(l.total, W - M - 3, base, { align: 'right' });
    y += 8 + (bouts.length - 1) * INTER;
    doc.setDrawColor('#e3dacb');
    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
  }

  // — Totaux —
  y += 10;
  const rx = W - M;
  /* LA COLONNE DES INTITULÉS S'EST ÉLARGIE — 17 août 2026. Elle tenait sur
     70 mm, taillée pour « Sous-total » et « Total ». Depuis que les règlements
     s'y disent avec leur date (« Règlement · 12 août 2026 »), l'intitulé
     rattrapait la valeur et les deux se chevauchaient sur le papier. */
  const lx = W - M - 116;
  const row = (label: string, value: string, bold = false, color = INK) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(bold ? INDIGO : SOFT);
    /* ET LE CHEVAUCHEMENT DEVIENT IMPOSSIBLE. Élargir suffisait aujourd'hui ;
       un libellé plus long demain le referait. On mesure la valeur, on donne à
       l'intitulé ce qui reste, et on le coupe s'il déborde — une ligne tronquée
       se lit, deux lignes superposées ne se lisent pas. */
    const dispo = rx - lx - doc.getTextWidth(value) - 4;
    let lab = label;
    if (doc.getTextWidth(lab) > dispo) {
      while (lab.length > 1 && doc.getTextWidth(`${lab}…`) > dispo) lab = lab.slice(0, -1);
      lab = `${lab}…`;
    }
    doc.text(lab, lx, y);
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
  if (d.tip) row('Pourboire, merci', d.tip, false, COPPER);
  if (d.reglements && d.reglements.length > 0) {
    for (const r of d.reglements) {
      row(`Règlement · ${pdfSafe(r.date)}`, `${pdfSafe(r.method)} · ${r.amount}`);
    }
  } else if (d.payment) row('Règlement', d.payment);
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
  await pieDeLaMaison(doc, W, 285);

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
  /* « Objet » porte des noms de prestations : ils gardent leurs lettres fon. */
  await assureFon(doc);
  const row = (label: string, value?: string) => {
    if (!value) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(SOFT);
    doc.text(label, M, y);
    doc.setFontSize(9.5);
    doc.setTextColor(INK);
    /* LA VALEUR RESTE DANS LA PAGE. « Objet » porte parfois tout un rituel —
       trois prestations bout à bout — et le texte sortait par la droite, puis
       se superposait à la ligne suivante. On le replie sur deux lignes au plus,
       et la hauteur du bloc suit ce qu'il a réellement écrit. */
    const VX = M + 36;
    const bouts = doc.splitTextToSize(pdfSafeGardeFon(value), W - M - VX) as string[];
    const vues = bouts.slice(0, 2);
    if (bouts.length > 2) vues[1] = `${vues[1].slice(0, -1)}…`;
    vues.forEach((t, i) => texteFon(doc, t, VX, y + i * 4.2));
    y += 6 + (vues.length - 1) * 4.2;
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
  /* LA DEVISE S’IMPRIME ICI AUSSI — 22 août 2026. Ce pied disait « pas de
     devise en fon : WinAnsi n'a ni ɔ ni ɖ ni ɛ ». C'était vrai des polices
     intégrées ; ça ne l’est plus depuis qu’on embarque la nôtre. */
  doc.text('Reçu émis par Le Trône', W / 2, 124, { align: 'center' });
  await pieDeLaMaison(doc, W, 129, { taille: 7.5 });

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
    doc.text(o.footer, W / 2, 280, { align: 'center' });
  }
  await pieDeLaMaison(doc, W, 286);
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
  doc.text('Document généré par Le Trône', W / 2, 283, { align: 'center' });
  await pieDeLaMaison(doc, W, 288, { taille: 7.5 });
  doc.save(d.filename);
  return d.filename;
}

/* ---------- Le livre de caisse (rapport de caisse) ---------- */

/* LA FEUILLE DOIT DIRE LA MÊME CHOSE QUE L'ÉCRAN — 22 août 2026, à la demande
   de Yéman. Elle ne recalcule RIEN : les lignes, les soldes et les totaux lui
   arrivent déjà faits, de la source même que lit le relevé du tiroir. Un
   rapport qui referait les additions de son côté finirait par contredire
   l'écran — et c'est alors le papier qu'on croit.

   LE SOLDE D'OUVERTURE EST LA PREMIÈRE LIGNE. Un livre qui part de zéro dit un
   solde faux jusqu'à la dernière ligne quand la caisse contenait déjà quelque
   chose. */
export type CashMove = {
  date: string;
  label: string;
  detail?: string;
  inn?: string;
  out?: string;
  balance: string;
};
export type CashLedger = {
  name: string;
  sub?: string;
  openLabel: string;
  opening: string;
  closeLabel: string;
  closing: string;
  totalIn: string;
  totalOut: string;
  moves: CashMove[];
};
export type CashGroup = { heading?: string; ledgers: CashLedger[] };

export async function cashbookPdf(o: {
  houseName: string;
  eyebrow: string;
  title: string;
  meta: string[];
  resume?: { label: string; value: string; tone?: 'in' | 'out' }[];
  groups: CashGroup[];
  aside?: { heading: string; note: string; groups: CashGroup[] };
  refus?: string[];
  filename: string;
}): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  normalizeSpaces(doc);
  const W = 210;
  const M = 16;
  /* Six colonnes sur 178 mm. Les trois montants se lisent alignés à droite :
     un chiffre se compare par sa dernière décimale, jamais par sa première. */
  const xDate = M;
  const xLabel = M + 18;
  const xDetail = M + 68;
  const rIn = 132;
  const rOut = 162;
  const rSolde = W - M;
  let y = 18;

  const saut = (limite = 262) => {
    if (y <= limite) return;
    doc.addPage();
    y = 20;
  };

  const enTete = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(SOFT);
    doc.text('DATE', xDate, y);
    doc.text('LIBELLÉ', xLabel, y);
    doc.text('DÉTAIL', xDetail, y);
    doc.text('ENTRÉE', rIn, y, { align: 'right' });
    doc.text('SORTIE', rOut, y, { align: 'right' });
    doc.text('SOLDE', rSolde, y, { align: 'right' });
    y += 2;
    doc.setDrawColor(COPPER);
    doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y);
    y += 4.5;
  };

  /* Une ligne du livre. Le libellé et le détail se replient ; la hauteur suit
     le plus long des deux, sinon deux lignes se chevaucheraient. */
  const ligne = (m: CashMove, ton?: 'ouverture' | 'cloture') => {
    const lab = doc.splitTextToSize(m.label, xDetail - xLabel - 3) as string[];
    const det = m.detail ? (doc.splitTextToSize(m.detail, rIn - 22 - xDetail) as string[]) : [];
    const hauteur = Math.max(lab.length, det.length, 1) * 3.6 + 2.4;
    if (y + hauteur > 272) { doc.addPage(); y = 20; enTete(); }
    if (ton === 'cloture') {
      doc.setDrawColor(COPPER);
      doc.setLineWidth(0.3);
      doc.line(M, y - 3, W - M, y - 3);
    } else {
      doc.setDrawColor('#EFE9DC');
      doc.setLineWidth(0.2);
      doc.line(M, y - 3, W - M, y - 3);
    }
    doc.setFont('helvetica', ton ? 'bold' : 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(ton ? INDIGO : SOFT);
    doc.text(m.date, xDate, y);
    doc.setTextColor(ton ? INDIGO : INK);
    doc.text(lab, xLabel, y);
    if (det.length) {
      doc.setTextColor(SOFT);
      doc.setFontSize(6.8);
      doc.text(det, xDetail, y);
      doc.setFontSize(7.6);
    }
    doc.setFont('helvetica', ton ? 'bold' : 'normal');
    if (m.inn) { doc.setTextColor(VERT); doc.text(m.inn, rIn, y, { align: 'right' }); }
    if (m.out) { doc.setTextColor(BRIQUE); doc.text(m.out, rOut, y, { align: 'right' }); }
    doc.setTextColor(INDIGO);
    doc.text(m.balance, rSolde, y, { align: 'right' });
    y += hauteur;
  };

  const livre = (l: CashLedger) => {
    saut(244);
    y += 6;
    doc.setFont('times', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(INDIGO);
    doc.text(l.name, M, y);
    doc.text(l.closing, rSolde, y, { align: 'right' });
    /* LE COMPTE PASSE SOUS LE NOM — 22 août 2026. Il se posait à sa droite,
       calé sur une largeur mesurée : « Caisse Principale11 mouvements » se
       lisait en un seul mot sur la feuille. Une ligne dessous ne chevauche
       rien, quelle que soit la longueur du nom. */
    if (l.sub) {
      y += 3.6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(SOFT);
      doc.text(l.sub, M, y);
    }
    y += 5.5;
    /* UNE CAISSE SANS MOUVEMENT LE DIT EN UNE LIGNE. Deux lignes de solde
       identiques encadrant le vide se lisaient comme un tableau cassé. */
    if (l.moves.length === 0) {
      doc.setDrawColor(COPPER);
      doc.setLineWidth(0.25);
      doc.line(M, y - 3, W - M, y - 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(SOFT);
      doc.text(l.openLabel + ' · aucun mouvement sur la période', M, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(INDIGO);
      doc.text(l.closing, rSolde, y, { align: 'right' });
      y += 7;
      return;
    }
    enTete();
    ligne({ date: '', label: l.openLabel, balance: l.opening }, 'ouverture');
    for (const m of l.moves) ligne(m);
    ligne({ date: '', label: l.closeLabel, inn: l.totalIn, out: l.totalOut, balance: l.closing }, 'cloture');
    y += 5;
  };

  const groupe = (g: CashGroup) => {
    if (g.heading) {
      saut(248);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(COPPER);
      doc.text(g.heading.toUpperCase(), M, y);
      y += 1.6;
      doc.setDrawColor(COPPER);
      doc.setLineWidth(0.25);
      doc.line(M, y, W - M, y);
      y += 2;
    }
    for (const l of g.ledgers) livre(l);
  };

  const seal = await loadSeal();
  if (seal) {
    const s = 16;
    try { doc.addImage(seal, 'PNG', W / 2 - s / 2, y, s, s); } catch { /* image indisponible */ }
    y += s + 2.5;
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(COPPER);
    doc.text('MND', W / 2, y, { align: 'center' });
    y += 7;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(SOFT);
  doc.text(o.houseName.toUpperCase(), M, y);
  doc.setTextColor(COPPER);
  doc.text(o.eyebrow.toUpperCase(), W - M, y, { align: 'right' });
  y += 8;
  doc.setFont('times', 'normal');
  doc.setFontSize(21);
  doc.setTextColor(INDIGO);
  doc.text(o.title, M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(SOFT);
  for (const m of o.meta) { y += 4.6; doc.text(m, M, y); }
  y += 4;
  doc.setDrawColor(COPPER);
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 8;

  /* LES QUATRE CASES — solde d'ouverture, entrées, sorties, solde de clôture.
     Elles ne se posent que sur une caisse seule : quatre cases au-dessus de six
     tiroirs en trois monnaies additionneraient ce qui ne s'additionne pas. */
  if (o.resume?.length) {
    const largeur = (W - 2 * M) / o.resume.length;
    doc.setDrawColor('#E3C9AE');
    doc.setLineWidth(0.25);
    doc.rect(M, y - 5, W - 2 * M, 14);
    o.resume.forEach((c, i) => {
      const x = M + i * largeur + 3;
      if (i > 0) doc.line(M + i * largeur, y - 5, M + i * largeur, y + 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.4);
      doc.setTextColor(SOFT);
      doc.text(c.label.toUpperCase(), x, y - 1);
      doc.setFont('times', 'normal');
      doc.setFontSize(13);
      doc.setTextColor(c.tone === 'in' ? VERT : c.tone === 'out' ? BRIQUE : INDIGO);
      doc.text(c.value, x, y + 5.5);
    });
    y += 16;
  }

  for (const g of o.groups) groupe(g);

  /* HORS BILAN : SON PROPRE RANGEMENT, sur le papier comme à l'écran. Leur
     argent est réel ; il n'entre simplement dans aucun total de la Maison. */
  if (o.aside && o.aside.groups.length) {
    saut(236);
    y += 8;
    doc.setFont('times', 'normal');
    doc.setFontSize(15);
    doc.setTextColor(INDIGO);
    doc.text(o.aside.heading, M, y);
    y += 4.6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(SOFT);
    const note = doc.splitTextToSize(o.aside.note, W - 2 * M) as string[];
    doc.text(note, M, y);
    y += note.length * 3.4 + 1;
    for (const g of o.aside.groups) groupe(g);
  }

  /* CE QUI MANQUE SE DIT. Une caisse discrète refermée ne s'imprime pas — son
     livre dirait son solde ligne à ligne — mais un document amputé en silence
     vaudrait pire que pas de document du tout. */
  if (o.refus?.length) {
    saut(256);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(BRIQUE);
    for (const r of o.refus) {
      const t = doc.splitTextToSize(r, W - 2 * M) as string[];
      doc.text(t, M, y);
      y += t.length * 3.6 + 1;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    await pieDeLaMaison(doc, W, 287, { taille: 7 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(SOFT);
    if (pages > 1) doc.text(String(i) + ' / ' + String(pages), W - M, 287, { align: 'right' });
  }
  doc.save(o.filename);
  return o.filename;
}
