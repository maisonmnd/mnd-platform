import {
  PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts, degrees, rgb,
  type PDFFont, type PDFImage,
} from 'pdf-lib';
import {
  BASE_DANS_LA_BOITE, TAILLE_DU_TEXTE, couleurLue, estUnCache, estUneImage, placeSurLaPage, tourFinal,
  type Famille, type PoseSurPdf, type RetoucheDesPages,
} from './pdf-signe-pur';

/* ══ LA COPIE SIGNÉE, ÉCRITE — 15 octobre 2026 ═════════════════════════
   On part des octets de l'ORIGINAL (jamais modifié : on en écrit une copie),
   on tourne les pages demandées, on pose les images et les textes au bon
   endroit de chaque page vue, on retire les pages écartées, et l'on rend les
   octets du nouveau PDF. Ce module tourne dans le navigateur comme dans le
   banc (pdf-lib n'a besoin de rien d'autre).

   16 octobre : les champs d'un formulaire se remplissent (puis se figent dans
   la copie) ; « Modifier le texte » et « Effacer une zone » couvrent ce qui
   est imprimé, de la couleur du papier dessous, AVANT toutes les autres
   pièces : ce qu'on écrit ou pose ensuite reste par-dessus. */

export type ImageDePose = { octets: Uint8Array; type: 'png' | 'jpg'; /** hauteur / largeur */ ratio: number };
/** Ce qu'on a écrit dans les champs d'un formulaire : du texte, une case cochée, le choix d'une liste. */
export type ValeursDuFormulaire = Readonly<Record<string, string | boolean>>;
export class PdfProtege extends Error {}

/** L'encre de la Maison pour ce qu'on écrit : un bleu nuit, comme un stylo. */
const ENCRE = rgb(0.118, 0.129, 0.314);

/** Ce que la police du PDF ne sait pas écrire devient « ? » plutôt que de tout faire échouer. */
function ecrivable(texte: string, police: PDFFont): string {
  const jeu = new Set(police.getCharacterSet());
  return [...texte].map((c) => (jeu.has(c.codePointAt(0) ?? 0) ? c : c === '’' ? "'" : '?')).join('');
}

/** Remplit les champs donnés, puis fige tout le formulaire dans la page (une copie signée ne se retouche plus). */
function remplisLeFormulaire(doc: PDFDocument, valeurs: ValeursDuFormulaire, police: PDFFont): void {
  const noms = Object.keys(valeurs);
  if (!noms.length) return;
  const form = doc.getForm();
  for (const nom of noms) {
    const v = valeurs[nom];
    try {
      const champ = form.getField(nom);
      if (champ instanceof PDFTextField) champ.setText(ecrivable(String(v ?? ''), police));
      else if (champ instanceof PDFCheckBox) { if (v === true || v === 'true') champ.check(); else champ.uncheck(); }
      else if (champ instanceof PDFRadioGroup || champ instanceof PDFDropdown || champ instanceof PDFOptionList) { if (typeof v === 'string' && v) champ.select(v); }
    } catch { /* un champ qui refuse ne fait pas tout échouer */ }
  }
  try { form.updateFieldAppearances(police); } catch { /* les apparences existantes restent */ }
  try { form.flatten(); } catch { /* un formulaire qui ne se fige pas reste remplissable */ }
}

export async function ecritLaCopie(
  original: Uint8Array,
  poses: readonly PoseSurPdf[],
  retouche: RetoucheDesPages,
  images: Readonly<Record<string, ImageDePose>>,
  formulaire: ValeursDuFormulaire = {},
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
  const polices: Partial<Record<Famille, PDFFont>> = { sans: helvetica };
  const policeDe = async (f: Famille | undefined): Promise<PDFFont> => {
    const k = f ?? 'sans';
    if (!polices[k]) polices[k] = await doc.embedFont(k === 'serif' ? StandardFonts.TimesRoman : StandardFonts.Courier);
    return polices[k] as PDFFont;
  };
  const incrustees = new Map<string, PDFImage>();
  const incruste = async (cle: string): Promise<PDFImage | null> => {
    if (incrustees.has(cle)) return incrustees.get(cle)!;
    const im = images[cle];
    if (!im) return null;
    const e = im.type === 'png' ? await doc.embedPng(im.octets) : await doc.embedJpg(im.octets);
    incrustees.set(cle, e);
    return e;
  };

  /* 0. Le formulaire, rempli puis figé. */
  remplisLeFormulaire(doc, formulaire, helvetica);

  /* 1. Les tours : la page prend son tour final ; les pièces se posent ensuite dans ce repère. */
  const tours = pages.map((p, i) => {
    const t = tourFinal(p.getRotation().angle, retouche.tours[i]);
    if (t !== p.getRotation().angle) p.setRotation(degrees(t));
    return t;
  });

  /* 2. Les pièces : d'abord TOUT ce qui couvre l'imprimé, puis les textes
     modifiés, puis le reste, chacun par-dessus ce qui précède. */
  const ordre: [PoseSurPdf, 'cache' | 'piece'][] = [
    ...poses.filter((p) => estUnCache(p.genre)).map((p): [PoseSurPdf, 'cache'] => [p, 'cache']),
    ...poses.filter((p) => p.genre === 'remplace').map((p): [PoseSurPdf, 'piece'] => [p, 'piece']),
    ...poses.filter((p) => !estUnCache(p.genre)).map((p): [PoseSurPdf, 'piece'] => [p, 'piece']),
  ];
  for (const [pose, etape] of ordre) {
    const page = pages[pose.page];
    if (!page || retouche.retirees.includes(pose.page)) continue;
    const tour = tours[pose.page];
    const cb = page.getCropBox();
    const cadre = { x: cb.x, y: cb.y, largeur: cb.width, hauteur: cb.height };
    const largeurVue = tour === 90 || tour === 270 ? cadre.hauteur : cadre.largeur;
    const hauteurVue = tour === 90 || tour === 270 ? cadre.largeur : cadre.hauteur;
    if (etape === 'cache') {
      /* La zone couverte, de la couleur du papier. */
      const l = pose.largeur * largeurVue, h = (pose.hauteur ?? 0) * hauteurVue;
      if (!(l > 0) || !(h > 0)) continue;
      const a = placeSurLaPage(pose, h, cadre, tour);
      const [r, g, b] = couleurLue(pose.fond, [1, 1, 1]);
      page.drawRectangle({ x: a.x, y: a.y, width: l, height: h, color: rgb(r, g, b), borderWidth: 0, rotate: degrees(a.angle) });
    } else if (pose.genre === 'remplace') {
      /* Le texte modifié, sur la ligne de base d'origine, dans l'encre et la famille d'origine. */
      const h = (pose.hauteur ?? 0) * hauteurVue;
      const police = await policeDe(pose.famille);
      const texte = ecrivable(String(pose.texte ?? '').trim(), police);
      if (!texte || !(h > 0)) continue;
      const [er, eg, eb] = couleurLue(pose.encre, [0.08, 0.08, 0.1]);
      const base = placeSurLaPage(pose, h * BASE_DANS_LA_BOITE, cadre, tour);
      page.drawText(texte, { x: base.x, y: base.y, size: pose.taille ?? TAILLE_DU_TEXTE, font: police, color: rgb(er, eg, eb), rotate: degrees(base.angle) });
    } else if (pose.genre === 'efface') {
      continue;
    } else if (estUneImage(pose.genre)) {
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
