/* ══ LA CARTE DE MARRAINE — 28 septembre 2026 (maquette validée) ═══════

   « Intègre le code de bienvenue sur tous les clients de la Maison MND…
   dessine la carte avec un QR code qu'on peut scanner, avec le nom de la
   cliente et le pattern de MND » (Yéman). Maquette : canvas « La carte de
   marraine MND », validé le 28.

   DESSINÉE DANS UN CANVAS, comme la carte d'anniversaire (`ds/carte.ts`) :
   c'est la même image à l'écran de Ma Couronne, dans la fiche du Trône,
   jointe à un WhatsApp et imprimée au format carte bancaire. Les mesures
   sont celles de la maquette, en vraie taille (1012 × 638, le rapport de
   85,6 × 54 mm), peintes au double pour rester nettes.

   LES MOTIFS SONT LES VRAIS : les tuiles de `public/assets/motifs/` (allover,
   médaillon, cire), le verrou couché de `public/assets/verrous/`, le
   pictogramme de `public/assets/vectoriel/`. Rien n'est redessiné : le
   médaillon et le verrou se posent à leurs proportions, jamais étirés.

   LE QR MÈNE À LA RÉSERVATION, CODE POSÉ : c'est le même lien que celui que
   la marraine partage (`lienDuParrainage`). */

import qrcode from 'qrcode-generator';
import { asset } from '../shared/asset';
import { assureLesPolices } from './carte';
import { lienDuParrainage, type ModeleDeCarte } from '../shared/parrainage-pur';
import { URL_DU_MODELE } from '../shared/lien-reservation';

export const CARTE_L = 1012;
export const CARTE_H = 638;
const ECHELLE = 2;

/** L'adresse du site, tirée du lien déjà approuvé par Meta : une seule vérité. */
export const ORIGINE_DU_SITE = new URL(URL_DU_MODELE).origin;
export const lienDeLaCarte = (code: string): string => lienDuParrainage(ORIGINE_DU_SITE, code);

export type DonneesDeCarte = {
  prenom: string;
  code: string;
  /** L'année d'entrée à la Maison (la fiche, `since`). */
  depuis: string;
  modele?: ModeleDeCarte;
};

const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"Jost", "Century Gothic", system-ui, sans-serif';
const SERIF_FON = '"Cormorant Garamond", "MND Fon", Georgia, serif';

const INDIGO = '#1E2150';
const IVOIRE = '#F6F1E7';
const CUIVRE = '#B97A4A';
const CU_700 = '#7C4C2C';
const CU_300 = '#D6A06F';

const M = (f: string) => asset(`/assets/motifs/${f}`);
const FICHIERS = {
  alloverIndigo: M('allover-aere-indigo-cuivre.png'),
  alloverIvoire: M('allover-aere-ivoire-cuivre.png'),
  medaillonTuile: M('medaillon-aere-ivoire-cuivre.png'),
  soleilCuivre: M('medaillon-seul-cuivre.png'),
  soleilIvoire: M('medaillon-seul-ivoire.png'),
  cire: M('cire-cuivre.png'),
  verrouIvoire: asset('/assets/verrous/verrou-couche-ivoire.png'),
  verrouIndigo: asset('/assets/verrous/verrou-couche-indigo.png'),
  pictogramme: asset('/assets/vectoriel/pictogramme-cuivre.svg'),
};

const images = new Map<string, Promise<HTMLImageElement>>();
function image(src: string): Promise<HTMLImageElement> {
  const vu = images.get(src);
  if (vu) return vu;
  const p = new Promise<HTMLImageElement>((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => { images.delete(src); ko(new Error(src)); };
    img.src = src;
  });
  images.set(src, p);
  return p;
}

let policesDeLaCarte: Promise<void> | null = null;
function polices(): Promise<void> {
  if (policesDeLaCarte) return policesDeLaCarte;
  const d = document as Document & { fonts?: FontFaceSet };
  policesDeLaCarte = (async () => {
    await assureLesPolices();
    if (!d.fonts) return;
    await Promise.all([
      `italic 300 132px ${SERIF}`, `500 48px ${SERIF}`, `300 66px ${SERIF}`, `300 21px ${SANS}`,
      `400 17px ${SANS}`, `400 19px ${SANS}`,
    ].map((f) => d.fonts!.load(f, 'Aàé').catch(() => undefined)));
  })();
  return policesDeLaCarte;
}

