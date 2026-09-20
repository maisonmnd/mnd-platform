/* LES LETTRES DU PRÊT, EN PDF — 20 septembre 2026.

   « J'aimerais sauvegarder le PDF des lettres d'engagement et partager »
   (Yéman). Maquette `public/maquette-les-lettres-au-dossier.html`, validée.

   POURQUOI UN SECOND DESSIN. Les lettres vivent en HTML (`lettres-du-pret.ts`)
   pour la fenêtre d'impression, qui reste la voie la plus fidèle. Le PDF, lui,
   doit naître SANS boîte d'impression, pour être rangé au coffre : jsPDF le
   dessine, comme il dessine déjà les contrats et les bulletins. La typographie
   est donc celle des autres PDF de la Maison, plus simple que la fenêtre.

   DEUX DESSINS, UN SEUL TEXTE QUI COMPTE. Les phrases sont recopiées ici ;
   `verifie-lettres-au-dossier` vérifie que CHAQUE phrase du PDF se retrouve
   mot pour mot dans la lettre à l'écran. Le jour où l'une bouge sans l'autre,
   le harnais le dit — c'est la seule garde qui tienne contre deux vérités.

   UNE PAGE PAR LETTRE, TOUJOURS : le dessin mesure avant d'écrire et n'ajoute
   jamais de page. Ce qui ne tiendrait pas se réduit (l'échéancier se résume),
   il ne déborde pas. */

import { ENCRES_PDF, espacesNormalises, monogrammeDeLaMaison, pdfSafe } from '../../../../shared/pdf';

export type LigneDEcheancierPdf = { mois: string; retenueXof: number; resteApresXof: number };

export type LettresDuPretPdf = {
  /** L'identité de la Maison, telle que les Paramètres la portent. */
  maison: string;
  raison: string;
  ville: string;
  /** « de la Maison MND », « de L'atelier MND » — déjà accordé par l'appelant. */
  deLaMaison: string;
  /** « la Maison MND », « L'atelier MND » — de même. */
  avecArticle: string;
  /** La société, première part de la raison sociale. */
  societe: string;
  nom: string;
  fonction?: string;
  telephone?: string;
  /** Le jour d'entrée dans la Maison, déjà écrit en clair. */
  depuisDit?: string;
  montantXof: number;
  montantEnLettres: string;
  /** Le jour du prêt, déjà écrit en clair (« 20 septembre 2026 »). */
  dateDite: string;
  motif?: string;
  baseXof: number;
  partPct: number;
  mensXof: number;
  mois: number;
  /** « du mois d'octobre 2026 », élision comprise. */
  premierMoisDit: string;
  plafondPct?: number;
  plan?: readonly LigneDEcheancierPdf[];
  identite?: { donnees: string; ratio: number };
  /** « oct. 2026 » pour l'échéancier. */
  moisCourt: (mois: string) => string;
};

