import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES HEURES DES RAPPELS, EPROUVEES : `node scripts/verifie-les-heures-des-rappels.mjs`.

   La regle des heures du rappel de la veille, sa copie dans `rappels-j1`, la
   porte qui fait taire la fonction hors de ses heures, le job horaire du SQL
   0143 et l'ecran du Marketing ; puis des pannes plantees, chacune criee. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-heures-des-rappels-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-heures-des-rappels.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
  });
  process.chdir(racine);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