function arrondi(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Une tuile répétée à la taille voulue : le motif se répète, il ne s'étire pas. */
function tuile(c: CanvasRenderingContext2D, img: HTMLImageElement, taille: number, w: number, h: number): void {
  const motif = c.createPattern(img, 'repeat');
  if (!motif) return;
  const k = taille / img.naturalWidth;
  motif.setTransform(new DOMMatrix().scale(k, k));
  c.fillStyle = motif;
  c.fillRect(0, 0, w, h);
}

/** Des capitales espacées, lettre à lettre (le canvas ne sait pas partout). */
function espace(c: CanvasRenderingContext2D, texte: string, x: number, y: number, pas: number, aligne: 'gauche' | 'centre' = 'gauche'): void {
  const largeurs = [...texte].map((ch) => c.measureText(ch).width);
  const total = largeurs.reduce((s, l) => s + l, 0) + pas * Math.max(0, texte.length - 1);
  let cx = aligne === 'centre' ? x - total / 2 : x;
  c.textAlign = 'left';
  [...texte].forEach((ch, i) => { c.fillText(ch, cx, y); cx += largeurs[i] + pas; });
}

/** Un paragraphe plié à la largeur, ligne par ligne. Rend la dernière ligne. */
function plie(c: CanvasRenderingContext2D, texte: string, x: number, y: number, maxW: number, interligne: number): number {
  let ligne = '';
  let yy = y;
  for (const mot of texte.split(' ')) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (c.measureText(essai).width > maxW && ligne) {
      c.fillText(ligne, x, yy);
      ligne = mot;
      yy += interligne;
    } else ligne = essai;
  }
  if (ligne) c.fillText(ligne, x, yy);
  return yy;
}

const deLaMarraine = (p: string): string => (/^[aeiouyàâäéèêëîïôöûùüh]/i.test(p) ? `d’${p}` : `de ${p}`);