const francs = (n: number): string => Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ');
const pct = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Les phrases des deux lettres, à l'identique de la fenêtre. */
export function phrasesDesLettres(d: LettresDuPretPdf): { demande: string[]; engagement: string[]; clauses: string[] } {
  const lettres = d.montantEnLettres;
  const chiffres = francs(d.montantXof);
  const plafond = d.plafondPct != null && d.plafondPct > 0 ? `${pct(d.plafondPct)}` : '…………';
  return {
    demande: [
      'Madame, Monsieur,',
      `Employé(e) ${d.deLaMaison} en qualité de ${d.fonction?.toLowerCase() || '…………'} depuis le `
      + `${d.depuisDit || '…………'}, j'ai l'honneur de solliciter un prêt sans intérêt de ${lettres} `
      + `francs CFA (${chiffres} F), pour le motif suivant :`,
      `Je propose de le rembourser par une retenue sur mon salaire de base, qui est aujourd'hui de `
      + `${francs(d.baseXof)} F : ${pct(d.partPct)} % de ce salaire, soit ${francs(d.mensXof)} F par mois, `
      + `pendant ${d.mois} mois, à compter du bulletin ${d.premierMoisDit}.`,
      `Je joins à cette demande la copie de ma carte d'identité ou de mon CIP, et vous prie d'agréer, `
      + `Madame, Monsieur, l'expression de ma considération respectueuse.`,
    ],
    engagement: [
      `Je soussigné(e), ${d.nom}, titulaire de la carte d'identité ou du CIP n° …………, demeurant à `
      + `…………, employé(e) de ${d.societe}, ${d.maison}, en qualité de ${d.fonction?.toLowerCase() || '…………'},`,
      `reconnais avoir reçu ${d.deLaMaison}, le ${d.dateDite}, la somme de ${lettres} francs CFA `
      + `(${chiffres} F), à titre de prêt sans intérêt. Je ne devrai à la Maison que cette somme, et rien au-delà.`,
      'Je m’engage à la rembourser par des retenues sur mon salaire, dans les conditions suivantes :',
      `J'autorise ${d.avecArticle} à opérer ces retenues sur mes bulletins de paie jusqu'au remboursement `
      + `complet. Chaque bulletin indique la retenue du mois et ce qui reste dû.`,
      `Fait à ${d.ville}, le ${d.dateDite}, en deux exemplaires, dont un m'est remis.`,
    ],
    clauses: [
      `La retenue est de ${pct(d.partPct)} % de mon salaire de base, soit ${francs(d.mensXof)} F par mois `
      + `à ce jour, à compter du bulletin ${d.premierMoisDit}, pendant ${d.mois} mois, selon l'échéancier ci-dessous.`,
      `Si mon salaire de base change, la même part s'applique au nouveau salaire : le remboursement s'en `
      + `trouve raccourci ou allongé d'autant.`,
      `Une retenue ne dépasse jamais ${plafond} % de mon salaire net du mois, plafond fixé par la Maison. `
      + `Si une retenue est réduite, parce qu'elle atteint ce plafond ou à ma demande acceptée par la Maison, `
      + `la différence est reportée à la fin du prêt.`,
      `Si mon contrat prend fin avant le remboursement complet, le solde restant dû sera retenu sur les `
      + `dernières sommes qui me seront versées, dans les limites prévues par la loi. Le reliquat éventuel `
      + `restera dû, et je m'engage à le rembourser selon un échéancier convenu avec la Maison.`,
    ],
  };
}

/** L'ÉCHÉANCIER QUI TIENT : quatorze lignes au plus, comme à l'écran. */
export const lignesDeLEcheancier = (
  plan: readonly LigneDEcheancierPdf[],
): (LigneDEcheancierPdf | null)[] => {
  const MAX = 14;
  return plan.length <= MAX ? [...plan] : [...plan.slice(0, MAX - 3), null, ...plan.slice(-2)];
};

/* eslint-disable @typescript-eslint/no-explicit-any -- jsPDF n'a pas de types ici. */
type Doc = any;

const LARGEUR = 210;
const HAUTEUR = 297;
const MARGE = 16;
const UTILE = LARGEUR - MARGE * 2;

/** LE PAPIER À EN-TÊTE : le monogramme, le nom de la Maison, sa ligne légale,
    et la référence de la pièce. Rend l'ordonnée où le texte commence. */
