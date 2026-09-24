/* LES PHOTOS DU SITE EN WEBP, ET LES ICÔNES DE L'ONGLET — 24 septembre 2026.

   L'état des lieux du site a mesuré l'accueil à 1,4 Mo, dont 880 Ko pour six
   photos en JPEG ; les mêmes en WebP, à qualité égale à l'œil, pèsent un bon
   quart de moins. Et l'icône d'onglet était le monogramme complet, 1600 pixels
   et 92 Ko, pour une case de 32.

   Ce script est le seul endroit où ces fichiers se fabriquent :
     · chaque `public/assets/photos/site/*.jpg` reçoit un jumeau `.webp`,
       refait seulement si le JPEG est plus récent que lui ;
     · les icônes de l'onglet et de l'écran d'accueil d'un téléphone sortent
       de `public/assets/og/icone-app-meta.png` (le monogramme sur l'indigo,
       déjà carré) aux tailles que les navigateurs demandent.
   Le JPEG reste : c'est lui que lisent les aperçus de partage (og:image), et
   lui que le `<picture>` sert à un navigateur qui ne lit pas le WebP.
   Le harnais verifie-la-vitrine refuse une photo sans jumeau, ou un jumeau
   plus lourd que l'original.

   `node scripts/photos-en-webp.mjs` */
import sharp from 'sharp';
import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const PHOTOS = path.join(racine, 'public/assets/photos/site');
const ICONE_SOURCE = path.join(racine, 'public/assets/og/icone-app-meta.png');
const ICONES = path.join(racine, 'public/assets/icones');
export const TAILLES_D_ICONE = [32, 180, 192, 512];

let faites = 0;
for (const f of readdirSync(PHOTOS).filter((f) => /\.jpe?g$/i.test(f))) {
  const jpg = path.join(PHOTOS, f);
  const webp = jpg.replace(/\.jpe?g$/i, '.webp');
  if (existsSync(webp) && statSync(webp).mtimeMs >= statSync(jpg).mtimeMs) continue;
  await sharp(jpg).webp({ quality: 82, effort: 6 }).toFile(webp);
  const avant = statSync(jpg).size, apres = statSync(webp).size;
  console.log(`  ${f} → ${path.basename(webp)} : ${Math.round(avant / 1024)} Ko → ${Math.round(apres / 1024)} Ko`);
  faites++;
}
console.log(faites ? `${faites} photo(s) converties.` : 'Toutes les photos ont déjà leur jumeau WebP.');

mkdirSync(ICONES, { recursive: true });
for (const t of TAILLES_D_ICONE) {
  const cible = path.join(ICONES, `icone-${t}.png`);
  if (existsSync(cible) && statSync(cible).mtimeMs >= statSync(ICONE_SOURCE).mtimeMs) continue;
  await sharp(ICONE_SOURCE).resize(t, t, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(cible);
  console.log(`  icône ${t} × ${t} : ${Math.round(statSync(cible).size / 1024)} Ko`);
}
console.log('Icônes en place.');