async function peinsLeRecto(c: CanvasRenderingContext2D, d: DonneesDeCarte): Promise<void> {
  const modele = d.modele ?? 'indigo';
  const [tIndigo, tIvoireCu, tMedaillon, soleilCu, soleilIv, cire, vIvoire, vIndigo] = await Promise.all([
    image(FICHIERS.alloverIndigo), image(FICHIERS.alloverIvoire), image(FICHIERS.medaillonTuile),
    image(FICHIERS.soleilCuivre), image(FICHIERS.soleilIvoire), image(FICHIERS.cire),
    image(FICHIERS.verrouIvoire), image(FICHIERS.verrouIndigo),
  ]);
  const clair = modele === 'ivoire';
  c.save();
  arrondi(c, 0, 0, CARTE_L, CARTE_H, 36);
  c.clip();
  if (modele === 'indigo') {
    c.fillStyle = INDIGO; c.fillRect(0, 0, CARTE_L, CARTE_H);
    tuile(c, tIndigo, 150, CARTE_L, CARTE_H);
    c.fillStyle = 'rgba(21,23,58,.62)'; c.fillRect(0, 0, CARTE_L, CARTE_H);
  } else if (modele === 'ivoire') {
    c.fillStyle = IVOIRE; c.fillRect(0, 0, CARTE_L, CARTE_H);
    tuile(c, tMedaillon, 140, CARTE_L, CARTE_H);
    c.fillStyle = 'rgba(246,241,231,.86)'; c.fillRect(0, 0, CARTE_L, CARTE_H);
  } else {
    c.fillStyle = '#9C6238'; c.fillRect(0, 0, CARTE_L, CARTE_H);
    c.globalCompositeOperation = 'multiply';
    tuile(c, tIvoireCu, 150, CARTE_L, CARTE_H);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(124,76,44,.35)'; c.fillRect(0, 0, CARTE_L, CARTE_H);
  }
  /* Le médaillon se lève au bord, comme un soleil. */
  c.globalAlpha = 0.95;
  c.drawImage(modele === 'cuivre' ? soleilIv : soleilCu, CARTE_L + 190 - 640, (CARTE_H - 640) / 2, 640, 640);
  c.globalAlpha = 1;
  /* Le filet intérieur, gravé. */
  arrondi(c, 22, 22, CARTE_L - 44, CARTE_H - 44, 22);
  c.strokeStyle = clair ? 'rgba(124,76,44,.55)' : 'rgba(214,160,111,.55)';
  c.lineWidth = 1;
  c.stroke();

  const encre = clair ? INDIGO : IVOIRE;
  const accent = clair ? CU_700 : modele === 'cuivre' ? '#F6E3CF' : CU_300;
  /* Le verrou couché : 214 × 67, ses proportions (1335 × 418). */
  c.drawImage(clair ? vIndigo : vIvoire, 70, 62, 214, 67);

  c.textBaseline = 'alphabetic';
  c.fillStyle = accent;
  c.font = `400 17px ${SANS}`;
  espace(c, 'CARTE DE MARRAINE', 70, 250, 17 * 0.34);

  /* Le prénom, en grand ; il se resserre s'il est long, jamais ne déborde. */
  let taille = 132;
  c.font = `italic 300 ${taille}px ${SERIF}`;
  while (c.measureText(d.prenom).width > 470 && taille > 56) {
    taille -= 4;
    c.font = `italic 300 ${taille}px ${SERIF}`;
  }
  c.fillStyle = encre;
  c.fillText(d.prenom, 66, 250 + 12 + taille * 0.86);
  c.font = `300 20px ${SANS}`;
  c.globalAlpha = 0.85;
  c.fillText(`Cliente de la Maison depuis ${d.depuis}`, 70, 250 + 12 + taille * 0.86 + 44);
  c.globalAlpha = 1;

  c.fillStyle = accent;
  c.font = `400 14px ${SANS}`;
  espace(c, 'SON CODE', 70, 530, 14 * 0.3);
  c.fillStyle = encre;
  c.font = `500 48px ${SERIF}`;
  espace(c, d.code, 70, 580, 48 * 0.16);

  c.drawImage(cire, CARTE_L - 70 - 150 - 118, CARTE_H - 58 - 118, 118, 118);
  c.restore();
}

async function peinsLeVerso(c: CanvasRenderingContext2D, d: DonneesDeCarte): Promise<void> {
  const [tMedaillon, picto] = await Promise.all([image(FICHIERS.medaillonTuile), image(FICHIERS.pictogramme)]);
  c.save();
  arrondi(c, 0, 0, CARTE_L, CARTE_H, 36);
  c.clip();
  c.fillStyle = IVOIRE; c.fillRect(0, 0, CARTE_L, CARTE_H);
  c.globalAlpha = 0.16;
  tuile(c, tMedaillon, 130, CARTE_L, CARTE_H);
  c.globalAlpha = 1;
  arrondi(c, 22, 22, CARTE_L - 44, CARTE_H - 44, 22);
  c.strokeStyle = 'rgba(124,76,44,.45)';
  c.lineWidth = 1;
  c.stroke();

  /* Le pictogramme : 70 de large, ses proportions (814 × 672). */
  c.drawImage(picto, 70, 60, 70, 58);
  c.textBaseline = 'alphabetic';
  c.fillStyle = INDIGO;
  c.font = `300 66px ${SERIF}`;
  c.fillText('Offrez la Maison.', 68, 262);
  c.fillStyle = '#3B3A55';
  c.font = `300 21px ${SANS}`;
  const fin = plie(c, `Scannez ce carré : votre amie réserve avec le code ${deLaMarraine(d.prenom)}, et son cadeau de bienvenue l’attend à sa première visite.`, 70, 312, 450, 33);
  c.fillStyle = CU_700;
  c.font = `400 19px ${SANS}`;
  plie(c, 'Quand elle est venue, un soin vous est offert.', 70, fin + 48, 450, 30);
  c.fillStyle = CUIVRE;
  c.font = `italic 400 26px ${SERIF_FON}`;
  c.fillText('mi nyɔ́ ɖɛkpɛ', 70, 584);
  const largeurDevise = c.measureText('mi nyɔ́ ɖɛkpɛ').width;
  c.fillStyle = '#5E5750';
  c.font = `400 13px ${SANS}`;
  espace(c, new URL(ORIGINE_DU_SITE).host.toUpperCase(), 70 + largeurDevise + 20, 584, 13 * 0.28);

  /* LE QR, sur sa plaque encadrée de cuivre. */
  const px = 582;
  const py = 104;
  arrondi(c, px - 9, py - 9, 378, 378, 36);
  c.strokeStyle = 'rgba(124,76,44,.45)';
  c.lineWidth = 1;
  c.stroke();
  arrondi(c, px, py, 360, 360, 28);
  c.fillStyle = '#FFFDF9';
  c.fill();
  c.strokeStyle = CUIVRE;
  c.lineWidth = 2;
  c.stroke();
  const qr = qrcode(0, 'Q');
  qr.addData(lienDeLaCarte(d.code));
  qr.make();
  const n = qr.getModuleCount();
  const cote = 304;
  const m = cote / n;
  c.fillStyle = INDIGO;
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect(px + 28 + k * m, py + 28 + r * m, Math.ceil(m), Math.ceil(m));
  }
  c.fillStyle = INDIGO;
  c.font = `500 30px ${SERIF}`;
  espace(c, d.code, px + 180, py + 360 + 46, 30 * 0.18, 'centre');
  c.restore();
}

