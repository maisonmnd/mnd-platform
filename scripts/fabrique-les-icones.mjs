/* LES ICÔNES DES APPLICATIONS, quand on pose le raccourci sur un téléphone.

   `node scripts/fabrique-les-icones.mjs`

   Ce que le téléphone affiche à côté du doigt, c'est une tuile de 60 pixels.
   Elle n'a pas de place pour un nom : le système écrit déjà celui du manifeste
   en dessous. Elle ne porte donc que le pictogramme, posé sur un champ de
   couleur, et c'est LE CHAMP qui dit de quelle application il s'agit.

   QUATRE TUILES QUI NE SE CONFONDENT PAS :
     · Maison MND   champ indigo, encre ivoire    la Maison
     · Ma Couronne  champ cuivre, encre ivoire    la cliente, la chaleur
     · Le Trône     champ or,     encre indigo    la Maison au travail
     · LOKAA        champ ivoire, encre indigo    le produit, à part

   « BIEN DISTINCT » SE MESURE. Un premier essai donnait l'indigo à la Maison et
   l'indigo PROFOND au Trône : neuf points d'écart perçu en Lab, c'est-à-dire
   deux tuiles que l'œil confond à soixante pixels. On a calculé l'écart entre
   toutes les paires de champs de la charte et cherché la répartition qui
   sépare le mieux. Ma Couronne et Le Trône, les deux que Yéman veut distinguer,
   s'opposent maintenant deux fois : par le champ, cuivre contre or, ET par
   l'encre, claire contre sombre. Le champ seul ne les séparait pas assez.

   CE QUI ÉTAIT CASSÉ. L'icône du portail portait un pictogramme indigo sur un
   champ OBSIDIENNE : 1,2 de contraste, une tuile noire où l'on ne voyait rien.
   Et l'obsidienne comme fond est contraire à la règle de la Maison, qui veut
   l'indigo pour les surfaces sombres.

   LE MASQUE D'ANDROID. Une icône « maskable » est rognée par le système, en
   cercle, en goutte ou en carré arrondi selon le téléphone : seuls les 80 %
   du centre sont garantis. Le pictogramme y est donc plus petit, et le champ
   va jusqu'au bord. Sur iPhone, c'est l'inverse qui compte : iOS ignore la
   transparence et composite sur du noir, donc le champ doit être opaque. Il
   l'est.

   RIEN N'EST REDESSINÉ : on prend le pictogramme du dépôt, déjà détouré, et on
   le pose à l'échelle. Le script le vérifie et refuse d'écrire s'il l'a
   déformé. */
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { couleursDeLaCharte } from './fabrique-les-pictogrammes.mjs';

const racine = path.resolve(import.meta.dirname, '..');
const MONOS = path.join(racine, 'public', 'assets', 'monograms');
const ICONES = path.join(racine, 'public', 'assets', 'icons');
const OG = path.join(racine, 'public', 'assets', 'og');

const charte = couleursDeLaCharte();
/* L'or n'est pas dans colors.css : il existe pour les dorures, et c'est lui
   qui fait le champ du Trône. */
const OR = '#B8902F';

/* part : la largeur du pictogramme, en part du côté de la tuile.
   0.62 pour une tuile ordinaire ; 0.50 pour une tuile masquable, dont seuls
   les 80 % du centre survivent au rognage. */
const PART = 0.62;
const PART_MASQUE = 0.50;

const APPS = [
  { clef: 'portal', champ: charte.indigo, encre: 'mono-ivoire.png', dit: 'Maison MND' },
  { clef: 'couronne', champ: charte.copper, encre: 'mono-ivoire.png', dit: 'Ma Couronne' },
  { clef: 'trone', champ: OR, encre: 'mono-indigo.png', dit: 'Le Trône' },
  { clef: 'lokaa', champ: charte.ivoire, encre: 'mono-indigo.png', dit: 'LOKAA' },
];

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

