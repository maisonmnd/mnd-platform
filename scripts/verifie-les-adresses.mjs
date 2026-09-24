import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES ADRESSES DE LA MAISON, EPROUVEES.

   La vitrine vit a la racine du domaine depuis le 24 septembre 2026, et
   l'ancien chemin /revelateur/ renvoie vers elle. Le harnais tient la forme
   de cette bascule : ou va chaque site, ce que dit une page de renvoi, quelles
   entrees restent hors des moteurs, et ce qui a ete construit.

   publie.mjs et renvoi.mjs ne sont PAS empaquetes : le harnais les importe a
   l'execution depuis la racine, sinon leur `import.meta.dirname` pointerait
   dans le dossier temporaire et `SOURCES` avec lui (meme regle que
   verifie-la-publication). */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-adresses-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-adresses.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    external: ['./publie.mjs', './renvoi.mjs'],
    banner: { js: `import { createRequire as __cr } from 'node:module';` },
  });
  /* Les deux modules exclus se resolvent depuis la racine, pas depuis Temp. */
  const { readFileSync, writeFileSync } = await import('node:fs');
  const texte = readFileSync(sortie, 'utf8')
    .replaceAll('"./publie.mjs"', JSON.stringify(pathToFileURL(path.join(racine, 'scripts/publie.mjs')).href))
    .replaceAll('"./renvoi.mjs"', JSON.stringify(pathToFileURL(path.join(racine, 'scripts/renvoi.mjs')).href));
  writeFileSync(sortie, texte);
  process.chdir(racine);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
