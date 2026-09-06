/* ══ LE DESSIN D'UNE CARTE — 6 septembre 2026 (maquette validée) ═════

   La carte finit en IMAGE : elle s'attache à un WhatsApp ou à un e-mail, et
   elle est vue sur le téléphone de quelqu'un, pas dans un navigateur.

   DESSINÉE, PAS PHOTOGRAPHIÉE. Les librairies qui capturent une page rendent
   mal les dégradés et perdent une police une fois sur dix ; une carte fausse
   une fois sur dix est une carte qu'on n'envoie plus. On la trace donc à la
   main dans un canvas, comme les courbes de la Maison.

   LES MESURES SONT CELLES DE LA MAQUETTE, au pixel près et en vraie taille :
   1080 × 1350. Les traduire à l'échelle aurait été une occasion de se tromper.

   LES POLICES SE CHARGENT AVANT DE PEINDRE. Un canvas ne sait pas attendre :
   si Cormorant n'est pas prête, il dessine en Times sans le dire, et la carte
   part comme ça. */

import { asset } from '../shared/asset';
import { DEVISE_COMPLETE } from '../shared/identite';
import type { ContenuDeCarte } from '../shared/cartes';

export const LARGEUR = 1080;
export const HAUTEUR = 1350;

const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"Jost", "Century Gothic", system-ui, sans-serif';
/* La police fon ne porte QUE ɔ ɖ ɛ et l'accent aigu ; le reste de la devise
   vient de Cormorant. En canvas il n'y a pas d'`unicode-range` : on empile les
   deux familles, et le moteur prend la première qui porte le glyphe. */
const SERIF_FON = `"Cormorant Garamond", "MND Fon", Georgia, serif`;

const INDIGO = '#1E2150';
const IVOIRE = '#F6F1E7';
const CUIVRE = '#B97A4A';
const CU_700 = '#7C4C2C';
const CU_300 = '#D6A06F';
const CU_200 = '#E4BE9C';
const CU_100 = '#F1DDC9';
const INDIGO_200 = '#A7ACC9';
const ENCRE = '#14141B';
const ENCRE_DOUCE = '#45454F';

/* ── LES POLICES, D'ABORD ────────────────────────────────────────────
   `document.fonts.load` ne devine pas : il faut lui nommer chaque graisse et
   chaque style qu'on va peindre, sinon il rend une promesse déjà tenue pour
   une variante qu'il n'a pas. */
const AFAIRE = [
  `300 88px ${SERIF}`, `italic 500 140px ${SERIF}`, `italic 400 44px ${SERIF}`,
  `italic 500 114px ${SERIF}`, `400 46px ${SERIF}`, `italic 400 38px ${SERIF}`,
  `italic 400 28px ${SERIF}`, `300 29px ${SANS}`, `400 29px ${SANS}`, `400 36px ${SANS}`,
];
let policesPretes: Promise<void> | null = null;
export function assureLesPolices(): Promise<void> {
  if (policesPretes) return policesPretes;
  const d = document as Document & { fonts?: FontFaceSet };
  policesPretes = (async () => {
    if (!d.fonts) return;
    await Promise.all(AFAIRE.map((f) => d.fonts!.load(f, 'Aàé').catch(() => undefined)));
    /* La devise a ses propres lettres, et c'est le seul texte qui les porte. */
    /* La face fon est declaree en normal SEULEMENT (tokens/fonts.css) :
       demander l'italique ne correspondrait a aucune face, et le prechargement
       rendrait une promesse vide. L'oblique se synthetise a la peinture. */
    await d.fonts.load(`400 28px "MND Fon"`, 'ɔɖɛ').catch(() => undefined);
    await d.fonts.ready;
  })();
  return policesPretes;
}

const images = new Map<string, Promise<HTMLImageElement>>();
function image(src: string): Promise<HTMLImageElement> {
  const vu = images.get(src);
  if (vu) return vu;
  const p = new Promise<HTMLImageElement>((ok, ko) => {
    const img = new Image();
    /* MÊME ORIGINE, donc pas de canvas taché : sans cela `toBlob` échouerait
       au moment de l'export, une fois la carte déjà à l'écran. */
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error(src));
    img.src = src;
  });
  images.set(src, p);
  return p;
}

/* ── LE HASARD QUI NE VARIE PAS ──────────────────────────────────────
   Une graine fixe : la carte de Baké et celle de Kossi doivent être
   exactement la même carte, et la même à chaque téléchargement. */