/** Une tuile : le champ, et le pictogramme au centre, à l'échelle. */
async function tuile(champ, encre, cote, part) {
  const src = path.join(MONOS, encre);
  if (!existsSync(src)) throw new Error(`pictogramme introuvable : ${src}`);
  const nu = await sharp(src).trim().toBuffer();
  const m = await sharp(nu).metadata();
  const large = Math.round(cote * part);
  const haut = Math.round((large * m.height) / m.width);
  const petit = await sharp(nu).resize(large, haut, { kernel: 'lanczos3' }).toBuffer();
  const [r, v, b] = hex(champ);
  return sharp({ create: { width: cote, height: cote, channels: 4, background: { r, g: v, b, alpha: 1 } } })
    .composite([{ input: petit, left: Math.round((cote - large) / 2), top: Math.round((cote - haut) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Le rapport du pictogramme dans une tuile rendue : il doit être celui du
    fichier source, sinon on l'a étiré. */
async function rapportDedans(buffer, champ) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: L, height: H, channels: c } = info;
  const [fr, fv, fb] = hex(champ);
  const encre = (x, y) => {
    const i = (y * L + x) * c;
    return Math.abs(data[i] - fr) + Math.abs(data[i + 1] - fv) + Math.abs(data[i + 2] - fb) > 40;
  };
  let x0 = L; let x1 = -1; let y0 = H; let y1 = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < L; x += 1) {
      if (encre(x, y)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 > x0 && y1 > y0 ? (x1 - x0 + 1) / (y1 - y0 + 1) : null;
}

function luminance(c) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
const contraste = (a, b) => {
  const [la, lb] = [luminance(hex(a)), luminance(hex(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** L'encre d'un pictogramme, pour mesurer son contraste avec le champ. */
async function encreDe(fichier) {
  const { data, info } = await sharp(fichier).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  for (let i = 0; i < data.length; i += c) {
    if (data[i + c - 1] > 240) return `#${[data[i], data[i + 1], data[i + 2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  return null;
}

mkdirSync(ICONES, { recursive: true });
const attendu = await (async () => {
  const m = await sharp(await sharp(path.join(MONOS, 'mono-indigo.png')).trim().toBuffer()).metadata();
  return m.width / m.height;
})();

let rates = 0;
for (const { clef, champ, encre, dit } of APPS) {
  const teinte = await encreDe(path.join(MONOS, encre));
  const c = contraste(champ, teinte);
  for (const [nom, cote, part] of [
    [`${clef}-192.png`, 192, PART], [`${clef}-512.png`, 512, PART],
    [`${clef}-maskable-512.png`, 512, PART_MASQUE],
  ]) {
    const buf = await tuile(champ, encre, cote, part);
    const r = await rapportDedans(buf, champ);
    if (r === null || Math.abs(r - attendu) / attendu > 0.02) {
      console.error(`  ${nom} : LE PICTOGRAMME EST DÉFORMÉ (${r?.toFixed(3)} au lieu de ${attendu.toFixed(3)})`);
      rates += 1;
      continue;
    }
    await sharp(buf).toFile(path.join(ICONES, nom));
  }
  console.log(`  ${dit.padEnd(13)} champ ${champ}  encre ${teinte}  contraste ${c.toFixed(1)}${c < 3 ? '  TROP FAIBLE' : ''}`);
  if (c < 3) rates += 1;
}

/* La vitrine tire ses quatre tailles de cette seule image : photos-en-webp les
   redécoupe dès qu'elle est plus récente qu'elles. */
mkdirSync(OG, { recursive: true });
const meta = await tuile(charte.indigo, 'mono-ivoire.png', 1024, PART);
await sharp(meta).toFile(path.join(OG, 'icone-app-meta.png'));
console.log(`  vitrine       champ ${charte.indigo}  source icone-app-meta.png 1024`);
console.log(`  or hors charte : ${OR}`);

if (rates) { console.error(`\n${rates} icône(s) en défaut.`); process.exit(1); }
console.log('\nIcônes en place.');
