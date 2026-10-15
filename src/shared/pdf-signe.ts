import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import { TAILLE_DU_TEXTE, estUneImage, placeSurLaPage, tourFinal, type PoseSurPdf, type RetoucheDesPages } from './pdf-signe-pur';

/* ══ LA COPIE SIGNÉE, ÉCRITE — 15 octobre 2026 ═════════════════════════
   On part des octets de l'ORIGINAL (jamais modifié : on en écrit une copie),
   on tourne les pages demandées, on pose les images et les textes au bon
   endroit de chaque page vue, on retire les pages écartées, et l'on rend les
   octets du nouveau PDF. Ce module tourne dans le navigateur comme dans le
   banc (pdf-lib n'a besoin de rien d'autre). */

export type ImageDePose = { octets: Uint8Array; type: 'png' | 'jpg'; /** hauteur / largeur */ ratio: number };
export class PdfProtege extends Error {}

/** L'encre de la Maison pour ce qu'on écrit : un bleu nuit, comme un stylo. */
const ENCRE = rgb(0.118, 0.129, 0.314);

/** Ce que la police du PDF ne sait pas écrire devient « ? » plutôt que de tout faire échouer. */
function ecrivable(texte: string, police: PDFFont): string {
  const jeu = new Set(police.getCharacterSet());
  return [...texte].map((c) => (jeu.has(c.codePointAt(0) ?? 0) ? c : c === '’' ? "'" : '?')).join('');
}

export async function ecritLaCopie(
  original: Uint8Array,
  poses: readonly PoseSurPdf[],
  retouche: RetoucheDesPages,
  images: Readonly<Record<string, ImageDePose>>,
): Promise<Uint8Array> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(original, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String(e))) throw new PdfProtege('Ce PDF est protégé par un mot de passe : il ne se signe pas ici.');
    throw e;
  }
  const pages = doc.getPages();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const dingbats = await doc.embedFont(StandardFonts.ZapfDingbats);
  const incrustees = new Map<string, PDFImage>();
  const incruste = async (cle: string): Promise<PDFImage | null> => {
    if (incrustees.has(cle)) return incrustees.get(cle)!;
    const im = images[cle];
    if (!im) return null;
    const e = im.type === 'png' ? await doc.embedPng(im.octets) : await doc.embedJpg(im.octets);
    incrustees.set(cle, e);
    return e;
  };

  /* 1. Les tours : la page prend son tour final ; les pièces se posent ensuite dans ce repère. */
  const tours = pages.map((p, i) => {
    const t = tourFinal(p.getRotation().angle, retouche.tours[i]);
    if (t !== p.getRotation().angle) p.setRotation(degrees(t));
    return t;
  });

  /* 2. Les pièces. */
  for (const pose of poses) {
    const page = pages[pose.page];
    if (!page || retouche.retirees.includes(pose.page)) continue;
    const tour = tours[pose.page];
    const cb = page.getCropBox();
    const cadre = { x: cb.x, y: cb.y, largeur: cb.width, hauteur: cb.height };
    const largeurVue = tour === 90 || tour === 270 ? cadre.hauteur : cadre.largeur;
    if (estUneImage(pose.genre)) {
      const im = pose.image ? images[pose.image] : undefined;
      const e = pose.image ? await incruste(pose.image) : null;
      if (!im || !e) continue;
      const l = Math.max(4, pose.largeur * largeurVue);
      const h = l * im.ratio;
      const a = placeSurLaPage(pose, h, cadre, tour);
      page.drawImage(e, { x: a.x, y: a.y, width: l, height: h, rotate: degrees(a.angle) });
    } else if (pose.genre === 'coche') {
      const taille = (pose.taille ?? TAILLE_DU_TEXTE) * 1.3;
      const a = placeSurLaPage(pose, taille * 0.8, cadre, tour);
      page.drawText('4', { x: a.x, y: a.y, size: taille, font: dingbats, color: ENCRE, rotate: degrees(a.angle) });
    } else {
      const taille = pose.taille ?? TAILLE_DU_TEXTE;
      const texte = ecrivable(String(pose.texte ?? '').trim(), helvetica);
      if (!texte) continue;
      /* L'ancre d'un texte est sa ligne de base : un peu au-dessus du bas de sa boîte. */
      const a = placeSurLaPage(pose, taille * 0.8, cadre, tour);
      page.drawText(texte, { x: a.x, y: a.y, size: taille, font: helvetica, color: ENCRE, rotate: degrees(a.angle) });
    }
  }

  /* 3. Les pages retirées, de la dernière à la première. */
  for (const i of [...new Set(retouche.retirees)].filter((p) => p >= 0 && p < pages.length).sort((a, b) => b - a)) doc.removePage(i);

  doc.setProducer('Maison MND · Le Trône');
  doc.setModificationDate(new Date());
  return await doc.save();
}
