/* LE PICTOGRAMME DANS TOUTES LES ENCRES DE LA CHARTE.

   `node scripts/fabrique-les-pictogrammes.mjs`

   Les cinq fichiers d'origine portent EXACTEMENT le même dessin : leur couche
   de transparence est identique au bit près, seule l'encre change. Une encre
   de plus ne se dessine donc pas, elle se verse : on reprend la couche du
   dessin de référence et on la remplit. Le pictogramme n'est ni redessiné ni
   déformé, c'est la même forme, dans une autre couleur.

   LES COULEURS SE LISENT DANS LA CHARTE, PAS ICI. `src/ds/tokens/colors.css`
   est le seul endroit où elles s'écrivent ; ce script prend ses `--color-*` de
   base. Le jour où la Maison ajoute une couleur, le pictogramme suit sans
   qu'on y pense, et `verifie-le-verrou` refuse qu'une couleur de la charte
   reste sans pictogramme.

   ON NE RÉÉCRIT PAS CE QUI EST DÉJÀ JUSTE. Un fichier dont l'encre est déjà la
   bonne est laissé tel quel : le réencoder changerait ses octets sans changer
   son image, et obligerait à republier les sept sites pour rien. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const racine = path.resolve(import.meta.dirname, '..');
const DOSSIER = path.join(racine, 'public', 'assets', 'monograms');
const REFERENCE = path.join(DOSSIER, 'mono-indigo.png');

/* Le nom de fichier de chaque encre. Les quatre premiers existaient avant ce
   script et gardent leur nom, y compris `copper`, resté en anglais. */
const NOMS = {
  indigo: 'mono-indigo',
  'indigo-deep': 'mono-indigo-profond',
  copper: 'mono-copper',
  obsidian: 'mono-obsidian',
  ivoire: 'mono-ivoire',
  sable: 'mono-sable',
  argile: 'mono-argile',
};

/** Les couleurs de base de la charte, lues à leur source. */
export function couleursDeLaCharte() {
  const css = readFileSync(path.join(racine, 'src/ds/tokens/colors.css'), 'utf8');
  const out = {};
  for (const m of css.matchAll(/--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2].toUpperCase();
  return out;
}

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

/** L'encre d'un pictogramme : la couleur de son premier pixel bien opaque. */
async function encreDe(fichier) {
  const { data, info } = await sharp(fichier).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const c = info.channels;
  for (let i = 0; i < data.length; i += c) {
    if (data[i + c - 1] > 240) {
      return [data[i], data[i + 1], data[i + 2]];
    }
  }
  return null;
}

async function principal() {
  if (!existsSync(REFERENCE)) {
    console.error(`Pictogramme de référence introuvable : ${REFERENCE}`);
    process.exit(1);
  }
  const charte = couleursDeLaCharte();
  const { data: alpha, info } = await sharp(REFERENCE).ensureAlpha().extractChannel(3).raw()
    .toBuffer({ resolveWithObject: true });
  const { width: L, height: H } = info;

  for (const [clef, nom] of Object.entries(NOMS)) {
    const teinte = charte[clef];
    if (!teinte) { console.log(`  ${nom} : ${clef} n'est pas dans la charte, ignorée`); continue; }
    const cible = path.join(DOSSIER, `${nom}.png`);
    const [r, v, b] = hex(teinte);

    if (existsSync(cible)) {
      const dejaLa = await encreDe(cible);
      if (dejaLa && Math.abs(dejaLa[0] - r) <= 2 && Math.abs(dejaLa[1] - v) <= 2 && Math.abs(dejaLa[2] - b) <= 2) {
        console.log(`  ${nom.padEnd(22)} ${teinte}  déjà juste, laissé tel quel`);
        continue;
      }
    }

    /* On verse la couleur sous la couche du dessin : la forme ne bouge pas. */
    const pixels = Buffer.alloc(L * H * 4);
    for (let i = 0; i < L * H; i += 1) {
      pixels[i * 4] = r;
      pixels[i * 4 + 1] = v;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = alpha[i];
    }
    await sharp(pixels, { raw: { width: L, height: H, channels: 4 } })
      .png({ compressionLevel: 9 }).toFile(cible);
    console.log(`  ${nom.padEnd(22)} ${teinte}  écrit  ${Math.round(readFileSync(cible).length / 1024)} ko`);
  }

  /* L'or n'est pas une couleur de la charte : il ne s'écrit nulle part dans
     colors.css. Il existe pourtant, pour les dorures. On le dit, sans le
     fabriquer : ce script ne sert que ce que la charte déclare. */
  const or = path.join(DOSSIER, 'mono-or.png');
  if (existsSync(or)) {
    const e = await encreDe(or);
    console.log(`  mono-or                #${e.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}  hors charte, laissé tel quel`);
  }
}

/* On ne s'exécute QUE lancé directement. `fabrique-les-icones` importe
   `couleursDeLaCharte` d'ici : sans cette garde, il refabriquerait les
   pictogrammes à chaque fois, et son journal parlerait d'autre chose que de
   ce qu'il fait. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