export type Face = 'recto' | 'verso' | 'deux';

/** PEINDRE UNE FACE (ou les deux, l'une sous l'autre, pour l'image à partager). */
export async function dessineLaCarteDeMarraine(canvas: HTMLCanvasElement, face: Face, d: DonneesDeCarte): Promise<void> {
  await polices();
  const deux = face === 'deux';
  const L = deux ? CARTE_L + 88 : CARTE_L;
  const H = deux ? CARTE_H * 2 + 44 + 120 : CARTE_H;
  canvas.width = L * ECHELLE;
  canvas.height = H * ECHELLE;
  const c = canvas.getContext('2d');
  if (!c) return;
  c.setTransform(ECHELLE, 0, 0, ECHELLE, 0, 0);
  c.clearRect(0, 0, L, H);
  if (!deux) {
    await (face === 'recto' ? peinsLeRecto(c, d) : peinsLeVerso(c, d));
    return;
  }
  /* L'image à partager : les deux faces sur le sable de la Maison. */
  const tuileSable = await image(FICHIERS.alloverIvoire);
  c.fillStyle = '#EEE6D6'; c.fillRect(0, 0, L, H);
  c.globalAlpha = 0.22;
  tuile(c, tuileSable, 180, L, H);
  c.globalAlpha = 1;
  c.save(); c.translate(44, 60); await peinsLeRecto(c, d); c.restore();
  c.save(); c.translate(44, 60 + CARTE_H + 44); await peinsLeVerso(c, d); c.restore();
}

/** L'image PNG d'une face, ou des deux. */
export async function carteDeMarraineEnBlob(face: Face, d: DonneesDeCarte): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await dessineLaCarteDeMarraine(canvas, face, d);
  return new Promise<Blob>((ok, ko) => {
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error('image'))), 'image/png');
  });
}

/** La même image, prête à voyager par `whatsapp-envoi` (une pièce en data URI). */
export async function carteDeMarraineEnPiece(d: DonneesDeCarte): Promise<{ nom: string; type: string; donnees: string }> {
  const canvas = document.createElement('canvas');
  await dessineLaCarteDeMarraine(canvas, 'deux', d);
  /* En JPEG : la pièce passe par le serveur, qui refuse au-delà de 5 Mo, et
     les deux faces en PNG au double s'en approchent. Meta accepte les deux. */
  return { nom: `carte-de-marraine-${d.code}.jpg`, type: 'image/jpeg', donnees: canvas.toDataURL('image/jpeg', 0.9) };
}

/** Le texte qui accompagne la carte quand on la partage. */
export const messageDeLaCarte = (d: Pick<DonneesDeCarte, 'code'>): string =>
  `Je t’offre la Maison MND : réserve avec mon code ${d.code}, un cadeau de bienvenue t’attend à ta première visite.\n${lienDeLaCarte(d.code)}`;