function alea(graine: number): () => number {
  let x = graine;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

const CLAIRES = ['#1E2150', '#B97A4A', '#D6A06F', '#E4BE9C', '#CDBBA9', '#9E6238'];
const SOMBRES = ['#E4BE9C', '#D6A06F', '#F1DDC9', '#C98A53', '#A7ACC9', '#B97A4A'];

const BALLONS = [
  { x: 148, y: 196, rx: 94, ry: 116, a: '#2C3470', b: '#15173A', fil: '#1E2150' },
  { x: 306, y: 138, rx: 78, ry: 96, a: '#E4BE9C', b: '#B97A4A', fil: '#B97A4A' },
  { x: 236, y: 352, rx: 64, ry: 79, a: '#FDF9F2', b: '#E3DACB', fil: '#CDBBA9' },
  { x: 934, y: 232, rx: 70, ry: 86, a: '#D6A06F', b: '#9E6238', fil: '#B97A4A' },
];

function fond(c: CanvasRenderingContext2D, profond: boolean): void {
  const g = c.createLinearGradient(0, 0, LARGEUR * 0.55, HAUTEUR);
  if (profond) {
    g.addColorStop(0, '#2C3470'); g.addColorStop(0.44, '#1E2150'); g.addColorStop(1, '#15173A');
  } else {
    g.addColorStop(0, '#FDF9F2'); g.addColorStop(0.46, '#F6F1E7'); g.addColorStop(1, '#F1E4D3');
  }
  c.fillStyle = g;
  c.fillRect(0, 0, LARGEUR, HAUTEUR);

  /* La lueur cuivre en haut à droite : c'est elle qui empêche le fond d'être
     un aplat, et un aplat sur une carte de fête se voit tout de suite. */
  const chaud = c.createRadialGradient(LARGEUR * 0.83, HAUTEUR * 0.06, 0, LARGEUR * 0.83, HAUTEUR * 0.06, 700);
  chaud.addColorStop(0, 'rgba(214,160,111,.30)');
  chaud.addColorStop(1, 'rgba(214,160,111,0)');
  c.fillStyle = chaud;
  c.fillRect(0, 0, LARGEUR, HAUTEUR);

  const froid = c.createRadialGradient(LARGEUR * 0.07, HAUTEUR * 0.95, 0, LARGEUR * 0.07, HAUTEUR * 0.95, 600);
  froid.addColorStop(0, profond ? 'rgba(185,122,74,.16)' : 'rgba(30,33,80,.10)');
  froid.addColorStop(1, profond ? 'rgba(185,122,74,0)' : 'rgba(30,33,80,0)');
  c.fillStyle = froid;
  c.fillRect(0, 0, LARGEUR, HAUTEUR);
}

function rectArrondi(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function cadre(c: CanvasRenderingContext2D): void {
  c.strokeStyle = CU_300; c.lineWidth = 2;
  rectArrondi(c, 39, 39, LARGEUR - 78, HAUTEUR - 78, 3); c.stroke();
  c.strokeStyle = 'rgba(185,122,74,.42)'; c.lineWidth = 1;
  rectArrondi(c, 47.5, 47.5, LARGEUR - 95, HAUTEUR - 95, 2); c.stroke();
}

function confettis(c: CanvasRenderingContext2D, profond: boolean, densite: number): void {
  const r = alea(7);
  const teintes = profond ? SOMBRES : CLAIRES;
  for (let i = 0; i < densite; i++) {
    const x = r() * LARGEUR, y = r() * HAUTEUR;
    /* LE TEXTE RESPIRE : rien ne tombe dans la colonne centrale, sinon on lit
       à travers des paillettes. */
    if (x > 150 && x < 930 && y > 250 && y < 1120) continue;
    const teinte = teintes[Math.floor(r() * teintes.length)];
    const rond = r() > 0.55;
    const t = 6 + r() * 12;
    c.save();
    c.globalAlpha = 0.35 + r() * 0.5;
    c.fillStyle = teinte;
    if (rond) {
      c.beginPath(); c.arc(x, y, (t * 0.7) / 2, 0, Math.PI * 2); c.fill();
    } else {
      c.translate(x, y); c.rotate(r() * Math.PI);
      c.fillRect(0, 0, t, t * 0.42);
    }
    c.restore();
  }
}

function ballons(c: CanvasRenderingContext2D): void {
  for (const b of BALLONS) {
    const bas = b.y + b.ry + 14;
    c.save();
    c.globalAlpha = 0.55; c.strokeStyle = b.fil; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(b.x, bas);
    c.bezierCurveTo(b.x - 26, bas + 78, b.x + 26, bas + 150, b.x - 10, bas + 226);
    c.stroke();
    c.restore();
  }
  for (const b of BALLONS) {
    const g = c.createLinearGradient(b.x - b.rx, b.y - b.ry, b.x + b.rx, b.y + b.ry);
    g.addColorStop(0, b.a); g.addColorStop(1, b.b);
    c.fillStyle = g;
    c.beginPath(); c.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2); c.fill();
    /* Le reflet fait le volume : sans lui, un ballon est un ovale. */
    c.save();
    c.fillStyle = 'rgba(255,255,255,.42)';
    c.beginPath();
    c.ellipse(b.x - b.rx * 0.28, b.y - b.ry * 0.36, b.rx * 0.22, b.ry * 0.26, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    /* Le nœud. */
    c.fillStyle = b.fil;
    c.save();
    c.translate(b.x, b.y + b.ry + 2); c.rotate(Math.PI / 4);
    c.fillRect(-7, -7, 14, 14);
    c.restore();
  }
}

function etoile(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, couleur: string): void {
  c.fillStyle = couleur;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rayon = i % 2 === 0 ? r : r * 0.44;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rayon;
    const y = cy + Math.sin(a) * rayon;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
  c.fill();
}

/* ── LE TEXTE ────────────────────────────────────────────────────────
   Le corps porte des passages en gras entre `**`. On découpe en mots, chacun
   avec sa graisse, puis on plie sur la largeur : c'est la seule façon d'avoir
   « L'atelier MND » en gras SANS que la ligne se casse au mauvais endroit. */
type Mot = { texte: string; gras: boolean };

function mots(texte: string): Mot[] {
  const out: Mot[] = [];
  for (const [i, part] of texte.split('**').entries()) {
    for (const m of part.split(/\s+/)) if (m) out.push({ texte: m, gras: i % 2 === 1 });
  }
  return out;
}

function plie(c: CanvasRenderingContext2D, liste: Mot[], maxW: number, police: (gras: boolean) => string): Mot[][] {
  const lignes: Mot[][] = [];
  let ligne: Mot[] = [];
  let large = 0;
  for (const m of liste) {
    c.font = police(m.gras);
    const w = c.measureText(m.texte).width;
    c.font = police(false);
    const espace = ligne.length ? c.measureText(' ').width : 0;
    if (ligne.length && large + espace + w > maxW) { lignes.push(ligne); ligne = []; large = 0; }
    else large += espace;
    ligne.push(m);
    large += w;
  }
  if (ligne.length) lignes.push(ligne);
  return lignes;
}

function ecritLigne(
  c: CanvasRenderingContext2D, ligne: Mot[], cx: number, y: number,
  police: (gras: boolean) => string, couleur: (gras: boolean) => string,
): void {
  c.font = police(false);
  const espace = c.measureText(' ').width;
  let large = 0;
  for (const [i, m] of ligne.entries()) {
    c.font = police(m.gras);
    large += c.measureText(m.texte).width + (i ? espace : 0);
  }
  let x = cx - large / 2;
  for (const [i, m] of ligne.entries()) {
    if (i) { c.font = police(false); x += espace; }
    c.font = police(m.gras);
    c.fillStyle = couleur(m.gras);
    c.textAlign = 'left';
    c.fillText(m.texte, x, y);
    x += c.measureText(m.texte).width;
  }
  c.textAlign = 'center';
}

/** Un texte simple, centré, plié sur `maxW`. Rend la hauteur consommée. */
function paragraphe(
  c: CanvasRenderingContext2D, texte: string, cx: number, y: number, maxW: number,
  font: string, couleur: string, interligne: number,
): number {
  c.font = font; c.fillStyle = couleur; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const lignes = plie(c, mots(texte), maxW, () => font);
  for (const [i, l] of lignes.entries()) {
    c.fillText(l.map((m) => m.texte).join(' '), cx, y + interligne * (i + 0.78));
  }
  return interligne * lignes.length;
}

/** LE GRAND MOT, en dégradé cuivre. Il rétrécit tout seul s'il ne tient pas :
    « d'avoir parlé de nous » est deux fois plus long que « Le Cercle », et une
    carte tronquée ne se rattrape pas une fois envoyée. */
function grandMot(
  c: CanvasRenderingContext2D, texte: string, taille: number, cx: number, y: number,
  maxW: number, profond: boolean,
): number {
  let t = taille;
  for (let i = 0; i < 24; i++) {
    c.font = `italic 500 ${t}px ${SERIF}`;
    if (c.measureText(texte).width <= maxW) break;
    t -= 4;
  }
  const large = c.measureText(texte).width;
  const g = c.createLinearGradient(cx - large / 2, 0, cx + large / 2, 0);
  if (profond) {
    g.addColorStop(0, '#E4BE9C'); g.addColorStop(0.3, '#D6A06F'); g.addColorStop(0.54, '#F1DDC9');
    g.addColorStop(0.8, '#C98A53'); g.addColorStop(1, '#E4BE9C');
  } else {
    g.addColorStop(0, '#C98A53'); g.addColorStop(0.26, '#7C4C2C'); g.addColorStop(0.52, '#E4BE9C');
    g.addColorStop(0.78, '#9E6238'); g.addColorStop(1, '#D6A06F');
  }
  c.fillStyle = g; c.textAlign = 'center';
  c.fillText(texte, cx, y + t * 0.78);
  return t * 0.98;
}

/** LA CARTE ENTIÈRE. Le contenu vient de `shared/cartes`, pur et éprouvé ;
    ici on ne fait que le poser. */
export async function dessineLaCarte(canvas: HTMLCanvasElement, k: ContenuDeCarte): Promise<void> {
  await assureLesPolices();
  const profond = k.fond === 'profond';
  const mono = await image(asset(`/assets/monograms/${profond ? 'mono-ivoire' : 'mono-copper'}.png`));

  canvas.width = LARGEUR; canvas.height = HAUTEUR;
  const c = canvas.getContext('2d');
  if (!c) return;
  c.clearRect(0, 0, LARGEUR, HAUTEUR);
  fond(c, profond);
  if (k.deco === 'ballons') ballons(c);
  confettis(c, profond, k.deco === 'ballons' ? 54 : 40);
  cadre(c);

  const cx = LARGEUR / 2;
  const maxW = LARGEUR - 236; // 118 px de marge de chaque côté, comme la maquette
  c.textBaseline = 'alphabetic';

  let y = k.deco === 'sceau' ? 128 : 174;

  /* Le sur-titre. */
  c.font = `300 88px ${SERIF}`;
  c.fillStyle = profond ? IVOIRE : INDIGO;
  c.textAlign = 'center';
  c.fillText(k.sur, cx, y + 70);
  y += 88;

  y += 4;
  y += grandMot(c, k.grand, k.grandTaille, cx, y, maxW, profond);

  /* L'emblème : la couronne d'ordinaire, un sceau pour le Cercle, cinq étoiles
     pour l'avis. Il dit de quoi parle la carte sans un mot. */
  if (k.deco === 'sceau') {
    y += 10;
    c.strokeStyle = CU_300; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, y + 75, 74, 0, Math.PI * 2);
    c.fillStyle = 'rgba(185,122,74,.12)'; c.fill();
    c.stroke();
    c.drawImage(mono, cx - 52, y + 23, 104, 104);
    y += 150;
  } else if (k.deco === 'etoiles') {
    y += 16;
    const pas = 54;
    for (let i = 0; i < 5; i++) etoile(c, cx - pas * 2 + pas * i, y + 26, 23, profond ? CU_200 : CUIVRE);
    c.strokeStyle = CU_300; c.lineWidth = 1;
    for (const s of [-1, 1]) {
      const g = c.createLinearGradient(cx + s * 160, 0, cx + s * 262, 0);
      g.addColorStop(0, CU_300); g.addColorStop(1, 'rgba(214,160,111,0)');
      c.strokeStyle = g;
      c.beginPath(); c.moveTo(cx + s * 160, y + 26); c.lineTo(cx + s * 262, y + 26); c.stroke();
    }
    y += 68;
  } else {
    y += 16;
    c.drawImage(mono, cx - 34, y, 68, 68);
    for (const s of [-1, 1]) {
      const g = c.createLinearGradient(cx + s * 50, 0, cx + s * 182, 0);
      g.addColorStop(0, CU_300); g.addColorStop(1, 'rgba(214,160,111,0)');
      c.strokeStyle = g; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx + s * 50, y + 34); c.lineTo(cx + s * 182, y + 34); c.stroke();
    }
    y += 68;
  }

  /* L'appel, puis le prénom. */
  y += 24;
  c.font = `italic 400 44px ${SERIF}`;
  c.fillStyle = profond ? CU_200 : CU_700;
  c.fillText(k.appel, cx, y + 36);
  y += 44;

  y += 6;
  /* LE PRÉNOM RÉTRÉCIT S'IL LE FAUT : « Marie Claude » ne tient pas au corps de
     « Baké », et un prénom coupé sur une carte est une insulte polie. */
  let tp = 114;
  for (let i = 0; i < 20; i++) {
    c.font = `italic 500 ${tp}px ${SERIF}`;
    if (c.measureText(k.prenom || '…').width <= maxW) break;
    tp -= 4;
  }
  c.fillStyle = profond ? IVOIRE : INDIGO;
  c.fillText(k.prenom || '…', cx, y + tp * 0.8);
  y += tp;

  y += 26;
  y += paragraphe(c, k.phrase, cx, y, maxW, `400 46px ${SERIF}`, profond ? CU_100 : ENCRE, 61);

  y += 26;
  const policeCorps = (gras: boolean) => `${gras ? 400 : 300} 29px ${SANS}`;
  const couleurCorps = (gras: boolean) =>
    (gras ? (profond ? CU_200 : INDIGO) : (profond ? INDIGO_200 : ENCRE_DOUCE));
  c.font = policeCorps(false);
  const lignesCorps = plie(c, mots(k.corps), maxW, policeCorps);
  for (const [i, l] of lignesCorps.entries()) ecritLigne(c, l, cx, y + 50 * (i + 0.72), policeCorps, couleurCorps);
  y += 50 * lignesCorps.length;

  y += 26;
  c.font = `italic 400 38px ${SERIF}`;
  c.fillStyle = profond ? CU_200 : INDIGO;
  c.textAlign = 'center';
  c.fillText(k.signe, cx, y + 30);

  /* ── LE PIED, ANCRÉ EN BAS ────────────────────────────────────────
     Il se compte depuis le bas, jamais depuis le texte : c'est ce qui empêche
     la devise de tomber sur le filet quand un mot s'allonge. */
  const basDevise = HAUTEUR - 62 - 8;
  c.font = `italic 400 28px ${SERIF_FON}`;
  c.fillStyle = profond ? CU_200 : CU_700;
  c.fillText(DEVISE_COMPLETE, cx, basDevise);

  const yFilet = basDevise - 28 - 12;
  c.strokeStyle = CU_300; c.lineWidth = 1;
  c.beginPath(); c.moveTo(cx - 95, yFilet); c.lineTo(cx + 95, yFilet); c.stroke();

  /* « L'ATELIER MND » : l'interlettrage se pose à la main, un caractère après
     l'autre, et le bloc se centre sur sa VRAIE largeur. Le navigateur, lui,
     laisse traîner l'espacement après la dernière lettre et pose le mot un
     demi-espacement trop à gauche — c'est ce décalage qu'on voyait sous le
     picto. Ici il n'existe pas. */
  const marque = 'L’ATELIER MND';
  const inter = 36 * 0.32;
  c.font = `400 36px ${SANS}`;
  c.fillStyle = profond ? IVOIRE : INDIGO;
  const largeMarque = [...marque].reduce((n, ch) => n + c.measureText(ch).width + inter, 0) - inter;
  let xm = cx - largeMarque / 2;
  c.textAlign = 'left';
  const yMarque = yFilet - 14;
  for (const ch of marque) {
    c.fillText(ch, xm, yMarque);
    xm += c.measureText(ch).width + inter;
  }
  c.textAlign = 'center';

  c.drawImage(mono, cx - 46, yMarque - 40 - 92, 92, 92);
}

/** L'IMAGE, prête à être jointe. PNG : le dégradé du titre se déchire en JPEG,
    et une carte se garde. */
export async function carteEnBlob(k: ContenuDeCarte): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await dessineLaCarte(canvas, k);
  return new Promise<Blob>((ok, ko) => {
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error('image'))), 'image/png');
  });
}