function entete(doc: Doc, d: LettresDuPretPdf, mono: string | null, reference: string[]): number {
  let y = 20;
  if (mono) {
    try { doc.addImage(mono, 'PNG', MARGE, y - 9, 13, 13, undefined, 'FAST'); } catch { /* image indisponible */ }
  }
  const gauche = mono ? MARGE + 16 : MARGE;
  doc.setFont('times', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(ENCRES_PDF.INDIGO);
  doc.text(pdfSafe(d.maison), gauche, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(ENCRES_PDF.SOFT);
  doc.text(pdfSafe(`${d.raison} · ${d.ville}`.toUpperCase()), gauche, y + 4);
  let yr = y - 3;
  for (const l of reference) {
    doc.text(pdfSafe(l.toUpperCase()), LARGEUR - MARGE, yr, { align: 'right' });
    yr += 3.6;
  }
  y += 7;
  doc.setDrawColor(ENCRES_PDF.INDIGO);
  doc.setLineWidth(0.2);
  doc.line(MARGE, y, LARGEUR - MARGE, y);
  return y + 6;
}

/** Un paragraphe justifié, rendu à l'ordonnée suivante. */
function paragraphe(doc: Doc, texte: string, y: number, opts?: { taille?: number; creux?: number }): number {
  const taille = opts?.taille ?? 9.4;
  const creux = opts?.creux ?? 0;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(taille);
  doc.setTextColor(ENCRES_PDF.INK);
  const lignes = doc.splitTextToSize(pdfSafe(texte), UTILE - creux);
  for (const l of lignes) {
    doc.text(l, MARGE + creux, y);
    y += taille * 0.48;
  }
  return y + 1.8;
}

/** Le pied de page, collé au bas de la feuille. */
function pied(doc: Doc, gauche: string, droite: string): void {
  const y = HAUTEUR - 12;
  doc.setDrawColor(ENCRES_PDF.FILET);
  doc.setLineWidth(0.15);
  doc.line(MARGE, y - 3.5, LARGEUR - MARGE, y - 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(ENCRES_PDF.SOFT);
  doc.text(pdfSafe(gauche), MARGE, y);
  doc.text(pdfSafe(droite), LARGEUR - MARGE, y, { align: 'right' });
}

/** Un cadre à signer, avec son étiquette. */
function cadre(doc: Doc, x: number, y: number, l: number, h: number, etq: string): void {
  doc.setDrawColor(ENCRES_PDF.FILET);
  doc.setLineWidth(0.15);
  doc.roundedRect(x, y, l, h, 1, 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(ENCRES_PDF.SOFT);
  doc.text(pdfSafe(etq.toUpperCase()), x + 3, y + 4.5);
}

/** LA PIÈCE D'IDENTITÉ, ou les deux cases à coller. Rend l'ordonnée suivante. */
function pieceDIdentite(doc: Doc, d: LettresDuPretPdf, y: number, o: { hauteur: number; largeur?: number }): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(ENCRES_PDF.SOFT);
  doc.text(pdfSafe("COPIE DE LA CARTE D'IDENTITÉ OU DU CIP"), MARGE, y);
  y += 2.5;
  if (d.identite?.donnees) {
    const ratio = d.identite.ratio > 0 ? d.identite.ratio : 1.58;
    let h = o.hauteur;
    let l = h * ratio;
    const lMax = o.largeur ?? UTILE;
    if (l > lMax) { l = lMax; h = l / ratio; }
    try { doc.addImage(d.identite.donnees, 'JPEG', MARGE, y, l, h, undefined, 'FAST'); } catch { /* illisible */ }
    doc.setDrawColor(ENCRES_PDF.FILET);
    doc.rect(MARGE, y, l, h);
    return y + h + 4;
  }
  /* SANS PHOTO, DEUX CASES À LA TAILLE D'UNE CARTE (85,6 × 54 mm) : une case
     plus petite ne recevrait pas une photocopie à l'échelle. */
  const h = Math.min(o.hauteur, 54);
  const l = h * (85.6 / 54);
  doc.setDrawColor(ENCRES_PDF.FILET);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(MARGE, y, l, h);
  doc.rect(MARGE + l + 5, y, l, h);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(7);
  doc.text('Recto', MARGE + l / 2, y + h / 2, { align: 'center' });
  doc.text('Verso', MARGE + l + 5 + l / 2, y + h / 2, { align: 'center' });
  return y + h + 4;
}

/** L'ÉCHÉANCIER, en deux groupes côte à côte. Rend l'ordonnée suivante. */
function echeancier(doc: Doc, d: LettresDuPretPdf, y: number, largeur: number): number {
  const plan = d.plan ?? [];
  if (plan.length === 0) return y;
  const lignes = lignesDeLEcheancier(plan);
  const moitie = Math.ceil(lignes.length / 2);
  const groupes = [lignes.slice(0, moitie), lignes.slice(moitie)];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(ENCRES_PDF.SOFT);
  doc.text(
    pdfSafe(`L'ÉCHÉANCIER DES RETENUES · ${plan.length} BULLETIN${plan.length > 1 ? 'S' : ''} · EN FRANCS`),
    MARGE, y,
  );
  y += 3.4;

  const largeurGroupe = (largeur - 5) / 2;
  const colonnes = (x0: number) => [x0 + 17, x0 + largeurGroupe * 0.62, x0 + largeurGroupe];
  doc.setFontSize(6.4);
  groupes.forEach((g, i) => {
    if (g.length === 0) return;
    const x0 = MARGE + i * (largeurGroupe + 5);
    const [xr, , xs] = colonnes(x0);
    doc.setTextColor(ENCRES_PDF.SOFT);
    doc.text('BULLETIN', x0, y);
    doc.text('RETENUE', xr, y, { align: 'right' });
    doc.text(pdfSafe('RESTE DÛ'), xs, y, { align: 'right' });
    doc.setDrawColor(ENCRES_PDF.FILET);
    doc.setLineWidth(0.12);
    doc.line(x0, y + 1.2, x0 + largeurGroupe, y + 1.2);
  });
  y += 4.6;

  const hauteurLigne = 3.9;
  doc.setFontSize(7.2);
  groupes.forEach((g, i) => {
    const x0 = MARGE + i * (largeurGroupe + 5);
    const [xr, , xs] = colonnes(x0);
    let yl = y;
    for (const l of g) {
      if (l === null) {
        doc.setTextColor(ENCRES_PDF.FILET);
        doc.text('…', x0 + largeurGroupe / 2, yl, { align: 'center' });
      } else {
        doc.setTextColor(ENCRES_PDF.SOFT);
        doc.text(pdfSafe(d.moisCourt(l.mois)), x0, yl);
        doc.setTextColor(ENCRES_PDF.INDIGO);
        doc.text(pdfSafe(francs(l.retenueXof)), xr, yl, { align: 'right' });
        doc.setTextColor(ENCRES_PDF.SOFT);
        doc.text(pdfSafe(l.resteApresXof > 0 ? francs(l.resteApresXof) : 'soldé'), xs, yl, { align: 'right' });
      }
      yl += hauteurLigne;
    }
  });
  return y + moitie * hauteurLigne + 2;
}

/** LES DEUX LETTRES, EN UN SEUL PDF DE DEUX PAGES. */
export async function lettresDuPretPdf(d: LettresDuPretPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  espacesNormalises(doc);
  const mono = await monogrammeDeLaMaison();
  const t = phrasesDesLettres(d);

  /* ── PIÈCE 1 · LA DEMANDE ─────────────────────────────────────── */
  let y = entete(doc, d, mono, ['Demande de prêt', 'Pièce 1 sur 2']);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(ENCRES_PDF.SOFT);
  doc.text('DE', MARGE, y);
  doc.text('À', LARGEUR - MARGE, y, { align: 'right' });
  y += 4;
  doc.setFontSize(8.6);
  doc.setTextColor(ENCRES_PDF.INK);
  const deGauche = [
    `Nom et prénoms : ${d.nom}`,
    `Fonction : ${d.fonction || '…………'}`,
    'Demeurant à …………………………',
    `Téléphone ${d.telephone || '…………'}`,
  ];
  const deDroite = [`La Direction ${d.deLaMaison}`, d.societe, d.ville];
  deGauche.forEach((l, i) => doc.text(pdfSafe(l), MARGE, y + i * 4.4));
  deDroite.forEach((l, i) => doc.text(pdfSafe(l), LARGEUR - MARGE, y + i * 4.4, { align: 'right' }));
  y += Math.max(deGauche.length, deDroite.length) * 4.4 + 3;

  doc.text(pdfSafe(`${d.ville}, le ${d.dateDite}`), LARGEUR - MARGE, y, { align: 'right' });
  y += 7;

  doc.setFontSize(6.6);
  doc.setTextColor(ENCRES_PDF.COPPER);
  doc.text('OBJET', MARGE, y);
  y += 4.5;
  doc.setFont('times', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(ENCRES_PDF.INDIGO);
  doc.text(pdfSafe('Demande de prêt sans intérêt'), MARGE, y);
  y += 7;

  for (const [i, p] of t.demande.entries()) {
    y = paragraphe(doc, p, y);
    /* LE MOTIF PREND SA LIGNE, comme à l'écran : une ligne à remplir en fin
       de phrase pousse le reste et laisse un blanc qui se lit mal. */
    if (i === 1) {
      doc.setTextColor(ENCRES_PDF.INDIGO);
      doc.setFontSize(9.4);
      if (d.motif?.trim()) {
        for (const l of doc.splitTextToSize(pdfSafe(d.motif.trim()), UTILE)) { doc.text(l, MARGE, y); y += 4.5; }
      } else {
        doc.setDrawColor(ENCRES_PDF.SOFT);
        doc.setLineDashPattern([0.4, 0.8], 0);
        doc.line(MARGE, y, LARGEUR - MARGE, y);
        doc.setLineDashPattern([], 0);
        y += 4;
      }
      y += 2;
    }
  }

  y = pieceDIdentite(doc, d, y + 2, { hauteur: 54 });

  const hCadre = 26;
  const lCadre = (UTILE - 6) / 2;
  cadre(doc, MARGE, y, lCadre, hCadre, 'Signature');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(ENCRES_PDF.SOFT);
  doc.text(pdfSafe(`Nom et prénoms : ${d.nom}`), MARGE + 3, y + hCadre - 3.5);
  cadre(doc, MARGE + lCadre + 6, y, lCadre, hCadre, 'Décision de la Maison, réservée à la Direction');
  const xd = MARGE + lCadre + 9;
  doc.setFontSize(7.4);
  doc.setTextColor(ENCRES_PDF.INK);
  ['Accordé tel que demandé', 'Accordé ainsi : ………… F, ……… % sur ……… mois', 'Refusé']
    .forEach((c, i) => {
      const yc = y + 9 + i * 5;
      doc.setDrawColor(ENCRES_PDF.SOFT);
      doc.rect(xd, yc - 2.4, 2.6, 2.6);
      doc.text(pdfSafe(c), xd + 4, yc);
    });
  pied(doc, `${d.maison} · demande de prêt sans intérêt`, 'À conserver au dossier du membre');

  /* ── PIÈCE 2 · L'ENGAGEMENT ───────────────────────────────────── */
  doc.addPage();
  y = entete(doc, d, mono, ['Engagement de remboursement', 'Pièce 2 sur 2']);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(ENCRES_PDF.COPPER);
  doc.text("LETTRE D'ENGAGEMENT", MARGE, y);
  y += 4.5;
  doc.setFont('times', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(ENCRES_PDF.INDIGO);
  doc.text(pdfSafe('Reconnaissance de prêt et autorisation de retenue sur salaire'), MARGE, y);
  y += 7;

  y = paragraphe(doc, t.engagement[0], y);
  y = paragraphe(doc, t.engagement[1], y);
  y = paragraphe(doc, t.engagement[2], y);
  t.clauses.forEach((c, i) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.4);
    doc.setTextColor(ENCRES_PDF.INDIGO);
    doc.text(`${i + 1}.`, MARGE, y);
    y = paragraphe(doc, c, y, { creux: 6 });
  });

  /* L'ÉCHÉANCIER, ET LA CARTE À CÔTÉ QUAND IL Y EN A UNE. */
  y += 1;
  const largeurCarte = d.identite?.donnees ? 64 : 0;
  const largeurTable = UTILE - (largeurCarte ? largeurCarte + 6 : 0);
  const yTable = y;
  const yApresTable = echeancier(doc, d, yTable, largeurTable);
  let yApresCarte = yTable;
  if (largeurCarte) {
    const ratio = d.identite!.ratio > 0 ? d.identite!.ratio : 1.58;
    let l = largeurCarte;
    let h = l / ratio;
    if (h > 44) { h = 44; l = h * ratio; }
    const x = LARGEUR - MARGE - l;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(ENCRES_PDF.SOFT);
    doc.text(pdfSafe("COPIE DE LA CARTE D'IDENTITÉ OU DU CIP"), x, yTable, { maxWidth: l });
    const yi = yTable + 5.5;
    try { doc.addImage(d.identite!.donnees, 'JPEG', x, yi, l, h, undefined, 'FAST'); } catch { /* illisible */ }
    doc.setDrawColor(ENCRES_PDF.FILET);
    doc.rect(x, yi, l, h);
    yApresCarte = yi + h + 4;
  }
  y = Math.max(yApresTable, yApresCarte) + 2;

  y = paragraphe(doc, t.engagement[3], y);
  y = paragraphe(doc, t.engagement[4], y);
  y += 2;

  const hSign = 30;
  cadre(doc, MARGE, y, lCadre, hSign, "Le membre de l'équipe");
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(ENCRES_PDF.SOFT);
  const mention = doc.splitTextToSize(
    pdfSafe(`Écrire à la main : « Lu et approuvé, bon pour la somme de ${d.montantEnLettres} francs CFA (${francs(d.montantXof)} F). »`),
    lCadre - 6,
  );
  mention.forEach((l: string, i: number) => doc.text(l, MARGE + 3, y + 8 + i * 3.4));
  doc.text('Signature', MARGE + 3, y + hSign - 3.5);
  cadre(doc, MARGE + lCadre + 6, y, lCadre, hSign, `Pour ${d.avecArticle}`);
  doc.text('Nom et qualité', MARGE + lCadre + 9, y + 9);
  doc.setDrawColor(ENCRES_PDF.FILET);
  doc.line(MARGE + lCadre + 9, y + 15, MARGE + lCadre + 3 + lCadre - 3, y + 15);
  doc.text('Signature et cachet', MARGE + lCadre + 9, y + hSign - 3.5);

  pied(doc, `${d.maison} · prêt sans intérêt, autorisation de retenue sur salaire`, 'Un exemplaire au membre, un au dossier');

  return doc.output('blob') as Blob;
}
